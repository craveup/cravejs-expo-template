import type { MenuProduct } from '@craveup/storefront-sdk';

import type {
  StorefrontBootstrapSnapshot,
} from '../../lib/storefront-bootstrap-service.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';

export type CatalogProductAvailability = 'available' | 'unavailable';

export type CatalogProductPresentation = Readonly<{
  availability: CatalogProductAvailability;
  badgeLabel?: string;
  calorieCount?: number;
  description?: string;
  id: string;
  imageUrl?: string;
  name: string;
  priceLabel: string;
}>;

export type CatalogSectionPresentation = Readonly<{
  id: string;
  imageUrl?: string;
  products: readonly CatalogProductPresentation[];
  title: string;
}>;

export type CatalogBrowseSnapshot = Readonly<{
  canStartOrder: boolean;
  hero: Readonly<{
    coverImageUrl?: string;
    logoImageUrl?: string;
    merchantBio?: string;
    merchantName: string;
  }>;
  location: Readonly<{
    address: string;
    name: string;
  }>;
  popularProducts: readonly CatalogProductPresentation[];
  sections: readonly CatalogSectionPresentation[];
}>;

export type CatalogProjectionResult =
  | Readonly<{
      snapshot: CatalogBrowseSnapshot;
      status: 'empty' | 'ready' | 'unpublished';
      ok: true;
    }>
  | Readonly<{ ok: false; reason: 'invalid-catalog' }>;

export type CatalogBrowseFailureStatus =
  | 'error'
  | 'not-found'
  | 'unavailable';

export type CatalogBrowseState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'offline' }>
  | Readonly<{ status: 'empty' | 'unpublished' }>
  | Readonly<{ data: CatalogBrowseSnapshot; status: 'ready' }>
  | Readonly<{
      requestId?: string;
      retryable: boolean;
      status: CatalogBrowseFailureStatus;
    }>;

export type CatalogBrowseActions = Readonly<{
  load(): void;
  retry(): void;
  selectCategory(categoryId: string): void;
}>;

export type CatalogBrowseContextValue = Readonly<{
  actions: CatalogBrowseActions;
  selectedCategoryId?: string;
  state: CatalogBrowseState;
}>;

const INVALID_PROJECTION = Object.freeze({
  ok: false,
  reason: 'invalid-catalog',
} as const);

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalHttpsUrl(value: unknown): string | undefined | false {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : false;
  } catch {
    return false;
  }
}

function projectProduct(
  value: unknown,
): CatalogProductPresentation | undefined {
  if (!isObject(value)) return undefined;
  const product = value as Partial<MenuProduct>;

  if (
    !nonEmptyString(product.id) ||
    !nonEmptyString(product.name) ||
    typeof product.description !== 'string' ||
    !nonEmptyString(product.price) ||
    !nonEmptyString(product.displayPrice) ||
    !nonEmptyString(product.currency) ||
    !Array.isArray(product.modifierIds) ||
    !product.modifierIds.every(nonEmptyString) ||
    new Set(product.modifierIds).size !== product.modifierIds.length ||
    (product.availability !== undefined &&
      typeof product.availability !== 'string')
  ) {
    return undefined;
  }

  const images = product.images ?? [];
  if (!Array.isArray(images)) return undefined;

  const safeImages = images.map(optionalHttpsUrl);
  if (safeImages.some((image) => image === false)) return undefined;

  if (product.nutrition !== undefined && !isObject(product.nutrition)) {
    return undefined;
  }

  const calorieCount = product.nutrition?.calorieCount;
  if (
    calorieCount !== undefined &&
    calorieCount !== null &&
    (!Number.isSafeInteger(calorieCount) || calorieCount < 0)
  ) {
    return undefined;
  }

  const description = product.description.trim();
  const imageUrl = safeImages.find(
    (image): image is string => typeof image === 'string',
  );

  return Object.freeze({
    availability:
      product.availability === 'AVAILABLE' ? 'available' : 'unavailable',
    ...(calorieCount === undefined || calorieCount === null
      ? {}
      : { calorieCount }),
    ...(description ? { description } : {}),
    id: product.id,
    ...(imageUrl ? { imageUrl } : {}),
    name: product.name,
    priceLabel: product.displayPrice,
  });
}

function projectProducts(
  products: readonly unknown[],
): readonly CatalogProductPresentation[] | undefined {
  const seen = new Set<string>();
  const projected: CatalogProductPresentation[] = [];

  for (const product of products) {
    const result = projectProduct(product);
    if (!result || seen.has(result.id)) return undefined;
    seen.add(result.id);
    projected.push(result);
  }

  return Object.freeze(projected);
}

export function projectCatalogSnapshot(
  source: StorefrontBootstrapSnapshot,
): CatalogProjectionResult {
  if (
    !isObject(source) ||
    !isObject(source.merchant) ||
    !isObject(source.location) ||
    !isObject(source.menus) ||
    !isObject(source.readiness) ||
    !nonEmptyString(source.merchant.name) ||
    typeof source.merchant.bio !== 'string' ||
    !nonEmptyString(source.location.restaurantDisplayName) ||
    !nonEmptyString(source.location.addressString) ||
    !Array.isArray(source.menus.menus) ||
    !Array.isArray(source.menus.popularProducts)
  ) {
    return INVALID_PROJECTION;
  }

  const coverImageUrl = optionalHttpsUrl(
    source.merchant.cover || source.location.coverPhoto,
  );
  const logoImageUrl = optionalHttpsUrl(
    source.merchant.logo || source.location.restaurantLogo,
  );
  if (coverImageUrl === false || logoImageUrl === false) {
    return INVALID_PROJECTION;
  }

  const menuIds = new Set<string>();
  const categoryIds = new Set<string>();
  const sections: CatalogSectionPresentation[] = [];
  let activeMenuCount = 0;

  for (const menu of source.menus.menus) {
    if (
      !isObject(menu) ||
      !nonEmptyString(menu.id) ||
      !nonEmptyString(menu.name) ||
      typeof menu.isActive !== 'boolean' ||
      !Array.isArray(menu.categories) ||
      menuIds.has(menu.id)
    ) {
      return INVALID_PROJECTION;
    }
    menuIds.add(menu.id);

    if (!menu.isActive) continue;
    activeMenuCount += 1;

    for (const category of menu.categories) {
      if (
        !isObject(category) ||
        !nonEmptyString(category.id) ||
        !nonEmptyString(category.name) ||
        !Array.isArray(category.products) ||
        categoryIds.has(category.id)
      ) {
        return INVALID_PROJECTION;
      }

      const products = projectProducts(category.products);
      if (!products) return INVALID_PROJECTION;
      categoryIds.add(category.id);

      const imageUrl = products.find((product) => product.imageUrl)?.imageUrl;
      sections.push(
        Object.freeze({
          id: category.id,
          ...(imageUrl ? { imageUrl } : {}),
          products,
          title: category.name,
        }),
      );
    }
  }

  const popularProducts = projectProducts(source.menus.popularProducts);
  if (!popularProducts) return INVALID_PROJECTION;

  const merchantBio = source.merchant.bio.trim();
  const snapshot = Object.freeze({
    canStartOrder: source.readiness.ready === true,
    hero: Object.freeze({
      ...(typeof coverImageUrl === 'string' ? { coverImageUrl } : {}),
      ...(typeof logoImageUrl === 'string' ? { logoImageUrl } : {}),
      ...(merchantBio ? { merchantBio } : {}),
      merchantName: source.merchant.name,
    }),
    location: Object.freeze({
      address: source.location.addressString,
      name: source.location.restaurantDisplayName,
    }),
    popularProducts,
    sections: Object.freeze(sections),
  });

  if (activeMenuCount === 0) {
    return Object.freeze({ ok: true, snapshot, status: 'unpublished' });
  }
  if (sections.every((section) => section.products.length === 0)) {
    return Object.freeze({ ok: true, snapshot, status: 'empty' });
  }

  return Object.freeze({ ok: true, snapshot, status: 'ready' });
}

export function catalogFailureState(
  failure: StorefrontFailure,
): CatalogBrowseState {
  if (failure.kind === 'not_found') {
    return Object.freeze({
      ...(failure.requestId ? { requestId: failure.requestId } : {}),
      retryable: false,
      status: 'not-found',
    });
  }

  const status: CatalogBrowseFailureStatus =
    failure.kind === 'unavailable' ? 'unavailable' : 'error';

  return Object.freeze({
    ...(failure.requestId ? { requestId: failure.requestId } : {}),
    retryable: failure.retryable,
    status,
  });
}

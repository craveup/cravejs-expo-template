import type {
  AddCartItemPayload,
  Product,
  SelectedModifierTypes,
} from '@craveup/storefront-sdk';

import { buildModifierSelectionPayload } from '../../domain/modifiers/index.ts';
import type { ModifierValidationIssue } from '../../domain/modifiers/types.ts';
import type { LocalStateStore } from '../../lib/local-state-store.ts';
import {
  assertSafeStorefrontResourceId,
  createStorefrontSessionScope,
  type StorefrontSessionScope,
} from '../../lib/storefront-session-scope.ts';

export const FAVOURITES_SCHEMA_VERSION = 1 as const;

export type FavouriteConfiguration = Readonly<{
  productId: string;
  selections: readonly SelectedModifierTypes[];
}>;

type StoredFavourites = Readonly<{
  environmentNamespace: string;
  items: readonly FavouriteConfiguration[];
  locationId: string;
  merchantSlug: string;
  schemaVersion: typeof FAVOURITES_SCHEMA_VERSION;
}>;

export type FavouriteWriteResult =
  | Readonly<{ item: FavouriteConfiguration; ok: true }>
  | Readonly<{
      issues: readonly ModifierValidationIssue[];
      ok: false;
      reason: 'invalid_configuration';
    }>
  | Readonly<{ ok: false; reason: 'invalid_product' }>;

export type FavouriteResolution =
  | Readonly<{
      cartIntent: AddCartItemPayload;
      item: FavouriteConfiguration;
      kind: 'ready';
      product: Product;
    }>
  | Readonly<{
      item: FavouriteConfiguration;
      kind: 'repair_required';
      product: Product;
      issues: readonly ModifierValidationIssue[];
    }>
  | Readonly<{
      item: FavouriteConfiguration;
      kind: 'missing_product';
    }>;

export interface FavouritesStore {
  list(): Promise<readonly FavouriteConfiguration[]>;
  remove(productId: string): Promise<boolean>;
  resolve(products: readonly Product[]): Promise<readonly FavouriteResolution[]>;
  save(
    product: Product,
    selections: readonly SelectedModifierTypes[],
  ): Promise<FavouriteWriteResult>;
}

const SAFE_PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_FAVOURITES = 100;
const MAX_SELECTION_DEPTH = 8;
const MAX_SELECTIONS_PER_LEVEL = 100;

function favouritesKey(scope: StorefrontSessionScope): string {
  return `storefront.favourites.v1.${scope.environmentNamespace}.${scope.merchantSlug}.${scope.locationId}`;
}

function cloneSelections(
  selections: readonly SelectedModifierTypes[],
): SelectedModifierTypes[] {
  return selections.map((selection) => ({
    groupId: selection.groupId,
    selectedOptions: selection.selectedOptions.map((option) => ({
      ...(option.children
        ? { children: cloneSelections(option.children) }
        : {}),
      optionId: option.optionId,
      quantity: option.quantity,
    })),
  }));
}

function parseSelections(
  value: unknown,
  depth = 0,
): SelectedModifierTypes[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length > MAX_SELECTIONS_PER_LEVEL ||
    depth > MAX_SELECTION_DEPTH
  ) {
    return undefined;
  }

  const selections: SelectedModifierTypes[] = [];

  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) return undefined;
    const groupId = Reflect.get(candidate, 'groupId');
    const selectedOptions = Reflect.get(candidate, 'selectedOptions');

    if (
      typeof groupId !== 'string' ||
      !SAFE_PUBLIC_ID_PATTERN.test(groupId) ||
      !Array.isArray(selectedOptions) ||
      selectedOptions.length > MAX_SELECTIONS_PER_LEVEL
    ) {
      return undefined;
    }

    const options: SelectedModifierTypes['selectedOptions'] = [];

    for (const option of selectedOptions) {
      if (typeof option !== 'object' || option === null) return undefined;
      const optionId = Reflect.get(option, 'optionId');
      const quantity = Reflect.get(option, 'quantity');
      const children = Reflect.get(option, 'children');

      if (
        typeof optionId !== 'string' ||
        !SAFE_PUBLIC_ID_PATTERN.test(optionId) ||
        typeof quantity !== 'number' ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        return undefined;
      }

      const parsedChildren =
        children === undefined
          ? undefined
          : parseSelections(children, depth + 1);
      if (children !== undefined && parsedChildren === undefined) return undefined;

      options.push({
        ...(parsedChildren ? { children: parsedChildren } : {}),
        optionId,
        quantity,
      });
    }

    selections.push({ groupId, selectedOptions: options });
  }

  return selections;
}

function parseRecord(
  value: string,
  scope: StorefrontSessionScope,
): StoredFavourites | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;

  if (
    record.schemaVersion !== FAVOURITES_SCHEMA_VERSION ||
    record.environmentNamespace !== scope.environmentNamespace ||
    record.merchantSlug !== scope.merchantSlug ||
    record.locationId !== scope.locationId ||
    !Array.isArray(record.items) ||
    record.items.length > MAX_FAVOURITES
  ) {
    return undefined;
  }

  const items: FavouriteConfiguration[] = [];
  const productIds = new Set<string>();

  for (const candidate of record.items) {
    if (typeof candidate !== 'object' || candidate === null) return undefined;
    const productId = Reflect.get(candidate, 'productId');
    const selections = parseSelections(Reflect.get(candidate, 'selections'));

    if (
      typeof productId !== 'string' ||
      !SAFE_PUBLIC_ID_PATTERN.test(productId) ||
      !selections ||
      productIds.has(productId)
    ) {
      return undefined;
    }

    productIds.add(productId);
    items.push(Object.freeze({ productId, selections }));
  }

  return Object.freeze({
    environmentNamespace: scope.environmentNamespace,
    items,
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    schemaVersion: FAVOURITES_SCHEMA_VERSION,
  });
}

export function createFavouritesStore(
  inputScope: StorefrontSessionScope,
  storage: LocalStateStore,
): FavouritesStore {
  const scope = createStorefrontSessionScope(inputScope);
  const key = favouritesKey(scope);
  let operationTail: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.catch(() => undefined).then(operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function read(): Promise<FavouriteConfiguration[]> {
    const value = await storage.getItem(key);
    if (value === null) return [];

    const record = parseRecord(value, scope);

    if (!record) {
      await storage.removeItem(key);
      return [];
    }

    return record.items.map((item) =>
      Object.freeze({
        productId: item.productId,
        selections: cloneSelections(item.selections),
      }),
    );
  }

  async function write(items: readonly FavouriteConfiguration[]): Promise<void> {
    const record: StoredFavourites = Object.freeze({
      environmentNamespace: scope.environmentNamespace,
      items,
      locationId: scope.locationId,
      merchantSlug: scope.merchantSlug,
      schemaVersion: FAVOURITES_SCHEMA_VERSION,
    });
    await storage.setItem(key, JSON.stringify(record));
  }

  return Object.freeze({
    list(): Promise<readonly FavouriteConfiguration[]> {
      return enqueue(read);
    },
    async remove(productIdInput: string): Promise<boolean> {
      let productId: string;

      try {
        productId = assertSafeStorefrontResourceId(productIdInput, 'productId');
      } catch {
        return false;
      }

      return enqueue(async () => {
        const items = await read();
        const retained = items.filter((item) => item.productId !== productId);
        if (retained.length === items.length) return false;

        await write(retained);
        return true;
      });
    },
    async resolve(
      products: readonly Product[],
    ): Promise<readonly FavouriteResolution[]> {
      const productIndex = new Map(
        products
          .filter((product) => product.locationId === scope.locationId)
          .map((product) => [product.id, product]),
      );

      return (await enqueue(read)).map((item): FavouriteResolution => {
        const product = productIndex.get(item.productId);
        if (!product) return Object.freeze({ item, kind: 'missing_product' });

        const payload = buildModifierSelectionPayload(product, item.selections);
        if (!payload.ok) {
          return Object.freeze({
            issues: payload.issues,
            item,
            kind: 'repair_required',
            product,
          });
        }

        return Object.freeze({
          cartIntent: Object.freeze({
            itemUnavailableAction: 'remove_item' as const,
            productId: product.id,
            quantity: 1,
            selections: payload.payload,
          }),
          item,
          kind: 'ready',
          product,
        });
      });
    },
    async save(
      product: Product,
      selections: readonly SelectedModifierTypes[],
    ): Promise<FavouriteWriteResult> {
      if (product.locationId !== scope.locationId) {
        return Object.freeze({ ok: false, reason: 'invalid_product' });
      }

      try {
        assertSafeStorefrontResourceId(product.id, 'productId');
      } catch {
        return Object.freeze({ ok: false, reason: 'invalid_product' });
      }

      const payload = buildModifierSelectionPayload(product, selections);
      if (!payload.ok) {
        return Object.freeze({
          issues: payload.issues,
          ok: false,
          reason: 'invalid_configuration',
        });
      }

      const item: FavouriteConfiguration = Object.freeze({
        productId: product.id,
        selections: cloneSelections(payload.payload),
      });
      return enqueue(async () => {
        const items = (await read()).filter(
          (candidate) => candidate.productId !== item.productId,
        );

        await write([...items, item].slice(-MAX_FAVOURITES));
        return Object.freeze({ item, ok: true });
      });
    },
  });
}

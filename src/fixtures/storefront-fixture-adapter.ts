import { normalizeMerchantSlug } from '../domain/storefront/merchant-scope.ts';
import {
  CANONICAL_STOREFRONT_FIXTURE_PROFILE,
  type CanonicalStorefrontFixture,
  type StorefrontFixtureScope,
} from './storefront-fixtures.ts';

export class StorefrontFixtureIntegrityError extends Error {
  constructor(reason: string) {
    super(`Invalid canonical Storefront fixture: ${reason}`);
    this.name = 'StorefrontFixtureIntegrityError';
  }
}

export class StorefrontFixtureScopeError extends Error {
  constructor(field: keyof StorefrontFixtureScope) {
    super(`Canonical Storefront fixture does not match requested ${field}`);
    this.name = 'StorefrontFixtureScopeError';
  }
}

export type StorefrontFixtureAdapter = Readonly<{
  load(scope: StorefrontFixtureScope): Promise<CanonicalStorefrontFixture>;
  mode: 'fixture';
}>;

function cloneFixture(
  fixture: CanonicalStorefrontFixture,
): CanonicalStorefrontFixture {
  return JSON.parse(JSON.stringify(fixture)) as CanonicalStorefrontFixture;
}

function validateFixture(fixture: CanonicalStorefrontFixture): void {
  if (fixture.profile !== CANONICAL_STOREFRONT_FIXTURE_PROFILE) {
    throw new StorefrontFixtureIntegrityError('unsupported profile');
  }

  const merchant = normalizeMerchantSlug(fixture.scope.merchantSlug);

  if (!merchant.ok || merchant.value !== fixture.scope.merchantSlug) {
    throw new StorefrontFixtureIntegrityError('invalid merchant scope');
  }
  if (!/^env-[a-f0-9]{16}$/.test(fixture.scope.environmentNamespace)) {
    throw new StorefrontFixtureIntegrityError('invalid environment scope');
  }
  if (!/^[a-f0-9]{24}$/.test(fixture.scope.locationId)) {
    throw new StorefrontFixtureIntegrityError('invalid location scope');
  }
  if (fixture.location.id !== fixture.scope.locationId) {
    throw new StorefrontFixtureIntegrityError('location detail is outside the scope');
  }
  if (fixture.location.restaurantSlug !== fixture.scope.merchantSlug) {
    throw new StorefrontFixtureIntegrityError('location detail is outside the merchant scope');
  }

  const matchingLocations = fixture.merchant.locations.filter(
    (location) => location.id === fixture.scope.locationId,
  );

  if (matchingLocations.length !== 1) {
    throw new StorefrontFixtureIntegrityError(
      'merchant must contain exactly one scoped location',
    );
  }
  if (
    fixture.distances.some(
      (distance) =>
        distance.locationId !== fixture.scope.locationId ||
        distance.location.id !== fixture.scope.locationId,
    )
  ) {
    throw new StorefrontFixtureIntegrityError('distance is outside the scope');
  }

  const productIds = new Set(fixture.products.map((product) => product.id));

  if (productIds.size !== fixture.products.length) {
    throw new StorefrontFixtureIntegrityError('product IDs must be unique');
  }

  const hasUnknownProduct = fixture.menus.some((menu) =>
    menu.categories.some((category) =>
      category.products.some((product) => !productIds.has(product.id)),
    ),
  );

  if (hasUnknownProduct) {
    throw new StorefrontFixtureIntegrityError('menu references an unknown product');
  }
}

export function createStorefrontFixtureAdapter(
  fixture: CanonicalStorefrontFixture,
): StorefrontFixtureAdapter {
  validateFixture(fixture);
  const canonicalFixture = cloneFixture(fixture);

  return Object.freeze({
    async load(scope: StorefrontFixtureScope) {
      if (
        scope.environmentNamespace !==
        canonicalFixture.scope.environmentNamespace
      ) {
        throw new StorefrontFixtureScopeError('environmentNamespace');
      }
      if (scope.merchantSlug !== canonicalFixture.scope.merchantSlug) {
        throw new StorefrontFixtureScopeError('merchantSlug');
      }
      if (scope.locationId !== canonicalFixture.scope.locationId) {
        throw new StorefrontFixtureScopeError('locationId');
      }

      return cloneFixture(canonicalFixture);
    },
    mode: 'fixture' as const,
  });
}

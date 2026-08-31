import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CANONICAL_STOREFRONT_FIXTURE_PROFILE,
  createCanonicalStorefrontFixture,
} from './storefront-fixtures.ts';
import {
  StorefrontFixtureIntegrityError,
  StorefrontFixtureScopeError,
  createStorefrontFixtureAdapter,
} from './storefront-fixture-adapter.ts';

test('canonical fixture preserves its published DTO relationships', () => {
  const fixture = createCanonicalStorefrontFixture();
  const location = fixture.merchant.locations.find(
    (candidate) => candidate.id === fixture.scope.locationId,
  );
  const productIds = new Set(fixture.products.map((product) => product.id));

  assert.equal(fixture.profile, CANONICAL_STOREFRONT_FIXTURE_PROFILE);
  assert.equal(location?.id, fixture.location.id);
  assert.equal(fixture.location.id, fixture.scope.locationId);
  assert.equal(fixture.distances[0]?.locationId, fixture.scope.locationId);
  assert.equal(fixture.distances[0]?.location.id, fixture.scope.locationId);
  assert.equal(
    fixture.menus.every((menu) =>
      menu.categories.every((category) =>
        category.products.every((product) => productIds.has(product.id)),
      ),
    ),
    true,
  );
});

test('fixture mode is explicit and performs zero Storefront requests', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
    throw new Error('fixture mode attempted a network request');
  };

  try {
    const adapter = createStorefrontFixtureAdapter(createCanonicalStorefrontFixture());
    const snapshot = await adapter.load({
      environmentNamespace: 'env-edba1d5cf699b81a',
      locationId: '0123456789abcdef01234567',
      merchantSlug: 'fixture-merchant',
    });

    assert.equal(adapter.mode, 'fixture');
    assert.equal(snapshot.profile, 'canonical-storefront-v1');
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fixture adapter rejects wrong tenant scope without a fallback', async () => {
  const adapter = createStorefrontFixtureAdapter(createCanonicalStorefrontFixture());

  for (const scope of [
    {
      environmentNamespace: 'env-edba1d5cf699b81a',
      locationId: '0123456789abcdef01234567',
      merchantSlug: 'another-merchant',
    },
    {
      environmentNamespace: 'env-edba1d5cf699b81a',
      locationId: 'fedcba9876543210fedcba98',
      merchantSlug: 'fixture-merchant',
    },
    {
      environmentNamespace: 'env-0123456789abcdef',
      locationId: '0123456789abcdef01234567',
      merchantSlug: 'fixture-merchant',
    },
  ]) {
    await assert.rejects(
      adapter.load(scope),
      (error: unknown) => error instanceof StorefrontFixtureScopeError,
    );
  }
});

test('fixture adapter rejects cross-resource fixture drift', () => {
  const wrongLocation = createCanonicalStorefrontFixture();
  wrongLocation.location.id = 'fedcba9876543210fedcba98';

  assert.throws(
    () => createStorefrontFixtureAdapter(wrongLocation),
    (error: unknown) => error instanceof StorefrontFixtureIntegrityError,
  );

  const unknownProduct = createCanonicalStorefrontFixture();
  unknownProduct.menus[0]!.categories[0]!.products.push({
    ...unknownProduct.menus[0]!.categories[0]!.products[0]!,
    id: 'unknown-product',
  });

  assert.throws(
    () => createStorefrontFixtureAdapter(unknownProduct),
    (error: unknown) => error instanceof StorefrontFixtureIntegrityError,
  );

  const duplicateProduct = createCanonicalStorefrontFixture();
  duplicateProduct.products.push({ ...duplicateProduct.products[0]! });

  assert.throws(
    () => createStorefrontFixtureAdapter(duplicateProduct),
    (error: unknown) => error instanceof StorefrontFixtureIntegrityError,
  );

  const wrongMerchant = createCanonicalStorefrontFixture();
  wrongMerchant.location.restaurantSlug = 'another-merchant';

  assert.throws(
    () => createStorefrontFixtureAdapter(wrongMerchant),
    (error: unknown) => error instanceof StorefrontFixtureIntegrityError,
  );
});

test('fixture reads are isolated from mutations by other consumers', async () => {
  const adapter = createStorefrontFixtureAdapter(createCanonicalStorefrontFixture());
  const scope = {
    environmentNamespace: 'env-edba1d5cf699b81a',
    locationId: '0123456789abcdef01234567',
    merchantSlug: 'fixture-merchant',
  };
  const first = await adapter.load(scope);

  first.merchant.name = 'mutated by a consumer';
  first.products[0]!.name = 'mutated product';

  const second = await adapter.load(scope);

  assert.equal(second.merchant.name, 'Fixture Merchant');
  assert.equal(second.products[0]?.name, 'Fixture Product');
});

test('fixture reads do not depend on a structuredClone runtime global', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'structuredClone',
  );

  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    value: undefined,
    writable: true,
  });

  try {
    await assert.doesNotReject(async () => {
      const adapter = createStorefrontFixtureAdapter(
        createCanonicalStorefrontFixture(),
      );
      const snapshot = await adapter.load({
        environmentNamespace: 'env-edba1d5cf699b81a',
        locationId: '0123456789abcdef01234567',
        merchantSlug: 'fixture-merchant',
      });

      assert.equal(snapshot.profile, CANONICAL_STOREFRONT_FIXTURE_PROFILE);
    });
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'structuredClone', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'structuredClone');
    }
  }
});

test('fixture source contains no runtime client, endpoint, or sensitive values', () => {
  const fixtureSource = readFileSync(
    new URL('./storefront-fixtures.ts', import.meta.url),
    'utf8',
  );
  const adapterSource = readFileSync(
    new URL('./storefront-fixture-adapter.ts', import.meta.url),
    'utf8',
  );
  const source = `${fixtureSource}\n${adapterSource}`;

  assert.doesNotMatch(source, /createStorefrontClient|\bfetch\b|\/api\/v1\/storefront/);
  assert.doesNotMatch(
    source,
    /apiKey|customerJwt|cartCapability|receiptCapability|clientSecret|providerMemberId/i,
  );
  assert.match(source, /import type \{[\s\S]+\} from '@craveup\/storefront-sdk'/);
});

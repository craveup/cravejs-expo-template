import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import { createInMemoryLocalStateStore } from '../../lib/local-state-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import { createFavouritesStore } from './favourites-store.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-edba1d5cf699b81a',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'fixture-merchant',
});

test('configured favourites survive restart and produce a validated shared cart intent', async () => {
  const storage = createInMemoryLocalStateStore();
  const products = createCanonicalStorefrontFixture().products;
  const customizableProduct = products[1]!;
  const store = createFavouritesStore(scope, storage);

  const saved = await store.save(customizableProduct, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [
        { optionId: 'modifier-option-oat-milk', quantity: 1 },
      ],
    },
  ]);
  const resolved = await createFavouritesStore(scope, storage).resolve(products);

  assert.equal(saved.ok, true);
  assert.deepEqual(resolved, [
    {
      cartIntent: {
        itemUnavailableAction: 'remove_item',
        productId: 'product-customizable',
        quantity: 1,
        selections: [
          {
            groupId: 'modifier-milk',
            selectedOptions: [
              { optionId: 'modifier-option-oat-milk', quantity: 1 },
            ],
          },
        ],
      },
      item: {
        productId: 'product-customizable',
        selections: [
          {
            groupId: 'modifier-milk',
            selectedOptions: [
              { optionId: 'modifier-option-oat-milk', quantity: 1 },
            ],
          },
        ],
      },
      kind: 'ready',
      product: customizableProduct,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(await store.list()), /price|total|specialInstructions/i);
});

test('favourites are isolated by environment, merchant, and location', async () => {
  const storage = createInMemoryLocalStateStore();
  const product = createCanonicalStorefrontFixture().products[0]!;
  const staging = createFavouritesStore(scope, storage);

  await staging.save(product, []);

  for (const anotherScope of [
    { ...scope, environmentNamespace: 'env-0123456789abcdef' },
    { ...scope, merchantSlug: 'another-merchant' },
    { ...scope, locationId: 'fedcba9876543210fedcba98' },
  ]) {
    assert.deepEqual(
      await createFavouritesStore(anotherScope, storage).list(),
      [],
    );
  }

  assert.equal((await staging.list()).length, 1);
});

test('removed, sold-out, and changed products require repair instead of stale add', async () => {
  const storage = createInMemoryLocalStateStore();
  const products = createCanonicalStorefrontFixture().products;
  const customizableProduct = products[1]!;
  const store = createFavouritesStore(scope, storage);
  await store.save(customizableProduct, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [
        { optionId: 'modifier-option-whole-milk', quantity: 1 },
      ],
    },
  ]);

  assert.equal((await store.resolve([]))[0]?.kind, 'missing_product');
  assert.equal(
    (
      await store.resolve([
        { ...customizableProduct, availability: 'SOLD_OUT' },
      ])
    )[0]?.kind,
    'repair_required',
  );
  assert.equal(
    (
      await store.resolve([
        {
          ...customizableProduct,
          modifiers: [
            {
              ...customizableProduct.modifiers[0]!,
              items: [customizableProduct.modifiers[0]!.items[1]!],
            },
          ],
        },
      ])
    )[0]?.kind,
    'repair_required',
  );
});

test('invalid configurations and cross-location products are never persisted', async () => {
  const storage = createInMemoryLocalStateStore();
  const product = createCanonicalStorefrontFixture().products[1]!;
  const store = createFavouritesStore(scope, storage);

  assert.equal(
    (
      await store.save(product, [
        {
          groupId: 'modifier-milk',
          selectedOptions: [{ optionId: 'missing-option', quantity: 1 }],
        },
      ])
    ).ok,
    false,
  );
  assert.equal(
    (
      await store.save(
        { ...product, locationId: 'fedcba9876543210fedcba98' },
        [],
      )
    ).ok,
    false,
  );
  assert.deepEqual(await store.list(), []);
});

test('remove is scoped and idempotent', async () => {
  const storage = createInMemoryLocalStateStore();
  const product = createCanonicalStorefrontFixture().products[0]!;
  const store = createFavouritesStore(scope, storage);
  await store.save(product, []);

  assert.equal(await store.remove(product.id), true);
  assert.equal(await store.remove(product.id), false);
  assert.equal(await store.remove('../product'), false);
});

test('concurrent favourite writes do not lose either configuration', async () => {
  const records = new Map<string, string>();
  const releaseReads = Promise.withResolvers<void>();
  const storage = {
    async getItem(key: string) {
      const snapshot = records.get(key) ?? null;
      await releaseReads.promise;
      return snapshot;
    },
    async removeItem(key: string) {
      records.delete(key);
    },
    async setItem(key: string, value: string) {
      records.set(key, value);
    },
  };
  const products = createCanonicalStorefrontFixture().products;
  const store = createFavouritesStore(scope, storage);

  const first = store.save(products[0]!, []);
  const second = store.save(products[1]!, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [
        { optionId: 'modifier-option-oat-milk', quantity: 1 },
      ],
    },
  ]);
  await Promise.resolve();
  releaseReads.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(
    (await store.list()).map((item) => item.productId).sort(),
    [products[0]!.id, products[1]!.id].sort(),
  );
});

test('favourites stay local and delegate modifier truth without duplicating cart transport', () => {
  const source = readFileSync(new URL('./favourites-store.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /@craveup\/storefront-sdk(?!['"];)|\bfetch\s*\(|createStorefrontClient|\.cart\.|console\.|process\.env|specialInstructions|price|total/i,
  );
  assert.match(source, /buildModifierSelectionPayload/);
  assert.match(source, /LocalStateStore/);
});

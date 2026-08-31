import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import { createInMemoryLocalStateStore } from '../../lib/local-state-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import { toFavouritePresentationRows } from './favourites-presentation.ts';
import { createFavouritesStore } from './favourites-store.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-edba1d5cf699b81a',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'fixture-merchant',
});

test('ready favourites use public names and only show an authoritative unconfigured price', async () => {
  const storage = createInMemoryLocalStateStore();
  const products = createCanonicalStorefrontFixture().products;
  const store = createFavouritesStore(scope, storage);

  await store.save({ ...products[0]!, images: [' https://images.example/product.png '] }, []);
  await store.save(products[1]!, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [{ optionId: 'modifier-option-oat-milk', quantity: 1 }],
    },
  ]);

  const resolutions = await store.resolve([
    { ...products[0]!, images: [' https://images.example/product.png '] },
    products[1]!,
  ]);

  assert.deepEqual(toFavouritePresentationRows(resolutions), [
    {
      id: 'product-basic',
      imageUri: 'https://images.example/product.png',
      kind: 'ready',
      name: 'Fixture Product',
      priceLabel: '$4.00',
    },
    {
      id: 'product-customizable',
      kind: 'ready',
      name: 'Fixture Customizable Product',
      selectionLabel: 'Oat milk',
    },
  ]);
});

test('presentation rows expose only valid HTTPS product images', async () => {
  const product = createCanonicalStorefrontFixture().products[0]!;
  const store = createFavouritesStore(scope, createInMemoryLocalStateStore());

  await store.save(product, []);

  const [row] = toFavouritePresentationRows(
    await store.resolve([
      {
        ...product,
        images: [
          'data:image/png;base64,not-public-catalog-data',
          'http://images.example/product.png',
          'https://user:password@images.example/product.png',
          ' https://images.example/product.png?size=card ',
        ],
      },
    ]),
  );

  assert.equal(row?.imageUri, 'https://images.example/product.png?size=card');
});

test('presentation rows omit malformed product images', async () => {
  const product = createCanonicalStorefrontFixture().products[0]!;
  const store = createFavouritesStore(scope, createInMemoryLocalStateStore());

  await store.save(product, []);

  const [row] = toFavouritePresentationRows(
    await store.resolve([
      {
        ...product,
        images: ['not a URL', 'file:///private/catalog-image.png'],
      },
    ]),
  );

  assert.equal(row?.imageUri, undefined);
});

test('selection labels preserve public quantities without calculating money', async () => {
  const product = createCanonicalStorefrontFixture().products[1]!;
  const quantityProduct = {
    ...product,
    modifiers: [
      {
        ...product.modifiers[0]!,
        items: product.modifiers[0]!.items.map((item) => ({
          ...item,
          maxQuantity: 2,
        })),
        rule: { max: 2, min: 1 },
      },
    ],
  };
  const store = createFavouritesStore(scope, createInMemoryLocalStateStore());
  await store.save(quantityProduct, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [{ optionId: 'modifier-option-oat-milk', quantity: 2 }],
    },
  ]);

  const rows = toFavouritePresentationRows(await store.resolve([quantityProduct]));

  assert.equal(rows[0]?.selectionLabel, 'Oat milk ×2');
  assert.equal(rows[0]?.priceLabel, undefined);
  assert.equal(Reflect.has(rows[0] ?? {}, 'cartIntent'), false);
});

test('changed and removed products fail closed into controlled presentation rows', async () => {
  const product = createCanonicalStorefrontFixture().products[1]!;
  const store = createFavouritesStore(scope, createInMemoryLocalStateStore());
  await store.save(product, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [{ optionId: 'modifier-option-oat-milk', quantity: 1 }],
    },
  ]);

  const repairRows = toFavouritePresentationRows(
    await store.resolve([{ ...product, availability: 'SOLD_OUT' }]),
  );
  const missingRows = toFavouritePresentationRows(await store.resolve([]));

  assert.deepEqual(repairRows, [
    {
      id: product.id,
      kind: 'repair_required',
      name: product.name,
      selectionLabel: 'Oat milk',
    },
  ]);
  assert.deepEqual(missingRows, [
    {
      id: product.id,
      kind: 'missing_product',
    },
  ]);
});

test('4G presentation stays route-free, localized, tokenized, and action-gated', () => {
  const source = readFileSync(
    new URL('./FavouritesPresentation.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /colors\.contentCanvas/);
  assert.match(source, /sizes\.minimumTouchTarget/);
  assert.match(source, /isReady && onAdd/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /favourites\.action\.addAccessibility/);
  assert.match(source, /favourites\.missingProduct/);
  assert.match(source, /useWindowDimensions/);
  assert.match(source, /getResponsiveLayout\(width, fontScale\)/);
  assert.match(source, /maxWidth: layout\.contentMaxWidth/);
  assert.match(source, /paddingHorizontal: layout\.horizontalPadding/);
  assert.doesNotMatch(source, /Signature Icy Peak|ABC Chai|Hokkaido|\$\d/);
  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|createStorefrontClient|SecureStore|\.cart\.|process\.env|#[0-9A-Fa-f]{3,8}/,
  );
});

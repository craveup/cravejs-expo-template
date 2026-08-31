import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import type { StorefrontBootstrapSnapshot } from '../../lib/storefront-bootstrap-service.ts';
import {
  catalogFailureState,
  projectCatalogSnapshot,
} from './catalog-browse.ts';
import {
  catalogBrowseReducer,
  isCatalogOffline,
} from './catalog-browse-state.ts';
import * as catalogBrowseState from './catalog-browse-state.ts';

function snapshot(): StorefrontBootstrapSnapshot {
  const fixture = createCanonicalStorefrontFixture();
  const products = fixture.menus[0]!.categories[0]!.products.map(
    (product, index) => ({
      ...product,
      availability: index === 0 ? 'AVAILABLE' : 'SOLD_OUT',
      images: [`https://cdn.example.test/product-${index}.png`],
      ...(index === 0 ? { nutrition: { calorieCount: 120 } } : {}),
    }),
  );

  return {
    location: fixture.location,
    menus: {
      menus: [
        {
          ...fixture.menus[0]!,
          categories: [
            {
              ...fixture.menus[0]!.categories[0]!,
              products,
            },
          ],
        },
      ],
      popularProducts: [products[1]!],
    },
    merchant: {
      ...fixture.merchant,
      cover: 'https://cdn.example.test/cover.png',
      logo: 'https://cdn.example.test/logo.png',
    },
    readiness: {
      fulfillmentMethod: 'takeout',
      orderDate: '2099-01-01',
      orderTime: '10:30 AM - 10:45 AM',
      pickupType: 'ASAP',
      ready: true,
    },
  };
}

test('catalog projection preserves server order and authoritative display fields', () => {
  const input = snapshot();
  const before = JSON.stringify(input);
  const result = projectCatalogSnapshot(input);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, 'ready');
  assert.equal(result.snapshot.hero.coverImageUrl, 'https://cdn.example.test/cover.png');
  assert.equal(result.snapshot.sections[0]?.imageUrl, 'https://cdn.example.test/product-0.png');
  assert.deepEqual(
    result.snapshot.sections[0]?.products.map((product) => product.id),
    input.menus.menus[0]?.categories[0]?.products.map((product) => product.id),
  );
  assert.equal(result.snapshot.sections[0]?.products[0]?.priceLabel, '$4.00');
  assert.equal(result.snapshot.sections[0]?.products[0]?.calorieCount, 120);
  assert.equal(result.snapshot.sections[0]?.products[1]?.availability, 'unavailable');
  assert.equal(result.snapshot.popularProducts[0]?.id, 'product-customizable');
  assert.equal(JSON.stringify(input), before);
});

test('inactive menus are unpublished and active menus with no products are empty', () => {
  const unpublished = snapshot();
  unpublished.menus.menus[0]!.isActive = false;
  const unpublishedResult = projectCatalogSnapshot(unpublished);
  assert.equal(unpublishedResult.ok && unpublishedResult.status, 'unpublished');

  const empty = snapshot();
  empty.menus.menus[0]!.categories[0]!.products = [];
  empty.menus.popularProducts = [];
  const emptyResult = projectCatalogSnapshot(empty);
  assert.equal(emptyResult.ok && emptyResult.status, 'empty');
});

test('malformed and duplicate catalog records fail closed', () => {
  const duplicateMenu = snapshot();
  duplicateMenu.menus.menus.push({ ...duplicateMenu.menus.menus[0]! });
  assert.deepEqual(projectCatalogSnapshot(duplicateMenu), {
    ok: false,
    reason: 'invalid-catalog',
  });

  const duplicateProduct = snapshot();
  const product = duplicateProduct.menus.menus[0]!.categories[0]!.products[0]!;
  duplicateProduct.menus.menus[0]!.categories[0]!.products.push({ ...product });
  assert.equal(projectCatalogSnapshot(duplicateProduct).ok, false);

  const unsafeImage = snapshot();
  unsafeImage.menus.menus[0]!.categories[0]!.products[0]!.images = [
    'http://cdn.example.test/product.png',
  ];
  assert.equal(projectCatalogSnapshot(unsafeImage).ok, false);

  const invalidCalories = snapshot();
  invalidCalories.menus.menus[0]!.categories[0]!.products[0]!.nutrition = {
    calorieCount: -1,
  };
  assert.equal(projectCatalogSnapshot(invalidCalories).ok, false);

  for (const malformed of [
    () => {
      const value = snapshot();
      value.menus.menus = [null] as never;
      return value;
    },
    () => {
      const value = snapshot();
      value.menus.menus[0]!.categories = [null] as never;
      return value;
    },
    () => {
      const value = snapshot();
      value.menus.menus[0]!.categories[0]!.products = [null] as never;
      return value;
    },
    () => {
      const value = snapshot();
      value.menus.menus[0]!.categories[0]!.products[0]!.modifierIds = [
        'modifier-1',
        'modifier-1',
      ];
      return value;
    },
  ]) {
    assert.doesNotThrow(() => {
      assert.deepEqual(projectCatalogSnapshot(malformed()), {
        ok: false,
        reason: 'invalid-catalog',
      });
    });
  }
});

test('catalog failures expose only safe retry and request metadata', () => {
  assert.deepEqual(
    catalogFailureState({
      kind: 'not_found',
      requestId: 'request-404',
      retryable: false,
    }),
    { requestId: 'request-404', retryable: false, status: 'not-found' },
  );
  assert.deepEqual(
    catalogFailureState({ kind: 'timeout', retryable: true }),
    { retryable: true, status: 'error' },
  );
  assert.deepEqual(
    catalogFailureState({ kind: 'unavailable', retryable: true }),
    { retryable: true, status: 'unavailable' },
  );
});

test('network and reducer states are explicit and retain no stale catalog', () => {
  assert.equal(isCatalogOffline({ isConnected: false }), true);
  assert.equal(isCatalogOffline({ isConnected: true, isInternetReachable: false }), true);
  assert.equal(isCatalogOffline({}), false);
  assert.deepEqual(catalogBrowseReducer({ status: 'idle' }, { type: 'load' }), {
    status: 'loading',
  });
  assert.deepEqual(
    catalogBrowseReducer(
      { status: 'loading' },
      { type: 'offline' },
    ),
    { status: 'offline' },
  );
});

test('catalog presentation and controller boundaries contain no direct transport or persistence', () => {
  const files = [
    './CatalogBrowseProvider.tsx',
    './CatalogProductCard.tsx',
    './CatalogStatePresentation.tsx',
    './HomeCatalogPresentation.tsx',
    './MenuCatalogPresentation.tsx',
  ];
  const source = files
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|SecureStore|process\.env|createStorefrontClient|https:\/\/www\.figma\.com/,
  );
  assert.doesNotMatch(source, /SCAN|FLAVOURSMITH|Ready in about/i);
  assert.match(source, /StorefrontBootstrapService/);
  assert.match(source, /useNetworkState/);
});

test('tab shell exposes exactly Home, Menu, Bag, and Rewards in order', () => {
  const layout = readFileSync(
    new URL('../../app/(tabs)/_layout.tsx', import.meta.url),
    'utf8',
  );
  const screens = layout.match(/<Tabs\.Screen/g) ?? [];

  assert.equal(screens.length, 4);
  assert.match(layout, /name="\(home\)"/);
  assert.match(layout, /name="\(menu\)"/);
  assert.match(layout, /name="\(bag\)"/);
  assert.match(layout, /name="\(rewards\)"/);
  assert.ok(layout.indexOf('name="(home)"') < layout.indexOf('name="(menu)"'));
  assert.ok(layout.indexOf('name="(menu)"') < layout.indexOf('name="(bag)"'));
  assert.ok(layout.indexOf('name="(bag)"') < layout.indexOf('name="(rewards)"'));
  assert.doesNotMatch(layout, /tabBarButton:[\s\S]*\(\) => null/);
  assert.doesNotMatch(layout, /display: 'none'/);
  assert.doesNotMatch(
    layout,
    /name="(?:scan|search|item|locations?)"/i,
  );
});

test('non-catalog tabs do not start catalog bootstrap work', () => {
  const isCatalogBrowsePath = Reflect.get(
    catalogBrowseState,
    'isCatalogBrowsePath',
  );
  const shouldLoadCatalogBrowse = Reflect.get(
    catalogBrowseState,
    'shouldLoadCatalogBrowse',
  );

  assert.equal(typeof isCatalogBrowsePath, 'function');
  assert.equal(typeof shouldLoadCatalogBrowse, 'function');
  if (
    typeof isCatalogBrowsePath !== 'function' ||
    typeof shouldLoadCatalogBrowse !== 'function'
  ) {
    return;
  }

  assert.equal(isCatalogBrowsePath('/'), true);
  assert.equal(isCatalogBrowsePath('/menu'), true);
  assert.equal(isCatalogBrowsePath('/search'), true);
  assert.equal(isCatalogBrowsePath('/rewards'), false);
  assert.equal(shouldLoadCatalogBrowse(false, {}), false);
  assert.equal(
    shouldLoadCatalogBrowse(true, {
      isConnected: true,
      isInternetReachable: true,
    }),
    true,
  );
});

test('Home and Menu preserve the supported Figma browse geometry', () => {
  const home = readFileSync(
    new URL('./HomeCatalogPresentation.tsx', import.meta.url),
    'utf8',
  );
  const menu = readFileSync(
    new URL('./MenuCatalogPresentation.tsx', import.meta.url),
    'utf8',
  );
  const card = readFileSync(
    new URL('./CatalogProductCard.tsx', import.meta.url),
    'utf8',
  );

  assert.match(home, /catalog\.categoriesTitle/);
  assert.match(home, /sections\.length\s*===\s*6/);
  assert.match(home, /catalog\.fullMenu/);
  assert.match(home, /flexWrap:\s*'wrap'/);
  assert.match(home, /categoryImage:[\s\S]*height:\s*82/);
  assert.match(home, /hero:[\s\S]*minHeight:\s*250/);
  assert.doesNotMatch(home, /categoryGrid:[\s\S]*marginEnd:\s*-/);
  assert.doesNotMatch(home, /horizontal[\s\S]{0,800}sections\.map/);

  assert.match(menu, /backgroundColor:\s*colors\.surface/);
  assert.doesNotMatch(menu, /name="store"/);
  assert.match(card, /accessible=\{!onPress\}/);
  assert.match(card, /accessibilityRole=\{onPress \? undefined : 'text'\}/);
  assert.match(card, /rowImage:[\s\S]*height:\s*168[\s\S]*width:\s*112/);
  assert.doesNotMatch(card, /marginTop:\s*'auto'/);
});

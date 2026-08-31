import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { Product } from '@craveup/storefront-sdk';

import type { ItemDetailLoadResult } from '../item/index.ts';
import {
  projectNutritionPresentation,
  type NutritionPresentationState,
} from './nutrition.ts';

const product: Product = {
  availability: 'AVAILABLE',
  currency: 'usd',
  description: 'Roasted tea with milk.',
  displayPrice: '$6.75',
  id: 'product-soba',
  images: [],
  locationId: '0123456789abcdef01234567',
  modifierIds: [],
  modifiers: [],
  name: 'Hokkaido Soba Milk Tea',
  price: '6.75',
};

function ready(
  nutrition: Extract<ItemDetailLoadResult, { kind: 'ready' }>['nutrition'],
): ItemDetailLoadResult {
  return {
    alternatives: [],
    canStartOrder: true,
    kind: 'ready',
    nutrition,
    product,
  };
}

test('projects only supported public nutrition fields', () => {
  const state = projectNutritionPresentation(
    ready({
      calorieCount: 320,
      dietaryPreferences: ['Vegetarian', 'Dairy-free option'],
      ingredients: ['Black tea', 'Milk', 'Buckwheat'],
    }),
  );

  assert.deepEqual(state, {
    data: {
      calorieCount: 320,
      dietaryPreferences: ['Vegetarian', 'Dairy-free option'],
      hasPublishedNutrition: true,
      ingredients: ['Black tea', 'Milk', 'Buckwheat'],
      productName: 'Hokkaido Soba Milk Tea',
    },
    status: 'ready',
  });
  assert.deepEqual(Object.keys(state.data).sort(), [
    'calorieCount',
    'dietaryPreferences',
    'hasPublishedNutrition',
    'ingredients',
    'productName',
  ]);
});

test('keeps the product screen ready with a truthful empty state', () => {
  assert.deepEqual(projectNutritionPresentation(ready({})), {
    data: {
      dietaryPreferences: [],
      hasPublishedNutrition: false,
      ingredients: [],
      productName: 'Hokkaido Soba Milk Tea',
    },
    status: 'ready',
  });
});

test('preserves safe loading failures without inventing product data', () => {
  const statuses = [
    'error',
    'not-found',
    'offline',
    'unavailable',
  ] as const satisfies readonly Exclude<
    NutritionPresentationState['status'],
    'loading' | 'ready'
  >[];

  for (const status of statuses) {
    assert.deepEqual(
      projectNutritionPresentation({ kind: 'failed', status }),
      { status },
    );
  }
});

test('nutrition route stays inside the Menu tab and on shared runtime seams', async () => {
  const [
    route,
    presentation,
    itemPresentation,
    rootLayout,
    tabLayout,
    menuStack,
    routes,
  ] = await Promise.all([
    readFile(
      new URL(
        '../../app/(tabs)/(menu)/item/[productId]/nutrition.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('./NutritionPresentation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../item/ItemDetailPresentation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../app/_layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../app/(tabs)/_layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../app/(tabs)/(menu)/_layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../navigation/routes.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(route, /getStorefrontRuntime\(\)/);
  assert.match(route, /runtime\.services\.bootstrap/);
  assert.match(route, /runtime\.client\.products/);
  assert.match(route, /loadItemDetail/);
  assert.doesNotMatch(rootLayout, /item\/\[productId\]\/nutrition/);
  assert.match(tabLayout, /name="\(menu\)"/);
  assert.match(menuStack, /<Stack/);
  assert.match(routes, /\/item\/:productId\/nutrition/);
  assert.match(itemPresentation, /onViewNutrition/);
  assert.match(presentation, /nutrition\.unavailable/);
  assert.match(presentation, /contentStyle=\{styles\.failureContent\}/);
  assert.doesNotMatch(presentation, /<PresentationLayout[\s\S]{0,160}\bcentered\b/);
  assert.doesNotMatch(
    presentation,
    /expo-router|getStorefrontRuntime|loadItemDetail|useNetworkState/,
  );

  const productionSource = `${route}\n${presentation}`;
  assert.doesNotMatch(
    productionSource,
    /\bfetch\s*\(|createStorefrontClient|SecureStore|process\.env|PaymentSheet|Apple\s*Pay|Google\s*Pay|gift\s*card|\bsugar\b|\bcaffeine\b|\bprotein\b/i,
  );
});

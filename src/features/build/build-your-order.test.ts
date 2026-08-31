import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { Product } from '@craveup/storefront-sdk';

import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import {
  loadBuildYourOrder,
  projectBuildYourOrder,
} from './build-your-order.ts';
import { setItemOptionQuantity } from '../item/item-detail.ts';

const locationId = '0123456789abcdef01234567';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    availability: 'AVAILABLE',
    currency: 'usd',
    description: 'Five choices, one cup nobody else has.',
    displayPrice: '$6.75',
    id: 'product-build-your-order',
    images: ['https://cdn.example.com/build.png'],
    locationId,
    modifierIds: ['tea-base', 'toppers'],
    modifiers: [
      {
        id: 'tea-base',
        items: [
          {
            id: 'icy-peak',
            maxQuantity: 1,
            name: 'Icy Peak Oolong',
            price: '0.00',
          },
          {
            id: 'red-oolong',
            maxQuantity: 1,
            name: 'Red Oolong',
            price: '0.35',
          },
        ],
        name: 'Your tea base',
        rule: { max: 1, min: 1 },
      },
      {
        description: 'Stack as many as you dare',
        id: 'toppers',
        items: [
          {
            id: 'silk-boba',
            maxQuantity: 2,
            name: 'Silk Boba',
            price: '0.95',
          },
        ],
        name: 'Toppers',
        rule: { max: 3, min: 0 },
      },
    ],
    name: 'Build Your Order',
    price: '6.75',
    ...overrides,
  };
}

function bootstrapFor(product: Product): StorefrontBootstrapService {
  return {
    async getOrderTimes() {
      throw new Error('not used');
    },
    async load() {
      return {
        data: {
          location: {
            addressString: '100 Example Avenue',
            id: locationId,
            restaurantDisplayName: 'Reference Tea',
          },
          menus: {
            menus: [
              {
                categories: [
                  {
                    id: 'custom',
                    name: 'Custom',
                    products: [
                      {
                        availability: product.availability,
                        currency: product.currency,
                        description: product.description,
                        displayPrice: product.displayPrice,
                        id: product.id,
                        images: product.images,
                        modifierIds: product.modifierIds,
                        name: product.name,
                        price: product.price,
                      },
                    ],
                  },
                ],
                id: 'menu',
                isActive: true,
                name: 'All day',
              },
            ],
            popularProducts: [],
          },
          merchant: {
            bio: '',
            cover: '',
            currency: 'USD',
            id: 'merchant',
            locations: [
              {
                addressString: '100 Example Avenue',
                coverPhoto: '',
                id: locationId,
                lat: 34,
                lng: -118,
                methodsStatus: {
                  delivery: false,
                  pickup: true,
                  roomService: false,
                  table: false,
                },
                restaurantBio: '',
                restaurantDisplayName: 'Reference Tea',
                restaurantLogo: '',
              },
            ],
            logo: '',
            name: 'Reference Tea',
          },
          readiness: {
            fulfillmentMethod: 'takeout',
            ready: true,
          },
        },
        kind: 'ready' as const,
      };
    },
  } as unknown as StorefrontBootstrapService;
}

test('loads only one published scoped customizable product', async () => {
  const product = buildProduct();
  assert.deepEqual(
    await loadBuildYourOrder(
      {
        bootstrap: bootstrapFor(product),
        locationId,
        products: { get: async () => product },
      },
      product.id,
      { isConnected: true, isInternetReachable: true },
    ),
    { canStartOrder: true, kind: 'ready', product },
  );

  const plainProduct = buildProduct({ modifierIds: [], modifiers: [] });
  assert.deepEqual(
    await loadBuildYourOrder(
      {
        bootstrap: bootstrapFor(plainProduct),
        locationId,
        products: { get: async () => plainProduct },
      },
      plainProduct.id,
      {},
    ),
    { kind: 'failed', status: 'unavailable' },
  );
});

test('projects public modifier steps and a required-option state without client totals', () => {
  const product = buildProduct();
  const empty = projectBuildYourOrder(product, [], false);
  assert.equal(empty.canAdd, false);
  assert.equal(empty.showRequiredOptionError, false);
  assert.equal(empty.missingRequiredGroupName, 'Your tea base');
  assert.deepEqual(empty.selectionSummary, []);
  assert.doesNotMatch(JSON.stringify(empty), /6\.95|configuredTotal|totalLabel/i);

  const attempted = projectBuildYourOrder(product, [], true);
  assert.equal(attempted.showRequiredOptionError, true);

  const withTea = setItemOptionQuantity(
    product,
    [],
    [{ groupId: 'tea-base' }],
    'icy-peak',
    1,
  );
  const completed = setItemOptionQuantity(
    product,
    withTea,
    [{ groupId: 'toppers' }],
    'silk-boba',
    2,
  );
  const ready = projectBuildYourOrder(product, completed, true);
  assert.equal(ready.canAdd, true);
  assert.equal(ready.showRequiredOptionError, false);
  assert.deepEqual(ready.selectionSummary, [
    'Icy Peak Oolong',
    'Silk Boba ×2',
  ]);
});

test('names a missing nested required group after its parent is selected', () => {
  const product = buildProduct({
    modifierIds: ['tea-base'],
    modifiers: [
      {
        id: 'tea-base',
        items: [
          {
            childGroups: [
              {
                group: {
                  id: 'sweetness',
                  items: [
                    { id: 'half', maxQuantity: 1, name: '50%', price: '0.00' },
                  ],
                  name: 'Sweetness',
                  rule: { max: 1, min: 1 },
                },
                groupId: 'sweetness',
              },
            ],
            id: 'icy-peak',
            maxQuantity: 1,
            name: 'Icy Peak Oolong',
            price: '0.00',
          },
        ],
        name: 'Your tea base',
        rule: { max: 1, min: 1 },
      },
    ],
  });
  const withTea = setItemOptionQuantity(
    product,
    [],
    [{ groupId: 'tea-base' }],
    'icy-peak',
    1,
  );

  const model = projectBuildYourOrder(product, withTea, true);
  assert.equal(model.canAdd, false);
  assert.equal(model.missingRequiredGroupName, 'Sweetness');
  assert.equal(model.showRequiredOptionError, true);
});

test('build route stays on the shared SDK, modifier, and cart seams', async () => {
  const [route, service, presentation, navigation] = await Promise.all([
    readFile(
      new URL('../../app/(tabs)/(menu)/build/[productId].tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('./build-your-order.ts', import.meta.url), 'utf8'),
    readFile(new URL('./BuildPresentation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../navigation/routes.ts', import.meta.url), 'utf8'),
  ]);
  const source = `${route}\n${service}\n${presentation}`;

  assert.match(route, /getStorefrontRuntime\(\)/);
  assert.match(route, /runtime\.client\.products/);
  assert.match(route, /runtime\.services\.(bootstrap|cart)/);
  assert.match(route, /submitItemToCart/);
  assert.match(route, /useLocalSearchParams/);
  assert.match(navigation, /id: 'build'[\s\S]{0,120}\/build\/:productId/);
  assert.match(presentation, /build\.addToBagFrom/);
  assert.match(presentation, /price:\s*model\.basePriceLabel/);
  assert.match(presentation, /disabled=\{[\s\S]{0,100}model\.showRequiredOptionError/);
  assert.match(presentation, /hero:[\s\S]*backgroundColor:\s*colors\.ink[\s\S]*minHeight:\s*138/);
  assert.doesNotMatch(presentation, /<Image|expo-image/);
  assert.doesNotMatch(presentation, /model\.basePriceLabel\s*[+*\/]/);
  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|createStorefrontClient|SecureStore|process\.env|FLAVOURSMITH|SCAN|configuredTotal|totalLabel|#[0-9A-Fa-f]{3,8}/i,
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type {
  Product,
  SelectedModifierTypes,
} from '@craveup/storefront-sdk';

import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import {
  createItemCartIntentKey,
  getItemOptionPressQuantity,
  loadItemDetail,
  projectItemFavourite,
  projectItemDetail,
  setItemOptionQuantity,
  submitItemToCart,
  type ItemCartIntentIds,
} from './item-detail.ts';

const locationId = '0123456789abcdef01234567';

function modifierProduct(overrides: Partial<Product> = {}): Product {
  return {
    availability: 'AVAILABLE',
    currency: 'usd',
    description: 'Roasted buckwheat and milk over black tea.',
    displayPrice: '$6.75',
    id: 'product-soba',
    images: ['https://cdn.example.com/soba.png'],
    locationId,
    modifierIds: ['size'],
    modifiers: [
      {
        id: 'size',
        items: [
          { id: 'regular', maxQuantity: 1, name: 'Regular · 16oz', price: '0.00' },
          {
            childGroups: [
              {
                group: {
                  id: 'sweetness',
                  items: [
                    { id: 'half', maxQuantity: 1, name: '50%', price: '0.00' },
                    { id: 'full', maxQuantity: 1, name: '100%', price: '0.00' },
                  ],
                  name: 'Sweetness',
                  rule: { max: 1, min: 1 },
                },
                groupId: 'sweetness',
              },
            ],
            id: 'large',
            maxQuantity: 1,
            name: 'Large · 24oz',
            price: '1.25',
          },
        ],
        name: 'Size',
        rule: { max: 1, min: 1 },
      },
    ],
    name: 'Hokkaido Soba Milk Tea',
    price: '6.75',
    ...overrides,
  };
}

function perParentModifierProduct(): Product {
  return modifierProduct({
    modifierIds: ['servings'],
    modifiers: [
      {
        id: 'servings',
        items: [
          {
            childGroups: [
              {
                applyPerParentQuantity: true,
                group: {
                  id: 'toppings',
                  items: [
                    {
                      id: 'boba',
                      maxQuantity: 2,
                      name: 'Boba',
                      price: '0.75',
                    },
                  ],
                  name: 'Toppings',
                  rule: { max: 1, min: 1 },
                },
                groupId: 'toppings',
              },
            ],
            id: 'cup',
            maxQuantity: 2,
            name: 'Cup',
            price: '0.00',
          },
        ],
        name: 'Servings',
        rule: { max: 2, min: 1 },
      },
    ],
  });
}

function bootstrapFor(products: readonly Product[], ready = true): StorefrontBootstrapService {
  const menuProducts = products.map((product) => ({
    availability: product.availability,
    currency: product.currency,
    description: product.description,
    displayPrice: product.displayPrice,
    id: product.id,
    images: product.images,
    modifierIds: product.modifierIds,
    name: product.name,
    nutrition: product.nutrition,
    price: product.price,
  }));

  return {
    async getOrderTimes() {
      throw new Error('not used');
    },
    async load() {
      return {
        data: {
          location: {
            addressData: {
              city: 'Santa Monica',
              country: 'US',
              lat: 34,
              lng: -118,
              state: 'CA',
              street: '1260 3rd St Promenade',
              zipCode: '90401',
            },
            addressString: '1260 3rd St Promenade, Santa Monica',
            coverPhoto: '',
            id: locationId,
            restaurantBio: '',
            restaurantDisplayName: 'Reference Tea',
            restaurantLogo: '',
            restaurantSlug: 'reference-tea',
          },
          menus: {
            menus: [
              {
                categories: [{ id: 'tea', name: 'Tea', products: menuProducts }],
                id: 'menu',
                isActive: true,
                name: 'All day',
                time: 'All day',
              },
            ],
            popularProducts: menuProducts,
          },
          merchant: {
            bio: '',
            country: 'US',
            cover: '',
            currency: 'USD',
            id: 'merchant',
            locations: [
              {
                addressString: '1260 3rd St Promenade, Santa Monica',
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
          readiness: ready
            ? {
                fulfillmentMethod: 'takeout',
                orderDate: '2099-01-01',
                orderTime: '10:30 AM',
                pickupType: 'ASAP',
                ready: true,
              }
            : { fulfillmentMethod: 'takeout', ready: false, reason: 'closed' },
        },
        kind: 'ready' as const,
      };
    },
  } as unknown as StorefrontBootstrapService;
}

type CartStub = CartService & {
  calls: string[];
};

function cartStub(input: {
  add?: CartServiceResult;
  initial?: ReturnType<CartService['getState']>;
  retry?: CartServiceResult;
  start?: CartServiceResult;
} = {}): CartStub {
  const calls: string[] = [];
  let state =
    input.initial ??
    ({ status: 'idle' } as ReturnType<CartService['getState']>);
  const ready = {
    cart: { id: 'cart-fixture' },
    kind: 'ready',
  } as CartServiceResult;

  return {
    calls,
    addItem: async (intent) => {
      calls.push(`add:${intent.id}:${intent.payload.productId}`);
      state = { status: 'ready' } as ReturnType<CartService['getState']>;
      return input.add ?? ready;
    },
    applyDiscount: async () => ready,
    claim: async () => ready,
    clear: async () => ready,
    dismissError: () => {
      calls.push('dismiss');
      state = { status: 'idle' } as ReturnType<CartService['getState']>;
      return true;
    },
    getState: () => state,
    load: async () => ready,
    removeDiscount: async () => ready,
    removeItem: async () => ready,
    retry: async () => {
      calls.push('retry');
      state = { status: 'ready' } as ReturnType<CartService['getState']>;
      return input.retry ?? ready;
    },
    setCustomer: async () => ready,
    setDeliveryAddress: async () => ready,
    setFulfillment: async () => ready,
    setGratuity: async () => ready,
    setOrderTime: async () => ready,
    start: async (intent) => {
      calls.push(`start:${intent.id}`);
      state = { status: 'ready' } as ReturnType<CartService['getState']>;
      return input.start ?? ready;
    },
    updateItemQuantity: async () => ready,
  };
}

const intents: ItemCartIntentIds = { add: 'item_add_abc_1', start: 'item_start_abc_2' };

test('loads one scoped public product and projects only backed nutrition and alternatives', async () => {
  const soldOut = modifierProduct({
    availability: 'SOLD_OUT',
    id: 'product-sold-out',
    modifierIds: [],
    modifiers: [],
    name: 'Golden Buddha Silk Boba',
  });
  const alternative = modifierProduct({
    id: 'product-alternative',
    modifierIds: [],
    modifiers: [],
    name: 'Signature Icy Peak Boba',
    nutrition: { calorieCount: 320, dietaryPreferences: ['Vegetarian'] },
  });
  const result = await loadItemDetail(
    {
      bootstrap: bootstrapFor([soldOut, alternative]),
      locationId,
      products: { get: async () => soldOut },
    },
    soldOut.id,
    { isConnected: true, isInternetReachable: true },
  );

  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  assert.equal(result.product.id, soldOut.id);
  assert.equal(result.canStartOrder, true);
  assert.deepEqual(result.nutrition, {});
  assert.deepEqual(result.alternatives.map((product) => product.id), [alternative.id]);
});

test('fails closed for offline, cross-location, malformed, and unpublished products', async () => {
  const product = modifierProduct();
  const dependencies = {
    bootstrap: bootstrapFor([product]),
    locationId,
    products: { get: async () => product },
  };

  assert.deepEqual(
    await loadItemDetail(dependencies, product.id, { isConnected: false }),
    { kind: 'failed', status: 'offline' },
  );
  assert.deepEqual(
    await loadItemDetail(
      { ...dependencies, products: { get: async () => ({ ...product, locationId: 'wrong' }) } },
      product.id,
      {},
    ),
    { kind: 'failed', status: 'unavailable' },
  );
  assert.deepEqual(
    await loadItemDetail(
      { ...dependencies, bootstrap: bootstrapFor([]) },
      product.id,
      {},
    ),
    { kind: 'failed', status: 'not-found' },
  );

  assert.deepEqual(
    await loadItemDetail(
      {
        ...dependencies,
        products: {
          get: async () => ({ ...product, name: 'unsafe\nname' }),
        },
      },
      product.id,
      {},
    ),
    { kind: 'failed', status: 'unavailable' },
  );

  assert.deepEqual(
    await loadItemDetail(
      {
        ...dependencies,
        products: {
          get: async () => ({ ...product, description: '   ' }),
        },
      },
      product.id,
      {},
    ),
    { kind: 'failed', status: 'unavailable' },
  );

  assert.deepEqual(
    await loadItemDetail(
      {
        ...dependencies,
        products: {
          get: async () => ({
            ...product,
            modifiers: [
              {
                ...product.modifiers[0]!,
                items: [
                  {
                    ...product.modifiers[0]!.items[1]!,
                    childGroups: [{ groupId: 'sweetness' }],
                  },
                ],
              },
            ],
          }),
        },
      },
      product.id,
      {},
    ),
    { kind: 'failed', status: 'unavailable' },
  );

  assert.deepEqual(
    await loadItemDetail(
      {
        ...dependencies,
        products: {
          get: async () => ({ ...product, modifiers: [{}] as Product['modifiers'] }),
        },
      },
      product.id,
      {},
    ),
    { kind: 'failed', status: 'unavailable' },
  );

  const unsafeNutrition = modifierProduct({
    nutrition: { dietaryPreferences: ['Vegetarian', 'unsafe\npreference'] },
  });
  assert.deepEqual(
    await loadItemDetail(
      {
        bootstrap: bootstrapFor([unsafeNutrition]),
        locationId,
        products: { get: async () => unsafeNutrition },
      },
      unsafeNutrition.id,
      {},
    ),
    { kind: 'failed', status: 'unavailable' },
  );
});

test('updates root and nested public modifier selections without mutating inputs', () => {
  const product = modifierProduct();
  const original: readonly SelectedModifierTypes[] = [];
  const withLarge = setItemOptionQuantity(product, original, [{ groupId: 'size' }], 'large', 1);
  const withSweetness = setItemOptionQuantity(
    product,
    withLarge,
    [
      { groupId: 'size', viaOptionId: 'large' },
      { groupId: 'sweetness' },
    ],
    'half',
    1,
  );

  assert.deepEqual(original, []);
  assert.deepEqual(withSweetness, [
    {
      groupId: 'size',
      selectedOptions: [
        {
          children: [
            {
              groupId: 'sweetness',
              selectedOptions: [{ optionId: 'half', quantity: 1 }],
            },
          ],
          optionId: 'large',
          quantity: 1,
        },
      ],
    },
  ]);
});

test('restores only a saved configuration that still validates against the current product', () => {
  const product = modifierProduct();
  const savedSelections = setItemOptionQuantity(
    product,
    [],
    [{ groupId: 'size' }],
    'regular',
    1,
  );

  assert.deepEqual(
    projectItemFavourite(product, [
      { productId: product.id, selections: savedSelections },
    ]),
    { favourite: true, selections: savedSelections },
  );
  assert.deepEqual(
    projectItemFavourite(product, [
      {
        productId: product.id,
        selections: [
          {
            groupId: 'size',
            selectedOptions: [{ optionId: 'removed-option', quantity: 1 }],
          },
        ],
      },
    ]),
    { favourite: true, selections: [] },
  );
  assert.deepEqual(projectItemFavourite(product, []), {
    favourite: false,
    selections: [],
  });
});

test('applies child min and max once per selected parent quantity', () => {
  const product = perParentModifierProduct();
  const withTwoCups = setItemOptionQuantity(
    product,
    [],
    [{ groupId: 'servings' }],
    'cup',
    2,
  );
  const before = JSON.stringify(withTwoCups);
  const child = projectItemDetail(product, withTwoCups, 1, {}, [])
    .groups[0]?.options[0]?.childGroups[0];
  assert.equal(child?.minimum, 2);
  assert.equal(child?.maximum, 2);

  const completed = setItemOptionQuantity(
    product,
    withTwoCups,
    [
      { groupId: 'servings', viaOptionId: 'cup' },
      { groupId: 'toppings' },
    ],
    'boba',
    2,
  );
  assert.equal(JSON.stringify(withTwoCups), before);
  assert.equal(projectItemDetail(product, completed, 1, {}, []).canAdd, true);
});

test('projects required modifier state and never computes a client-side order total', () => {
  const product = modifierProduct();
  const empty = projectItemDetail(product, [], 1, {}, []);
  assert.equal(empty.canAdd, false);
  assert.equal(empty.addLabel, 'Add 1 to order');
  assert.equal(empty.priceLabel, '$6.75');
  assert.doesNotMatch(JSON.stringify(empty), /7\.70|total/i);

  const selected = setItemOptionQuantity(product, [], [{ groupId: 'size' }], 'regular', 1);
  const required = projectItemDetail(product, selected, 1, {}, []);
  assert.equal(required.canAdd, true);
  assert.equal(
    getItemOptionPressQuantity(required.groups[0]!, required.groups[0]!.options[0]!),
    1,
  );

  const optionalProduct = modifierProduct({
    modifierIds: ['extras'],
    modifiers: [
      {
        id: 'extras',
        items: [{ id: 'boba', maxQuantity: 1, name: 'Boba', price: '0.75' }],
        name: 'Extras',
        rule: { max: 1, min: 0 },
      },
    ],
  });
  const withOptional = setItemOptionQuantity(
    optionalProduct,
    [],
    [{ groupId: 'extras' }],
    'boba',
    1,
  );
  const optional = projectItemDetail(optionalProduct, withOptional, 1, {}, []);
  assert.equal(
    getItemOptionPressQuantity(optional.groups[0]!, optional.groups[0]!.options[0]!),
    0,
  );
});

test('revalidates the latest product immediately before using the shared cart service', async () => {
  const product = modifierProduct({ modifierIds: [], modifiers: [] });
  const cart = cartStub();
  let gets = 0;
  const result = await submitItemToCart({
    cart,
    intents,
    locationId,
    productId: product.id,
    products: {
      async get() {
        gets += 1;
        return product;
      },
    },
    quantity: 2,
    selections: [],
  });

  assert.deepEqual(result, { kind: 'added' });
  assert.equal(gets, 1);
  assert.deepEqual(cart.calls, [
    `start:${intents.start}`,
    `add:${intents.add}:${product.id}`,
  ]);
});

test('rejects changed or sold-out product data before dispatching add item', async () => {
  const product = modifierProduct({ modifierIds: [], modifiers: [] });
  const cart = cartStub({
    initial: { status: 'ready' } as ReturnType<CartService['getState']>,
  });
  const result = await submitItemToCart({
    cart,
    intents,
    locationId,
    productId: product.id,
    products: { get: async () => ({ ...product, availability: 'SOLD_OUT' }) },
    quantity: 1,
    selections: [],
  });

  assert.deepEqual(result, { kind: 'unavailable' });
  assert.deepEqual(cart.calls, []);
});

test('fails closed when cart commands reject or the cart becomes unauthorized', async () => {
  const product = modifierProduct({ modifierIds: [], modifiers: [] });
  const throwingCart = cartStub({
    initial: { status: 'ready' } as ReturnType<CartService['getState']>,
  });
  throwingCart.addItem = async () => {
    throw new Error('cart adapter escaped its failure mapping');
  };
  assert.deepEqual(
    await submitItemToCart({
      cart: throwingCart,
      intents,
      locationId,
      productId: product.id,
      products: { get: async () => product },
      quantity: 1,
      selections: [],
    }),
    { kind: 'unavailable' },
  );

  const unauthorizedCart = cartStub({
    add: { kind: 'terminal', reason: 'unauthorized' },
    initial: { status: 'ready' } as ReturnType<CartService['getState']>,
  });
  assert.deepEqual(
    await submitItemToCart({
      cart: unauthorizedCart,
      intents,
      locationId,
      productId: product.id,
      products: { get: async () => product },
      quantity: 1,
      selections: [],
    }),
    { kind: 'unavailable' },
  );
});

test('preserves the exact uncertain intent and stops after reconciliation', async () => {
  const product = modifierProduct({ modifierIds: [], modifiers: [] });
  const retryCart = cartStub({
    initial: {
      intent: { id: intents.add, kind: 'add_item' },
      previous: { cart: {}, revision: 1 },
      retry: 'same_intent',
      status: 'error',
    } as ReturnType<CartService['getState']>,
  });
  const retry = await submitItemToCart({
    cart: retryCart,
    intents,
    locationId,
    productId: product.id,
    products: { get: async () => product },
    quantity: 1,
    retryPhase: 'add',
    selections: [],
  });
  assert.deepEqual(retry, { kind: 'added' });
  assert.deepEqual(retryCart.calls, ['retry']);

  const reconcileCart = cartStub({
    add: {
      failure: { code: 'CART_CONFLICT', kind: 'conflict', retryable: false },
      kind: 'reconciliation_required',
    },
    initial: { status: 'ready' } as ReturnType<CartService['getState']>,
  });
  const reconciled = await submitItemToCart({
    cart: reconcileCart,
    intents,
    locationId,
    productId: product.id,
    products: { get: async () => product },
    quantity: 1,
    selections: [],
  });
  assert.deepEqual(reconciled, { kind: 'refresh_required' });
  assert.equal(reconcileCart.calls.length, 1);
});

test('intent keys are bounded and route code stays on shared runtime seams', async () => {
  assert.equal(createItemCartIntentKey('add', 1_786_400_000_000, 4), 'item_add_msnsfpq8_4');
  assert.throws(() => createItemCartIntentKey('start', -1, 1));
  assert.throws(() => createItemCartIntentKey('start', 1, 0));

  const [route, service, presentation] = await Promise.all([
    readFile(
      new URL('../../app/(tabs)/(menu)/item/[productId].tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('./item-detail.ts', import.meta.url), 'utf8'),
    readFile(new URL('./ItemDetailPresentation.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(route, /getStorefrontRuntime\(\)/);
  assert.match(route, /runtime\.client\.products/);
  assert.match(route, /runtime\.services\.(bootstrap|cart|favourites)/);
  assert.match(route, /tryGetItemRuntime/);
  assert.match(presentation, /interactionDisabled/);
  assert.match(presentation, /disabled=\{interactionDisabled/);
  assert.match(presentation, /item\.addCountFrom/);
  assert.match(presentation, /price:\s*model\.priceLabel/);
  assert.doesNotMatch(presentation, /model\.priceLabel\s*[+*\/]/);
  assert.doesNotMatch(
    `${route}\n${service}\n${presentation}`,
    /\bfetch\s*\(|createStorefrontClient|SecureStore|process\.env|specialInstructions|Tell me when|sugar|caffeine|protein|totalFormatted|#[0-9A-Fa-f]{3,8}/i,
  );
});

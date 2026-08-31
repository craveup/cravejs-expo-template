import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import { createStorefrontCartFixture } from '../../fixtures/storefront-cart-fixture.ts';
import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import { createInMemoryLocalStateStore } from '../../lib/local-state-store.ts';
import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import { createFavouritesStore } from './favourites-store.ts';
import {
  createFavouriteCartIntentKey,
  isFavouritesOffline,
  loadFavouritesRoute,
  submitFavouriteToCart,
} from './favourites-route.ts';

const fixture = createCanonicalStorefrontFixture();
const scope = createStorefrontSessionScope(fixture.scope);

function bootstrapService(
  overrides: Partial<StorefrontBootstrapService> = {},
): StorefrontBootstrapService {
  return {
    getOrderTimes:
      overrides.getOrderTimes ??
      (async () => ({ data: fixture.orderTimes, kind: 'ready' })),
    load:
      overrides.load ??
      (async () => ({
        data: {
          location: fixture.location,
          menus: { menus: fixture.menus, popularProducts: [] },
          merchant: fixture.merchant,
          readiness: {
            fulfillmentMethod: 'takeout',
            orderDate: '2099-01-01',
            orderTime: '10:30 AM - 10:45 AM',
            pickupType: 'ASAP',
            ready: true,
          },
        },
        kind: 'ready',
      })),
    loadShell:
      overrides.loadShell ??
      (async () => ({
        data: { location: fixture.location, merchant: fixture.merchant },
        kind: 'ready',
      })),
  };
}

function failedCartResult(retryable = false): CartServiceResult {
  return {
    failure: { kind: retryable ? 'timeout' : 'unknown', retryable },
    kind: 'failed',
  };
}

function cartService(
  input: Readonly<{
    addItem: CartService['addItem'];
    dismissError?: CartService['dismissError'];
    getState: CartService['getState'];
    retry?: CartService['retry'];
    start?: CartService['start'];
  }>,
): CartService {
  const failed = () => Promise.resolve(failedCartResult());
  return {
    addItem: input.addItem,
    applyDiscount: failed,
    claim: failed,
    clear: failed,
    dismissError: input.dismissError ?? (() => false),
    getState: input.getState,
    load: failed,
    removeDiscount: failed,
    removeItem: failed,
    retry: input.retry ?? failed,
    setCustomer: failed,
    setDeliveryAddress: failed,
    setFulfillment: failed,
    setGratuity: failed,
    setOrderTime: failed,
    start: input.start ?? failed,
    updateItemQuantity: failed,
  };
}

async function readyResolution() {
  const favourites = createFavouritesStore(
    scope,
    createInMemoryLocalStateStore(),
  );
  await favourites.save(fixture.products[1]!, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [
        { optionId: 'modifier-option-oat-milk', quantity: 1 },
      ],
    },
  ]);
  const [resolution] = await favourites.resolve(fixture.products);
  assert.equal(resolution?.kind, 'ready');
  if (!resolution || resolution.kind !== 'ready') {
    throw new Error('Expected ready favourite fixture.');
  }
  return resolution;
}

test('4G loads only saved products in the active catalog and revalidates modifiers', async () => {
  const favourites = createFavouritesStore(
    scope,
    createInMemoryLocalStateStore(),
  );
  await favourites.save(fixture.products[1]!, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [
        { optionId: 'modifier-option-oat-milk', quantity: 1 },
      ],
    },
  ]);
  const requested: string[] = [];

  const result = await loadFavouritesRoute(
    {
      bootstrap: bootstrapService(),
      favourites,
      locationId: scope.locationId,
      products: {
        async get(locationId, productId) {
          requested.push(`${locationId}:${productId}`);
          return fixture.products.find((product) => product.id === productId)!;
        },
      },
    },
    { isConnected: true, isInternetReachable: true },
  );

  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  assert.deepEqual(requested, [
    `${scope.locationId}:product-customizable`,
  ]);
  assert.equal(result.resolutions[0]?.kind, 'ready');
  assert.deepEqual(
    result.resolutions[0]?.kind === 'ready'
      ? result.resolutions[0].cartIntent
      : undefined,
    {
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
  );
});

test('4G treats the SDK popular-products surface as part of the active catalog', async () => {
  const favourites = createFavouritesStore(
    scope,
    createInMemoryLocalStateStore(),
  );
  const popularProduct = fixture.products[0]!;
  await favourites.save(popularProduct, []);
  const menusWithoutPopularProduct = fixture.menus.map((menu) => ({
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      products: category.products.filter(
        (product) => product.id !== popularProduct.id,
      ),
    })),
  }));
  let productReads = 0;

  const result = await loadFavouritesRoute(
    {
      bootstrap: bootstrapService({
        async load() {
          const loaded = await bootstrapService().load();
          assert.equal(loaded.kind, 'ready');
          if (loaded.kind !== 'ready') return loaded;

          return {
            data: {
              ...loaded.data,
              menus: {
                menus: menusWithoutPopularProduct,
                popularProducts: [popularProduct],
              },
            },
            kind: 'ready',
          };
        },
      }),
      favourites,
      locationId: scope.locationId,
      products: {
        async get() {
          productReads += 1;
          return popularProduct;
        },
      },
    },
    { isConnected: true, isInternetReachable: true },
  );

  assert.equal(productReads, 1);
  assert.equal(
    result.kind === 'ready' ? result.resolutions[0]?.kind : undefined,
    'ready',
  );
});

test('4G treats removed, missing, and sold-out catalogue products as deliberate repair states', async () => {
  const storage = createInMemoryLocalStateStore();
  const favourites = createFavouritesStore(scope, storage);
  await favourites.save(fixture.products[1]!, [
    {
      groupId: 'modifier-milk',
      selectedOptions: [
        { optionId: 'modifier-option-oat-milk', quantity: 1 },
      ],
    },
  ]);

  const removedMenus = fixture.menus.map((menu) => ({
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      products: category.products.filter(
        (product) => product.id !== 'product-customizable',
      ),
    })),
  }));
  const removed = await loadFavouritesRoute(
    {
      bootstrap: bootstrapService({
        async load() {
          return {
            data: {
              location: fixture.location,
              menus: { menus: removedMenus, popularProducts: [] },
              merchant: fixture.merchant,
              readiness: {
                fulfillmentMethod: 'takeout',
                orderDate: '2099-01-01',
                orderTime: '10:30 AM - 10:45 AM',
                pickupType: 'ASAP',
                ready: true,
              },
            },
            kind: 'ready',
          };
        },
      }),
      favourites,
      locationId: scope.locationId,
      products: { get: async () => Promise.reject(new Error('unexpected')) },
    },
    {},
  );
  assert.equal(
    removed.kind === 'ready' ? removed.resolutions[0]?.kind : undefined,
    'missing_product',
  );

  const missing = await loadFavouritesRoute(
    {
      bootstrap: bootstrapService(),
      favourites,
      locationId: scope.locationId,
      products: {
        get: async () => Promise.reject({ status: 404 }),
      },
    },
    {},
  );
  assert.equal(
    missing.kind === 'ready' ? missing.resolutions[0]?.kind : undefined,
    'missing_product',
  );

  const soldOut = await loadFavouritesRoute(
    {
      bootstrap: bootstrapService(),
      favourites,
      locationId: scope.locationId,
      products: {
        async get() {
          return { ...fixture.products[1]!, availability: 'SOLD_OUT' };
        },
      },
    },
    {},
  );
  assert.equal(
    soldOut.kind === 'ready' ? soldOut.resolutions[0]?.kind : undefined,
    'repair_required',
  );
});

test('4G serves a local empty state offline but requires current catalog data before Add', async () => {
  const empty = await loadFavouritesRoute(
    {
      bootstrap: bootstrapService({
        load: async () => Promise.reject(new Error('must not load')),
      }),
      favourites: createFavouritesStore(
        scope,
        createInMemoryLocalStateStore(),
      ),
      locationId: scope.locationId,
      products: { get: async () => Promise.reject(new Error('must not load')) },
    },
    { isConnected: false },
  );
  assert.deepEqual(empty, { canAdd: false, kind: 'ready', resolutions: [] });

  const favourites = createFavouritesStore(
    scope,
    createInMemoryLocalStateStore(),
  );
  await favourites.save(fixture.products[0]!, []);
  assert.deepEqual(
    await loadFavouritesRoute(
      {
        bootstrap: bootstrapService(),
        favourites,
        locationId: scope.locationId,
        products: { get: async () => fixture.products[0]! },
      },
      { isInternetReachable: false },
    ),
    { kind: 'failed', status: 'offline' },
  );
  assert.equal(isFavouritesOffline({}), false);
});

test('4G keeps Add unavailable when the public ordering-readiness contract is not ready', async () => {
  const favourites = createFavouritesStore(
    scope,
    createInMemoryLocalStateStore(),
  );
  await favourites.save(fixture.products[0]!, []);

  const result = await loadFavouritesRoute(
    {
      bootstrap: bootstrapService({
        async load() {
          const loaded = await bootstrapService().load();
          assert.equal(loaded.kind, 'ready');
          if (loaded.kind !== 'ready') return loaded;

          return {
            data: {
              ...loaded.data,
              readiness: {
                fulfillmentMethod: 'takeout',
                ready: false,
                reason: 'Ordering is unavailable.',
              },
            },
            kind: 'ready',
          };
        },
      }),
      favourites,
      locationId: scope.locationId,
      products: { get: async () => fixture.products[0]! },
    },
    { isConnected: true, isInternetReachable: true },
  );

  assert.equal(result.kind, 'ready');
  assert.equal(result.kind === 'ready' ? result.canAdd : undefined, false);
});

test('4G starts or reuses the shared cart and dispatches the validated favourite payload', async () => {
  const resolution = await readyResolution();
  const calls: string[] = [];
  let state: ReturnType<CartService['getState']> = { status: 'idle' };
  const cart = cartService({
    async addItem(intent) {
      calls.push(`add:${intent.id}:${intent.payload.productId}`);
      const cart = createStorefrontCartFixture({ revision: 2 });
      state = {
        cart,
        revision: 2,
        status: 'ready',
      };
      return { cart, kind: 'ready' };
    },
    getState: () => state,
    async start(intent) {
      calls.push(`start:${intent.id}:${intent.fulfillmentMethod}:${intent.channel}`);
      const cart = createStorefrontCartFixture({ revision: 1 });
      state = {
        cart,
        revision: 1,
        status: 'ready',
      };
      return { cart, kind: 'ready' };
    },
  });

  assert.deepEqual(
    await submitFavouriteToCart(cart, resolution, {
      add: 'favourite_add_0001',
      start: 'favourite_start_0001',
    }),
    { kind: 'added' },
  );
  assert.deepEqual(calls, [
    'start:favourite_start_0001:takeout:app',
    'add:favourite_add_0001:product-customizable',
  ]);
});

test('4G retries an uncertain Add with the exact retained cart command and never replays a conflict', async () => {
  const resolution = await readyResolution();
  const initialCart = createStorefrontCartFixture({ revision: 1 });
  let state: ReturnType<CartService['getState']> = {
    cart: initialCart,
    revision: 1,
    status: 'ready',
  };
  let addCalls = 0;
  let retryCalls = 0;
  const cart = cartService({
    async addItem() {
      addCalls += 1;
      state = {
        intent: { id: 'favourite_add_0002', kind: 'add_item' },
        previous: {
          cart: initialCart,
          revision: 1,
        },
        retry: 'same_intent',
        status: 'error',
      };
      return failedCartResult(true);
    },
    getState: () => state,
    async retry() {
      retryCalls += 1;
      const cart = createStorefrontCartFixture({ revision: 2 });
      state = {
        cart,
        revision: 2,
        status: 'ready',
      };
      return { cart, kind: 'ready' };
    },
  });
  const intents = {
    add: 'favourite_add_0002',
    start: 'favourite_start_0002',
  };

  assert.deepEqual(await submitFavouriteToCart(cart, resolution, intents), {
    kind: 'retryable',
    phase: 'add',
    retry: 'same_intent',
  });
  assert.deepEqual(
    await submitFavouriteToCart(cart, resolution, intents, 'add'),
    { kind: 'added' },
  );
  assert.equal(addCalls, 1);
  assert.equal(retryCalls, 1);

  const reconciledCart = createStorefrontCartFixture({ revision: 3 });
  state = {
    cart: reconciledCart,
    revision: 3,
    status: 'ready',
  };
  const conflictCart = cartService({
    async addItem() {
      return {
        cart: state.status === 'ready' ? state.cart : undefined,
        failure: { kind: 'conflict', retryable: false },
        kind: 'reconciliation_required',
      };
    },
    getState: () => state,
  });
  assert.deepEqual(
    await submitFavouriteToCart(conflictCart, resolution, {
      add: 'favourite_add_0003',
      start: 'favourite_start_0003',
    }),
    { kind: 'refresh_required' },
  );
});

test('4G intent keys are bounded, stable inputs and reject invalid clocks or sequences', () => {
  assert.equal(
    createFavouriteCartIntentKey('add', 1_786_400_000_000, 4),
    'favourite_add_msnsfpq8_4',
  );
  assert.throws(() => createFavouriteCartIntentKey('start', -1, 1));
  assert.throws(() => createFavouriteCartIntentKey('start', 1, 0));
});

test('4G route composes the one runtime catalog, favourite store, and cart service', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(rewards)/favourites.tsx', import.meta.url),
    'utf8',
  );
  const presentation = readFileSync(
    new URL('./FavouritesPresentation.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /runtime\.services\.favourites/);
  assert.match(route, /runtime\.services\.cart/);
  assert.match(route, /runtime\.client\.products/);
  assert.match(route, /loadFavouritesRoute/);
  assert.match(route, /submitFavouriteToCart/);
  assert.match(route, /useFocusEffect/);
  assert.match(route, /focusGeneration\.current/);
  assert.match(presentation, /actionState/);
  assert.match(presentation, /accessibilityState/);
  assert.match(presentation, /<Screen/);
  assert.doesNotMatch(
    route,
    /\bfetch\s*\(|createStorefrontClient|SecureStore|process\.env|console\.|price|total|#[0-9A-Fa-f]{3,8}/,
  );
});

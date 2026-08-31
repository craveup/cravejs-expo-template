import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createStorefrontClient } from '@craveup/storefront-sdk';

import { createStorefrontCartFixture } from '../fixtures/storefront-cart-fixture.ts';
import { createCartService, type CartClient } from './cart.ts';
import {
  createCartSessionStore,
  type StorefrontCartSessionStore,
} from './cart-session.ts';
import { createCustomerSessionStore } from './customer-session.ts';
import type {
  OrderingSessionResult,
  OrderingSessionService,
} from './ordering-session-service.ts';
import {
  createInMemoryStorefrontSecretStore,
  type StorefrontSecretStore,
} from './storefront-secret-store.ts';
import {
  createStorefrontSessionScope,
  type StorefrontSessionScope,
} from './storefront-session-scope.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

const secondLocationId = 'fedcba9876543210fedcba98';

function cartClient(overrides: Partial<CartClient> = {}): CartClient {
  const cart = () => Promise.resolve(createStorefrontCartFixture());
  return {
    addItem: cart,
    applyDiscount: cart,
    delete: cart,
    get: cart,
    removeDiscount: cart,
    removeItem: cart,
    setDelivery: cart,
    update: cart,
    updateGratuity: cart,
    updateItemQuantity: cart,
    updateOrderTime: cart,
    validateAndUpdateCustomer: cart,
    ...overrides,
  };
}

function failedOrderingResult(): OrderingSessionResult {
  return Object.freeze({
    failure: Object.freeze({
      code: 'ORDERING_NOT_EXPECTED',
      kind: 'unknown' as const,
      retryable: false,
    }),
    kind: 'failed' as const,
  });
}

function orderingService(
  overrides: Partial<OrderingSessionService> = {},
): OrderingSessionService {
  return {
    claim: async () => failedOrderingResult(),
    recover: async () => failedOrderingResult(),
    start: async () => failedOrderingResult(),
    ...overrides,
  };
}

async function persistCart(
  sessions: StorefrontCartSessionStore,
  revision = 1,
  accessToken: string | null = 'guest-capability-fixture',
  cartId = 'cart_fixture',
): Promise<void> {
  await sessions.set({
    ...(accessToken ? { accessToken } : {}),
    cartId,
    locationId: scope.locationId,
    revision,
  });
}

async function readyService(
  sessions: StorefrontCartSessionStore,
  client: CartClient,
  ordering = orderingService(),
) {
  const service = createCartService(
    client,
    sessions,
    ordering,
    scope.locationId,
  );
  const result = await service.start({
    channel: 'app',
    fulfillmentMethod: 'takeout',
    id: 'intent_start_0001',
  });
  assert.equal(result.kind, 'ready');
  return service;
}

test('start reuses the scoped persisted cart instead of creating a second session', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions, 3);
  const calls: string[] = [];
  const service = createCartService(
    cartClient({
      async get(locationId, cartId) {
        calls.push(`get:${locationId}:${cartId}`);
        return createStorefrontCartFixture({ revision: 3 });
      },
    }),
    sessions,
    orderingService({
      async start() {
        calls.push('start');
        return failedOrderingResult();
      },
    }),
    scope.locationId,
  );

  const result = await service.start({
    fulfillmentMethod: 'takeout',
    id: 'intent_start_0001',
  });

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [`get:${scope.locationId}:cart_fixture`]);
  assert.equal(service.getState().status, 'ready');
});

test('SDK cart reads persist a newer server revision before CartService accepts it', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions, 1);
  const sdk = createStorefrontClient({
    baseUrl: 'https://api.example.test',
    async fetch() {
      return new Response(
        JSON.stringify(createStorefrontCartFixture({ revision: 2 })),
        {
          headers: {
            'Content-Type': 'application/json',
            ETag: '"cart-2"',
          },
          status: 200,
        },
      );
    },
    sessionStore: sessions,
  });
  const service = createCartService(
    sdk.cart,
    sessions,
    orderingService(),
    scope.locationId,
  );

  const result = await service.load({ id: 'intent_load_newer_0001' });

  assert.equal(result.kind, 'ready');
  assert.equal(result.kind === 'ready' && result.cart.revision, 2);
  const state = service.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.status === 'ready' ? state.revision : undefined, 2);
  assert.equal((await sessions.get(scope.locationId))?.revision, 2);
});

test('start delegates new sessions to the shared ordering service', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  const starts: unknown[] = [];
  const service = createCartService(
    cartClient(),
    sessions,
    orderingService({
      async start(intent) {
        starts.push(intent);
        await persistCart(sessions);
        return {
          cart: createStorefrontCartFixture(),
          kind: 'ready',
        };
      },
    }),
    scope.locationId,
  );

  const result = await service.start({
    channel: 'app',
    fulfillmentMethod: 'takeout',
    id: 'intent_start_0002',
  });

  assert.equal(result.kind, 'ready');
  assert.deepEqual(starts, [
    {
      channel: 'app',
      fulfillmentMethod: 'takeout',
      idempotencyKey: 'intent_start_0002',
    },
  ]);
});

test('load rejects a structurally incomplete cart response', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  const service = createCartService(
    cartClient({
      async get() {
        return {
          id: 'cart_fixture',
          locationId: scope.locationId,
          revision: 1,
          status: 'OPEN',
        } as never;
      },
    }),
    sessions,
    orderingService(),
    scope.locationId,
  );

  const result = await service.load({ id: 'intent_load_0000' });

  assert.deepEqual(result, {
    failure: {
      code: 'INVALID_STOREFRONT_RESPONSE',
      kind: 'unavailable',
      retryable: true,
    },
    kind: 'failed',
  });
  assert.equal(service.getState().status, 'error');
});

test('load validates published nested cart fields before exposing them', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  const cart = createStorefrontCartFixture({
    deliveryInfo: {
      addressData: {
        city: 'Dubai',
        country: 'United Arab Emirates',
        lat: 25.2048,
        lng: 55.2708,
        state: 'Dubai',
        street: 'Fixture Street',
        zipCode: '00000',
      },
      addressString: 'Fixture Street, Dubai',
    },
    items: [
      {
        categoryId: 'category_fixture',
        description: 'Fixture product',
        discount: '0.00',
        discountFormatted: '$0.00',
        id: 'item_fixture',
        imageUrl: 'https://example.test/product.png',
        itemUnavailableAction: 'remove_item',
        name: 'Fixture product',
        price: '5.00',
        priceFormatted: '$5.00',
        productId: 'product_fixture',
        quantity: 1,
        selections: [
          {
            id: 'modifier_group_fixture',
            items: [
              {
                children: [],
                id: 'modifier_item_fixture',
                name: 'Regular',
                price: '0.00',
                priceFormatted: '$0.00',
                quantity: 1,
              },
            ],
            name: 'Size',
            rule: { max: 1, min: 1 },
          },
        ],
        total: '5.00',
        totalFormatted: '$5.00',
      },
    ],
    totalQuantity: 1,
  });
  const service = createCartService(
    cartClient({ get: async () => cart }),
    sessions,
    orderingService(),
    scope.locationId,
  );

  const result = await service.load({ id: 'intent_load_0006' });

  assert.equal(result.kind, 'ready');
  assert.equal(result.kind === 'ready' && result.cart.items.length, 1);
});

test('load rejects malformed nested cart items', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  const malformed = createStorefrontCartFixture({
    items: [{ id: 'item_fixture' }] as never,
    totalQuantity: 1,
  });
  const service = createCartService(
    cartClient({ get: async () => malformed }),
    sessions,
    orderingService(),
    scope.locationId,
  );

  const result = await service.load({ id: 'intent_load_0007' });

  assert.equal(result.kind, 'failed');
  assert.equal(
    result.kind === 'failed' && result.failure.code,
    'INVALID_STOREFRONT_RESPONSE',
  );
});

test('ordering-session ambiguous retries keep the identical start intent', async () => {
  for (const kind of ['timeout', 'unavailable'] as const) {
    const sessions = createCartSessionStore(
      scope,
      createInMemoryStorefrontSecretStore(),
    );
    const attempts: unknown[] = [];
    let call = 0;
    const service = createCartService(
      cartClient(),
      sessions,
      orderingService({
        async start(intent) {
          attempts.push(intent);
          call += 1;
          if (call === 1) {
            return {
              failure: { kind, retryable: true },
              kind: 'failed',
            };
          }
          await persistCart(sessions);
          return {
            cart: createStorefrontCartFixture(),
            kind: 'ready',
          };
        },
      }),
      scope.locationId,
    );

    const first = await service.start({
      channel: 'app',
      fulfillmentMethod: 'takeout',
      id: 'intent_start_0005',
    });
    const retried = await service.retry();

    assert.equal(first.kind, 'failed');
    assert.equal(retried.kind, 'ready');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0], attempts[1]);
    assert.deepEqual(attempts[0], {
      channel: 'app',
      fulfillmentMethod: 'takeout',
      idempotencyKey: 'intent_start_0005',
    });
  }
});

test('timeout retry preserves the exact caller key, revision, and cloned payload', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  const attempts: { config: unknown; payload: unknown }[] = [];
  const configs: unknown[] = [];
  let attempt = 0;
  const client = cartClient({
    async addItem(_locationId, _cartId, payload, config) {
      attempts.push({
        config: structuredClone(config),
        payload: structuredClone(payload),
      });
      configs.push(config);
      attempt += 1;
      if (attempt === 1) {
        throw Object.assign(new Error('bounded timeout'), {
          name: 'StorefrontTimeoutError',
        });
      }
      await persistCart(sessions, 2);
      return createStorefrontCartFixture({ revision: 2 });
    },
    async get() {
      return createStorefrontCartFixture();
    },
  });
  const service = await readyService(sessions, client);
  const payload = {
    itemUnavailableAction: 'remove_item' as const,
    productId: 'product_fixture',
    quantity: 1,
    selections: [
      {
        groupId: 'group_fixture',
        selectedOptions: [
          {
            children: [
              {
                groupId: 'child_group_fixture',
                selectedOptions: [
                  { optionId: 'child_option_fixture', quantity: 1 },
                ],
              },
            ],
            optionId: 'option_fixture',
            quantity: 1,
          },
        ],
      },
    ],
  };

  const first = await service.addItem({
    id: 'intent_add_0001',
    payload,
  });
  assert.equal(first.kind, 'failed');
  assert.equal(service.getState().status, 'error');

  payload.selections[0]!.selectedOptions[0]!.quantity = 99;
  payload.selections[0]!.selectedOptions[0]!.children![0]!.selectedOptions[0]!.quantity = 99;

  const retried = await service.retry();

  assert.equal(retried.kind, 'ready');
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(configs[1], configs[0]);
  assert.deepEqual(attempts[0]!.config, {
    idempotencyKey: 'intent_add_0001',
    revision: 1,
  });
});

test('transport-loss retry preserves the exact mutation intent', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  const attempts: unknown[] = [];
  let attempt = 0;
  const client = cartClient({
    async addItem(_locationId, _cartId, payload, config) {
      attempts.push({
        config: structuredClone(config),
        payload: structuredClone(payload),
      });
      attempt += 1;
      if (attempt === 1) throw new TypeError('network connection lost');
      await persistCart(sessions, 2);
      return createStorefrontCartFixture({ revision: 2 });
    },
  });
  const service = await readyService(sessions, client);

  const first = await service.addItem({
    id: 'intent_add_0002',
    payload: {
      itemUnavailableAction: 'remove_item',
      productId: 'product_fixture',
      quantity: 1,
      selections: [],
    },
  });

  assert.equal(first.kind, 'failed');
  assert.equal(service.getState().status, 'error');

  const retried = await service.retry();

  assert.equal(retried.kind, 'ready');
  assert.deepEqual(attempts[1], attempts[0]);
});

test('conflict publishes the authoritative cart and never replays the rejected intent', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  let addCalls = 0;
  let getRevision = 1;
  const client = cartClient({
    async addItem() {
      addCalls += 1;
      if (addCalls === 1) {
        getRevision = 5;
        await persistCart(sessions, 5);
        throw Object.assign(new Error('conflict'), {
          code: 'CART_CONFLICT',
          status: 409,
        });
      }
      await persistCart(sessions, 6);
      return createStorefrontCartFixture({ revision: 6 });
    },
    async get() {
      return createStorefrontCartFixture({ revision: getRevision });
    },
  });
  const service = await readyService(sessions, client);
  const input = {
    id: 'intent_add_0002',
    payload: {
      itemUnavailableAction: 'remove_item' as const,
      productId: 'product_fixture',
      quantity: 1,
      selections: [],
    },
  };

  const conflict = await service.addItem(input);
  const sameIntent = await service.addItem(input);
  const deliberateRetry = await service.addItem({
    ...input,
    id: 'intent_add_0003',
  });

  assert.equal(conflict.kind, 'reconciliation_required');
  assert.equal(
    conflict.kind === 'reconciliation_required' && conflict.cart?.revision,
    5,
  );
  assert.deepEqual(sameIntent, {
    kind: 'transition_rejected',
    reason: 'intent_must_change',
  });
  assert.equal(deliberateRetry.kind, 'ready');
  assert.equal(addCalls, 2);
});

test('a concurrent stored revision change reconciles before sending a stale mutation', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  let mutationCalls = 0;
  let getRevision = 1;
  const client = cartClient({
    async addItem() {
      mutationCalls += 1;
      return createStorefrontCartFixture();
    },
    async get() {
      return createStorefrontCartFixture({ revision: getRevision });
    },
  });
  const service = await readyService(sessions, client);
  getRevision = 2;
  await persistCart(sessions, 2);

  const result = await service.addItem({
    id: 'intent_add_0004',
    payload: {
      itemUnavailableAction: 'remove_item',
      productId: 'product_fixture',
      quantity: 1,
      selections: [],
    },
  });

  assert.equal(result.kind, 'reconciliation_required');
  assert.equal(mutationCalls, 0);
  assert.equal(service.getState().status, 'ready');
});

test('a newer revision arriving during a mutation replaces its stale response', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  let getRevision = 1;
  const client = cartClient({
    async addItem() {
      getRevision = 3;
      await persistCart(sessions, 3);
      return createStorefrontCartFixture({ revision: 2 });
    },
    async get() {
      return createStorefrontCartFixture({ revision: getRevision });
    },
  });
  const service = await readyService(sessions, client);

  const result = await service.addItem({
    id: 'intent_add_0006',
    payload: {
      itemUnavailableAction: 'remove_item',
      productId: 'product_fixture',
      quantity: 1,
      selections: [],
    },
  });

  assert.equal(result.kind, 'reconciliation_required');
  assert.equal(
    result.kind === 'reconciliation_required' && result.cart?.revision,
    3,
  );
  const state = service.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.status === 'ready' && state.revision, 3);
});

test('missing and wrong cart capabilities fail closed and clear inaccessible sessions', async () => {
  const missingSessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(missingSessions, 1, null);
  let networkCalls = 0;
  const sdk = createStorefrontClient({
    baseUrl: 'https://api.example.test',
    async fetch() {
      networkCalls += 1;
      throw new Error('network must not be reached');
    },
    sessionStore: missingSessions,
  });
  const missingService = createCartService(
    sdk.cart,
    missingSessions,
    orderingService(),
    scope.locationId,
  );

  const missing = await missingService.load({ id: 'intent_load_0001' });

  assert.deepEqual(missing, { kind: 'terminal', reason: 'unauthorized' });
  assert.equal(networkCalls, 0);
  assert.equal(await missingSessions.get(scope.locationId), null);

  const wrongSessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(wrongSessions, 1, 'wrong-capability-fixture');
  const wrongService = createCartService(
    cartClient({
      async get() {
        throw Object.assign(new Error('denied'), {
          code: 'CART_CAPABILITY_REQUIRED',
          status: 403,
        });
      },
    }),
    wrongSessions,
    orderingService(),
    scope.locationId,
  );

  const wrong = await wrongService.load({ id: 'intent_load_0002' });

  assert.deepEqual(wrong, { kind: 'terminal', reason: 'unauthorized' });
  assert.equal(await wrongSessions.get(scope.locationId), null);
});

test('guest cart rejection preserves an unrelated customer session', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);
  const customerSessions = createCustomerSessionStore(scope, storage);
  await persistCart(sessions);
  await customerSessions.setToken('customer-jwt-fixture');
  const service = createCartService(
    cartClient({
      async get() {
        throw Object.assign(new Error('guest cart rejected'), {
          code: 'CART_OR_CUSTOMER_AUTH_REQUIRED',
          status: 401,
        });
      },
    }),
    sessions,
    orderingService(),
    scope.locationId,
    customerSessions,
  );

  const result = await service.load({ id: 'intent_load_0006' });

  assert.deepEqual(result, { kind: 'terminal', reason: 'unauthorized' });
  assert.equal(await sessions.get(scope.locationId), null);
  assert.equal(await customerSessions.getAuthToken(), 'customer-jwt-fixture');
});

test('storage failure before mutation sends no cart request', async () => {
  const backing = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(backing);
  let failReads = false;
  const sessions: StorefrontCartSessionStore = {
    clear: backing.clear,
    clearMatching: backing.clearMatching,
    async get(locationId) {
      if (failReads) throw new Error('SecureStore unavailable');
      return backing.get(locationId);
    },
    set: backing.set,
  };
  let mutationCalls = 0;
  const client = cartClient({
    async addItem() {
      mutationCalls += 1;
      return createStorefrontCartFixture();
    },
    async get() {
      return createStorefrontCartFixture();
    },
  });
  const service = await readyService(sessions, client);
  failReads = true;

  const result = await service.addItem({
    id: 'intent_add_0005',
    payload: {
      itemUnavailableAction: 'remove_item',
      productId: 'product_fixture',
      quantity: 1,
      selections: [],
    },
  });

  assert.equal(result.kind, 'failed');
  assert.equal(
    result.kind === 'failed' && result.failure.code,
    'SECURE_STORAGE_UNAVAILABLE',
  );
  assert.equal(mutationCalls, 0);
});

test('environment, merchant, and location scopes cannot reuse another cart', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const ownerSessions = createCartSessionStore(scope, storage);
  await persistCart(ownerSessions);
  const isolatedScopes: StorefrontSessionScope[] = [
    {
      ...scope,
      environmentNamespace: 'env-fedcba9876543210',
    },
    {
      ...scope,
      merchantSlug: 'another-merchant',
    },
    {
      ...scope,
      locationId: secondLocationId,
    },
  ];

  for (const isolatedScope of isolatedScopes) {
    const isolatedSessions = createCartSessionStore(isolatedScope, storage);
    assert.equal(await isolatedSessions.get(isolatedScope.locationId), null);
  }
  assert.notEqual(await ownerSessions.get(scope.locationId), null);
});

test('expiry and deletion clear sessions while immutable carts remain for result recovery', async () => {
  const expiredSessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(expiredSessions);
  const expiredService = createCartService(
    cartClient({
      async get() {
        return createStorefrontCartFixture({ status: 'EXPIRED' });
      },
    }),
    expiredSessions,
    orderingService(),
    scope.locationId,
  );
  assert.deepEqual(await expiredService.load({ id: 'intent_load_0003' }), {
    kind: 'terminal',
    reason: 'expired',
  });
  assert.equal(await expiredSessions.get(scope.locationId), null);

  const lockedSessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(lockedSessions);
  const lockedService = createCartService(
    cartClient({
      async get() {
        return createStorefrontCartFixture({ status: 'LOCKED' });
      },
    }),
    lockedSessions,
    orderingService(),
    scope.locationId,
  );
  assert.deepEqual(await lockedService.load({ id: 'intent_load_0004' }), {
    kind: 'terminal',
    reason: 'immutable',
  });
  assert.notEqual(await lockedSessions.get(scope.locationId), null);

  const deletedSessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(deletedSessions);
  const deleteClient = cartClient({
    async delete(locationId) {
      await deletedSessions.clear(locationId);
      return createStorefrontCartFixture();
    },
    async get() {
      return createStorefrontCartFixture();
    },
  });
  const deleteService = await readyService(deletedSessions, deleteClient);
  assert.deepEqual(await deleteService.clear({ id: 'intent_clear_0001' }), {
    kind: 'terminal',
    reason: 'deleted',
  });
  assert.equal(await deletedSessions.get(scope.locationId), null);
});

test('guest claim removes the revoked capability and survives service restart with customer auth', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);
  const customerSessions = createCustomerSessionStore(scope, storage);
  await persistCart(sessions);
  await customerSessions.setToken('customer-jwt-fixture');
  let startCalls = 0;
  let cartRevision = 1;
  const ordering = orderingService({
    async claim() {
      cartRevision = 2;
      await persistCart(sessions, 2, null);
      return {
        cart: createStorefrontCartFixture({ revision: 2 }),
        kind: 'ready',
      };
    },
    async start() {
      startCalls += 1;
      return failedOrderingResult();
    },
  });
  const client = cartClient({
    async get() {
      return createStorefrontCartFixture({ revision: cartRevision });
    },
  });
  const first = createCartService(
    client,
    sessions,
    ordering,
    scope.locationId,
    customerSessions,
  );
  assert.equal(
    (
      await first.start({
        fulfillmentMethod: 'takeout',
        id: 'intent_start_0003',
      })
    ).kind,
    'ready',
  );

  const claimed = await first.claim({ id: 'intent_claim_0001' });
  const persisted = await sessions.get(scope.locationId);
  const restarted = createCartService(
    client,
    sessions,
    ordering,
    scope.locationId,
    customerSessions,
  );
  const restored = await restarted.start({
    fulfillmentMethod: 'takeout',
    id: 'intent_start_0004',
  });

  assert.equal(claimed.kind, 'ready');
  assert.deepEqual(persisted, {
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 2,
  });
  assert.equal(restored.kind, 'ready');
  assert.equal(startCalls, 0);
  assert.doesNotMatch(
    JSON.stringify({ claimed, restored }),
    /capability|customer-jwt/,
  );
});

test('claim timeout retry keeps the same cart, revision, and idempotency key', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);
  const customerSessions = createCustomerSessionStore(scope, storage);
  await persistCart(sessions);
  await customerSessions.setToken('customer-jwt-fixture');
  const attempts: unknown[] = [];
  let call = 0;
  const ordering = orderingService({
    async claim(intent) {
      attempts.push(intent);
      call += 1;
      if (call === 1) {
        return {
          failure: { kind: 'timeout', retryable: true },
          kind: 'failed',
        };
      }
      await persistCart(sessions, 2, null);
      return {
        cart: createStorefrontCartFixture({ revision: 2 }),
        kind: 'ready',
      };
    },
  });
  const client = cartClient({
    async get() {
      return createStorefrontCartFixture();
    },
  });
  const service = createCartService(
    client,
    sessions,
    ordering,
    scope.locationId,
    customerSessions,
  );
  assert.equal(
    (
      await service.start({
        fulfillmentMethod: 'takeout',
        id: 'intent_start_0006',
      })
    ).kind,
    'ready',
  );

  const first = await service.claim({ id: 'intent_claim_0002' });
  const retried = await service.retry();

  assert.equal(first.kind, 'failed');
  assert.equal(retried.kind, 'ready');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], attempts[1]);
  assert.deepEqual(attempts[0], {
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_claim_0002',
    revision: 1,
  });
  assert.equal((await sessions.get(scope.locationId))?.accessToken, undefined);
});

test('claim conflict preserves the guest capability and requires a new intent', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  const ordering = orderingService({
    async claim() {
      await persistCart(sessions, 2);
      return {
        cart: createStorefrontCartFixture({ revision: 2 }),
        failure: {
          code: 'CART_CONFLICT',
          kind: 'conflict',
          retryable: false,
        },
        kind: 'reconciliation_required',
      };
    },
  });
  const service = createCartService(
    cartClient({
      async get() {
        return createStorefrontCartFixture();
      },
    }),
    sessions,
    ordering,
    scope.locationId,
  );
  assert.equal(
    (
      await service.start({
        fulfillmentMethod: 'takeout',
        id: 'intent_start_0008',
      })
    ).kind,
    'ready',
  );

  const conflicted = await service.claim({ id: 'intent_claim_0004' });
  const repeated = await service.claim({ id: 'intent_claim_0004' });

  assert.equal(conflicted.kind, 'reconciliation_required');
  assert.equal(
    conflicted.kind === 'reconciliation_required' && conflicted.cart?.revision,
    2,
  );
  assert.deepEqual(repeated, {
    kind: 'transition_rejected',
    reason: 'intent_must_change',
  });
  assert.equal(
    (await sessions.get(scope.locationId))?.accessToken,
    'guest-capability-fixture',
  );
});

test('claim authorization failure cannot restore the cleared cart', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  const service = createCartService(
    cartClient({
      async get() {
        return createStorefrontCartFixture();
      },
    }),
    sessions,
    orderingService({
      async claim() {
        await sessions.clear(scope.locationId);
        return {
          failure: {
            code: 'CUSTOMER_AUTH_REQUIRED',
            kind: 'authentication_required',
            retryable: false,
          },
          kind: 'failed',
        };
      },
    }),
    scope.locationId,
  );
  assert.equal(
    (
      await service.start({
        fulfillmentMethod: 'takeout',
        id: 'intent_start_0007',
      })
    ).kind,
    'ready',
  );

  const result = await service.claim({ id: 'intent_claim_0003' });

  assert.deepEqual(result, { kind: 'terminal', reason: 'unauthorized' });
  assert.equal(service.getState().status, 'terminal');
  assert.equal(service.dismissError(), false);
  assert.equal(await sessions.get(scope.locationId), null);
});

test('all published cart mutations use the current authoritative revision', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  let revision = 1;
  const calls: { args: unknown[]; name: string }[] = [];
  async function next(name: string, args: unknown[]) {
    calls.push({ args: structuredClone(args), name });
    revision += 1;
    await persistCart(sessions, revision);
    return createStorefrontCartFixture({ revision });
  }
  const client = cartClient({
    applyDiscount: (...args) => next('applyDiscount', args),
    get: async () => createStorefrontCartFixture({ revision }),
    removeDiscount: (...args) => next('removeDiscount', args),
    removeItem: (...args) => next('removeItem', args),
    setDelivery: (...args) => next('setDelivery', args),
    update: (...args) => next('update', args),
    updateGratuity: (...args) => next('updateGratuity', args),
    updateItemQuantity: (...args) => next('updateItemQuantity', args),
    updateOrderTime: (...args) => next('updateOrderTime', args),
    validateAndUpdateCustomer: (...args) => next('setCustomer', args),
  });
  const service = await readyService(sessions, client);

  await service.updateItemQuantity({
    id: 'intent_qty_0001',
    itemId: 'item_fixture',
    quantity: 2,
  });
  await service.removeItem({
    id: 'intent_remove_0001',
    itemId: 'item_fixture',
  });
  await service.applyDiscount({ code: 'TEA10', id: 'intent_discount_0001' });
  await service.removeDiscount({ id: 'intent_discount_0002' });
  await service.setGratuity({
    id: 'intent_tip_0001',
    payload: { percentage: '15' },
  });
  await service.setCustomer({
    id: 'intent_customer_0001',
    payload: { customerName: 'Sam', emailAddress: 'sam@example.test' },
  });
  await service.setFulfillment({
    id: 'intent_fulfillment_0001',
    payload: { fulfillmentMethod: 'delivery' },
  });
  await service.setDeliveryAddress({
    id: 'intent_delivery_0001',
    payload: {
      city: 'Karachi',
      country: 'United Arab Emirates',
      lat: 24.8607,
      lng: 67.0011,
      state: 'Sindh',
      street: 'Fixture Street',
      zipCode: '74000',
    },
  });
  await service.setOrderTime({
    id: 'intent_time_0001',
    payload: {
      orderDate: '2099-01-01',
      orderTime: '10:30',
      pickupType: 'LATER',
    },
  });

  assert.deepEqual(
    calls.map((call) => call.name),
    [
      'updateItemQuantity',
      'removeItem',
      'applyDiscount',
      'removeDiscount',
      'updateGratuity',
      'setCustomer',
      'update',
      'setDelivery',
      'updateOrderTime',
    ],
  );
  assert.deepEqual(
    calls.map((call) => (call.args.at(-1) as { revision: number }).revision),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test('cart domain uses the shared SDK boundary and contains no transport or secret handling', () => {
  const source = readFileSync(new URL('./cart.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /X-Cart-Token|If-Match|Idempotency-Key/);
  assert.doesNotMatch(source, /console\.|EXPO_PUBLIC_|process\.env/);

  const runtime = readFileSync(
    new URL('./storefront.ts', import.meta.url),
    'utf8',
  );
  assert.match(runtime, /cart: createCartService\(/);
  assert.equal((runtime.match(/createStorefrontClient\(/g) ?? []).length, 1);
});

test('a recovered hosted-checkout handoff locks every cart mutation at the shared service boundary', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await persistCart(sessions);
  let mutationCalls = 0;
  const service = createCartService(
    cartClient({
      async updateGratuity() {
        mutationCalls += 1;
        return createStorefrontCartFixture();
      },
    }),
    sessions,
    orderingService(),
    scope.locationId,
    undefined,
    undefined,
    { isLocked: async () => true },
  );
  assert.equal((await service.load({ id: 'intent_load_0099' })).kind, 'ready');

  assert.deepEqual(
    await service.setGratuity({
      id: 'intent_tip_0099',
      payload: { percentage: '18' },
    }),
    {
      kind: 'transition_rejected',
      reason: 'checkout_handoff_locked',
    },
  );
  assert.equal(mutationCalls, 0);

  const unavailableRecoveryService = createCartService(
    cartClient(),
    sessions,
    orderingService(),
    scope.locationId,
    undefined,
    undefined,
    {
      async isLocked() {
        throw new Error('recovery storage unavailable');
      },
    },
  );
  assert.deepEqual(
    await unavailableRecoveryService.start({
      channel: 'web',
      fulfillmentMethod: 'takeout',
      id: 'intent_start_0100',
    }),
    {
      kind: 'transition_rejected',
      reason: 'checkout_handoff_locked',
    },
  );
});

test('storage errors are reported without exposing storage values', async () => {
  const storage: StorefrontSecretStore = {
    async deleteItem() {},
    async getItem() {
      throw new Error('secret guest-capability-fixture');
    },
    async setItem() {},
  };
  const sessions = createCartSessionStore(scope, storage);
  const service = createCartService(
    cartClient(),
    sessions,
    orderingService(),
    scope.locationId,
  );

  const result = await service.load({ id: 'intent_load_0005' });

  assert.equal(result.kind, 'failed');
  assert.deepEqual(result.kind === 'failed' && result.failure, {
    code: 'SECURE_STORAGE_UNAVAILABLE',
    kind: 'unavailable',
    retryable: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /guest-capability/);
});

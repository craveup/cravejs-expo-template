import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createStorefrontClient } from '@craveup/storefront-sdk';

import { createStorefrontCartFixture } from '../fixtures/storefront-cart-fixture.ts';
import { createCartSessionStore } from './cart-session.ts';
import { createCustomerSessionStore } from './customer-session.ts';
import {
  createOrderingSessionService,
  type OrderingSessionClient,
} from './ordering-session-service.ts';
import { createInMemoryStorefrontSecretStore } from './storefront-secret-store.ts';
import { createStorefrontSessionScope } from './storefront-session-scope.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

function client(overrides: {
  claim?: OrderingSessionClient['cart']['claim'];
  get?: OrderingSessionClient['cart']['get'];
  start?: OrderingSessionClient['orderingSessions']['start'];
} = {}): OrderingSessionClient {
  return {
    cart: {
      async claim() {
        return createStorefrontCartFixture({ revision: 2 });
      },
      async get() {
        return createStorefrontCartFixture();
      },
      ...('claim' in overrides ? { claim: overrides.claim! } : {}),
      ...('get' in overrides ? { get: overrides.get! } : {}),
    },
    orderingSessions: {
      async start() {
        return {
          cart: createStorefrontCartFixture(),
          cartAccessToken: 'guest-capability-fixture',
        };
      },
      ...('start' in overrides ? { start: overrides.start! } : {}),
    },
  };
}

test('new ordering sessions use a caller-stable key and persist capability before ready', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  const calls: unknown[] = [];
  const service = createOrderingSessionService(
    client({
      async start(locationId, payload, config) {
        calls.push({ config, locationId, payload });
        await sessions.set({
          accessToken: 'guest-capability-fixture',
          cartId: 'cart_fixture',
          locationId,
          revision: 1,
        });
        return {
          cart: createStorefrontCartFixture(),
          cartAccessToken: 'guest-capability-fixture',
        };
      },
    }),
    sessions,
    scope.locationId,
  );

  const result = await service.start({
    channel: 'app',
    fulfillmentMethod: 'takeout',
    idempotencyKey: 'intent_start_0001',
  });

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [
    {
      config: { idempotencyKey: 'intent_start_0001' },
      locationId: scope.locationId,
      payload: {
        channel: 'app',
        existingCartId: null,
        fulfillmentMethod: 'takeout',
      },
    },
  ]);
  assert.deepEqual(await sessions.get(scope.locationId), {
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 1,
  });
  assert.doesNotMatch(JSON.stringify(result), /guest-capability/);
});

test('new ordering explicitly bypasses a persisted cart through the published SDK', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  await sessions.set({
    accessToken: 'old-capability-fixture',
    cartId: 'cart_old',
    locationId: scope.locationId,
    revision: 7,
  });
  let requestBody: unknown;
  const sdk = createStorefrontClient({
    baseUrl: 'https://api.example.test',
    async fetch(_input, init) {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          cart: createStorefrontCartFixture({ id: 'cart_new', revision: 1 }),
          cartAccessToken: 'new-capability-fixture',
        }),
        { headers: { ETag: '"cart-1"' }, status: 200 },
      );
    },
    sessionStore: sessions,
  });
  const service = createOrderingSessionService(
    sdk,
    sessions,
    scope.locationId,
  );

  const result = await service.start({
    channel: 'app',
    fulfillmentMethod: 'takeout',
    idempotencyKey: 'intent_start_0003',
  });

  assert.equal(result.kind, 'ready');
  assert.equal(Reflect.get(requestBody as object, 'existingCartId'), null);
  assert.deepEqual(await sessions.get(scope.locationId), {
    accessToken: 'new-capability-fixture',
    cartId: 'cart_new',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 1,
  });
});

test('post-response session verification reports secure storage failure', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  const service = createOrderingSessionService(
    client({
      async start(locationId) {
        await sessions.set({
          accessToken: 'guest-capability-fixture',
          cartId: 'cart_fixture',
          locationId,
          revision: 1,
        });
        return {
          cart: createStorefrontCartFixture(),
          cartAccessToken: 'guest-capability-fixture',
        };
      },
    }),
    {
      ...sessions,
      async get() {
        throw new Error('secure storage unavailable');
      },
    },
    scope.locationId,
  );

  const result = await service.start({
    fulfillmentMethod: 'takeout',
    idempotencyKey: 'intent_start_0004',
  });

  assert.equal(result.kind, 'failed');
  assert.equal(
    result.kind === 'failed' ? result.failure.code : undefined,
    'SECURE_STORAGE_UNAVAILABLE',
  );
});

test('existing-cart recovery always sends explicit cart ID and revision without inventing a capability', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  const calls: unknown[] = [];
  const service = createOrderingSessionService(
    client({
      async start(locationId, payload, config) {
        calls.push({ config, locationId, payload });
        await sessions.set({
          cartId: 'cart_fixture',
          locationId,
          revision: 7,
        });
        return { cart: createStorefrontCartFixture({ revision: 7 }) };
      },
    }),
    sessions,
    scope.locationId,
  );

  const result = await service.recover({
    cartId: 'cart_fixture',
    fulfillmentMethod: 'takeout',
    idempotencyKey: 'intent_recover_0001',
    revision: 6,
  });

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [
    {
      config: { idempotencyKey: 'intent_recover_0001', revision: 6 },
      locationId: scope.locationId,
      payload: {
        existingCartId: 'cart_fixture',
        fulfillmentMethod: 'takeout',
      },
    },
  ]);
  assert.deepEqual(await sessions.get(scope.locationId), {
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 7,
  });
});

test('successful customer claim persists the server revision and removes guest capability', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  const calls: unknown[] = [];
  await sessions.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 3,
  });
  const service = createOrderingSessionService(
    client({
      async claim(locationId, cartId, config) {
        calls.push({ cartId, config, locationId });
        await sessions.set({
          cartId,
          locationId,
          revision: 4,
        });
        return createStorefrontCartFixture({ revision: 4 });
      },
    }),
    sessions,
    scope.locationId,
  );

  const result = await service.claim({
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_claim_0001',
    revision: 3,
  });

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [
    {
      cartId: 'cart_fixture',
      config: { idempotencyKey: 'intent_claim_0001', revision: 3 },
      locationId: scope.locationId,
    },
  ]);
  assert.deepEqual(await sessions.get(scope.locationId), {
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 4,
  });
});

test('a conflict refreshes authoritative cart state but never replays the mutation', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  let claimCalls = 0;
  let getCalls = 0;
  await sessions.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });
  const service = createOrderingSessionService(
    client({
      async claim() {
        claimCalls += 1;
        await sessions.set({
          accessToken: 'guest-capability-fixture',
          cartId: 'cart_fixture',
          locationId: scope.locationId,
          revision: 5,
        });
        throw { code: 'CART_CONFLICT', requestId: 'request-fixture', status: 409 };
      },
      async get() {
        getCalls += 1;
        return createStorefrontCartFixture({ revision: 5 });
      },
    }),
    sessions,
    scope.locationId,
  );

  const result = await service.claim({
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_claim_0002',
    revision: 2,
  });

  assert.equal(result.kind, 'reconciliation_required');
  assert.equal(result.kind === 'reconciliation_required' ? result.cart?.revision : undefined, 5);
  assert.equal(claimCalls, 1);
  assert.equal(getCalls, 1);
  assert.equal((await sessions.get(scope.locationId))?.revision, 5);
  assert.equal(
    (await sessions.get(scope.locationId))?.accessToken,
    'guest-capability-fixture',
  );
});

test('claim authorization failure clears stale customer and cart access', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);
  const customers = createCustomerSessionStore(scope, storage);
  await sessions.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 3,
  });
  await customers.setToken('customer.jwt.fixture');
  const service = createOrderingSessionService(
    client({
      async claim() {
        throw { status: 401 };
      },
    }),
    sessions,
    scope.locationId,
    customers,
  );

  const result = await service.claim({
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_claim_0003',
    revision: 3,
  });

  assert.equal(result.kind, 'failed');
  assert.equal(await customers.getAuthToken(), null);
  assert.equal(await sessions.get(scope.locationId), null);
});

test('guest recovery authorization failure preserves the customer session', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);
  const customers = createCustomerSessionStore(scope, storage);
  await sessions.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 3,
  });
  await customers.setToken('customer.jwt.fixture');
  const service = createOrderingSessionService(
    client({
      async start() {
        throw { status: 401 };
      },
    }),
    sessions,
    scope.locationId,
    customers,
  );

  const result = await service.recover({
    cartId: 'cart_fixture',
    fulfillmentMethod: 'takeout',
    idempotencyKey: 'intent_recover_0002',
    revision: 3,
  });

  assert.equal(result.kind, 'failed');
  assert.equal(await customers.getAuthToken(), 'customer.jwt.fixture');
  assert.equal(await sessions.get(scope.locationId), null);
});

test('invalid intents and cross-location responses fail closed before persistence', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  let startCalls = 0;
  const service = createOrderingSessionService(
    client({
      async start() {
        startCalls += 1;
        return {
          cart: createStorefrontCartFixture({
            locationId: 'fedcba9876543210fedcba98',
          }),
          cartAccessToken: 'must-not-persist',
        };
      },
    }),
    sessions,
    scope.locationId,
  );

  assert.equal(
    (
      await service.start({
        fulfillmentMethod: 'takeout',
        idempotencyKey: 'short',
      })
    ).kind,
    'failed',
  );
  assert.equal(startCalls, 0);

  const invalidRecovery = await service.recover({
    cartId: '../cart',
    fulfillmentMethod: 'takeout',
    idempotencyKey: 'intent_recover_0003',
    revision: 1,
  });
  assert.equal(
    invalidRecovery.kind === 'failed' ? invalidRecovery.failure.code : undefined,
    'CLIENT_VALIDATION_ERROR',
  );

  assert.equal(
    (
      await service.start({
        fulfillmentMethod: 'takeout',
        idempotencyKey: 'intent_start_0002',
      })
    ).kind,
    'failed',
  );
  assert.equal(await sessions.get(scope.locationId), null);
});

test('ordering service has no direct transport, raw headers, or secret logging', () => {
  const source = readFileSync(new URL('./ordering-session-service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|X-Cart-Token|If-Match|Idempotency-Key|console\.|process\.env/,
  );
  assert.match(source, /import type \{ StorefrontClient \}/);
});

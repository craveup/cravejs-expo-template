import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LoyaltyLedger } from '@craveup/storefront-sdk';

import { createStorefrontCartFixture } from '../../fixtures/storefront-cart-fixture.ts';
import { createCartSessionStore } from '../../lib/cart-session.ts';
import { createCustomerSessionStore } from '../../lib/customer-session.ts';
import { createInMemoryStorefrontSecretStore } from '../../lib/storefront-secret-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import {
  createLoyaltyService,
  type LoyaltyClient,
} from './loyalty-service.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

const ledger: LoyaltyLedger = {
  balances: [
    {
      asOf: '2099-01-01T00:00:00.000Z',
      available: 450,
      label: 'Points',
      posted: 500,
      reserved: 50,
      unit: 'points',
    },
  ],
  enabled: true,
  entries: [
    {
      amount: 25,
      classification: 'purchase',
      occurredAt: '2099-01-01T00:00:00.000Z',
      operation: 'credit',
      orderReference: 'FIXTURE',
      unit: 'points',
    },
  ],
  nextCursor: 'cursor_fixture_2',
};

function client(overrides: Partial<{
  cancel: LoyaltyClient['loyalty']['cancel'];
  get: LoyaltyClient['cart']['get'];
  ledger: LoyaltyClient['loyalty']['ledger'];
  quote: LoyaltyClient['loyalty']['quote'];
  redeem: LoyaltyClient['loyalty']['redeem'];
}> = {}): LoyaltyClient {
  return {
    cart: {
      get: overrides.get ?? (async () => createStorefrontCartFixture()),
    },
    loyalty: {
      cancel:
        overrides.cancel ??
        (async () => createStorefrontCartFixture({ revision: 3 })),
      ledger: overrides.ledger ?? (async () => ledger),
      quote: overrides.quote ?? (async () => ({ enabled: true, rewards: [] })),
      redeem:
        overrides.redeem ??
        (async () => createStorefrontCartFixture({ revision: 3 })),
    },
  };
}

function setup(clientValue: LoyaltyClient) {
  const storage = createInMemoryStorefrontSecretStore();
  const carts = createCartSessionStore(scope, storage);
  const customers = createCustomerSessionStore(scope, storage);
  const service = createLoyaltyService(
    clientValue,
    carts,
    customers,
    scope.locationId,
  );

  return { carts, customers, service };
}

test('quote and ledger preserve only server-authoritative balances and rewards', async () => {
  const calls: unknown[] = [];
  const { service } = setup(
    client({
      async ledger(params) {
        calls.push(params);
        return {
          ...ledger,
          balances: ledger.balances?.map((balance) => ({
            ...balance,
            providerBalanceId: 'provider-balance-secret',
          })),
          entries: ledger.entries?.map((entry) => ({
            ...entry,
            providerEntryId: 'provider-entry-secret',
          })),
          memberId: 'provider-member-secret',
        } as LoyaltyLedger;
      },
      async quote() {
        return {
          available: true,
          balance: { available: 450, posted: 500, reserved: 50 },
          enabled: true,
          pointsToEarn: 25,
          rewards: [
            {
              id: 'reward_fixture',
              name: 'Fixture reward',
              pointsCost: 200,
              redeemable: true,
              status: 'available',
              providerRewardId: 'provider-reward-secret',
            },
          ],
          memberId: 'provider-member-secret',
        } as unknown as Awaited<ReturnType<LoyaltyClient['loyalty']['quote']>>;
      },
    }),
  );

  const quote = await service.getQuote('cart_fixture');
  const history = await service.getLedger({ cursor: 'cursor_fixture_1', limit: 20 });

  assert.equal(quote.kind, 'ready');
  assert.equal(
    quote.kind === 'ready' ? quote.data.balance?.available : undefined,
    450,
  );
  assert.equal(history.kind, 'ready');
  assert.deepEqual(calls, [{ cursor: 'cursor_fixture_1', limit: 20 }]);
  assert.doesNotMatch(JSON.stringify({ quote, history }), /tier|memberId|programId/i);
  assert.doesNotMatch(
    JSON.stringify({ quote, history }),
    /providerBalanceId|providerEntryId|providerRewardId|provider-/i,
  );
});

test('malformed nested loyalty values fail closed at the SDK boundary', async () => {
  const invalidQuote = setup(
    client({
      async quote() {
        return {
          enabled: true,
          rewards: [
            {
              id: 'reward_fixture',
              name: 'Fixture reward',
              pointsCost: Number.NaN,
              redeemable: true,
              status: 'available',
            },
          ],
        };
      },
    }),
  );
  const invalidLedger = setup(
    client({
      async ledger() {
        return {
          enabled: true,
          entries: [
            {
              amount: Number.POSITIVE_INFINITY,
              occurredAt: '2099-01-01T00:00:00.000Z',
              operation: 'credit',
              unit: 'points',
            },
          ],
        };
      },
    }),
  );

  assert.equal((await invalidQuote.service.getQuote('cart_fixture')).kind, 'failed');
  assert.equal((await invalidLedger.service.getLedger()).kind, 'failed');
});

test('duplicate reward IDs fail closed before presentation or redemption', async () => {
  const duplicatedRewards = setup(
    client({
      async quote() {
        return {
          enabled: true,
          rewards: [
            {
              id: 'reward_duplicate',
              name: 'First reward',
              pointsCost: 100,
              redeemable: true,
              status: 'available',
            },
            {
              id: 'reward_duplicate',
              name: 'Second reward',
              pointsCost: 200,
              redeemable: true,
              status: 'available',
            },
          ],
        };
      },
    }),
  );

  assert.equal(
    (await duplicatedRewards.service.getQuote('cart_fixture')).kind,
    'failed',
  );
});

test('duplicate normalized balance units fail closed before selecting account truth', async () => {
  const duplicatedBalances = setup(
    client({
      async ledger() {
        return {
          balances: [
            {
              asOf: '2099-01-01T00:00:00.000Z',
              available: 100,
              posted: 100,
              reserved: 0,
              unit: 'points',
            },
            {
              asOf: '2099-01-01T00:00:00.000Z',
              available: 200,
              posted: 200,
              reserved: 0,
              unit: 'POINTS',
            },
          ],
          enabled: true,
        };
      },
    }),
  );

  assert.equal((await duplicatedBalances.service.getLedger()).kind, 'failed');
});

test('redeem uses stable revision controls, persists returned cart, then refetches ledger', async () => {
  const calls: unknown[] = [];
  const { carts, service } = setup(
    client({
      async ledger() {
        calls.push('ledger');
        return ledger;
      },
      async redeem(locationId, cartId, rewardId, config) {
        calls.push({ cartId, config, locationId, rewardId });
        await carts.set({
          accessToken: 'guest-capability-fixture',
          cartId,
          locationId,
          revision: 3,
        });
        return createStorefrontCartFixture({
          discountTotal: '2.50',
          orderTotal: '7.50',
          revision: 3,
        });
      },
    }),
  );
  await carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  const result = await service.redeem({
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_redeem_0001',
    revision: 2,
    rewardId: 'reward_fixture',
  });

  assert.equal(result.kind, 'updated');
  assert.deepEqual(calls, [
    {
      cartId: 'cart_fixture',
      config: { idempotencyKey: 'intent_redeem_0001', revision: 2 },
      locationId: scope.locationId,
      rewardId: 'reward_fixture',
    },
    'ledger',
  ]);
  assert.equal(result.kind === 'updated' ? result.cart.orderTotal : undefined, '7.50');
  assert.equal(result.kind === 'updated' ? result.ledger?.balances?.[0]?.available : undefined, 450);
  assert.equal((await carts.get(scope.locationId))?.revision, 3);
  assert.equal(
    (await carts.get(scope.locationId))?.accessToken,
    'guest-capability-fixture',
  );
});

test('post-mutation ledger failure never turns a successful redeem into a replayable failure', async () => {
  let carts!: ReturnType<typeof setup>['carts'];
  const configured = setup(
    client({
      async ledger() {
        throw { status: 503 };
      },
      async redeem(locationId, cartId) {
        await carts.set({ cartId, locationId, revision: 3 });
        return createStorefrontCartFixture({ revision: 3 });
      },
    }),
  );
  carts = configured.carts;
  const { service } = configured;
  await carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  const result = await service.redeem({
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_redeem_0002',
    revision: 2,
    rewardId: 'reward_fixture',
  });

  assert.equal(result.kind, 'updated');
  assert.equal(
    result.kind === 'updated' ? result.refreshFailure?.kind : undefined,
    'unavailable',
  );
});

test('loyalty conflict refreshes the cart without replaying redemption', async () => {
  let redeemCalls = 0;
  let getCalls = 0;
  const { carts, service } = setup(
    client({
      async get() {
        getCalls += 1;
        return createStorefrontCartFixture({ revision: 5 });
      },
      async redeem() {
        redeemCalls += 1;
        await carts.set({
          accessToken: 'guest-capability-fixture',
          cartId: 'cart_fixture',
          locationId: scope.locationId,
          revision: 5,
        });
        throw { code: 'CART_CONFLICT', status: 409 };
      },
    }),
  );
  await carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  const result = await service.redeem({
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_redeem_0003',
    revision: 2,
    rewardId: 'reward_fixture',
  });

  assert.equal(result.kind, 'reconciliation_required');
  assert.equal(redeemCalls, 1);
  assert.equal(getCalls, 1);
  assert.equal((await carts.get(scope.locationId))?.revision, 5);
});

test('customer authorization failure clears the customer token', async () => {
  const { customers, service } = setup(
    client({
      async quote() {
        throw { code: 'UNAUTHORIZED', status: 401 };
      },
    }),
  );
  await customers.setToken('customer.jwt.fixture');

  const result = await service.getQuote('cart_fixture');

  assert.equal(result.kind, 'failed');
  assert.equal(await customers.getAuthToken(), null);
});

test('cancel uses the same idempotent revision-safe mutation path', async () => {
  const calls: unknown[] = [];
  const { carts, service } = setup(
    client({
      async cancel(locationId, cartId, config) {
        calls.push({ cartId, config, locationId });
        await carts.set({ cartId, locationId, revision: 4 });
        return createStorefrontCartFixture({ revision: 4 });
      },
    }),
  );
  await carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 3,
  });

  const result = await service.cancel({
    cartId: 'cart_fixture',
    idempotencyKey: 'intent_cancel_0001',
    revision: 3,
  });

  assert.equal(result.kind, 'updated');
  assert.deepEqual(calls, [
    {
      cartId: 'cart_fixture',
      config: { idempotencyKey: 'intent_cancel_0001', revision: 3 },
      locationId: scope.locationId,
    },
  ]);
});

test('loyalty service has no provider calls, local money math, tier inference, or secret logging', () => {
  const source = readFileSync(new URL('./loyalty-service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|console\.|process\.env|provider|memberId|tier|parseFloat|parseInt/i,
  );
  assert.match(source, /import type \{ StorefrontClient \}/);
});

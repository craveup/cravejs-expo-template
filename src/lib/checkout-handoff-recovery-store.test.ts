import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryLocalStateStore } from './local-state-store.ts';
import {
  createCheckoutHandoffRecoveryStore,
  type CheckoutHandoffRecoveryStore,
} from './checkout-handoff-recovery-store.ts';
import { createStorefrontSessionScope } from './storefront-session-scope.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

const command = Object.freeze({
  attemptId: 'checkout_handoff_1',
  cartId: 'cart_fixture',
  revision: 4,
});

async function prepared(store: CheckoutHandoffRecoveryStore) {
  assert.equal(await store.lockPreparing(command), true);
  assert.equal(
    await store.markPrepared(
      command.attemptId,
      '2099-01-01T00:00:00.000Z',
    ),
    true,
  );
}

test('recovery lock persists only scoped redacted handoff state across restart', async () => {
  const memory = createInMemoryLocalStateStore();
  const writtenValues: string[] = [];
  const localState = {
    getItem: memory.getItem,
    removeItem: memory.removeItem,
    async setItem(key: string, value: string) {
      writtenValues.push(value);
      await memory.setItem(key, value);
    },
  };
  const first = createCheckoutHandoffRecoveryStore(scope, localState);
  await prepared(first);
  assert.equal(await first.markOpening(command.attemptId), true);
  assert.equal(await first.markOutcome(command.attemptId, 'handed_off'), true);

  const restarted = createCheckoutHandoffRecoveryStore(scope, localState);
  assert.deepEqual(await restarted.get(), {
    attemptId: command.attemptId,
    cartId: command.cartId,
    expiresAt: '2099-01-01T00:00:00.000Z',
    revision: command.revision,
    status: 'handed_off',
  });
  assert.equal(await restarted.isLocked(command.cartId), true);
  assert.equal(await restarted.isLocked('different_cart'), false);

  assert.equal(JSON.stringify(writtenValues).includes('checkoutUrl'), false);
  assert.equal(JSON.stringify(writtenValues).includes('https://'), false);
});

test('only the same attempt advances and only a known pre-open state can clear', async () => {
  const store = createCheckoutHandoffRecoveryStore(
    scope,
    createInMemoryLocalStateStore(),
  );

  assert.equal(await store.lockPreparing(command), true);
  assert.equal(await store.lockPreparing(command), true);
  assert.equal(
    await store.lockPreparing({ ...command, attemptId: 'checkout_handoff_2' }),
    false,
  );
  assert.equal(await store.markPrepared('checkout_handoff_2', '2099-01-01T00:00:00.000Z'), false);
  assert.equal(await store.clearBeforeOpen(command.attemptId), true);
  assert.deepEqual(await store.get(), { status: 'unlocked' });

  await prepared(store);
  assert.equal(await store.markOpening(command.attemptId), true);
  assert.equal(await store.clearBeforeOpen(command.attemptId), false);
  assert.equal(await store.markOutcome(command.attemptId, 'outcome_unknown'), true);
  assert.equal(await store.clearBeforeOpen(command.attemptId), false);
});

test('malformed or cross-scope records fail closed without unlocking the cart', async () => {
  const localState = createInMemoryLocalStateStore();
  const key = `storefront.checkout-handoff.v1.${scope.environmentNamespace}.${scope.merchantSlug}.${scope.locationId}`;
  await localState.setItem(
    key,
    JSON.stringify({
      ...command,
      environmentNamespace: 'env-fedcba9876543210',
      locationId: scope.locationId,
      merchantSlug: scope.merchantSlug,
      schemaVersion: 1,
      status: 'preparing_handoff',
    }),
  );

  const store = createCheckoutHandoffRecoveryStore(scope, localState);
  assert.deepEqual(await store.get(), { status: 'recovery_unavailable' });
  assert.equal(await store.isLocked(command.cartId), true);
  assert.notEqual(await localState.getItem(key), null);

  await localState.setItem(
    key,
    JSON.stringify({
      ...command,
      checkoutUrl: 'https://checkout.example.test/secret',
      environmentNamespace: scope.environmentNamespace,
      locationId: scope.locationId,
      merchantSlug: scope.merchantSlug,
      schemaVersion: 1,
      status: 'preparing_handoff',
    }),
  );
  assert.deepEqual(await store.get(), { status: 'recovery_unavailable' });
  assert.equal(await store.isLocked(command.cartId), true);
});

test('an expired handoff that was never opened is safely released after restart', async () => {
  const localState = createInMemoryLocalStateStore();
  const first = createCheckoutHandoffRecoveryStore(scope, localState);
  assert.equal(await first.lockPreparing(command), true);
  assert.equal(
    await first.markPrepared(
      command.attemptId,
      '2026-08-13T00:00:00.000Z',
    ),
    true,
  );

  const restarted = createCheckoutHandoffRecoveryStore(
    scope,
    localState,
    () => Date.parse('2026-08-14T00:00:00.000Z'),
  );
  assert.deepEqual(await restarted.get(), { status: 'unlocked' });
});

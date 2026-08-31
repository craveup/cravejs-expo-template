import assert from 'node:assert/strict';
import test from 'node:test';

import { createCartSessionStore } from './cart-session.ts';
import { createInMemoryStorefrontSecretStore } from './storefront-secret-store.ts';
import {
  cartSessionKey,
  createStorefrontSessionScope,
  StorefrontSessionContractError,
} from './storefront-session-scope.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

test('cart session survives adapter restart with injected merchant scope', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const first = createCartSessionStore(scope, storage);

  await first.set({
    accessToken: 'guest-capability',
    cartId: 'cart_123',
    locationId: scope.locationId,
    revision: 3,
  });

  const restarted = createCartSessionStore(scope, storage);

  assert.deepEqual(await restarted.get(scope.locationId), {
    accessToken: 'guest-capability',
    cartId: 'cart_123',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 3,
  });
});

test('claim-like writes remove guest capability and keep revisions monotonic', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);

  await sessions.set({
    accessToken: 'guest-capability',
    cartId: 'cart_123',
    locationId: scope.locationId,
    revision: 3,
  });
  await sessions.set({
    cartId: 'cart_123',
    locationId: scope.locationId,
    revision: 4,
  });
  await sessions.set({
    accessToken: 'stale-capability',
    cartId: 'cart_123',
    locationId: scope.locationId,
    revision: 2,
  });
  await sessions.set({
    accessToken: 'same-revision-stale-capability',
    cartId: 'cart_123',
    locationId: scope.locationId,
    revision: 4,
  });

  assert.deepEqual(await sessions.get(scope.locationId), {
    cartId: 'cart_123',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 4,
  });
});

test('new and recovered carts never inherit or invent a capability', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);

  await sessions.set({
    accessToken: 'old-capability',
    cartId: 'cart_old',
    locationId: scope.locationId,
    revision: 7,
  });
  await sessions.set({
    cartId: 'cart_recovered',
    locationId: scope.locationId,
    revision: 9,
  });

  assert.deepEqual(await sessions.get(scope.locationId), {
    cartId: 'cart_recovered',
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: 9,
  });
});

test('matching cleanup never removes a replacement cart', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCartSessionStore(scope, storage);

  await sessions.set({
    accessToken: 'old-capability',
    cartId: 'cart_old',
    locationId: scope.locationId,
    revision: 7,
  });

  assert.equal(
    await sessions.clearMatching(scope.locationId, 'cart_different'),
    false,
  );
  assert.equal((await sessions.get(scope.locationId))?.cartId, 'cart_old');

  const cleanup = sessions.clearMatching(scope.locationId, 'cart_old');
  const replacement = sessions.set({
    accessToken: 'new-capability',
    cartId: 'cart_new',
    locationId: scope.locationId,
    revision: 1,
  });

  assert.equal(await cleanup, true);
  await replacement;
  assert.equal((await sessions.get(scope.locationId))?.cartId, 'cart_new');
});

test('cart sessions isolate reused tenant identifiers across environments', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const staging = createCartSessionStore(scope, storage);
  const production = createCartSessionStore(
    createStorefrontSessionScope({
      ...scope,
      environmentNamespace: 'env-fedcba9876543210',
    }),
    storage,
  );

  await staging.set({
    accessToken: 'staging-capability',
    cartId: 'cart_staging',
    locationId: scope.locationId,
    revision: 1,
  });

  assert.equal(await production.get(scope.locationId), null);
  assert.equal(
    (await staging.get(scope.locationId))?.accessToken,
    'staging-capability',
  );
});

test('malformed or wrong-scope cart records are cleared on read', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const key = cartSessionKey(scope);
  const sessions = createCartSessionStore(scope, storage);

  for (const value of [
    '{broken-json',
    JSON.stringify({
      accessToken: 'capability',
      cartId: 'cart_123',
      environmentNamespace: 'env-fedcba9876543210',
      locationId: scope.locationId,
      merchantSlug: scope.merchantSlug,
      revision: 1,
      schemaVersion: 1,
    }),
    JSON.stringify({
      cartId: 'cart_123',
      environmentNamespace: scope.environmentNamespace,
      locationId: scope.locationId,
      merchantSlug: scope.merchantSlug,
      revision: 1,
      schemaVersion: 2,
    }),
  ]) {
    await storage.setItem(key, value);
    assert.equal(await sessions.get(scope.locationId), null);
    assert.equal(await storage.getItem(key), null);
  }
});

test('cart writes reject cross-location, cross-merchant, and invalid secrets', async () => {
  const sessions = createCartSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );

  await assert.rejects(
    () =>
      sessions.set({
        cartId: 'cart_123',
        locationId: 'fedcba9876543210fedcba98',
        revision: 1,
      }),
    StorefrontSessionContractError,
  );
  await assert.rejects(
    () =>
      sessions.set({
        cartId: 'cart_123',
        locationId: scope.locationId,
        merchantSlug: 'different-merchant',
        revision: 1,
      }),
    StorefrontSessionContractError,
  );
  await assert.rejects(
    () =>
      sessions.set({
        accessToken: '',
        cartId: 'cart_123',
        locationId: scope.locationId,
        revision: 1,
      }),
    StorefrontSessionContractError,
  );
});

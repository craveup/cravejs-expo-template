import assert from 'node:assert/strict';
import test from 'node:test';

import { createCartSessionStore } from './cart-session.ts';
import { createCustomerSessionStore } from './customer-session.ts';
import { createInMemoryStorefrontSecretStore } from './storefront-secret-store.ts';
import {
  createStorefrontSessionScope,
  customerSessionKey,
} from './storefront-session-scope.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

test('customer token survives adapter restart and feeds async auth seam', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const first = createCustomerSessionStore(scope, storage);

  await first.setToken('customer.jwt.value');

  const restarted = createCustomerSessionStore(scope, storage);
  assert.equal(await restarted.getAuthToken(), 'customer.jwt.value');
});

test('customer tokens isolate reused merchant slugs across environments', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const staging = createCustomerSessionStore(scope, storage);
  const production = createCustomerSessionStore(
    createStorefrontSessionScope({
      ...scope,
      environmentNamespace: 'env-fedcba9876543210',
    }),
    storage,
  );

  await staging.setToken('staging.jwt.value');

  assert.equal(await production.getAuthToken(), null);
  assert.equal(await staging.getAuthToken(), 'staging.jwt.value');
});

test('malformed and wrong-merchant customer records are cleared', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const key = customerSessionKey(scope);
  const customers = createCustomerSessionStore(scope, storage);

  await storage.setItem(
    key,
    JSON.stringify({
      environmentNamespace: scope.environmentNamespace,
      merchantSlug: 'different-merchant',
      schemaVersion: 1,
      token: 'customer.jwt.value',
    }),
  );

  assert.equal(await customers.getAuthToken(), null);
  assert.equal(await storage.getItem(key), null);
});

test('logout-style local clear does not remove an unrelated guest cart', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const customers = createCustomerSessionStore(scope, storage);
  const carts = createCartSessionStore(scope, storage);

  await customers.setToken('customer.jwt.value');
  await carts.set({
    accessToken: 'guest-capability',
    cartId: 'cart_123',
    locationId: scope.locationId,
    revision: 2,
  });

  await customers.clear();

  assert.equal(await customers.getAuthToken(), null);
  assert.equal(
    (await carts.get(scope.locationId))?.accessToken,
    'guest-capability',
  );
});

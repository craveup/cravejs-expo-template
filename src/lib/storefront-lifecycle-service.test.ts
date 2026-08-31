import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCustomerAuthService } from '../features/auth/customer-auth-service.ts';
import { createStorefrontCartFixture } from '../fixtures/storefront-cart-fixture.ts';
import { createCartSessionStore } from './cart-session.ts';
import { createCustomerSessionStore } from './customer-session.ts';
import { createInMemoryStorefrontSecretStore } from './storefront-secret-store.ts';
import {
  createStorefrontLifecycleService,
  type StorefrontLifecycleClient,
} from './storefront-lifecycle-service.ts';
import { createStorefrontSessionScope } from './storefront-session-scope.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

function setup(cartGet: StorefrontLifecycleClient['cart']['get']) {
  const storage = createInMemoryStorefrontSecretStore();
  const carts = createCartSessionStore(scope, storage);
  const customers = createCustomerSessionStore(scope, storage);
  let profileCalls = 0;
  const auth = createCustomerAuthService(
    {
      async getProfile() {
        profileCalls += 1;
        return {
          customerEmail: 'guest@example.com',
          customerName: 'Guest',
          id: 'customer_fixture',
          lastName: 'Customer',
          phoneNumber: null,
          profilePicture: '',
        };
      },
      async login() {
        return { delivery: 'email', methodId: 'method_fixture' };
      },
      async logout() {
        return { success: true };
      },
      async verifyOtp() {
        return { token: 'customer.jwt.fixture' };
      },
    },
    customers,
  );
  const lifecycle = createStorefrontLifecycleService(
    { cart: { get: cartGet } },
    auth,
    carts,
    scope.locationId,
  );

  return { auth, carts, customers, lifecycle, profileCalls: () => profileCalls };
}

test('cold-start restore rehydrates scoped auth and cart without exposing secrets', async () => {
  const configured = setup(async () => createStorefrontCartFixture({ revision: 3 }));
  await configured.customers.setToken('customer.jwt.fixture');
  await configured.carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 3,
  });

  const snapshot = await configured.lifecycle.restore();

  assert.equal(snapshot.auth.status, 'authenticated');
  assert.equal(snapshot.cart?.revision, 3);
  assert.doesNotMatch(JSON.stringify(snapshot), /customer\.jwt|guest-capability/);
});

test('foreground restore reuses authenticated profile state and refreshes cart truth', async () => {
  let cartCalls = 0;
  const configured = setup(async () => {
    cartCalls += 1;
    return createStorefrontCartFixture({ revision: cartCalls });
  });
  await configured.customers.setToken('customer.jwt.fixture');
  await configured.carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });

  await configured.lifecycle.restore();
  await configured.lifecycle.restore();

  assert.equal(configured.profileCalls(), 1);
  assert.equal(cartCalls, 2);
});

test('expired and terminally inaccessible carts clear while transient failures remain recoverable', async () => {
  const expired = setup(async () =>
    createStorefrontCartFixture({ status: 'EXPIRED' }),
  );
  await expired.carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });
  assert.equal((await expired.lifecycle.restore()).cart, undefined);
  assert.equal(await expired.carts.get(scope.locationId), null);

  const missing = setup(async () => {
    throw { code: 'NOT_FOUND', status: 404 };
  });
  await missing.carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });
  const missingSnapshot = await missing.lifecycle.restore();
  assert.equal(missingSnapshot.cartFailure?.kind, 'not_found');
  assert.equal(await missing.carts.get(scope.locationId), null);

  const unavailable = setup(async () => {
    throw { status: 503 };
  });
  await unavailable.carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });
  const unavailableSnapshot = await unavailable.lifecycle.restore();
  assert.equal(unavailableSnapshot.cartFailure?.kind, 'unavailable');
  assert.ok(await unavailable.carts.get(scope.locationId));
});

test('expired-cart cleanup reports secure storage failure without hiding the record', async () => {
  const configured = setup(async () =>
    createStorefrontCartFixture({ status: 'EXPIRED' }),
  );
  await configured.carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });
  const lifecycle = createStorefrontLifecycleService(
    {
      cart: {
        async get() {
          return createStorefrontCartFixture({ status: 'EXPIRED' });
        },
      },
    },
    configured.auth,
    {
      ...configured.carts,
      async clearMatching() {
        throw new Error('secure storage unavailable');
      },
    },
    scope.locationId,
  );

  const snapshot = await lifecycle.restore();

  assert.equal(snapshot.cartFailure?.code, 'SECURE_STORAGE_UNAVAILABLE');
  assert.ok(await configured.carts.get(scope.locationId));
});

test('foreground customer expiry clears auth and inaccessible cart together', async () => {
  const configured = setup(async () => {
    throw { status: 401 };
  });
  await configured.customers.setToken('customer.jwt.fixture');
  await configured.carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });

  const snapshot = await configured.lifecycle.restore();

  assert.equal(snapshot.auth.status, 'signed_out');
  assert.equal(snapshot.cartFailure?.kind, 'authentication_required');
  assert.equal(await configured.customers.getAuthToken(), null);
  assert.equal(await configured.carts.get(scope.locationId), null);
});

test('guest-cart authorization failure preserves the customer session', async () => {
  const configured = setup(async () => {
    throw { status: 401 };
  });
  await configured.customers.setToken('customer.jwt.fixture');
  await configured.carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });

  const snapshot = await configured.lifecycle.restore();

  assert.equal(snapshot.auth.status, 'authenticated');
  assert.equal(snapshot.cartFailure?.kind, 'authentication_required');
  assert.equal(
    await configured.customers.getAuthToken(),
    'customer.jwt.fixture',
  );
  assert.equal(await configured.carts.get(scope.locationId), null);
});

test('stale lifecycle cleanup preserves a replacement cart', async () => {
  let finishRequest!: () => void;
  const requestStarted = Promise.withResolvers<void>();
  const requestFinished = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  const configured = setup(async () => {
    requestStarted.resolve();
    await requestFinished;
    return createStorefrontCartFixture({
      id: 'cart_previous',
      status: 'EXPIRED',
    });
  });
  await configured.carts.set({
    accessToken: 'previous-capability-fixture',
    cartId: 'cart_previous',
    locationId: scope.locationId,
    revision: 1,
  });

  const restore = configured.lifecycle.restore();
  await requestStarted.promise;
  await configured.carts.set({
    accessToken: 'current-capability-fixture',
    cartId: 'cart_current',
    locationId: scope.locationId,
    revision: 1,
  });
  finishRequest();
  await restore;

  assert.equal(
    (await configured.carts.get(scope.locationId))?.cartId,
    'cart_current',
  );
});

test('completed carts remain available for protected order-result recovery', async () => {
  const configured = setup(async () =>
    createStorefrontCartFixture({ status: 'COMPLETED' }),
  );
  await configured.carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 1,
  });

  const snapshot = await configured.lifecycle.restore();

  assert.equal(snapshot.cart?.status, 'COMPLETED');
  assert.ok(await configured.carts.get(scope.locationId));
});

test('lifecycle service has no timer, offline queue, direct transport, or logging', () => {
  const source = readFileSync(
    new URL('./storefront-lifecycle-service.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|setInterval|setTimeout|queue|console\.|process\.env/,
  );
  assert.match(source, /import type \{ StorefrontClient \}/);
});

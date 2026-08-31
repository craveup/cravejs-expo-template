import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCartSessionStore } from '../../lib/cart-session.ts';
import { createCustomerSessionStore } from '../../lib/customer-session.ts';
import { isCustomerAuthenticationFailure } from '../../lib/customer-request-failure.ts';
import { mapStorefrontError } from '../../lib/storefront-errors.ts';
import { createInMemoryStorefrontSecretStore } from '../../lib/storefront-secret-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import {
  createCustomerAuthService,
  type CustomerAuthClient,
} from './customer-auth-service.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

const profile = {
  customerEmail: 'guest@example.com',
  customerName: 'Guest',
  id: 'customer_fixture',
  lastName: 'Customer',
  phoneNumber: null,
  profilePicture: '',
};

function customerClient(
  overrides: Partial<CustomerAuthClient> = {},
): CustomerAuthClient {
  return {
    async getProfile() {
      return profile;
    },
    async login() {
      return { delivery: 'email', methodId: 'method_fixture_1' };
    },
    async logout() {
      return { success: true };
    },
    async verifyOtp() {
      return { token: 'customer.jwt.fixture' };
    },
    ...overrides,
  };
}

test('login and verification use the exact challenge then store only the scoped token', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCustomerSessionStore(scope, storage);
  const loginPayloads: unknown[] = [];
  const verificationPayloads: unknown[] = [];
  const service = createCustomerAuthService(
    customerClient({
      async login(payload) {
        loginPayloads.push(payload);
        return { delivery: 'email', methodId: 'method_fixture_1' };
      },
      async verifyOtp(payload) {
        verificationPayloads.push(payload);
        return { token: 'customer.jwt.fixture' };
      },
    }),
    sessions,
  );
  const observedStatuses: string[] = [];
  const unsubscribe = service.subscribe((state) => observedStatuses.push(state.status));

  const challenge = await service.requestChallenge({
    identifierString: 'guest@example.com',
    merchantSlug: scope.merchantSlug,
  });
  const verified = await service.verify('012345', {
    customerName: ' Guest ',
    lastName: ' Customer ',
  });
  unsubscribe();

  assert.equal(challenge.ok, true);
  assert.equal(verified.ok, true);
  assert.deepEqual(loginPayloads, [
    {
      identifierString: 'guest@example.com',
      merchantSlug: 'example-merchant',
    },
  ]);
  assert.deepEqual(verificationPayloads, [
    {
      customerName: 'Guest',
      identifierString: 'guest@example.com',
      lastName: 'Customer',
      merchantSlug: 'example-merchant',
      methodId: 'method_fixture_1',
      otp: '012345',
    },
  ]);
  assert.equal(await sessions.getAuthToken(), 'customer.jwt.fixture');
  assert.equal(service.getState().status, 'authenticated');
  assert.doesNotMatch(JSON.stringify(service.getState()), /012345|customer\.jwt|method_fixture/i);
  assert.deepEqual(observedStatuses, [
    'requesting_challenge',
    'awaiting_verification',
    'verifying',
    'authenticated',
  ]);
});

test('resend preserves identity and replaces the active challenge', async () => {
  const sessions = createCustomerSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  let callCount = 0;
  const service = createCustomerAuthService(
    customerClient({
      async login() {
        callCount += 1;
        return { delivery: 'email', methodId: `method_fixture_${callCount}` };
      },
    }),
    sessions,
  );

  await service.requestChallenge({
    identifierString: 'guest@example.com',
    merchantSlug: scope.merchantSlug,
  });
  const resent = await service.resend();
  const state = service.getState();

  assert.equal(resent.ok, true);
  assert.equal(state.status, 'awaiting_verification');
  if (state.status === 'awaiting_verification') {
    assert.equal(state.challenge.methodId, 'method_fixture_2');
  }
});

test('a transient profile failure retains the token and supports deliberate retry', async () => {
  const sessions = createCustomerSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  let profileCalls = 0;
  const service = createCustomerAuthService(
    customerClient({
      async getProfile() {
        profileCalls += 1;
        if (profileCalls === 1) throw { status: 503 };
        return profile;
      },
    }),
    sessions,
  );

  await service.requestChallenge({
    identifierString: 'guest@example.com',
    merchantSlug: scope.merchantSlug,
  });
  const first = await service.verify('012345');
  const retried = await service.retryProfile();

  assert.equal(first.ok, false);
  assert.equal(first.state.status, 'profile_unavailable');
  assert.equal(await sessions.getAuthToken(), 'customer.jwt.fixture');
  assert.equal(retried.ok, true);
  assert.equal(retried.state.status, 'authenticated');
});

test('restore skips the network without a token and clears a rejected token', async () => {
  const sessions = createCustomerSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  let profileCalls = 0;
  const service = createCustomerAuthService(
    customerClient({
      async getProfile() {
        profileCalls += 1;
        throw { code: 'UNAUTHORIZED', status: 401 };
      },
    }),
    sessions,
  );

  assert.equal((await service.restore()).state.status, 'signed_out');
  assert.equal(profileCalls, 0);

  await sessions.setToken('expired.jwt.fixture');
  const rejected = await service.restore();

  assert.equal(rejected.ok, false);
  assert.equal(rejected.state.status, 'signed_out');
  assert.equal(rejected.ok ? undefined : rejected.failure.kind, 'authentication_required');
  assert.equal(await sessions.getAuthToken(), null);
  assert.equal(profileCalls, 1);
});

test('an external customer 401 clears both persisted and in-memory auth', async () => {
  const sessions = createCustomerSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  const service = createCustomerAuthService(customerClient(), sessions);

  await sessions.setToken('customer.jwt.fixture');
  assert.equal((await service.restore()).state.status, 'authenticated');

  const failure = mapStorefrontError({ status: 401 });
  assert.equal(failure.kind, 'authentication_required');
  if (!isCustomerAuthenticationFailure(failure)) {
    throw new Error('Expected an authentication failure fixture.');
  }

  const handled = await service.invalidateSession(failure);

  assert.equal(handled, failure);
  assert.equal(service.getState().status, 'signed_out');
  assert.equal(await sessions.getAuthToken(), null);
});

test('logout clears local auth in every remote outcome without deleting the guest cart', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const sessions = createCustomerSessionStore(scope, storage);
  const carts = createCartSessionStore(scope, storage);
  const service = createCustomerAuthService(
    customerClient({
      async logout() {
        throw { requestId: 'request-fixture', status: 503 };
      },
    }),
    sessions,
  );

  await sessions.setToken('customer.jwt.fixture');
  await carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 3,
  });

  const result = await service.logout();

  assert.equal(result.ok, false);
  assert.equal(result.state.status, 'signed_out');
  assert.equal(await sessions.getAuthToken(), null);
  assert.equal(
    (await carts.get(scope.locationId))?.accessToken,
    'guest-capability-fixture',
  );
});

test('logout reports failed local token deletion ahead of remote revocation failure', async () => {
  const backing = createInMemoryStorefrontSecretStore();
  const sessions = createCustomerSessionStore(scope, {
    ...backing,
    async deleteItem() {
      throw new Error('secure storage unavailable');
    },
  });
  const service = createCustomerAuthService(
    customerClient({
      async logout() {
        throw { requestId: 'request-fixture', status: 503 };
      },
    }),
    sessions,
  );
  await sessions.setToken('customer.jwt.fixture');

  const result = await service.logout();

  assert.equal(result.ok, false);
  assert.equal(
    result.ok ? undefined : result.failure.code,
    'SECURE_STORAGE_UNAVAILABLE',
  );
});

test('logout invalidates an in-flight verification so its token cannot be resurrected', async () => {
  const sessions = createCustomerSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  let resolveVerification!: (value: { token: string }) => void;
  let profileCalls = 0;
  const verification = new Promise<{ token: string }>((resolve) => {
    resolveVerification = resolve;
  });
  const service = createCustomerAuthService(
    customerClient({
      async getProfile() {
        profileCalls += 1;
        return profile;
      },
      async verifyOtp() {
        return verification;
      },
    }),
    sessions,
  );

  await service.requestChallenge({
    identifierString: 'guest@example.com',
    merchantSlug: scope.merchantSlug,
  });
  const pendingVerification = service.verify('012345');
  assert.equal(service.getState().status, 'verifying');

  await service.logout();
  resolveVerification({ token: 'customer.jwt.fixture' });
  const staleResult = await pendingVerification;

  assert.equal(staleResult.ok, false);
  assert.equal(service.getState().status, 'signed_out');
  assert.equal(await sessions.getAuthToken(), null);
  assert.equal(profileCalls, 0);
});

test('a failing presentation subscriber cannot interrupt auth state progress', async () => {
  const sessions = createCustomerSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  const service = createCustomerAuthService(customerClient(), sessions);
  service.subscribe(() => {
    throw new Error('presentation failure');
  });

  const result = await service.requestChallenge({
    identifierString: 'guest@example.com',
    merchantSlug: scope.merchantSlug,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'awaiting_verification');
});

test('auth service contains no direct transport, native storage, or secret logging', () => {
  const source = readFileSync(new URL('./customer-auth-service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\bfetch\s*\(|expo-secure-store|console\.|process\.env/);
  assert.match(source, /import type \{ StorefrontClient \}/);
});

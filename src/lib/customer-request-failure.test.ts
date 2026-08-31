import assert from 'node:assert/strict';
import test from 'node:test';

import type { CustomerSessionStore } from './customer-session.ts';
import {
  mapCustomerRequestFailure,
  SECURE_STORAGE_FAILURE,
} from './customer-request-failure.ts';

function sessionStore(clear: () => Promise<void>): CustomerSessionStore {
  return {
    clear,
    getAuthToken: async () => null,
    setToken: async () => undefined,
  };
}

test('clears the scoped customer token after an authentication failure', async () => {
  let clearCalls = 0;
  const failure = await mapCustomerRequestFailure(
    { code: 'CUSTOMER_AUTH_REQUIRED', status: 401 },
    sessionStore(async () => {
      clearCalls += 1;
    }),
  );

  assert.equal(clearCalls, 1);
  assert.equal(failure.kind, 'authentication_required');
});

test('does not clear the customer token after a non-authentication failure', async () => {
  let clearCalls = 0;
  const failure = await mapCustomerRequestFailure(
    { status: 503 },
    sessionStore(async () => {
      clearCalls += 1;
    }),
  );

  assert.equal(clearCalls, 0);
  assert.equal(failure.kind, 'unavailable');
});

test('delegates authentication expiry to the shared auth-state boundary', async () => {
  let clearCalls = 0;
  let handledFailure;
  const failure = await mapCustomerRequestFailure(
    { status: 401 },
    sessionStore(async () => {
      clearCalls += 1;
    }),
    async (authenticationFailure) => {
      handledFailure = authenticationFailure;
      return authenticationFailure;
    },
  );

  assert.equal(clearCalls, 0);
  assert.equal(handledFailure, failure);
  assert.equal(failure.kind, 'authentication_required');
});

test('fails closed when an invalid customer token cannot be removed', async () => {
  const failure = await mapCustomerRequestFailure(
    { status: 401 },
    sessionStore(async () => {
      throw new Error('storage unavailable');
    }),
  );

  assert.equal(failure, SECURE_STORAGE_FAILURE);
});

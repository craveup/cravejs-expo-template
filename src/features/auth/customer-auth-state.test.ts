import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { mapStorefrontError } from '../../lib/storefront-errors.ts';
import {
  CustomerAuthTransitionError,
  INITIAL_CUSTOMER_AUTH_STATE,
  reduceCustomerAuthState,
  type CustomerAuthState,
} from './customer-auth-state.ts';

const request = {
  identifierString: 'guest@example.com',
  merchantSlug: 'example-merchant',
} as const;

function requestChallenge(
  state: CustomerAuthState = INITIAL_CUSTOMER_AUTH_STATE,
): CustomerAuthState {
  return reduceCustomerAuthState(state, {
    request,
    type: 'challenge_requested',
  });
}

function receiveChallenge(
  state: CustomerAuthState,
  methodId = 'method_1',
): CustomerAuthState {
  return reduceCustomerAuthState(state, {
    response: { delivery: 'email', methodId },
    type: 'challenge_received',
  });
}

test('login and resend replace the challenge without retaining OTP or token state', () => {
  const first = receiveChallenge(requestChallenge(), 'method_1');
  const resendPending = requestChallenge(first);
  const resent = receiveChallenge(resendPending, 'method_2');
  const serialized = JSON.stringify(resent);

  assert.equal(resent.status, 'awaiting_verification');
  if (resent.status === 'awaiting_verification') {
    assert.equal(resent.challenge.methodId, 'method_2');
    assert.equal(resent.challenge.identifierString, request.identifierString);
  }
  assert.doesNotMatch(serialized, /"otp"|"token"/i);
});

test('failed resend retains the prior challenge and safe failure only', () => {
  const first = receiveChallenge(requestChallenge(), 'method_1');
  const resendPending = requestChallenge(first);
  const failed = reduceCustomerAuthState(resendPending, {
    failure: mapStorefrontError({
      message: 'contains a raw identifier and token',
      requestId: 'safe-request-id',
      status: 429,
    }),
    type: 'challenge_failed',
  });

  assert.equal(failed.status, 'awaiting_verification');
  if (failed.status === 'awaiting_verification') {
    assert.equal(failed.challenge.methodId, 'method_1');
    assert.equal(failed.failure?.kind, 'rate_limited');
  }
  assert.doesNotMatch(JSON.stringify(failed), /raw identifier|token/);
});

test('verification failure preserves challenge for deliberate retry', () => {
  const awaiting = receiveChallenge(requestChallenge());
  const verifying = reduceCustomerAuthState(awaiting, {
    type: 'verification_requested',
  });
  const failed = reduceCustomerAuthState(verifying, {
    failure: mapStorefrontError({ code: 'INVALID_OTP', status: 422 }),
    type: 'verification_failed',
  });

  assert.equal(failed.status, 'awaiting_verification');
  if (failed.status === 'awaiting_verification') {
    assert.equal(failed.challenge.methodId, 'method_1');
    assert.equal(failed.failure?.kind, 'invalid_request');
  }
});

test('restore exposes only the allowlisted customer profile', () => {
  const restoring = reduceCustomerAuthState(INITIAL_CUSTOMER_AUTH_STATE, {
    type: 'restore_requested',
  });
  const authenticated = reduceCustomerAuthState(restoring, {
    profile: {
      customerEmail: 'guest@example.com',
      customerName: 'Guest',
      id: 'customer_123',
      lastName: 'Customer',
      phoneNumber: null,
      profilePicture: '',
      providerMemberId: 'must-not-leak',
    },
    type: 'authenticated',
  });

  assert.deepEqual(authenticated, {
    profile: {
      customerEmail: 'guest@example.com',
      customerName: 'Guest',
      id: 'customer_123',
      lastName: 'Customer',
      phoneNumber: null,
      profilePicture: '',
    },
    status: 'authenticated',
  });
  assert.deepEqual(
    reduceCustomerAuthState(authenticated, { type: 'signed_out' }),
    INITIAL_CUSTOMER_AUTH_STATE,
  );
});

test('profile failures retain a retryable signed-in boundary without a token', () => {
  const awaiting = receiveChallenge(requestChallenge());
  const verifying = reduceCustomerAuthState(awaiting, {
    type: 'verification_requested',
  });
  const unavailable = reduceCustomerAuthState(verifying, {
    failure: mapStorefrontError({ status: 503 }),
    type: 'profile_failed',
  });
  const restoring = reduceCustomerAuthState(unavailable, {
    type: 'restore_requested',
  });

  assert.deepEqual(unavailable, {
    failure: { kind: 'unavailable', retryable: true, status: 503 },
    status: 'profile_unavailable',
  });
  assert.equal(restoring.status, 'restoring');
  assert.doesNotMatch(JSON.stringify(unavailable), /token|otp/i);
  assert.deepEqual(
    reduceCustomerAuthState(restoring, { type: 'restore_empty' }),
    INITIAL_CUSTOMER_AUTH_STATE,
  );
});

test('illegal transitions fail closed without including state or event data', () => {
  assert.throws(
    () =>
      reduceCustomerAuthState(INITIAL_CUSTOMER_AUTH_STATE, {
        type: 'verification_requested',
      }),
    (error: unknown) => {
      assert.ok(error instanceof CustomerAuthTransitionError);
      assert.equal(
        error.message,
        'Invalid customer authentication state transition.',
      );
      return true;
    },
  );
});

test('headless auth state has no transport, storage, environment, or React dependency', () => {
  const source = readFileSync(
    new URL('./customer-auth-state.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /@craveup\/storefront-sdk|expo-secure-store|AsyncStorage|process\.env|\bfetch\s*\(|console\.|from ['"]react/,
  );
});

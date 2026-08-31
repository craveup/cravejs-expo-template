import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CustomerAuthState } from './customer-auth-state.ts';
import {
  getCustomerAuthFailureMessage,
  getOtpAuthFailureMessage,
  getOtpRouteDestination,
  getSignInRouteDestination,
} from './customer-auth-route.ts';

test('sign-in routing follows only the shared authentication state', () => {
  assert.equal(getSignInRouteDestination({ status: 'signed_out' }), undefined);
  assert.equal(
    getSignInRouteDestination({
      profile: {
        customerEmail: null,
        customerName: 'Test',
        id: 'customer_fixture',
        lastName: 'Customer',
        phoneNumber: null,
        profilePicture: '',
      },
      status: 'authenticated',
    }),
    '/account',
  );
  assert.equal(
    getSignInRouteDestination({
      failure: { code: 'NETWORK_ERROR', kind: 'unavailable', retryable: true },
      status: 'profile_unavailable',
    }),
    '/account',
  );

  const awaiting = {
    challenge: {
      delivery: 'sms',
      identifierString: '+15555550100',
      merchantSlug: 'fixture-merchant',
      methodId: 'method_fixture',
    },
    status: 'awaiting_verification',
  } as const satisfies CustomerAuthState;
  assert.equal(getSignInRouteDestination(awaiting), '/sign-in/verify');
});

test('sign-in failures use fixed safe copy', () => {
  assert.equal(
    getCustomerAuthFailureMessage('rate_limited'),
    'Too many attempts. Please wait and try again.',
  );
  assert.equal(getCustomerAuthFailureMessage(), undefined);
});

test('OTP routing requires an in-memory challenge and never accepts route state', () => {
  assert.equal(getOtpRouteDestination({ status: 'signed_out' }), '/sign-in');
  assert.equal(
    getOtpRouteDestination({
      failure: { code: 'NETWORK_ERROR', kind: 'unavailable', retryable: true },
      status: 'profile_unavailable',
    }),
    '/account',
  );
  assert.equal(
    getOtpRouteDestination({
      challenge: {
        delivery: 'sms',
        identifierString: '+15555550100',
        merchantSlug: 'fixture-merchant',
        methodId: 'method_fixture',
      },
      status: 'verifying',
    }),
    undefined,
  );
});

test('OTP failures distinguish invalid codes without exposing raw service details', () => {
  assert.equal(getOtpAuthFailureMessage('invalid'), 'Check the code and try again.');
  assert.equal(
    getOtpAuthFailureMessage('network'),
    'We could not verify the code. Check your connection and try again.',
  );
});

test('sign-in route does not place private authentication values in navigation or logs', () => {
  const source = readFileSync(
    new URL('../../app/sign-in.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /useLocalSearchParams|AsyncStorage|SecureStore|console\.|\bfetch\s*\(/);
  assert.doesNotMatch(source, /identifier.*(?:push|replace)|(?:push|replace).*identifier/i);
});

test('OTP route keeps the code and challenge out of navigation, storage, and logs', () => {
  const source = readFileSync(
    new URL('../../app/sign-in/verify.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /useLocalSearchParams|AsyncStorage|SecureStore|console\.|\bfetch\s*\(/);
  assert.doesNotMatch(source, /(?:otp|code|methodId|identifier).*(?:push|replace)/i);
});

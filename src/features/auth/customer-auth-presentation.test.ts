import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPhoneChallengeRequest,
  maskCustomerIdentifier,
  toCustomerAuthPresentationFailure,
  toOtpAuthPresentation,
  toSignInAuthPresentation,
} from './customer-auth-presentation.ts';

const challenge = {
  delivery: 'sms' as const,
  identifierString: '+15550124567',
  merchantSlug: 'example-merchant',
  methodId: 'method_fixture_123',
};

test('phone presentation builds the one canonical auth request', () => {
  assert.deepEqual(
    buildPhoneChallengeRequest('example-merchant', {
      countryCode: '+1',
      identifier: '(555) 012-4567',
    }),
    {
      identifierString: '+15550124567',
      merchantSlug: 'example-merchant',
    },
  );
  assert.equal(
    buildPhoneChallengeRequest('example-merchant', {
      countryCode: '+1',
      identifier: '12',
    }),
    undefined,
  );
});

test('identifier labels mask phone and email contact data', () => {
  assert.equal(maskCustomerIdentifier('+15550124567'), '•••• 4567');
  assert.equal(maskCustomerIdentifier('tea@example.com'), 't•••@example.com');
  assert.equal(maskCustomerIdentifier('malformed'), 'your account');
});

test('sign-in presentation exposes only initial request progress and safe failure class', () => {
  assert.deepEqual(
    toSignInAuthPresentation({
      request: {
        identifierString: challenge.identifierString,
        merchantSlug: challenge.merchantSlug,
      },
      status: 'requesting_challenge',
    }),
    { pending: true },
  );
  assert.deepEqual(
    toSignInAuthPresentation({
      failure: { kind: 'rate_limited', retryable: true },
      status: 'signed_out',
    }),
    { failure: 'rate_limited', pending: false },
  );
});

test('OTP presentation distinguishes resend, verification, and recoverable failure states', () => {
  assert.deepEqual(
    toOtpAuthPresentation({ challenge, status: 'awaiting_verification' }),
    {
      identifierLabel: '•••• 4567',
      pending: false,
      resendAvailable: true,
    },
  );
  assert.deepEqual(
    toOtpAuthPresentation({ challenge, status: 'verifying' }),
    {
      identifierLabel: '•••• 4567',
      pending: true,
      resendAvailable: false,
    },
  );
  assert.deepEqual(
    toOtpAuthPresentation({
      challenge,
      failure: { kind: 'invalid_request', retryable: false },
      status: 'awaiting_verification',
    }),
    {
      failure: 'invalid',
      identifierLabel: '•••• 4567',
      pending: false,
      resendAvailable: true,
    },
  );
  assert.deepEqual(
    toOtpAuthPresentation({
      previousChallenge: challenge,
      request: {
        identifierString: challenge.identifierString,
        merchantSlug: challenge.merchantSlug,
      },
      status: 'requesting_challenge',
    }),
    {
      identifierLabel: '•••• 4567',
      pending: true,
      resendAvailable: false,
    },
  );
});

test('failure mapping never exposes SDK messages, request IDs, or provider details', () => {
  assert.equal(
    toCustomerAuthPresentationFailure({
      code: 'RATE_LIMITED',
      kind: 'rate_limited',
      requestId: 'request_fixture_123',
      retryAfterMs: 1_000,
      retryable: true,
    }),
    'rate_limited',
  );
});

test('auth presentation adapter owns no transport, storage, navigation, or logging', () => {
  const source = readFileSync(
    new URL('./customer-auth-presentation.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /@craveup\/storefront-sdk|expo-router|SecureStore|AsyncStorage|process\.env|\bfetch\s*\(|console\.|\botp\b.*(?:store|persist|log)/i,
  );
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeMerchantSlug } from '../../domain/storefront/merchant-scope.ts';
import {
  buildCustomerVerificationRequest,
  composeE164Phone,
  createCustomerAuthChallenge,
  createCustomerLoginRequest,
  isCustomerOtpValid,
  normalizeCustomerEmail,
  replaceCustomerAuthChallenge,
  validateCustomerVerificationResponse,
  validateStorefrontCustomer,
} from './customer-auth-contract.ts';

test('normalizes merchant slugs and email identifiers to the handoff limits', () => {
  assert.deepEqual(normalizeMerchantSlug('  example-merchant  '), {
    ok: true,
    value: 'example-merchant',
  });
  assert.deepEqual(normalizeMerchantSlug('Example Merchant'), {
    field: 'merchantSlug',
    ok: false,
  });
  assert.deepEqual(normalizeCustomerEmail('  GUEST@EXAMPLE.COM  '), {
    ok: true,
    value: 'guest@example.com',
  });
  assert.equal(normalizeCustomerEmail(`${'a'.repeat(244)}@example.com`).ok, false);
});

test('composes E.164 phones exactly once from separate presentation fields', () => {
  assert.deepEqual(composeE164Phone('+1', '(555) 123-4567'), {
    ok: true,
    value: '+15551234567',
  });
  assert.deepEqual(composeE164Phone('44', '20 7946 0958'), {
    ok: true,
    value: '+442079460958',
  });
  assert.deepEqual(composeE164Phone('+1', '+1 555 123 4567'), {
    field: 'identifierString',
    ok: false,
  });
  assert.equal(composeE164Phone('+1', '12345').ok, false);
  assert.equal(composeE164Phone('+1234', '5551234567').ok, false);
});

test('creates an exact two-field login request from a normalized identifier', () => {
  const result = createCustomerLoginRequest(' example-merchant ', 'guest@example.com');

  assert.deepEqual(result, {
    ok: true,
    value: {
      identifierString: 'guest@example.com',
      merchantSlug: 'example-merchant',
    },
  });
  assert.deepEqual(createCustomerLoginRequest('example-merchant', 'GUEST@example.com'), {
    field: 'identifierString',
    ok: false,
  });
});

test('validates challenge delivery and opaque method ID fields', () => {
  const request = {
    identifierString: 'guest@example.com',
    merchantSlug: 'example-merchant',
  };

  assert.deepEqual(
    createCustomerAuthChallenge(request, {
      delivery: 'email',
      methodId: 'method_example_0001',
    }),
    {
      ok: true,
      value: {
        ...request,
        delivery: 'email',
        methodId: 'method_example_0001',
      },
    },
  );
  assert.deepEqual(
    createCustomerAuthChallenge(request, {
      delivery: 'push',
      methodId: 'method_example_0001',
    }),
    { field: 'delivery', ok: false },
  );
  assert.deepEqual(
    createCustomerAuthChallenge(request, { delivery: 'email', methodId: ' padded ' }),
    { field: 'methodId', ok: false },
  );
});

test('verification preserves leading zeroes and the exact challenge identity', () => {
  const challenge = {
    delivery: 'sms' as const,
    identifierString: '+15551234567',
    merchantSlug: 'example-merchant',
    methodId: 'method_example_0001',
  };

  assert.equal(isCustomerOtpValid('012345'), true);
  assert.equal(isCustomerOtpValid('1234'), false);
  assert.equal(isCustomerOtpValid('12345a'), false);
  assert.deepEqual(
    buildCustomerVerificationRequest(challenge, '012345', {
      customerName: '  Guest  ',
      lastName: '  Customer  ',
    }),
    {
      ok: true,
      value: {
        customerName: 'Guest',
        identifierString: '+15551234567',
        lastName: 'Customer',
        merchantSlug: 'example-merchant',
        methodId: 'method_example_0001',
        otp: '012345',
      },
    },
  );
});

test('optional names are omitted when blank and rejected over 100 characters', () => {
  const challenge = {
    delivery: 'email' as const,
    identifierString: 'guest@example.com',
    merchantSlug: 'example-merchant',
    methodId: 'method_example_0001',
  };

  const withoutNames = buildCustomerVerificationRequest(challenge, '012345', {
    customerName: '  ',
  });
  assert.equal(withoutNames.ok, true);
  if (withoutNames.ok) {
    assert.equal('customerName' in withoutNames.value, false);
  }
  assert.deepEqual(
    buildCustomerVerificationRequest(challenge, '012345', {
      lastName: 'a'.repeat(101),
    }),
    { field: 'lastName', ok: false },
  );
});

test('resend replaces the method while preserving the normalized login identity', () => {
  const challenge = {
    delivery: 'email' as const,
    identifierString: 'guest@example.com',
    merchantSlug: 'example-merchant',
    methodId: 'method_example_0001',
  };

  assert.deepEqual(
    replaceCustomerAuthChallenge(challenge, {
      delivery: 'email',
      methodId: 'method_example_0002',
    }),
    {
      ok: true,
      value: {
        ...challenge,
        methodId: 'method_example_0002',
      },
    },
  );
});

test('verification response accepts only one bounded opaque token', () => {
  assert.deepEqual(validateCustomerVerificationResponse({ token: 'opaque.jwt.value' }), {
    ok: true,
    value: { token: 'opaque.jwt.value' },
  });
  assert.deepEqual(validateCustomerVerificationResponse({ token: '' }), {
    field: 'token',
    ok: false,
  });
  assert.deepEqual(validateCustomerVerificationResponse({ jwt: 'wrong-field' }), {
    field: 'token',
    ok: false,
  });
});

test('profile projection allowlists the exact released customer fields', () => {
  assert.deepEqual(
    validateStorefrontCustomer({
      customerEmail: 'guest@example.com',
      customerName: 'Guest',
      id: 'customer_123',
      lastName: 'Customer',
      phoneNumber: null,
      profilePicture: '',
      providerMemberId: 'must-not-leak',
    }),
    {
      ok: true,
      value: {
        customerEmail: 'guest@example.com',
        customerName: 'Guest',
        id: 'customer_123',
        lastName: 'Customer',
        phoneNumber: null,
        profilePicture: '',
      },
    },
  );
  assert.deepEqual(
    validateStorefrontCustomer({
      customerEmail: undefined,
      customerName: 'Guest',
      id: 'customer_123',
      lastName: 'Customer',
      phoneNumber: null,
      profilePicture: '',
    }),
    { field: 'profile', ok: false },
  );
});

test('auth contract helpers have no runtime transport, storage, environment, or logging access', () => {
  const source = readFileSync(
    new URL('./customer-auth-contract.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /\bfetch\b|SecureStore|process\.env|EXPO_PUBLIC_|console\./);
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import type { CustomerAuthState } from '../auth/customer-auth-state.ts';
import * as accountHomeRoute from './account-home-route.ts';
import {
  canLoadAccountSupplement,
  getAccountRouteDestination,
} from './account-home-route.ts';

const profile = {
  customerEmail: null,
  customerName: 'Test',
  id: 'customer_fixture',
  lastName: 'Customer',
  phoneNumber: '+15555550100',
  profilePicture: '',
};

test('account waits for scoped session restore before redirecting signed-out users', () => {
  assert.equal(
    getAccountRouteDestination({ status: 'signed_out' }, false),
    undefined,
  );
  assert.equal(
    getAccountRouteDestination({ status: 'signed_out' }, true),
    '/sign-in',
  );
});

test('account sends an active challenge to OTP and keeps profile recovery local', () => {
  const challengeState = {
    challenge: {
      delivery: 'sms',
      identifierString: '+15555550100',
      merchantSlug: 'fixture-merchant',
      methodId: 'method_fixture',
    },
    status: 'awaiting_verification',
  } as const satisfies CustomerAuthState;

  assert.equal(
    getAccountRouteDestination(challengeState, true),
    '/sign-in/verify',
  );
  assert.equal(
    getAccountRouteDestination(
      {
        failure: { code: 'NETWORK_ERROR', kind: 'unavailable', retryable: true },
        status: 'profile_unavailable',
      },
      true,
    ),
    undefined,
  );
});

test('account supplement loads only after an authenticated profile exists', () => {
  assert.equal(canLoadAccountSupplement({ status: 'signed_out' }), false);
  assert.equal(
    canLoadAccountSupplement({ profile, status: 'authenticated' }),
    true,
  );
});

test('authenticated account content is ready before optional supplements settle', () => {
  const getAccountContentState = (
    accountHomeRoute as Record<string, unknown>
  ).getAccountContentState as
    | ((state: CustomerAuthState) => Readonly<Record<string, unknown>>)
    | undefined;
  const authenticatedState = {
    profile,
    status: 'authenticated',
  } as const satisfies CustomerAuthState;

  assert.equal(typeof getAccountContentState, 'function');
  assert.deepEqual(getAccountContentState?.(authenticatedState), {
    profile,
    status: 'ready',
  });
  assert.deepEqual(getAccountContentState?.({ status: 'signed_out' }), {
    status: 'loading',
  });
  assert.deepEqual(
    getAccountContentState?.({
      failure: { code: 'NETWORK_ERROR', kind: 'unavailable', retryable: true },
      status: 'profile_unavailable',
    }),
    { status: 'error' },
  );
});

test('account refreshes authoritative supplements whenever the mounted route regains focus', () => {
  const source = readFileSync(
    new URL('../../app/(tabs)/(home)/account.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /import \{[^}]*useFocusEffect[^}]*\} from 'expo-router';/s);
  assert.match(source, /useFocusEffect\(\s*useCallback\(\(\) => \{/);
});

test('account route consumes shared services without inventing account fields', () => {
  const routeUrl = new URL(
    '../../app/(tabs)/(home)/account.tsx',
    import.meta.url,
  );
  assert.equal(
    existsSync(routeUrl),
    true,
    'account must live in the Home tab stack so the approved tab shell remains visible',
  );
  assert.equal(
    existsSync(new URL('../../app/account.tsx', import.meta.url)),
    false,
    'obsolete root account route must be removed',
  );
  const source = readFileSync(
    routeUrl,
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /tier|totalOrders|notificationStatus|cardSummary|savedPayment|console\.|\bfetch\s*\(/i,
  );
  assert.match(source, /useMerchantLocationHeader/);
  assert.match(source, /merchantHeaderState={merchantHeader\.state}/);
  assert.match(source, /onOrderHistory=\{\(\) => router\.push\('\/orders'/);
  assert.match(source, /onSavedStores=\{\(\) => router\.push\('\/locations'/);
  assert.match(source, /auth\.logout\(\)/);
  assert.match(source, /auth\.getState\(\)/);
  assert.match(source, /return \(\) => \{\s*active = false;/);
  assert.doesNotMatch(source, /loading=\{supplement\?\.customerId/);
});

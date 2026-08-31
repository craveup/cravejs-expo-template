import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import type { LoyaltyLedger, LoyaltyQuote } from '@craveup/storefront-sdk';

import { loadRewardsAccount } from './rewards-account-loader.ts';
import {
  toRewardsAccountFailureState,
  toRewardsAccountPresentation,
} from './rewards-account-presentation.ts';

const ledger: LoyaltyLedger = {
  balances: [
    {
      asOf: '2026-08-11T00:00:00.000Z',
      available: 340,
      label: 'Points',
      posted: 340,
      reserved: 0,
      unit: 'points',
    },
  ],
  enabled: true,
};

const quote: LoyaltyQuote = {
  appliedRewardId: 'reward_applied',
  available: true,
  enabled: true,
  rewards: [
    {
      id: 'reward_available',
      name: 'Server-authored reward',
      pointsCost: 100,
      redeemable: true,
      status: 'available',
    },
    {
      id: 'reward_applied',
      name: 'Applied reward',
      pointsCost: 250,
      redeemable: false,
      status: 'applied',
    },
  ],
};

test('1H maps only real points and server-supported rewards without tier inference', () => {
  assert.deepEqual(
    toRewardsAccountPresentation(
      ledger,
      { kind: 'ready', quote },
      'en',
    ),
    {
      balanceLabel: '340',
      rewards: [
        {
          applied: false,
          id: 'reward_available',
          name: 'Server-authored reward',
          pointsLabel: '100 pts',
          redeemable: true,
        },
        {
          applied: true,
          id: 'reward_applied',
          name: 'Applied reward',
          pointsLabel: '250 pts',
          redeemable: false,
        },
      ],
      rewardsStatus: 'ready',
      status: 'ready',
    },
  );
  assert.deepEqual(
    toRewardsAccountPresentation(ledger, { kind: 'not_started' }),
    {
      balanceLabel: '340',
      rewards: [],
      rewardsStatus: 'requires_order',
      status: 'ready',
    },
  );
  assert.deepEqual(
    toRewardsAccountPresentation({ enabled: false }, { kind: 'not_started' }),
    { status: 'unavailable' },
  );
});

test('1H keeps authentication and retryable failures controlled', () => {
  assert.deepEqual(
    toRewardsAccountFailureState({
      code: 'CUSTOMER_AUTH_REQUIRED',
      kind: 'authentication_required',
      retryable: false,
    }),
    { status: 'signed_out' },
  );
  assert.deepEqual(
    toRewardsAccountFailureState({
      kind: 'unavailable',
      retryable: true,
    }),
    { status: 'error' },
  );
  assert.deepEqual(
    toRewardsAccountFailureState({ kind: 'forbidden', retryable: false }),
    { status: 'unavailable' },
  );
});

test('1H reads a quote only for an existing scoped cart', async () => {
  let quoteCalls = 0;
  const withoutCart = await loadRewardsAccount({
    cartSessions: { async get() { return null; } },
    locationId: 'location_fixture',
    loyalty: {
      async getLedger() { return { data: ledger, kind: 'ready' }; },
      async getQuote() {
        quoteCalls += 1;
        return { data: quote, kind: 'ready' };
      },
    },
  });

  assert.equal(withoutCart.status, 'ready');
  assert.equal(
    withoutCart.status === 'ready' ? withoutCart.rewardsStatus : undefined,
    'requires_order',
  );
  assert.equal(quoteCalls, 0);

  const withCart = await loadRewardsAccount({
    cartSessions: {
      async get() {
        return {
          cartId: 'cart_fixture',
          locationId: 'location_fixture',
          revision: 1,
        };
      },
    },
    locationId: 'location_fixture',
    loyalty: {
      async getLedger() { return { data: ledger, kind: 'ready' }; },
      async getQuote(cartId) {
        quoteCalls += 1;
        assert.equal(cartId, 'cart_fixture');
        return { data: quote, kind: 'ready' };
      },
    },
  });

  assert.equal(withCart.status, 'ready');
  assert.equal(
    withCart.status === 'ready' ? withCart.rewards.length : undefined,
    2,
  );
  assert.equal(quoteCalls, 1);
});

test('1H fails safely when scoped cart storage or quote access is unavailable', async () => {
  const storageFailure = await loadRewardsAccount({
    cartSessions: { async get() { throw new Error('storage'); } },
    locationId: 'location_fixture',
    loyalty: {
      async getLedger() { return { data: ledger, kind: 'ready' }; },
      async getQuote() { return { data: quote, kind: 'ready' }; },
    },
  });
  assert.deepEqual(storageFailure, { status: 'error' });

  const quoteFailure = await loadRewardsAccount({
    cartSessions: {
      async get() {
        return {
          cartId: 'cart_fixture',
          locationId: 'location_fixture',
          revision: 1,
        };
      },
    },
    locationId: 'location_fixture',
    loyalty: {
      async getLedger() { return { data: ledger, kind: 'ready' }; },
      async getQuote() {
        return {
          failure: { kind: 'unavailable', retryable: true },
          kind: 'failed',
        };
      },
    },
  });
  assert.equal(quoteFailure.status, 'ready');
  assert.equal(
    quoteFailure.status === 'ready'
      ? quoteFailure.rewardsStatus
      : undefined,
    'unavailable',
  );
});

test('1H presentation stays responsive, localized, route-free, and action-gated', () => {
  const presentation = readFileSync(
    new URL('./RewardsAccountPresentation.tsx', import.meta.url),
    'utf8',
  );
  const tabRouteUrl = new URL('../../app/(tabs)/(rewards)/rewards.tsx', import.meta.url);
  const rootRouteUrl = new URL('../../app/rewards.tsx', import.meta.url);

  assert.equal(existsSync(tabRouteUrl), true);
  assert.equal(existsSync(rootRouteUrl), false);

  const route = readFileSync(tabRouteUrl, 'utf8');
  const tabsLayout = readFileSync(
    new URL('../../app/(tabs)/_layout.tsx', import.meta.url),
    'utf8',
  );

  assert.match(presentation, /getResponsiveLayout\(width, fontScale\)/);
  assert.match(presentation, /colors\.ink/);
  assert.match(presentation, /onHistory \?/);
  assert.match(presentation, /onRedeem \?/);
  assert.match(presentation, /name="star"/);
  assert.match(presentation, /styles\.heroActions/);
  assert.match(presentation, /alignSelf: 'flex-start'/);
  assert.match(presentation, /accessibilityRole="list"/);
  assert.match(route, /runtimeBrand\.capabilities\.loyalty !== 'enabled'/);
  assert.match(route, /runtime\.services\.loyalty/);
  assert.match(route, /runtime\.cartSessions/);
  assert.match(route, /auth\.restore\(\)/);
  assert.match(tabsLayout, /name="\(rewards\)"/);
  assert.doesNotMatch(tabsLayout, /tabBarButton:[\s\S]*\(\) => null/);
  assert.doesNotMatch(tabsLayout, /display: 'none'/);
  assert.doesNotMatch(
    `${presentation}\n${route}`,
    /FLAVOURSMITH|Scan in store|SCAN|paper receipt|next free|points to go|memberId|programId|expo-notifications|requestPermissions|\bfetch\s*\(|SecureStore|#[0-9A-Fa-f]{3,8}/i,
  );
  assert.doesNotMatch(route, /rewards\/claim/);
});

test('1H gated route does not construct the Storefront runtime', () => {
  const routeUrl = new URL('../../app/(tabs)/(rewards)/rewards.tsx', import.meta.url);

  assert.equal(existsSync(routeUrl), true);

  const route = readFileSync(routeUrl, 'utf8');
  const capabilityGuard = route.indexOf(
    "runtimeBrand.capabilities.loyalty !== 'enabled'",
  );
  const enabledRoute = route.indexOf('function EnabledRewardsRoute');
  const runtimeRead = route.indexOf('getStorefrontRuntime()');

  assert.ok(capabilityGuard >= 0);
  assert.ok(enabledRoute > capabilityGuard);
  assert.ok(runtimeRead > enabledRoute);
});

test('1H exposes points history only after the rewards account is ready', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(rewards)/rewards.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    route,
    /onHistory=\{\s*presentation\.status === 'ready'[\s\S]*router\.push\('\/rewards\/history'/,
  );
});

test('1H never reuses a completed load across authentication sessions', () => {
  const routeUrl = new URL('../../app/(tabs)/(rewards)/rewards.tsx', import.meta.url);

  assert.equal(existsSync(routeUrl), true);

  const route = readFileSync(routeUrl, 'utf8');
  assert.match(route, /session: CustomerAuthenticatedState/);
  assert.match(route, /session: authenticatedState/);
  assert.match(route, /load\.session === authState/);
});

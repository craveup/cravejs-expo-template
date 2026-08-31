import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LoyaltyQuote } from '@craveup/storefront-sdk';

import { createStorefrontCartFixture } from '../../fixtures/storefront-cart-fixture.ts';
import type { StorefrontCartSession } from '../../lib/cart-session.ts';
import type { LoyaltyMutationResult } from './loyalty-service.ts';
import {
  createRewardSubmissionGuard,
  createRewardMutationKey,
  loadRewardRedemption,
  submitRewardRedemption,
  toRewardRedemptionPresentation,
  type RewardRedemptionDependencies,
  type RewardRedemptionSnapshot,
} from './reward-redemption.ts';

const locationId = '0123456789abcdef01234567';
const cart: StorefrontCartSession = {
  cartId: 'cart_fixture',
  locationId,
  revision: 2,
};
const quote: LoyaltyQuote = {
  available: true,
  balance: { available: 340, posted: 340, reserved: 0 },
  enabled: true,
  rewards: [
    {
      id: 'reward_fixture',
      name: 'Free Silk Boba topper',
      pointsCost: 100,
      redeemable: true,
      status: 'available',
    },
  ],
};

type Overrides = Partial<{
  cancel: RewardRedemptionDependencies['loyalty']['cancel'];
  getCart: RewardRedemptionDependencies['cartSessions']['get'];
  getQuote: RewardRedemptionDependencies['loyalty']['getQuote'];
  redeem: RewardRedemptionDependencies['loyalty']['redeem'];
}>;

function updated(): LoyaltyMutationResult {
  return {
    cart: createStorefrontCartFixture({ revision: 3 }),
    kind: 'updated',
  };
}

function dependencies(overrides: Overrides = {}): RewardRedemptionDependencies {
  return {
    cartSessions: {
      get: overrides.getCart ?? (async () => cart),
    },
    locationId,
    loyalty: {
      cancel: overrides.cancel ?? (async () => updated()),
      getQuote:
        overrides.getQuote ??
        (async () => ({ data: quote, kind: 'ready' })),
      redeem: overrides.redeem ?? (async () => updated()),
    },
  };
}

async function readySnapshot(
  configured: RewardRedemptionDependencies = dependencies(),
): Promise<RewardRedemptionSnapshot> {
  const result = await loadRewardRedemption(configured, 'reward_fixture');
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') throw new Error('Expected ready reward fixture.');
  return result.snapshot;
}

test('3B loads only the selected server quote and omits a projected balance', async () => {
  const snapshot = await readySnapshot();
  assert.deepEqual(snapshot, {
    balanceAvailable: 340,
    cartId: 'cart_fixture',
    mode: 'redeem',
    revision: 2,
    rewardId: 'reward_fixture',
    rewardName: 'Free Silk Boba topper',
    rewardPointsCost: 100,
  });

  assert.deepEqual(toRewardRedemptionPresentation(snapshot), {
    actionStatus: 'idle',
    balanceLabel: '340 pts',
    mode: 'redeem',
    primaryLabel: 'Redeem it',
    rewardCostLabel: '−100 pts',
    rewardName: 'Free Silk Boba topper',
    secondaryLabel: 'Not yet',
    status: 'ready',
    title: 'Redeem for 100 pts?',
  });
  assert.equal(
    Object.hasOwn(toRewardRedemptionPresentation(snapshot), 'balanceAfter'),
    false,
  );
});

test('3B rejects invalid rewards and never creates a cart for display', async () => {
  let quoteCalls = 0;
  const invalid = await loadRewardRedemption(
    dependencies({
      async getQuote() {
        quoteCalls += 1;
        return { data: quote, kind: 'ready' };
      },
    }),
    'not safe',
  );
  assert.deepEqual(invalid, { kind: 'failed', state: { status: 'not_found' } });
  assert.equal(quoteCalls, 0);

  const withoutCart = await loadRewardRedemption(
    dependencies({ getCart: async () => null }),
    'reward_fixture',
  );
  assert.deepEqual(withoutCart, {
    kind: 'failed',
    state: { status: 'requires_order' },
  });
});

test('3B treats an expired cart quote as a new-order requirement', async () => {
  const result = await loadRewardRedemption(
    dependencies({
      async getQuote() {
        return {
          failure: { kind: 'not_found', retryable: false },
          kind: 'failed',
        };
      },
    }),
    'reward_fixture',
  );

  assert.deepEqual(result, {
    kind: 'failed',
    state: { status: 'requires_order' },
  });
});

test('3B re-quotes then redeems with the exact cart revision and stable intent key', async () => {
  const intents: unknown[] = [];
  let applied = false;
  const configured = dependencies({
    async getQuote() {
      return {
        data: applied ? { ...quote, appliedRewardId: 'reward_fixture' } : quote,
        kind: 'ready',
      };
    },
    async redeem(intent) {
      intents.push(intent);
      applied = true;
      return updated();
    },
  });
  const snapshot = await readySnapshot(configured);
  const key = createRewardMutationKey(1_786_400_000_000, 1);

  assert.deepEqual(await submitRewardRedemption(configured, snapshot, key), {
    kind: 'completed',
  });
  assert.deepEqual(intents, [
    {
      cartId: 'cart_fixture',
      idempotencyKey: key,
      revision: 2,
      rewardId: 'reward_fixture',
    },
  ]);
});

test('3B verifies the post-mutation quote before reporting completion', async () => {
  let quoteCalls = 0;
  const configured = dependencies({
    async getQuote() {
      quoteCalls += 1;
      return { data: quote, kind: 'ready' };
    },
  });
  const snapshot = await readySnapshot(configured);

  assert.deepEqual(
    await submitRewardRedemption(
      configured,
      snapshot,
      createRewardMutationKey(1_786_400_000_000, 7),
    ),
    { kind: 'refresh_required' },
  );
  assert.equal(quoteCalls, 3);
});

test('3B lost-response retry reuses the identical mutation body', async () => {
  const intents: unknown[] = [];
  let applied = false;
  const configured = dependencies({
    async getQuote() {
      return {
        data: applied ? { ...quote, appliedRewardId: 'reward_fixture' } : quote,
        kind: 'ready',
      };
    },
    async redeem(intent) {
      intents.push(intent);
      if (intents.length === 1) {
        return {
          failure: { kind: 'timeout', retryable: true },
          kind: 'failed',
        };
      }
      applied = true;
      return updated();
    },
  });
  const snapshot = await readySnapshot(configured);
  const key = createRewardMutationKey(1_786_400_000_000, 2);

  assert.deepEqual(await submitRewardRedemption(configured, snapshot, key), {
    kind: 'retryable_error',
  });
  assert.deepEqual(await submitRewardRedemption(configured, snapshot, key), {
    kind: 'completed',
  });
  assert.deepEqual(intents, [intents[0], intents[0]]);
});

test('3B conflict requires a fresh confirmation and never replays redemption', async () => {
  let redeemCalls = 0;
  const configured = dependencies({
    async redeem() {
      redeemCalls += 1;
      return {
        cart: createStorefrontCartFixture({ revision: 5 }),
        failure: { kind: 'conflict', retryable: false },
        kind: 'reconciliation_required',
      };
    },
  });
  const snapshot = await readySnapshot(configured);

  assert.deepEqual(
    await submitRewardRedemption(
      configured,
      snapshot,
      createRewardMutationKey(1_786_400_000_000, 3),
    ),
    { kind: 'refresh_required' },
  );
  assert.equal(redeemCalls, 1);
});

test('3B refreshes instead of terminally failing when the cart or reward disappears', async () => {
  let quoteCalls = 0;
  let redeemCalls = 0;
  const quoteExpired = dependencies({
    async getQuote() {
      quoteCalls += 1;
      return quoteCalls === 1
        ? { data: quote, kind: 'ready' }
        : {
            failure: { kind: 'not_found', retryable: false },
            kind: 'failed',
          };
    },
    async redeem() {
      redeemCalls += 1;
      return updated();
    },
  });
  const expiredSnapshot = await readySnapshot(quoteExpired);

  assert.deepEqual(
    await submitRewardRedemption(
      quoteExpired,
      expiredSnapshot,
      createRewardMutationKey(1_786_400_000_000, 5),
    ),
    { kind: 'refresh_required' },
  );
  assert.equal(redeemCalls, 0);

  const rewardRemoved = dependencies({
    async redeem() {
      return {
        failure: { kind: 'not_found', retryable: false },
        kind: 'failed',
      };
    },
  });
  const removedSnapshot = await readySnapshot(rewardRemoved);

  assert.deepEqual(
    await submitRewardRedemption(
      rewardRemoved,
      removedSnapshot,
      createRewardMutationKey(1_786_400_000_000, 6),
    ),
    { kind: 'refresh_required' },
  );
});

test('3B applied reward uses the matching server cancel operation', async () => {
  const cancelIntents: unknown[] = [];
  const appliedQuote = { ...quote, appliedRewardId: 'reward_fixture' };
  let applied = true;
  const configured = dependencies({
    async cancel(intent) {
      cancelIntents.push(intent);
      applied = false;
      return updated();
    },
    async getQuote() {
      return { data: applied ? appliedQuote : quote, kind: 'ready' };
    },
  });
  const snapshot = await readySnapshot(configured);
  const idempotencyKey = createRewardMutationKey(1_786_400_000_000, 4);
  assert.equal(snapshot.mode, 'cancel');

  await submitRewardRedemption(
    configured,
    snapshot,
    idempotencyKey,
  );
  assert.deepEqual(cancelIntents, [
    {
      cartId: 'cart_fixture',
      idempotencyKey,
      revision: 2,
    },
  ]);
});

test('3B submission guard invalidates stale completions and permits one active intent', () => {
  const guard = createRewardSubmissionGuard();
  const first = guard.begin();

  assert.equal(typeof first, 'number');
  assert.equal(guard.begin(), undefined);

  guard.invalidate();
  assert.equal(guard.complete(first!), false);

  const second = guard.begin();
  assert.equal(typeof second, 'number');
  assert.notEqual(second, first);
  assert.equal(guard.complete(second!), true);
  assert.equal(typeof guard.begin(), 'number');
});

test('3B route and presentation stay gated, responsive, and free of invented truth', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(rewards)/rewards/redeem/[rewardId].tsx', import.meta.url),
    'utf8',
  );
  const presentation = readFileSync(
    new URL('./RewardRedemptionPresentation.tsx', import.meta.url),
    'utf8',
  );
  const accountRoute = readFileSync(
    new URL('../../app/(tabs)/(rewards)/rewards.tsx', import.meta.url),
    'utf8',
  );
  const accountPresentation = readFileSync(
    new URL('./RewardsAccountPresentation.tsx', import.meta.url),
    'utf8',
  );
  const presentationIcon = readFileSync(
    new URL('../_shared/PresentationIcon.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /useLocalSearchParams/);
  assert.match(route, /runtimeBrand\.capabilities\.loyalty !== 'enabled'/);
  assert.match(route, /createRewardMutationKey/);
  assert.match(route, /createRewardSubmissionGuard/);
  assert.match(route, /load\.rewardId === rewardId/);
  assert.match(route, /key=\{rewardId\}/);
  assert.match(route, /useLayoutEffect/);
  assert.match(route, /result\.kind === 'refresh_required'/);
  assert.match(presentation, /getResponsiveLayout\(width, fontScale\)/);
  assert.match(presentation, /PresentationIcon[\s\S]*name="starFilled"/);
  assert.doesNotMatch(presentation, />\s*★\s*</);
  assert.match(
    presentationIcon,
    /starFilled:[\s\S]*android: 'star_rate',[\s\S]*web: 'star_rate'/,
  );
  assert.match(accountRoute, /useFocusEffect/);
  assert.match(
    accountRoute,
    /`\/rewards\/redeem\/\$\{encodeURIComponent\(rewardId\)\}`/,
  );
  assert.match(
    accountPresentation,
    /reward\.applied && onRedeem[\s\S]*rewards\.redemption\.action\.cancel[\s\S]*onRedeem\(reward\.id\)/,
  );
  assert.doesNotMatch(
    `${route}\n${presentation}`,
    /Balance after|240 pts|pointsToGo|memberId|programId|\bfetch\s*\(|SecureStore|#[0-9A-Fa-f]{3,8}/i,
  );
});

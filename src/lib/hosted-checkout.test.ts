import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { StorefrontCart } from '@craveup/storefront-sdk';

import { createStorefrontCartFixture } from '../fixtures/storefront-cart-fixture.ts';
import {
  createCheckoutHandoffRecoveryStore,
  type CheckoutHandoffRecoveryStore,
} from './checkout-handoff-recovery-store.ts';
import {
  createHostedCheckoutService,
  mapHostedBrowserResult,
} from './hosted-checkout.ts';
import { createInMemoryLocalStateStore } from './local-state-store.ts';
import { createStorefrontSessionScope } from './storefront-session-scope.ts';

const locationId = '0123456789abcdef01234567';
const checkoutOrigin = 'https://checkout.example.test';
const checkoutUrl = `${checkoutOrigin}/handoff?opaque=secret#fragment`;
const attemptId = 'checkout_attempt_1';

function cart(overrides: Partial<StorefrontCart> = {}): StorefrontCart {
  return createStorefrontCartFixture({
    items: [
      {
        categoryId: null,
        description: 'Oat milk',
        discount: '0.00',
        discountFormatted: '$0.00',
        id: 'item_1',
        imageUrl: '',
        itemUnavailableAction: 'remove_item',
        name: 'Matcha',
        price: '6.75',
        priceFormatted: '$6.75',
        productId: 'product_1',
        quantity: 1,
        selections: [],
        specialInstructions: '',
        total: '6.75',
        totalFormatted: '$6.75',
      },
    ],
    orderTotal: '6.75',
    orderTotalFormatted: '$6.75',
    orderTotalWithServiceFee: '6.75',
    orderTotalWithServiceFeeAmount: 6.75,
    orderTotalWithServiceFeeFormatted: '$6.75',
    subTotal: '6.75',
    subTotalFormatted: '$6.75',
    totalQuantity: 1,
    ...overrides,
  });
}

function configured(
  overrides: Readonly<{
    isOnline?: () => Promise<boolean>;
    open?: (url: string) => Promise<'closed' | 'opened' | 'unknown'>;
    prepare?: (
      location: string,
      cartId: string,
      config?: Readonly<{ idempotencyKey?: string }>,
    ) => Promise<unknown>;
    recovery?: CheckoutHandoffRecoveryStore;
  }> = {},
) {
  const prepareCalls: unknown[][] = [];
  const openedUrls: string[] = [];
  const recovery =
    overrides.recovery ??
    createCheckoutHandoffRecoveryStore(
      createStorefrontSessionScope({
        environmentNamespace: 'env-0123456789abcdef',
        locationId,
        merchantSlug: 'example-merchant',
      }),
      createInMemoryLocalStateStore(),
    );
  const service = createHostedCheckoutService({
    browser: {
      async open(url) {
        openedUrls.push(url);
        return overrides.open?.(url) ?? 'opened';
      },
    },
    checkout: {
      async prepare(location, cartId, config) {
        prepareCalls.push([location, cartId, config]);
        return (
          (await overrides.prepare?.(location, cartId, config)) ?? {
            checkoutUrl,
            expiresAt: '2099-01-01T00:00:00.000Z',
          }
        );
      },
    },
    checkoutOrigin,
    isOnline: overrides.isOnline ?? (async () => true),
    locationId,
    now: () => Date.parse('2026-08-13T00:00:00.000Z'),
    recovery,
  });
  return { openedUrls, prepareCalls, recovery, service };
}

test('prepares once with the exact SDK arguments and opens the untouched opaque URL', async () => {
  const { openedUrls, prepareCalls, recovery, service } = configured();
  const result = await service.start(cart(), attemptId);

  assert.equal(result.kind, 'handed_off');
  assert.deepEqual(prepareCalls, [
    [locationId, 'cart_fixture', { idempotencyKey: attemptId }],
  ]);
  assert.deepEqual(openedUrls, [checkoutUrl]);
  assert.equal(service.getState().status, 'handed_off');
  assert.equal(JSON.stringify(result).includes(checkoutUrl), false);
  assert.equal(JSON.stringify(service.getState()).includes('opaque'), false);
  assert.equal((await recovery.get()).status, 'handed_off');
});

test('rejects unsafe carts, offline starts, malformed responses, and expired handoffs before open', async () => {
  for (const invalidCart of [
    cart({ locationId: 'fedcba9876543210fedcba98' }),
    cart({ status: 'LOCKED' }),
    cart({ items: [], totalQuantity: 0 }),
    cart({ fulfilmentMethod: 'delivery' }),
    cart({ orderDate: '', orderTime: '', pickupType: 'LATER' }),
  ]) {
    const current = configured();
    assert.equal((await current.service.start(invalidCart, attemptId)).kind, 'failed');
    assert.equal(current.prepareCalls.length, 0);
    assert.equal(current.openedUrls.length, 0);
    assert.equal((await current.recovery.get()).status, 'unlocked');
  }

  const offline = configured({ isOnline: async () => false });
  assert.equal((await offline.service.start(cart(), attemptId)).kind, 'failed');
  assert.equal(offline.prepareCalls.length, 0);

  for (const response of [
    { checkoutUrl: 'http://checkout.example.test/handoff', expiresAt: '2099-01-01T00:00:00.000Z' },
    { checkoutUrl: 'https://user:pass@checkout.example.test/handoff', expiresAt: '2099-01-01T00:00:00.000Z' },
    { checkoutUrl: 'https://evil.example.test/handoff', expiresAt: '2099-01-01T00:00:00.000Z' },
    { checkoutUrl, expiresAt: 'not-a-date' },
    { checkoutUrl, expiresAt: '2026-08-12T00:00:00.000Z' },
  ]) {
    const current = configured({ prepare: async () => response });
    const result = await current.service.start(cart(), attemptId);
    assert.equal(
      result.kind,
      response.expiresAt === '2026-08-12T00:00:00.000Z' ? 'expired' : 'failed',
    );
    assert.equal(current.openedUrls.length, 0);
    assert.equal(JSON.stringify(result).includes(String(response.checkoutUrl)), false);
    assert.equal((await current.recovery.get()).status, 'unlocked');
  }

  const primitive = configured({ prepare: async () => 'not-an-object' });
  assert.equal((await primitive.service.start(cart(), attemptId)).kind, 'failed');
  assert.equal(primitive.openedUrls.length, 0);
});

test('a lost prepare response retries only the identical command and blocks double taps', async () => {
  let calls = 0;
  let releaseFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let allowFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => {
    allowFirst = resolve;
  });
  const current = configured({
    async prepare() {
      calls += 1;
      if (calls === 1) {
        releaseFirst();
        await firstBlocked;
        throw { code: 'TIMEOUT', name: 'StorefrontTimeoutError' };
      }
      return { checkoutUrl, expiresAt: '2099-01-01T00:00:00.000Z' };
    },
  });

  const first = current.service.start(cart(), attemptId);
  await firstStarted;
  assert.equal(
    (await current.service.start(cart(), 'checkout_attempt_2')).kind,
    'transition_rejected',
  );
  allowFirst();
  const lost = await first;
  assert.equal(lost.kind, 'retryable');
  assert.equal(lost.kind === 'retryable' ? lost.retry : undefined, 'same_intent');
  assert.equal(current.service.getState().status, 'preparing_handoff');
  assert.equal((await current.recovery.get()).status, 'preparing_handoff');

  const completed = await current.service.retry();
  assert.equal(completed.kind, 'handed_off');
  assert.deepEqual(
    current.prepareCalls.map((entry) => entry[2]),
    [
      { idempotencyKey: attemptId },
      { idempotencyKey: attemptId },
    ],
  );
  assert.equal((await current.recovery.get()).status, 'handed_off');
});

test('restart recovery resumes an uncertain prepare with the persisted cart revision and key', async () => {
  const recovery = createCheckoutHandoffRecoveryStore(
    createStorefrontSessionScope({
      environmentNamespace: 'env-0123456789abcdef',
      locationId,
      merchantSlug: 'example-merchant',
    }),
    createInMemoryLocalStateStore(),
  );
  const first = configured({
    recovery,
    async prepare() {
      throw { code: 'TIMEOUT', name: 'StorefrontTimeoutError' };
    },
  });
  assert.equal((await first.service.start(cart(), attemptId)).kind, 'retryable');

  const restarted = configured({ recovery });
  const result = await restarted.service.resume(cart());
  assert.equal(result.kind, 'handed_off');
  assert.deepEqual(restarted.prepareCalls, [
    [locationId, 'cart_fixture', { idempotencyKey: attemptId }],
  ]);
  assert.equal((await recovery.get()).status, 'handed_off');
});

test('browser close, dismiss, lock, and open failures never become safe cancellation or success', async () => {
  assert.equal(mapHostedBrowserResult('opened'), 'opened');
  assert.equal(mapHostedBrowserResult('cancel'), 'closed');
  assert.equal(mapHostedBrowserResult('dismiss'), 'closed');
  assert.equal(mapHostedBrowserResult('locked'), 'unknown');

  for (const open of [
    async () => 'closed' as const,
    async () => 'unknown' as const,
    async () => {
      throw new Error('browser unavailable');
    },
  ]) {
    const current = configured({ open });
    const result = await current.service.start(cart(), attemptId);
    assert.equal(result.kind, 'outcome_unknown');
    assert.equal(current.service.getState().status, 'outcome_unknown');
    assert.equal((await current.recovery.get()).status, 'outcome_unknown');
    assert.equal((await current.service.retry()).kind, 'transition_rejected');
  }
});

test('hosted handoff source cannot collect payment, exchange tokens, persist URLs, or log secrets', () => {
  const source = readFileSync(new URL('./hosted-checkout.ts', import.meta.url), 'utf8');
  const browser = readFileSync(
    new URL('./hosted-checkout-browser.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /createPaymentIntent|\.exchange\s*\(|clientSecret|SecureStore|AsyncStorage|console\./);
  assert.doesNotMatch(browser, /createPaymentIntent|checkout\.prepare|SecureStore|AsyncStorage|console\./);
  assert.match(browser, /Platform\.OS === 'web'/);
  assert.match(browser, /Linking\.openURL/);
  assert.match(browser, /WebBrowser\.openBrowserAsync/);
});

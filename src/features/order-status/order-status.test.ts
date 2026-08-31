import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { createStorefrontOrderFixture } from '../../fixtures/storefront-order-fixture.ts';
import { createTranslator } from '../../i18n/localization.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import {
  isOrderStatusOffline,
  loadActiveOrderStatus,
  type ActiveOrderStatusService,
  type OrderStatusLifecycle,
} from './order-status-loader.ts';
import {
  getOrderStatusPollDelay,
  ORDER_STATUS_POLL_INTERVAL_MS,
  toOrderStatusPresentationState,
} from './order-status-presentation.ts';

test('2B restores the scoped cart before requesting its authoritative order result', async () => {
  const calls: string[] = [];
  const lifecycle: OrderStatusLifecycle = {
    async restore() {
      return { cart: { id: 'cart_fixture' } };
    },
  };
  const orders: ActiveOrderStatusService = {
    async getActiveResult(cartId) {
      calls.push(cartId);
      return { data: { state: 'order_pending' }, kind: 'ready' };
    },
  };

  const result = await loadActiveOrderStatus(lifecycle, orders);

  assert.deepEqual(calls, ['cart_fixture']);
  assert.deepEqual(result, {
    data: { state: 'order_pending' },
    kind: 'ready',
  });
});

test('2B does not request an order result without a recoverable cart', async () => {
  let calls = 0;
  const orders: ActiveOrderStatusService = {
    async getActiveResult() {
      calls += 1;
      return { data: { state: 'payment_pending' }, kind: 'ready' };
    },
  };

  assert.deepEqual(
    await loadActiveOrderStatus({ restore: async () => ({}) }, orders),
    { kind: 'no_active_order' },
  );

  const failure: StorefrontFailure = {
    kind: 'unavailable',
    retryable: true,
  };
  assert.deepEqual(
    await loadActiveOrderStatus(
      { restore: async () => ({ cartFailure: failure }) },
      orders,
    ),
    { failure, kind: 'failed' },
  );
  assert.equal(calls, 0);
});

test('2B maps every published active-result state without inferring a prep timeline', () => {
  const paymentPending = toOrderStatusPresentationState({
    data: { state: 'payment_pending' },
    kind: 'ready',
  });
  const orderPending = toOrderStatusPresentationState({
    data: { state: 'order_pending' },
    kind: 'ready',
  });
  const orderFailed = toOrderStatusPresentationState({
    data: { code: 'PAYMENT_FAILED', state: 'failed' },
    kind: 'ready',
  });

  assert.deepEqual(paymentPending, { status: 'payment_pending' });
  assert.deepEqual(orderPending, { status: 'order_pending' });
  assert.deepEqual(orderFailed, { status: 'order_failed' });
  assert.equal(
    getOrderStatusPollDelay(paymentPending),
    ORDER_STATUS_POLL_INTERVAL_MS,
  );
  assert.equal(
    getOrderStatusPollDelay(orderPending),
    ORDER_STATUS_POLL_INTERVAL_MS,
  );
  assert.equal(getOrderStatusPollDelay(orderFailed), undefined);
  assert.doesNotMatch(JSON.stringify(orderFailed), /PAYMENT_FAILED/);
});

test('2B completed state presents only authoritative public order fields', () => {
  const order = createStorefrontOrderFixture({
    currency: 'usd',
    fulfillmentMethod: 'takeout',
    orderTime: '10:30 AM - 10:45 AM',
    orderTotal: '30.54',
    restaurantDisplayName: 'Fixture Merchant',
    shortId: 'OOO-42',
    totalQuantity: 3,
  });
  const state = toOrderStatusPresentationState({
    data: { order, state: 'completed' },
    kind: 'ready',
  });

  assert.deepEqual(state, {
    order: {
      detailLabel: 'Pickup \u00b7 10:30 AM - 10:45 AM',
      fulfillmentLabel: 'Pickup',
      itemCountLabel: '3 items',
      merchantLabel: 'Fixture Merchant',
      orderLabel: 'Order OOO-42',
      tracking: {
        createdAt: '2099-01-01T10:00:00.000Z',
        fulfillmentMethod: 'takeout',
        status: 'COMPLETED',
        updatedAt: '2099-01-01T10:15:00.000Z',
      },
      totalLabel: '$30.54',
    },
    status: 'completed',
  });
  assert.equal(getOrderStatusPollDelay(state), undefined);
});

test('2B describes a completed placement result as confirmed, not fulfilled', () => {
  const t = createTranslator('en');

  assert.equal(t('orders.status.completed.title'), 'Order confirmed');
  assert.doesNotMatch(t('orders.status.completed.title'), /complete/i);
});

test('2B keeps connectivity and service failures controlled', () => {
  assert.equal(isOrderStatusOffline({ isConnected: false }), true);
  assert.equal(isOrderStatusOffline({ isInternetReachable: false }), true);
  assert.equal(isOrderStatusOffline({}), false);

  const expired = toOrderStatusPresentationState({
    failure: {
      code: 'CART_CAPABILITY_REQUIRED',
      kind: 'forbidden',
      retryable: false,
    },
    kind: 'failed',
  });
  const retryable = toOrderStatusPresentationState({
    failure: {
      code: 'PRIVATE_PROVIDER_CODE',
      kind: 'timeout',
      retryable: true,
    },
    kind: 'failed',
  });

  assert.deepEqual(expired, { status: 'session_expired' });
  assert.deepEqual(retryable, { status: 'error' });
  assert.doesNotMatch(JSON.stringify(retryable), /PRIVATE_PROVIDER_CODE/);
});

test('active order status polling has one shared focus and lifecycle owner', () => {
  const hookUrl = new URL('./use-active-order-status.ts', import.meta.url);
  assert.equal(
    existsSync(hookUrl),
    true,
    'the shared active-order status hook must exist',
  );

  const hook = readFileSync(hookUrl, 'utf8');
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/order/status.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /useActiveOrderStatus\(\{ lifecycle, orders \}\)/);
  assert.doesNotMatch(route, /loadActiveOrderStatus|setTimeout|AppState/);
  assert.match(hook, /useNetworkState/);
  assert.match(hook, /useFocusEffect/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /setTimeout/);
  assert.match(hook, /clearTimeout/);
  assert.match(hook, /focusGeneration\.current !== generation/);
  assert.match(hook, /previousState !== 'active'/);
});

test('2B route polls pending results, refreshes on foreground, and keeps secrets headless', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/order/status.tsx', import.meta.url),
    'utf8',
  );
  const hook = readFileSync(
    new URL('./use-active-order-status.ts', import.meta.url),
    'utf8',
  );
  const loader = readFileSync(
    new URL('./order-status-loader.ts', import.meta.url),
    'utf8',
  );
  const presentation = readFileSync(
    new URL('./OrderStatusPresentation.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /runtime\.services\.lifecycle/);
  assert.match(route, /runtime\.services\.orders/);
  assert.match(hook, /useFocusEffect/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /previousState !== 'active'/);
  assert.match(hook, /delay !== undefined && appState\.current === 'active'/);
  assert.match(hook, /setTimeout/);
  assert.match(hook, /clearTimeout/);
  assert.match(hook, /focusGeneration\.current !== generation/);
  assert.match(loader, /orders\.getActiveResult\(snapshot\.cart\.id\)/);
  assert.match(presentation, /getResponsiveLayout/);
  assert.match(presentation, /accessibilityLiveRegion="polite"/);

  for (const source of [route, hook, loader, presentation]) {
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|SecureStore|process\.env|console\.|estimatedReadyTime|Date\.now|We'll ping|bring it out|Apple Pay|SCAN|#[0-9A-Fa-f]{3,8}/,
    );
  }
  assert.doesNotMatch(route, /cartId|receiptToken/);
  assert.match(route, /router\.push\('\/account' as Href\)/);
});

test('2B invalidates an in-flight result when the app backgrounds', () => {
  const hook = readFileSync(
    new URL('./use-active-order-status.ts', import.meta.url),
    'utf8',
  );

  assert.match(hook, /requestInFlight\.current = true/);
  assert.match(
    hook,
    /if \(appState\.current !== 'active'\) \{\s*refreshOnForeground\.current = true;\s*\} else if \(offline\)/,
  );
  assert.match(
    hook,
    /nextState !== 'active'[\s\S]{0,300}requestInFlight\.current/,
  );
  assert.match(hook, /refreshOnForeground\.current = true/);
});

test('2B discards completed order details while the route is blurred', () => {
  const hook = readFileSync(
    new URL('./use-active-order-status.ts', import.meta.url),
    'utf8',
  );

  assert.match(hook, /useNavigation/);
  assert.match(
    hook,
    /addListener\('blur', \(\) => setState\(\{ status: 'loading' \}\)\)/,
  );
});

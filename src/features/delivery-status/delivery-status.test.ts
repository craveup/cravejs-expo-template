import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { createStorefrontOrderFixture } from '../../fixtures/storefront-order-fixture.ts';
import { toOrderStatusPresentationState } from '../order-status/order-status-presentation.ts';
import {
  isDeliveryStatusOrder,
  toDeliveryStatusPresentationState,
} from './delivery-status.ts';

function completedDelivery(
  overrides: Parameters<typeof createStorefrontOrderFixture>[0] = {},
) {
  return toOrderStatusPresentationState({
    data: {
      order: createStorefrontOrderFixture({
        createdAt: '2099-01-01T10:00:00',
        deliveryInfo: { deliveryAddress: '1 Example Street, Apt 4B' },
        fulfillmentMethod: 'delivery',
        shortId: 'OOO-4417',
        status: 'IN_PROGRESS',
        updatedAt: '2099-01-01T10:15:00',
        ...overrides,
      }),
      state: 'completed',
    },
    kind: 'ready',
  });
}

test('4C projects only authoritative delivery status fields', () => {
  const state = toDeliveryStatusPresentationState(completedDelivery());

  assert.deepEqual(state, {
    data: {
      addressLabel: '1 Example Street, Apt 4B',
      createdAtLabel: 'Jan 1, 2099, 10:00 AM',
      orderLabel: 'Order OOO-4417',
      statusLabel: 'IN_PROGRESS',
      updatedAtLabel: 'Jan 1, 2099, 10:15 AM',
    },
    status: 'ready',
  });
  assert.doesNotMatch(
    JSON.stringify(state),
    /courier|driver|vehicle|map|message|handoff|eta|arrival|provider|cart|token/i,
  );
});

test('4C preserves controlled non-completed states without inventing progress', () => {
  const statuses = [
    'error',
    'loading',
    'no_active_order',
    'offline',
    'order_failed',
    'order_pending',
    'payment_pending',
    'session_expired',
    'unavailable',
  ] as const;

  for (const status of statuses) {
    assert.deepEqual(toDeliveryStatusPresentationState({ status }), {
      status,
    });
  }
});

test('4C fails closed for non-delivery and invalid required timestamps', () => {
  assert.deepEqual(
    toDeliveryStatusPresentationState(
      completedDelivery({ fulfillmentMethod: 'takeout' }),
    ),
    { status: 'unavailable' },
  );
  assert.deepEqual(
    toDeliveryStatusPresentationState(
      completedDelivery({ createdAt: 'not-a-timestamp' }),
    ),
    { status: 'unavailable' },
  );
});

test('4C omits invalid optional timestamps and missing addresses', () => {
  assert.deepEqual(
    toDeliveryStatusPresentationState(
      completedDelivery({ deliveryInfo: null, updatedAt: 'not-a-timestamp' }),
    ),
    {
      data: {
        createdAtLabel: 'Jan 1, 2099, 10:00 AM',
        orderLabel: 'Order OOO-4417',
        statusLabel: 'IN_PROGRESS',
      },
      status: 'ready',
    },
  );
});

test('4C is selected only for an authoritative completed delivery result', () => {
  assert.equal(isDeliveryStatusOrder(completedDelivery()), true);
  assert.equal(
    isDeliveryStatusOrder(completedDelivery({ fulfillmentMethod: 'takeout' })),
    false,
  );
  assert.equal(isDeliveryStatusOrder({ status: 'order_pending' }), false);
});

test('4C hands the completed delivery snapshot to the replacement route after cart cleanup', async () => {
  const handoff = (await import('./delivery-status.ts')) as unknown as {
    clearDeliveryStatusHandoff?: (orders: object, expected: object) => void;
    handoffDeliveryStatus?: (
      orders: object,
      state: object,
      navigate: () => void,
    ) => boolean;
    readDeliveryStatusHandoff?: (orders: object) => object | undefined;
    selectDeliveryStatusSourceState?: (
      current: object,
      remembered?: object,
    ) => object;
  };

  assert.equal(typeof handoff.clearDeliveryStatusHandoff, 'function');
  assert.equal(typeof handoff.handoffDeliveryStatus, 'function');
  assert.equal(typeof handoff.readDeliveryStatusHandoff, 'function');
  assert.equal(typeof handoff.selectDeliveryStatusSourceState, 'function');

  const completed = completedDelivery();
  const orders = {};
  const otherRuntimeOrders = {};
  let snapshotVisibleDuringNavigation: object | undefined;

  assert.equal(
    handoff.handoffDeliveryStatus!(orders, completed, () => {
      snapshotVisibleDuringNavigation =
        handoff.readDeliveryStatusHandoff!(orders);
    }),
    true,
  );
  assert.strictEqual(snapshotVisibleDuringNavigation, completed);
  assert.equal(
    handoff.readDeliveryStatusHandoff!(otherRuntimeOrders),
    undefined,
  );
  assert.strictEqual(
    handoff.selectDeliveryStatusSourceState!(
      { status: 'no_active_order' },
      handoff.readDeliveryStatusHandoff!(orders),
    ),
    completed,
  );

  handoff.clearDeliveryStatusHandoff!(orders, completed);
  assert.equal(handoff.readDeliveryStatusHandoff!(orders), undefined);
});

test('4C does not hand non-delivery completed details to the delivery route', async () => {
  const handoff = (await import('./delivery-status.ts')) as unknown as {
    handoffDeliveryStatus?: (
      orders: object,
      state: object,
      navigate: () => void,
    ) => boolean;
    readDeliveryStatusHandoff?: (orders: object) => object | undefined;
  };
  const orders = {};
  let navigated = false;

  assert.equal(typeof handoff.handoffDeliveryStatus, 'function');
  assert.equal(typeof handoff.readDeliveryStatusHandoff, 'function');
  assert.equal(
    handoff.handoffDeliveryStatus!(
      orders,
      completedDelivery({ fulfillmentMethod: 'takeout' }),
      () => {
        navigated = true;
      },
    ),
    false,
  );
  assert.equal(navigated, false);
  assert.equal(handoff.readDeliveryStatusHandoff!(orders), undefined);
});

test('4C clears the memory-only snapshot when route replacement throws', async () => {
  const handoff = (await import('./delivery-status.ts')) as unknown as {
    handoffDeliveryStatus: (
      orders: object,
      state: object,
      navigate: () => void,
    ) => boolean;
    readDeliveryStatusHandoff: (orders: object) => object | undefined;
  };
  const orders = {};

  assert.throws(
    () =>
      handoff.handoffDeliveryStatus(orders, completedDelivery(), () => {
        throw new Error('navigation failed');
      }),
    /navigation failed/,
  );
  assert.equal(handoff.readDeliveryStatusHandoff(orders), undefined);
});

test('4C does not mask authorization or service failures with a remembered snapshot', async () => {
  const handoff = (await import('./delivery-status.ts')) as unknown as {
    selectDeliveryStatusSourceState: (
      current: object,
      remembered?: object,
    ) => object;
  };
  const completed = completedDelivery();

  for (const status of [
    'error',
    'offline',
    'order_failed',
    'order_pending',
    'payment_pending',
    'session_expired',
    'unavailable',
  ] as const) {
    assert.deepEqual(
      handoff.selectDeliveryStatusSourceState({ status }, completed),
      { status },
      status,
    );
  }
});

test('4C has a thin shared-poller route and responsive reduced presentation', () => {
  const presentationUrl = new URL(
    './DeliveryStatusPresentation.tsx',
    import.meta.url,
  );
  const routeUrl = new URL(
    '../../app/(tabs)/(home)/delivery/status.tsx',
    import.meta.url,
  );
  assert.equal(existsSync(presentationUrl), true, '4C presentation must exist');
  assert.equal(existsSync(routeUrl), true, '4C route must exist');

  const presentation = readFileSync(presentationUrl, 'utf8');
  const route = readFileSync(routeUrl, 'utf8');
  const homeStack = readFileSync(
    new URL('../../app/(tabs)/(home)/_layout.tsx', import.meta.url),
    'utf8',
  );
  const orderStatusRoute = readFileSync(
    new URL('../../app/(tabs)/(home)/order/status.tsx', import.meta.url),
    'utf8',
  );

  assert.match(presentation, /MerchantLocationHeader/);
  assert.match(presentation, /Screen/);
  assert.match(presentation, /Surface/);
  assert.match(presentation, /getResponsiveLayout/);
  assert.match(presentation, /accessibilityLiveRegion="polite"/);
  assert.match(presentation, /accessibilityRole="header"/);
  assert.match(presentation, /background="accent"/);
  assert.match(presentation, /delivery\.status\.created/);
  assert.match(presentation, /delivery\.status\.updated/);
  assert.match(presentation, /delivery\.status\.address/);
  assert.match(
    presentation,
    /state\.status === 'error' \|\|[\s\S]{0,100}merchantHeaderState\.status === 'unavailable'/,
  );

  assert.match(route, /useActiveOrderStatus\(\{ lifecycle, orders \}\)/);
  assert.match(route, /toDeliveryStatusPresentationState/);
  assert.match(route, /router\.push\('\/account' as Href\)/);
  assert.match(route, /orderStatus\.retry\(\)/);
  assert.match(homeStack, /<Stack\.Screen name="delivery\/status" \/>/);
  assert.match(orderStatusRoute, /isDeliveryStatusOrder\(orderStatus\.state\)/);
  assert.match(
    orderStatusRoute,
    /router\.replace\('\/delivery\/status' as Href\)/,
  );

  for (const source of [presentation, route]) {
    assert.doesNotMatch(
      source,
      /@craveup\/storefront-sdk|\bfetch\s*\(|SecureStore|setTimeout|AppState|process\.env|console\.|\bcourier\b|\bdriver\b|\bvehicle\b|\bmap\b|\bmessage\b|\bhandoff\b|\beta\b|\barrival\b|\bscan\b/i,
    );
  }
  assert.doesNotMatch(route, /cartId|capability|receiptToken|customerToken/);
});

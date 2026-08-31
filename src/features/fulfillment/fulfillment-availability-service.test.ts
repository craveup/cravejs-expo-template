import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import {
  createFulfillmentAvailabilityService,
  type FulfillmentAvailabilityClient,
} from './fulfillment-availability-service.ts';

const fixture = createCanonicalStorefrontFixture();

function client(
  overrides: Partial<{
    getBySlug: FulfillmentAvailabilityClient['merchant']['getBySlug'];
    getOrderTimes: FulfillmentAvailabilityClient['locations']['getOrderTimes'];
    getOrderingReadiness: FulfillmentAvailabilityClient['locations']['getOrderingReadiness'];
  }> = {},
): FulfillmentAvailabilityClient {
  return {
    locations: {
      getOrderTimes: overrides.getOrderTimes ?? (async () => fixture.orderTimes),
      getOrderingReadiness:
        overrides.getOrderingReadiness ??
        (async (_locationId, fulfillmentMethod = 'takeout') => ({
          fulfillmentMethod,
          orderDate: '2099-01-01',
          orderTime: '10:30 AM - 10:45 AM',
          pickupType: 'ASAP',
          ready: true,
        })),
    },
    merchant: {
      getBySlug: overrides.getBySlug ?? (async () => fixture.merchant),
    },
  };
}

test('loads pickup-only readiness and preserves server schedule labels', async () => {
  const calls: unknown[] = [];
  const result = await createFulfillmentAvailabilityService(
    client({
      async getOrderTimes(locationId) {
        calls.push(['times', locationId]);
        return fixture.orderTimes;
      },
      async getOrderingReadiness(locationId, method = 'takeout') {
        calls.push(['readiness', locationId, method]);
        return {
          estimatedReadyTime: '10:45 AM',
          fulfillmentMethod: method,
          orderDate: '2099-01-01',
          orderTime: '10:30 AM - 10:45 AM',
          pickupType: 'ASAP',
          ready: true,
        };
      },
    }),
    fixture.scope.merchantSlug,
  ).load(fixture.scope.locationId);

  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.kind === 'ready' ? result.data.schedule : undefined, {
    allowAsap: false,
    days: [
      {
        intervals: [
          { label: '10:30 AM - 10:45 AM', value: '10:30 AM - 10:45 AM' },
          { label: '10:45 AM - 11:00 AM', value: '10:45 AM - 11:00 AM' },
        ],
        label: 'Fixture day',
        value: '2099-01-01',
      },
    ],
    kind: 'options',
  });
  assert.equal(result.kind === 'ready' ? result.data.pickupAvailable : false, true);
  assert.equal(result.kind === 'ready' ? result.data.deliverySupported : true, false);
  assert.deepEqual(calls, [
    ['times', fixture.scope.locationId],
    ['readiness', fixture.scope.locationId, 'takeout'],
  ]);
  assert.equal(
    result.kind === 'ready' && Object.hasOwn(result.data, 'estimatedReadyTime'),
    false,
  );
});

test('queries delivery only when the merchant location supports it', async () => {
  const methods: unknown[] = [];
  const result = await createFulfillmentAvailabilityService(
    client({
      async getBySlug() {
        return {
          ...fixture.merchant,
          locations: [
            {
              ...fixture.merchant.locations[0]!,
              methodsStatus: {
                ...fixture.merchant.locations[0]!.methodsStatus,
                delivery: true,
              },
            },
          ],
        };
      },
      async getOrderingReadiness(_locationId, method = 'takeout') {
        methods.push(method);
        return method === 'delivery'
          ? { fulfillmentMethod: method, ready: false, reason: 'not available' }
          : {
              fulfillmentMethod: method,
              orderDate: '2099-01-01',
              orderTime: 'ASAP',
              pickupType: 'ASAP',
              ready: true,
            };
      },
    }),
    fixture.scope.merchantSlug,
  ).load(fixture.scope.locationId);

  assert.equal(result.kind, 'ready');
  assert.deepEqual(methods, ['takeout', 'delivery']);
  assert.equal(result.kind === 'ready' ? result.data.pickupAvailable : false, true);
  assert.equal(result.kind === 'ready' ? result.data.deliverySupported : false, true);
  assert.equal(result.kind === 'ready' ? result.data.deliveryAvailable : true, false);
});

test('preserves server-provided ASAP and exposes unlabeled regular responses safely', async () => {
  const asap = await createFulfillmentAvailabilityService(
    client({
      async getOrderTimes() {
        return {
          orderDays: [{ intervals: ['ASAP'], label: 'Today', value: 'server-today' }],
          requireScheduledOrders: true,
          scheduleAllowed: true,
        };
      },
    }),
    fixture.scope.merchantSlug,
  ).load(fixture.scope.locationId);
  assert.deepEqual(
    asap.kind === 'ready' ? asap.data.schedule : undefined,
    {
      allowAsap: false,
      days: [
        {
          intervals: [{ label: 'ASAP', value: 'ASAP' }],
          label: 'Today',
          value: 'server-today',
        },
      ],
      kind: 'options',
    },
  );
  assert.match(asap.kind === 'ready' ? (asap.data.nextOrderingSlotLabel ?? '') : '', /Today.*ASAP/);

  const regular = await createFulfillmentAvailabilityService(
    client({
      async getOrderTimes() {
        return { orderDays: [], scheduleAllowed: true };
      },
    }),
    fixture.scope.merchantSlug,
  ).load(fixture.scope.locationId);
  assert.deepEqual(
    regular.kind === 'ready' ? regular.data.schedule : undefined,
    { allowAsap: true, days: [], kind: 'options' },
  );
  assert.equal(
    regular.kind === 'ready' ? regular.data.nextOrderingSlotLabel : undefined,
    undefined,
  );
});

test('fails closed for cross-merchant, malformed readiness, and malformed schedule responses', async () => {
  for (const serviceClient of [
    client({
      async getBySlug() {
        return { ...fixture.merchant, locations: [] };
      },
    }),
    client({
      async getOrderingReadiness() {
        return {
          fulfillmentMethod: 'delivery',
          orderDate: '2099-01-01',
          orderTime: '10:30 AM',
          pickupType: 'ASAP',
          ready: true,
        };
      },
    }),
    client({
      async getOrderTimes() {
        return {
          orderDays: [
            { intervals: ['10:30 AM', '10:30 AM'], label: 'Today', value: 'today' },
          ],
          requireScheduledOrders: true,
          scheduleAllowed: true,
        };
      },
    }),
  ]) {
    const result = await createFulfillmentAvailabilityService(
      serviceClient,
      fixture.scope.merchantSlug,
    ).load(fixture.scope.locationId);
    assert.equal(result.kind, 'failed');
    assert.equal(
      result.kind === 'failed' ? result.failure.code : undefined,
      'INVALID_STOREFRONT_RESPONSE',
    );
  }
});

test('rejects unsafe server-authored location and schedule copy', async () => {
  for (const serviceClient of [
    client({
      async getBySlug() {
        return {
          ...fixture.merchant,
          locations: [
            {
              ...fixture.merchant.locations[0]!,
              restaurantDisplayName: 'Unsafe\nstore',
            },
          ],
        };
      },
    }),
    client({
      async getOrderTimes() {
        return {
          orderDays: [
            {
              intervals: ['10:30 AM'],
              label: 'x'.repeat(501),
              value: '2099-01-01',
            },
          ],
          scheduleAllowed: true,
        };
      },
    }),
  ]) {
    const result = await createFulfillmentAvailabilityService(
      serviceClient,
      fixture.scope.merchantSlug,
    ).load(fixture.scope.locationId);
    assert.equal(result.kind, 'failed');
    assert.equal(
      result.kind === 'failed' ? result.failure.code : undefined,
      'INVALID_STOREFRONT_RESPONSE',
    );
  }
});

test('maps failures safely and performs no cart mutation or client-owned time interpretation', async () => {
  const result = await createFulfillmentAvailabilityService(
    client({
      async getOrderTimes() {
        throw { body: { private: 'hidden' }, requestId: 'safe-id', status: 503 };
      },
    }),
    fixture.scope.merchantSlug,
  ).load(fixture.scope.locationId);
  assert.equal(result.kind, 'failed');
  assert.doesNotMatch(JSON.stringify(result), /private|hidden/);

  const source = readFileSync(
    new URL('./fulfillment-availability-service.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|cart\.|updateFulfillment|updateOrderTime|Date\s*\(|new Date|console\.|process\.env/,
  );
  assert.match(source, /toPickupSchedulePresentation/);
  assert.match(source, /getNextOrderingSlotLabel/);
});

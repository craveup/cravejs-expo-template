import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { StorefrontCart } from '@craveup/storefront-sdk';

import { createStorefrontCartFixture } from '../../fixtures/storefront-cart-fixture.ts';
import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import {
  applyPickupFulfillment,
  applyPickupSchedule,
  createFulfillmentIntentKey,
  loadFulfillmentFlow,
  loadPickupScheduleFlow,
} from './fulfillment-flow.ts';
import type {
  FulfillmentAvailabilityResult,
  FulfillmentAvailabilityService,
} from './fulfillment-availability-service.ts';

const locationId = '0123456789abcdef01234567';

function item(
  overrides: Partial<StorefrontCart['items'][number]> = {},
) {
  return {
    description: 'Tea',
    categoryId: null,
    discount: '0.00',
    discountFormatted: '$0.00',
    id: 'item_1',
    imageUrl: '',
    itemUnavailableAction: 'remove_item',
    name: 'Tea',
    price: '6.75',
    priceFormatted: '$6.75',
    productId: 'product_1',
    quantity: 1,
    selections: [],
    specialInstructions: '',
    total: '6.75',
    totalFormatted: '$6.75',
    ...overrides,
  } satisfies StorefrontCart['items'][number];
}

function cart(overrides: Partial<StorefrontCart> = {}): StorefrontCart {
  return createStorefrontCartFixture({
    items: [item()],
    subTotal: '6.75',
    subTotalFormatted: '$6.75',
    totalQuantity: 1,
    ...overrides,
  });
}

function availabilityResult(
  overrides: Partial<
    Extract<FulfillmentAvailabilityResult, { kind: 'ready' }>['data']
  > = {},
): FulfillmentAvailabilityResult {
  return {
    data: {
      deliveryAvailable: false,
      deliverySupported: false,
      locationAddress: '100 Example Avenue',
      locationName: 'Example Store',
      nextOrderingSlotLabel: 'Tomorrow · 10:30 AM - 10:45 AM',
      pickupAvailable: true,
      pickupSupported: true,
      schedule: {
        allowAsap: false,
        days: [
          {
            intervals: [
              {
                label: '10:30 AM - 10:45 AM',
                value: '10:30 AM - 10:45 AM',
              },
            ],
            label: 'Tomorrow',
            value: '2099-01-01',
          },
        ],
        kind: 'options',
      },
      ...overrides,
    },
    kind: 'ready',
  } as FulfillmentAvailabilityResult;
}

function availability(
  result: FulfillmentAvailabilityResult = availabilityResult(),
): FulfillmentAvailabilityService & { calls: number } {
  return {
    calls: 0,
    async load() {
      this.calls += 1;
      return result;
    },
  };
}

function cartService(
  overrides: Partial<Pick<CartService, 'dismissError' | 'getState' | 'load' | 'retry' | 'setFulfillment' | 'setOrderTime'>> = {},
): Pick<CartService, 'dismissError' | 'getState' | 'load' | 'retry' | 'setFulfillment' | 'setOrderTime'> {
  const current = cart();
  return {
    dismissError: overrides.dismissError ?? (() => true),
    getState: overrides.getState ?? (() => ({ cart: current, revision: 1, status: 'ready' })),
    load: overrides.load ?? (async () => ({ cart: current, kind: 'ready' })),
    retry: overrides.retry ?? (async () => ({ cart: current, kind: 'ready' })),
    setFulfillment:
      overrides.setFulfillment ?? (async () => ({ cart: current, kind: 'ready' })),
    setOrderTime:
      overrides.setOrderTime ?? (async () => ({ cart: current, kind: 'ready' })),
  };
}

test('loads one scoped cart and server availability without enabling gated delivery', async () => {
  const current = cart({ fulfilmentMethod: 'delivery' });
  const result = await loadFulfillmentFlow(
    {
      availability: availability(),
      cart: cartService({ load: async () => ({ cart: current, kind: 'ready' }) }),
      cartSessions: {
        get: async () => ({ cartId: current.id, locationId, revision: 1 }),
      },
      locationId,
    },
    'fulfillment_load_1',
  );

  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.kind === 'ready' ? result.data.pickupLocation : undefined, {
    address: '100 Example Avenue',
    locationName: 'Example Store',
  });
  assert.equal(result.kind === 'ready' ? result.data.selectedChoice : undefined, 'delivery');
  assert.equal(result.kind === 'ready' ? result.data.deliveryEntryEnabled : true, false);
  assert.equal(Object.hasOwn(result, 'estimatedReadyTime'), false);
});

test('dismisses a prior new-intent error before a fresh cart mutation', async () => {
  const before = cart({ fulfilmentMethod: 'delivery' });
  let dismissals = 0;
  let mutations = 0;
  const service = cartService({
    dismissError() {
      dismissals += 1;
      return true;
    },
    getState: () => ({
      intent: { id: 'old_intent', kind: 'set_fulfillment' },
      previous: { cart: before, revision: 1 },
      retry: 'new_intent',
      status: 'error',
    }),
    async setFulfillment() {
      mutations += 1;
      return {
        cart: cart({ fulfilmentMethod: 'takeout', revision: 2 }),
        kind: 'ready',
      };
    },
  });

  assert.equal(
    (
      await applyPickupFulfillment(
        { availability: availability(), cart: service, locationId },
        before,
        'fulfillment_pickup_fresh',
        false,
      )
    ).kind,
    'completed',
  );
  assert.equal(dismissals, 1);
  assert.equal(mutations, 1);
});

test('projects a closed pickup only from server availability and requires a cart session', async () => {
  let cartLoads = 0;
  const closed = await loadFulfillmentFlow(
    {
      availability: availability(availabilityResult({ pickupAvailable: false })),
      cart: cartService({
        async load() {
          cartLoads += 1;
          return { cart: cart(), kind: 'ready' };
        },
      }),
      cartSessions: { get: async () => ({ cartId: 'cart_fixture', locationId, revision: 1 }) },
      locationId,
    },
    'fulfillment_load_2',
  );
  assert.equal(closed.kind, 'closed');
  assert.equal(closed.kind === 'closed' ? closed.data.locationName : undefined, 'Example Store');

  const missing = await loadFulfillmentFlow(
    {
      availability: availability(),
      cart: cartService({
        async load() {
          cartLoads += 1;
          return { cart: cart(), kind: 'ready' };
        },
      }),
      cartSessions: { get: async () => null },
      locationId,
    },
    'fulfillment_load_3',
  );
  assert.deepEqual(missing, { kind: 'missing-cart' });
  assert.equal(cartLoads, 1);
});

test('loads a standalone schedule for one scoped pickup cart even while ASAP is closed', async () => {
  const current = cart({ fulfilmentMethod: 'takeout' });
  const result = await loadPickupScheduleFlow(
    {
      availability: availability(
        availabilityResult({ pickupAvailable: false }),
      ),
      cart: cartService({ load: async () => ({ cart: current, kind: 'ready' }) }),
      cartSessions: {
        get: async () => ({ cartId: current.id, locationId, revision: 1 }),
      },
      locationId,
    },
    'fulfillment_schedule_load',
  );

  assert.equal(result.kind, 'ready');
  assert.equal(result.kind === 'ready' ? result.data.cart.id : undefined, current.id);
  assert.equal(
    result.kind === 'ready' ? result.data.locationName : undefined,
    'Example Store',
  );
  assert.equal(
    result.kind === 'ready' ? result.data.schedule.allowAsap : true,
    false,
  );
});

test('standalone schedule rejects delivery carts, missing sessions, and empty schedules', async () => {
  const deliveryCart = cart({ fulfilmentMethod: 'delivery' });
  const pickupRequired = await loadPickupScheduleFlow(
    {
      availability: availability(),
      cart: cartService({
        load: async () => ({ cart: deliveryCart, kind: 'ready' }),
      }),
      cartSessions: {
        get: async () => ({ cartId: deliveryCart.id, locationId, revision: 1 }),
      },
      locationId,
    },
    'fulfillment_schedule_delivery',
  );
  assert.deepEqual(pickupRequired, { kind: 'pickup-required' });

  const missing = await loadPickupScheduleFlow(
    {
      availability: availability(),
      cart: cartService(),
      cartSessions: { get: async () => null },
      locationId,
    },
    'fulfillment_schedule_missing',
  );
  assert.deepEqual(missing, { kind: 'missing-cart' });

  const unavailable = await loadPickupScheduleFlow(
    {
      availability: availability(
        availabilityResult({
          schedule: { allowAsap: true, days: [], kind: 'options' },
        }),
      ),
      cart: cartService(),
      cartSessions: {
        get: async () => ({ cartId: 'cart_fixture', locationId, revision: 1 }),
      },
      locationId,
    },
    'fulfillment_schedule_empty',
  );
  assert.deepEqual(unavailable, { kind: 'unavailable' });
});

test('switches only to pickup, preserves items, and reloads server availability', async () => {
  const selection = {
    id: 'group_1',
    items: [
      {
        id: 'option_1',
        name: 'Oat milk',
        price: '0.75',
        priceFormatted: '$0.75',
        quantity: 1,
      },
    ],
    name: 'Milk',
    rule: { max: 1, min: 1 },
  } satisfies StorefrontCart['items'][number]['selections'][number];
  const before = cart({
    fulfilmentMethod: 'delivery',
    items: [item({ selections: [selection] })],
  });
  const after = cart({
    fulfilmentMethod: 'takeout',
    fulfillmentMethodFeeTotal: '1.25',
    fulfillmentMethodFeeTotalFormatted: '$1.25',
    items: [
      item({
        selections: [
          {
            ...selection,
            items: [
              {
                ...selection.items[0]!,
                price: '1.00',
                priceFormatted: '$1.00',
              },
            ],
          },
        ],
      }),
    ],
    revision: 2,
  });
  const calls: unknown[] = [];
  const availabilityService = availability();
  const result = await applyPickupFulfillment(
    {
      availability: availabilityService,
      cart: cartService({
        async setFulfillment(intent) {
          calls.push(intent);
          return { cart: after, kind: 'ready' };
        },
      }),
      locationId,
    },
    before,
    'fulfillment_pickup_1',
    false,
  );

  assert.deepEqual(calls, [
    { id: 'fulfillment_pickup_1', payload: { fulfillmentMethod: 'takeout' } },
  ]);
  assert.equal(result.kind, 'completed');
  assert.equal(result.kind === 'completed' ? result.cart.revision : undefined, 2);
  assert.equal(availabilityService.calls, 1);

  const malformed = await applyPickupFulfillment(
    {
      availability: availability(),
      cart: cartService({
        setFulfillment: async () => ({
          cart: cart({ fulfilmentMethod: 'takeout', items: [], revision: 2, totalQuantity: 0 }),
          kind: 'ready',
        }),
      }),
      locationId,
    },
    before,
    'fulfillment_pickup_2',
    false,
  );
  assert.deepEqual(malformed, { kind: 'unavailable' });

  const noRequiredSlot = await applyPickupFulfillment(
    {
      availability: availability(
        availabilityResult({
          schedule: { allowAsap: false, days: [], kind: 'options' },
        }),
      ),
      cart: cartService({
        setFulfillment: async () => ({
          cart: { ...after, revision: 3 },
          kind: 'ready',
        }),
      }),
      locationId,
    },
    before,
    'fulfillment_pickup_required_without_slots',
    false,
  );
  assert.deepEqual(noRequiredSlot, { kind: 'unavailable' });
});

test('preserves exact retry and asks for confirmation after conflict reconciliation', async () => {
  const before = cart({ fulfilmentMethod: 'delivery' });
  const refreshed = cart({ fulfilmentMethod: 'delivery', revision: 3 });
  const failure = {
    failure: { code: 'CART_CONFLICT', kind: 'conflict', retryable: false },
    cart: refreshed,
    kind: 'reconciliation_required',
  } satisfies CartServiceResult;
  const conflict = await applyPickupFulfillment(
    { availability: availability(), cart: cartService({ setFulfillment: async () => failure }), locationId },
    before,
    'fulfillment_pickup_3',
    false,
  );
  assert.deepEqual(conflict, { cart: refreshed, kind: 'refresh-required' });

  let retries = 0;
  const retryCart = cartService({
    getState: () => ({
      intent: { id: 'fulfillment_pickup_4', kind: 'set_fulfillment' },
      previous: { cart: before, revision: 1 },
      retry: 'same_intent',
      status: 'error',
    }),
    retry: async () => {
      retries += 1;
      return { cart: cart({ fulfilmentMethod: 'takeout', revision: 2 }), kind: 'ready' };
    },
    setFulfillment: async () => ({
      failure: { code: 'TIMEOUT', kind: 'timeout', retryable: true },
      kind: 'failed',
    }),
  });
  assert.deepEqual(
    await applyPickupFulfillment(
      { availability: availability(), cart: retryCart, locationId },
      before,
      'fulfillment_pickup_4',
      false,
    ),
    { kind: 'retryable', retry: 'same-intent' },
  );
  assert.equal(
    (
      await applyPickupFulfillment(
        { availability: availability(), cart: retryCart, locationId },
        before,
        'fulfillment_pickup_4',
        true,
      )
    ).kind,
    'completed',
  );
  assert.equal(retries, 1);
});

test('submits only an exact server schedule selection through the shared cart', async () => {
  const current = cart({ fulfilmentMethod: 'takeout' });
  const availabilityData = availabilityResult();
  assert.equal(availabilityData.kind, 'ready');
  const calls: unknown[] = [];
  const dependencies = {
    cart: cartService({
      async setOrderTime(intent) {
        calls.push(intent);
        return { cart: cart({ pickupType: 'LATER', revision: 2 }), kind: 'ready' };
      },
    }),
    locationId,
  };

  assert.deepEqual(
    await applyPickupSchedule(
      dependencies,
      current,
      availabilityData.data.schedule,
      {
        dayValue: 'unknown',
        intervalValue: '10:30 AM - 10:45 AM',
        pickupType: 'LATER',
      },
      'fulfillment_schedule_1',
      false,
    ),
    { kind: 'selection-invalid' },
  );
  assert.equal(calls.length, 0);

  const result = await applyPickupSchedule(
    dependencies,
    current,
    availabilityData.data.schedule,
    {
      dayValue: '2099-01-01',
      intervalValue: '10:30 AM - 10:45 AM',
      pickupType: 'LATER',
    },
    'fulfillment_schedule_2',
    false,
  );
  assert.equal(result.kind, 'completed');
  assert.deepEqual(calls, [
    {
      id: 'fulfillment_schedule_2',
      payload: {
        orderDate: '2099-01-01',
        orderTime: '10:30 AM - 10:45 AM',
        pickupType: 'LATER',
      },
    },
  ]);
});

test('submits ASAP only when the server allows it', async () => {
  const current = cart({ fulfilmentMethod: 'takeout' });
  const scheduleResult = availabilityResult();
  assert.equal(scheduleResult.kind, 'ready');
  const calls: unknown[] = [];
  const service = cartService({
    async setOrderTime(intent) {
      calls.push(intent);
      return { cart: cart({ pickupType: 'ASAP', revision: 2 }), kind: 'ready' };
    },
  });

  assert.deepEqual(
    await applyPickupSchedule(
      { cart: service, locationId },
      current,
      {
        allowAsap: false,
        days: scheduleResult.kind === 'ready' &&
          scheduleResult.data.schedule.kind === 'options'
          ? scheduleResult.data.schedule.days
          : [],
        kind: 'options',
      },
      { pickupType: 'ASAP' },
      'fulfillment_schedule_asap_blocked',
      false,
    ),
    { kind: 'selection-invalid' },
  );
  assert.equal(calls.length, 0);

  const result = await applyPickupSchedule(
    { cart: service, locationId },
    current,
    { allowAsap: true, days: [], kind: 'options' },
    { pickupType: 'ASAP' },
    'fulfillment_schedule_asap',
    false,
  );
  assert.equal(result.kind, 'completed');
  assert.deepEqual(calls, [
    {
      id: 'fulfillment_schedule_asap',
      payload: { pickupType: 'ASAP' },
    },
  ]);
});

test('intent keys are bounded and routes use only the shared runtime seams', async () => {
  assert.equal(
    createFulfillmentIntentKey('pickup', 1_786_400_000_000, 4),
    'fulfillment_pickup_msnsfpq8_4',
  );
  assert.throws(() => createFulfillmentIntentKey('schedule', -1, 1));
  assert.throws(() => createFulfillmentIntentKey('load', 1, 0));

  const [choiceRoute, closedRoute, scheduleRoute, flow, navigation, bagRoute, bagPresentation] = await Promise.all([
    readFile(new URL('../../app/(tabs)/(home)/fulfillment.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../app/store-closed.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../app/(tabs)/(home)/schedule.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./fulfillment-flow.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../navigation/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../app/(tabs)/(bag)/bag.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../bag/BagPresentation.tsx', import.meta.url), 'utf8'),
  ]);
  const source = `${choiceRoute}\n${closedRoute}\n${scheduleRoute}\n${flow}`;
  assert.match(choiceRoute, /runtime\.services\.cart/);
  assert.match(choiceRoute, /runtime\.cartSessions/);
  assert.match(choiceRoute, /createFulfillmentAvailabilityService/);
  assert.match(closedRoute, /router\.replace\('\/schedule'/);
  assert.doesNotMatch(closedRoute, /PickupScheduleScreen|applyPickupSchedule/);
  assert.match(scheduleRoute, /loadPickupScheduleFlow/);
  assert.match(scheduleRoute, /applyPickupSchedule/);
  assert.match(scheduleRoute, /PickupScheduleScreen/);
  assert.match(scheduleRoute, /runtime\.cartSessions/);
  assert.match(
    scheduleRoute,
    /result\.cart\.fulfilmentMethod !== 'takeout'[\s\S]{0,120}router\.replace\('\/fulfillment'/,
  );
  assert.match(bagRoute, /router\.push\('\/fulfillment'/);
  assert.match(bagPresentation, /onChangeFulfillment/);
  assert.match(navigation, /id: 'fulfillment'[\s\S]{0,120}path: '\/fulfillment'/);
  assert.match(navigation, /id: 'storeClosed'[\s\S]{0,120}path: '\/store-closed'/);
  assert.match(navigation, /id: 'pickupSchedule'[\s\S]{0,120}path: '\/schedule'/);
  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|createStorefrontClient|SecureStore|process\.env|\$3\.99|ready in|shut at|open until|estimatedReadyTime|delivery\/address|serviceable|configuredTotal/i,
  );
});

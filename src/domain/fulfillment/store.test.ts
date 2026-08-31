import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FulfilmentMethods } from '@craveup/storefront-sdk';

import {
  getReadyFulfillmentSelection,
  initialFulfillmentDraft,
  reduceFulfillmentDraft,
  toPresentationFulfillmentChoice,
  toWireFulfillmentMethod,
} from './store.ts';
import type { FulfillmentDraft } from './types.ts';

const cartAddress = {
  city: 'London',
  country: 'United Kingdom' as const,
  lat: 51.513,
  lng: -0.133,
  state: 'London',
  street: '8 Greek Street',
  zipCode: 'W1D 4DG',
};

const customerAddressInput = {
  fullAddress: '8 Greek Street, London W1D 4DG',
  lat: cartAddress.lat,
  line1: cartAddress.street,
  lng: cartAddress.lng,
};

function selectLocation() {
  const result = reduceFulfillmentDraft(initialFulfillmentDraft(), {
    locationId: 'location_123',
    type: 'location_selected',
  });
  assert.equal(result.ok, true);
  return result.state;
}

test('maps only supported presentation choices to exact SDK wire values', () => {
  assert.equal(toWireFulfillmentMethod('pickup'), FulfilmentMethods.TAKEOUT);
  assert.equal(toWireFulfillmentMethod('delivery'), FulfilmentMethods.DELIVERY);
  assert.equal(toWireFulfillmentMethod('table'), undefined);
  assert.equal(toPresentationFulfillmentChoice('takeout'), 'pickup');
  assert.equal(toPresentationFulfillmentChoice('delivery'), 'delivery');
  assert.equal(toPresentationFulfillmentChoice('room_service'), undefined);
});

test('a new location clears location-specific method, address, and schedule state', () => {
  const state: FulfillmentDraft = {
    deliveryAddresses: { cartAddress, customerAddressInput },
    locationId: 'location_123',
    method: FulfilmentMethods.DELIVERY,
    schedule: { orderDate: '2026-08-12', orderTime: '10:30', pickupType: 'LATER' as const },
  };
  const result = reduceFulfillmentDraft(state, {
    locationId: 'location_456',
    type: 'location_selected',
  });

  assert.deepEqual(result, {
    ok: true,
    state: { locationId: 'location_456' },
  });
});

test('pickup removes delivery address state while preserving a same-location schedule', () => {
  const state: FulfillmentDraft = {
    deliveryAddresses: { cartAddress, customerAddressInput },
    locationId: 'location_123',
    method: FulfilmentMethods.DELIVERY,
    schedule: { pickupType: 'ASAP' as const },
  };
  const result = reduceFulfillmentDraft(state, {
    method: FulfilmentMethods.TAKEOUT,
    type: 'method_selected',
  });

  assert.deepEqual(result, {
    ok: true,
    state: {
      locationId: 'location_123',
      method: FulfilmentMethods.TAKEOUT,
      schedule: { pickupType: 'ASAP' },
    },
  });
});

test('delivery keeps cart and customer address DTOs separate', () => {
  let state = selectLocation();
  const method = reduceFulfillmentDraft(state, {
    method: FulfilmentMethods.DELIVERY,
    type: 'method_selected',
  });
  assert.equal(method.ok, true);
  state = method.state;

  const address = reduceFulfillmentDraft(state, {
    addresses: { cartAddress, customerAddressInput },
    type: 'delivery_addresses_selected',
  });
  assert.equal(address.ok, true);
  const schedule = reduceFulfillmentDraft(address.state, {
    schedule: { orderDate: '2026-08-12', orderTime: '10:30–10:45', pickupType: 'LATER' },
    type: 'schedule_selected',
  });
  assert.equal(schedule.ok, true);

  assert.deepEqual(getReadyFulfillmentSelection(schedule.state), {
    deliveryAddresses: { cartAddress, customerAddressInput },
    locationId: 'location_123',
    method: FulfilmentMethods.DELIVERY,
    schedule: {
      orderDate: '2026-08-12',
      orderTime: '10:30–10:45',
      pickupType: 'LATER',
    },
  });
});

test('invalid methods, locations, schedules, and delivery ordering fail closed', () => {
  const empty = initialFulfillmentDraft();
  assert.deepEqual(
    reduceFulfillmentDraft(empty, { method: 'table_side', type: 'method_selected' }),
    { ok: false, reason: 'invalid_location', state: empty },
  );
  assert.equal(
    reduceFulfillmentDraft(empty, { locationId: 'bad location', type: 'location_selected' }).ok,
    false,
  );

  const location = selectLocation();
  assert.deepEqual(
    reduceFulfillmentDraft(location, { method: 'table_side', type: 'method_selected' }),
    { ok: false, reason: 'invalid_method', state: location },
  );
  assert.equal(
    reduceFulfillmentDraft(location, {
      addresses: { cartAddress },
      type: 'delivery_addresses_selected',
    }).ok,
    false,
  );
  assert.equal(
    reduceFulfillmentDraft(
      { ...location, method: FulfilmentMethods.TAKEOUT },
      {
        schedule: { orderDate: '', orderTime: '10:30', pickupType: 'LATER' },
        type: 'schedule_selected',
      },
    ).ok,
    false,
  );
});

test('fulfillment domain remains pure and owns no transport, storage, or cart mutation', () => {
  const source = ['types.ts', 'store.ts']
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');

  assert.doesNotMatch(
    source,
    /expo-router|SecureStore|AsyncStorage|process\.env|\bfetch\s*\(|getStorefrontRuntime|\.cart\.|setDelivery|updateOrderTime|console\./,
  );
});

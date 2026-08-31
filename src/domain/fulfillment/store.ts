import type {
  FulfillmentDeliveryAddresses,
  FulfillmentDraft,
  FulfillmentEvent,
  FulfillmentSchedule,
  FulfillmentTransitionFailure,
  FulfillmentTransitionResult,
  OrderingFulfillmentMethod,
  ReadyFulfillmentSelection,
} from './types.ts';

const SAFE_LOCATION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TAKEOUT = 'takeout' as const satisfies OrderingFulfillmentMethod;
const DELIVERY = 'delivery' as const satisfies OrderingFulfillmentMethod;

export function initialFulfillmentDraft(): FulfillmentDraft {
  return Object.freeze({});
}

export function toWireFulfillmentMethod(
  choice: unknown,
): OrderingFulfillmentMethod | undefined {
  if (choice === 'pickup') return TAKEOUT;
  if (choice === 'delivery') return DELIVERY;
  return undefined;
}

export function toPresentationFulfillmentChoice(
  method: unknown,
): 'delivery' | 'pickup' | undefined {
  if (method === TAKEOUT) return 'pickup';
  if (method === DELIVERY) return 'delivery';
  return undefined;
}

function failed(
  state: FulfillmentDraft,
  reason: FulfillmentTransitionFailure,
): FulfillmentTransitionResult {
  return Object.freeze({ ok: false, reason, state });
}

function succeeded(state: FulfillmentDraft): FulfillmentTransitionResult {
  return Object.freeze({ ok: true, state: Object.freeze(state) });
}

function validLocationId(value: string): boolean {
  return SAFE_LOCATION_ID.test(value);
}

function copySchedule(schedule: FulfillmentSchedule): FulfillmentSchedule | undefined {
  if (schedule.pickupType === 'ASAP') {
    return Object.freeze({ pickupType: 'ASAP' });
  }

  if (
    schedule.pickupType !== 'LATER' ||
    typeof schedule.orderDate !== 'string' ||
    schedule.orderDate.length < 1 ||
    schedule.orderDate.length > 256 ||
    schedule.orderDate !== schedule.orderDate.trim() ||
    typeof schedule.orderTime !== 'string' ||
    schedule.orderTime.length < 1 ||
    schedule.orderTime.length > 256 ||
    schedule.orderTime !== schedule.orderTime.trim()
  ) {
    return undefined;
  }

  return Object.freeze({
    orderDate: schedule.orderDate,
    orderTime: schedule.orderTime,
    pickupType: 'LATER',
  });
}

function copyDeliveryAddresses(
  addresses: FulfillmentDeliveryAddresses,
): FulfillmentDeliveryAddresses {
  return Object.freeze({
    cartAddress: Object.freeze({ ...addresses.cartAddress }),
    ...(addresses.customerAddressInput
      ? {
          customerAddressInput: Object.freeze({
            ...addresses.customerAddressInput,
          }),
        }
      : {}),
  });
}

export function reduceFulfillmentDraft(
  state: FulfillmentDraft,
  event: FulfillmentEvent,
): FulfillmentTransitionResult {
  switch (event.type) {
    case 'cleared':
      return succeeded(initialFulfillmentDraft());
    case 'location_selected':
      if (!validLocationId(event.locationId)) {
        return failed(state, 'invalid_location');
      }
      if (state.locationId === event.locationId) return succeeded(state);
      return succeeded({ locationId: event.locationId });
    case 'method_selected': {
      if (!state.locationId) return failed(state, 'invalid_location');
      if (
        event.method !== TAKEOUT &&
        event.method !== DELIVERY
      ) {
        return failed(state, 'invalid_method');
      }
      return succeeded({
        locationId: state.locationId,
        method: event.method,
        ...(event.method === DELIVERY && state.deliveryAddresses
          ? { deliveryAddresses: state.deliveryAddresses }
          : {}),
        ...(state.schedule ? { schedule: state.schedule } : {}),
      });
    }
    case 'delivery_addresses_selected':
      if (!state.locationId || state.method !== DELIVERY) {
        return failed(state, 'invalid_delivery_state');
      }
      return succeeded({
        ...state,
        deliveryAddresses: copyDeliveryAddresses(event.addresses),
      });
    case 'schedule_selected': {
      if (!state.locationId || !state.method) {
        return failed(state, 'invalid_method');
      }
      const schedule = copySchedule(event.schedule);
      if (!schedule) return failed(state, 'invalid_schedule');
      return succeeded({ ...state, schedule });
    }
  }
}

export function getReadyFulfillmentSelection(
  state: FulfillmentDraft,
): ReadyFulfillmentSelection | undefined {
  if (!state.locationId || !state.method || !state.schedule) return undefined;

  if (state.method === TAKEOUT) {
    return Object.freeze({
      locationId: state.locationId,
      method: state.method,
      schedule: state.schedule,
    });
  }

  if (!state.deliveryAddresses) return undefined;

  return Object.freeze({
    deliveryAddresses: state.deliveryAddresses,
    locationId: state.locationId,
    method: state.method,
    schedule: state.schedule,
  });
}

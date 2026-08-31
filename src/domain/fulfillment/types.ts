import type {
  CustomerAddressInput,
  DeliveryAddress,
  FulfilmentMethod,
  UpdateOrderTimePayload,
} from '@craveup/storefront-sdk';

export type OrderingFulfillmentMethod = Extract<
  FulfilmentMethod,
  'delivery' | 'takeout'
>;

export type FulfillmentDeliveryAddresses = Readonly<{
  cartAddress: DeliveryAddress;
  customerAddressInput?: CustomerAddressInput;
}>;

export type FulfillmentSchedule = UpdateOrderTimePayload;

export type FulfillmentDraft = Readonly<{
  deliveryAddresses?: FulfillmentDeliveryAddresses;
  locationId?: string;
  method?: OrderingFulfillmentMethod;
  schedule?: FulfillmentSchedule;
}>;

export type ReadyFulfillmentSelection =
  | Readonly<{
      locationId: string;
      method: 'takeout';
      schedule: FulfillmentSchedule;
    }>
  | Readonly<{
      deliveryAddresses: FulfillmentDeliveryAddresses;
      locationId: string;
      method: 'delivery';
      schedule: FulfillmentSchedule;
    }>;

export type FulfillmentEvent =
  | Readonly<{ locationId: string; type: 'location_selected' }>
  | Readonly<{ method: string; type: 'method_selected' }>
  | Readonly<{
      addresses: FulfillmentDeliveryAddresses;
      type: 'delivery_addresses_selected';
    }>
  | Readonly<{ schedule: FulfillmentSchedule; type: 'schedule_selected' }>
  | Readonly<{ type: 'cleared' }>;

export type FulfillmentTransitionFailure =
  | 'invalid_delivery_state'
  | 'invalid_location'
  | 'invalid_method'
  | 'invalid_schedule';

export type FulfillmentTransitionResult =
  | Readonly<{ ok: true; state: FulfillmentDraft }>
  | Readonly<{
      ok: false;
      reason: FulfillmentTransitionFailure;
      state: FulfillmentDraft;
    }>;

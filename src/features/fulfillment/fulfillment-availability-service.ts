import type {
  FulfilmentMethod,
  OrderTimesResponse,
  OrderingReadinessResponse,
} from '@craveup/storefront-sdk';

import { mapStorefrontError, type StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import {
  getNextOrderingSlotLabel,
  toPickupSchedulePresentation,
  type OrderTimesPresentationResult,
} from '../schedule/storefront-order-times.ts';
import { getValidatedMerchantLocations } from '../locations/location-directory-service.ts';

export type FulfillmentAvailabilityClient = Readonly<{
  locations: Pick<
    StorefrontClient['locations'],
    'getOrderTimes' | 'getOrderingReadiness'
  >;
  merchant: Pick<StorefrontClient['merchant'], 'getBySlug'>;
}>;

export type FulfillmentAvailabilitySnapshot = Readonly<{
  deliveryAvailable: boolean;
  deliverySupported: boolean;
  locationAddress: string;
  locationName: string;
  nextOrderingSlotLabel?: string;
  pickupAvailable: boolean;
  pickupSupported: boolean;
  schedule: OrderTimesPresentationResult;
}>;

export type FulfillmentAvailabilityResult =
  | Readonly<{ data: FulfillmentAvailabilitySnapshot; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export interface FulfillmentAvailabilityService {
  load(locationId: string): Promise<FulfillmentAvailabilityResult>;
}

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

const INVALID_LOCATION_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_LOCATION_ID',
  kind: 'invalid_request',
  retryable: false,
});
const MAX_PUBLIC_TEXT_LENGTH = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PUBLIC_TEXT_LENGTH &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isOrderTimesResponse(value: unknown): value is OrderTimesResponse {
  if (
    !isObject(value) ||
    typeof value.scheduleAllowed !== 'boolean' ||
    (value.requireScheduledOrders !== undefined &&
      typeof value.requireScheduledOrders !== 'boolean') ||
    !Array.isArray(value.orderDays) ||
    value.orderDays.length > 31
  ) {
    return false;
  }

  const dayValues = new Set<string>();
  for (const day of value.orderDays) {
    if (
      !isObject(day) ||
      !isNonemptyString(day.value) ||
      !isNonemptyString(day.label) ||
      !Array.isArray(day.intervals) ||
      day.intervals.length > 200 ||
      !day.intervals.every(isNonemptyString) ||
      dayValues.has(day.value) ||
      new Set(day.intervals).size !== day.intervals.length
    ) {
      return false;
    }

    dayValues.add(day.value);
  }

  return true;
}

function isReadinessResponse(
  value: unknown,
  fulfillmentMethod: FulfilmentMethod,
): value is OrderingReadinessResponse {
  if (
    !isObject(value) ||
    typeof value.ready !== 'boolean' ||
    value.fulfillmentMethod !== fulfillmentMethod
  ) {
    return false;
  }

  if (!value.ready) return isNonemptyString(value.reason);

  return (
    (value.pickupType === 'ASAP' || value.pickupType === 'LATER') &&
    isNonemptyString(value.orderDate) &&
    isNonemptyString(value.orderTime) &&
    (value.estimatedReadyTime === undefined ||
      isNonemptyString(value.estimatedReadyTime))
  );
}

export function createFulfillmentAvailabilityService(
  client: FulfillmentAvailabilityClient,
  merchantSlug: string,
): FulfillmentAvailabilityService {
  return Object.freeze({
    async load(locationId: string): Promise<FulfillmentAvailabilityResult> {
      if (!isNonemptyString(locationId)) {
        return Object.freeze({ failure: INVALID_LOCATION_FAILURE, kind: 'failed' });
      }

      try {
        const merchant = await client.merchant.getBySlug(merchantSlug);
        const locations = getValidatedMerchantLocations(merchant);
        const location = locations?.find((candidate) => candidate.id === locationId);
        if (!location) {
          return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
        }
        if (
          !isNonemptyString(location.restaurantDisplayName) ||
          !isNonemptyString(location.addressString)
        ) {
          return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
        }

        const readinessMethods: FulfilmentMethod[] = [];
        if (location.methodsStatus.pickup) readinessMethods.push('takeout');
        if (location.methodsStatus.delivery) readinessMethods.push('delivery');

        const [orderTimes, ...readinessResponses] = await Promise.all([
          client.locations.getOrderTimes(locationId),
          ...readinessMethods.map((method) =>
            client.locations.getOrderingReadiness(locationId, method),
          ),
        ]);

        if (
          !isOrderTimesResponse(orderTimes) ||
          !readinessResponses.every((response, index) =>
            isReadinessResponse(response, readinessMethods[index]!),
          )
        ) {
          return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
        }

        const readinessByMethod = new Map(
          readinessResponses.map((response) => [response.fulfillmentMethod, response]),
        );
        const schedule = toPickupSchedulePresentation(orderTimes);
        const nextOrderingSlotLabel = getNextOrderingSlotLabel(schedule);

        return Object.freeze({
          data: Object.freeze({
            deliveryAvailable: readinessByMethod.get('delivery')?.ready === true,
            deliverySupported: location.methodsStatus.delivery,
            locationAddress: location.addressString,
            locationName: location.restaurantDisplayName,
            ...(nextOrderingSlotLabel ? { nextOrderingSlotLabel } : {}),
            pickupAvailable: readinessByMethod.get('takeout')?.ready === true,
            pickupSupported: location.methodsStatus.pickup,
            schedule,
          }),
          kind: 'ready',
        });
      } catch (error) {
        return Object.freeze({ failure: mapStorefrontError(error), kind: 'failed' });
      }
    },
  });
}

import type {
  MenuBundle,
  MerchantApiResponse,
  OrderTimesResponse,
  OrderingReadinessResponse,
  StorefrontLocation,
} from '@craveup/storefront-sdk';

import { mapStorefrontError, type StorefrontFailure } from './storefront-errors.ts';
import type { StorefrontClient } from './storefront.ts';

export type StorefrontBootstrapClient = Readonly<{
  locations: Pick<
    StorefrontClient['locations'],
    'getById' | 'getOrderTimes' | 'getOrderingReadiness'
  >;
  menus: Pick<StorefrontClient['menus'], 'list'>;
  merchant: Pick<StorefrontClient['merchant'], 'getBySlug'>;
}>;

export type StorefrontBootstrapSnapshot = Readonly<{
  location: StorefrontLocation;
  menus: MenuBundle;
  merchant: MerchantApiResponse;
  readiness: OrderingReadinessResponse;
}>;

export type StorefrontShellSnapshot = Readonly<{
  location: StorefrontLocation;
  merchant: MerchantApiResponse;
}>;

export type StorefrontBootstrapResult<T> =
  | Readonly<{ data: T; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export interface StorefrontBootstrapService {
  getOrderTimes(): Promise<StorefrontBootstrapResult<OrderTimesResponse>>;
  load(): Promise<StorefrontBootstrapResult<StorefrontBootstrapSnapshot>>;
  loadShell(): Promise<StorefrontBootstrapResult<StorefrontShellSnapshot>>;
}

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMerchant(value: unknown, locationId: string): value is MerchantApiResponse {
  if (!isObject(value) || !Array.isArray(value.locations)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    value.locations.filter(
      (location) => isObject(location) && location.id === locationId,
    ).length === 1
  );
}

function isLocation(value: unknown, locationId: string): value is StorefrontLocation {
  return (
    isObject(value) &&
    value.id === locationId &&
    typeof value.restaurantDisplayName === 'string' &&
    typeof value.addressString === 'string'
  );
}

function isMenuBundle(value: unknown): value is MenuBundle {
  return (
    isObject(value) &&
    Array.isArray(value.menus) &&
    Array.isArray(value.popularProducts)
  );
}

function isReadiness(value: unknown): value is OrderingReadinessResponse {
  return (
    isObject(value) &&
    typeof value.ready === 'boolean' &&
    typeof value.fulfillmentMethod === 'string'
  );
}

function isOrderTimes(value: unknown): value is OrderTimesResponse {
  return (
    isObject(value) &&
    Array.isArray(value.orderDays) &&
    typeof value.scheduleAllowed === 'boolean'
  );
}

export function createStorefrontBootstrapService(
  client: StorefrontBootstrapClient,
  merchantSlug: string,
  locationId: string,
): StorefrontBootstrapService {
  let shellSnapshot: StorefrontShellSnapshot | undefined;

  async function loadShell(): Promise<
    StorefrontBootstrapResult<StorefrontShellSnapshot>
  > {
    if (shellSnapshot) {
      return Object.freeze({ data: shellSnapshot, kind: 'ready' });
    }

    try {
      const merchant = await client.merchant.getBySlug(merchantSlug);
      if (!isMerchant(merchant, locationId)) {
        return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      }

      const location = await client.locations.getById(locationId);
      if (!isLocation(location, locationId)) {
        return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      }

      shellSnapshot = Object.freeze({ location, merchant });
      return Object.freeze({ data: shellSnapshot, kind: 'ready' });
    } catch (error) {
      return Object.freeze({ failure: mapStorefrontError(error), kind: 'failed' });
    }
  }

  return Object.freeze({
    async getOrderTimes(): Promise<StorefrontBootstrapResult<OrderTimesResponse>> {
      try {
        const orderTimes = await client.locations.getOrderTimes(locationId);
        return isOrderTimes(orderTimes)
          ? Object.freeze({ data: orderTimes, kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({ failure: mapStorefrontError(error), kind: 'failed' });
      }
    },
    async load(): Promise<StorefrontBootstrapResult<StorefrontBootstrapSnapshot>> {
      try {
        const shell = await loadShell();
        if (shell.kind === 'failed') return shell;

        const [menus, readiness] = await Promise.all([
          client.menus.list(locationId, { menuOnly: true }),
          client.locations.getOrderingReadiness(locationId, 'takeout'),
        ]);

        if (
          !isMenuBundle(menus) ||
          !isReadiness(readiness) ||
          readiness.fulfillmentMethod !== 'takeout'
        ) {
          return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
        }

        return Object.freeze({
          data: Object.freeze({
            location: shell.data.location,
            menus,
            merchant: shell.data.merchant,
            readiness,
          }),
          kind: 'ready',
        });
      } catch (error) {
        return Object.freeze({ failure: mapStorefrontError(error), kind: 'failed' });
      }
    },
    loadShell,
  });
}

import type {
  DistanceRequest,
  DistanceResponse,
  MerchantApiResponse,
  MerchantLocation,
  StorefrontLocation,
} from '@craveup/storefront-sdk';

import { mapStorefrontError, type StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import {
  toLocationPickerItems,
  toStoreDetailPresentation,
  type StoreDetailPresentationData,
} from './storefront-location-adapters.ts';
import type { LocationPickerItem } from './location-picker.ts';

export type LocationDirectoryClient = Readonly<{
  locations: Pick<StorefrontClient['locations'], 'distance' | 'getById'>;
  merchant: Pick<StorefrontClient['merchant'], 'getBySlug'>;
}>;

export type LocationDirectorySnapshot = Readonly<{
  distances: readonly DistanceResponse[];
  distanceFailure?: StorefrontFailure;
  items: readonly LocationPickerItem[];
  locations: readonly MerchantLocation[];
}>;

export type LocationDetailSnapshot = Readonly<{
  distance?: DistanceResponse;
  distanceFailure?: StorefrontFailure;
  location: StorefrontLocation;
  merchantLocation: MerchantLocation;
  presentation: StoreDetailPresentationData;
}>;

export type LocationDirectoryResult =
  | Readonly<{ data: LocationDirectorySnapshot; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export type LocationDetailResult =
  | Readonly<{ data: LocationDetailSnapshot; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export interface LocationDirectoryService {
  get(locationId: string, origin?: DistanceRequest): Promise<LocationDetailResult>;
  list(origin?: DistanceRequest): Promise<LocationDirectoryResult>;
}

type DistanceLoadResult = Readonly<{
  distance?: DistanceResponse;
  failure?: StorefrontFailure;
}>;

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

const INVALID_ORIGIN_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_DISTANCE_ORIGIN',
  kind: 'invalid_request',
  retryable: false,
});

const INVALID_LOCATION_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_LOCATION_ID',
  kind: 'invalid_request',
  retryable: false,
});

const LOCATION_NOT_FOUND_FAILURE: StorefrontFailure = Object.freeze({
  code: 'LOCATION_NOT_FOUND',
  kind: 'not_found',
  retryable: false,
});

const MAX_CONCURRENT_DISTANCE_REQUESTS = 4;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isDistanceOrigin(value: DistanceRequest): boolean {
  return (
    isCoordinate(value.lat, -90, 90) &&
    isCoordinate(value.lng, -180, 180) &&
    (value.unit === undefined || value.unit === 'miles' || value.unit === 'kilometers')
  );
}

function isMethodsStatus(value: unknown): value is MerchantLocation['methodsStatus'] {
  return (
    isObject(value) &&
    typeof value.pickup === 'boolean' &&
    typeof value.delivery === 'boolean' &&
    typeof value.table === 'boolean' &&
    typeof value.roomService === 'boolean'
  );
}

function isMerchantLocation(value: unknown): value is MerchantLocation {
  return (
    isObject(value) &&
    isNonemptyString(value.id) &&
    isNonemptyString(value.restaurantDisplayName) &&
    typeof value.coverPhoto === 'string' &&
    typeof value.restaurantLogo === 'string' &&
    isNonemptyString(value.addressString) &&
    typeof value.restaurantBio === 'string' &&
    (value.lat === null || isCoordinate(value.lat, -90, 90)) &&
    (value.lng === null || isCoordinate(value.lng, -180, 180)) &&
    isMethodsStatus(value.methodsStatus)
  );
}

export function getValidatedMerchantLocations(
  value: MerchantApiResponse,
): readonly MerchantLocation[] | undefined {
  if (!isObject(value) || !Array.isArray(value.locations) || value.locations.length > 500) {
    return undefined;
  }

  if (
    !isNonemptyString(value.id) ||
    !isNonemptyString(value.name) ||
    !isNonemptyString(value.country) ||
    !isNonemptyString(value.currency) ||
    typeof value.bio !== 'string' ||
    typeof value.logo !== 'string' ||
    typeof value.cover !== 'string' ||
    !value.locations.every(isMerchantLocation)
  ) {
    return undefined;
  }

  const ids = new Set(value.locations.map((location) => location.id));
  return ids.size === value.locations.length ? value.locations : undefined;
}

function isStorefrontLocation(
  value: unknown,
  merchantLocation: MerchantLocation,
  merchantSlug: string,
): value is StorefrontLocation {
  return (
    isObject(value) &&
    value.id === merchantLocation.id &&
    value.restaurantSlug === merchantSlug &&
    value.restaurantDisplayName === merchantLocation.restaurantDisplayName &&
    value.addressString === merchantLocation.addressString
  );
}

function isDistanceResponse(
  value: unknown,
  merchantLocation: MerchantLocation,
): value is DistanceResponse {
  if (
    !isObject(value) ||
    value.locationId !== merchantLocation.id ||
    !isObject(value.location) ||
    value.location.id !== merchantLocation.id ||
    value.location.restaurantDisplayName !== merchantLocation.restaurantDisplayName ||
    value.location.addressString !== merchantLocation.addressString ||
    !isObject(value.location.coordinates) ||
    !isCoordinate(value.location.coordinates.lat, -90, 90) ||
    !isCoordinate(value.location.coordinates.lng, -180, 180) ||
    !isObject(value.distance)
  ) {
    return false;
  }

  return (
    (value.distance.unit === 'miles' || value.distance.unit === 'kilometers') &&
    typeof value.distance.value === 'number' &&
    Number.isFinite(value.distance.value) &&
    value.distance.value >= 0 &&
    typeof value.distance.miles === 'number' &&
    Number.isFinite(value.distance.miles) &&
    value.distance.miles >= 0 &&
    typeof value.distance.kilometers === 'number' &&
    Number.isFinite(value.distance.kilometers) &&
    value.distance.kilometers >= 0
  );
}

async function loadDistance(
  client: LocationDirectoryClient,
  location: MerchantLocation,
  origin: DistanceRequest,
): Promise<DistanceLoadResult> {
  try {
    const distance = await client.locations.distance(location.id, origin);
    return isDistanceResponse(distance, location)
      ? Object.freeze({ distance })
      : Object.freeze({ failure: INVALID_RESPONSE_FAILURE });
  } catch (error) {
    return Object.freeze({ failure: mapStorefrontError(error) });
  }
}

async function loadDistances(
  client: LocationDirectoryClient,
  locations: readonly MerchantLocation[],
  origin: DistanceRequest,
): Promise<DistanceLoadResult[]> {
  const results: DistanceLoadResult[] = [];

  for (let index = 0; index < locations.length; index += MAX_CONCURRENT_DISTANCE_REQUESTS) {
    const batch = locations.slice(index, index + MAX_CONCURRENT_DISTANCE_REQUESTS);
    results.push(
      ...(await Promise.all(
        batch.map((location) => loadDistance(client, location, origin)),
      )),
    );
  }

  return results;
}

async function loadMerchantLocations(
  client: LocationDirectoryClient,
  merchantSlug: string,
): Promise<
  | Readonly<{ kind: 'ready'; locations: readonly MerchantLocation[] }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>
> {
  try {
    const merchant = await client.merchant.getBySlug(merchantSlug);
    const locations = getValidatedMerchantLocations(merchant);
    return locations
      ? Object.freeze({ kind: 'ready', locations })
      : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
  } catch (error) {
    return Object.freeze({ failure: mapStorefrontError(error), kind: 'failed' });
  }
}

export function createLocationDirectoryService(
  client: LocationDirectoryClient,
  merchantSlug: string,
): LocationDirectoryService {
  return Object.freeze({
    async get(locationId: string, origin?: DistanceRequest): Promise<LocationDetailResult> {
      if (!isNonemptyString(locationId)) {
        return Object.freeze({ failure: INVALID_LOCATION_FAILURE, kind: 'failed' });
      }
      if (origin && !isDistanceOrigin(origin)) {
        return Object.freeze({ failure: INVALID_ORIGIN_FAILURE, kind: 'failed' });
      }

      const directory = await loadMerchantLocations(client, merchantSlug);
      if (directory.kind === 'failed') return directory;

      const merchantLocation = directory.locations.find((location) => location.id === locationId);
      if (!merchantLocation) {
        return Object.freeze({ failure: LOCATION_NOT_FOUND_FAILURE, kind: 'failed' });
      }

      try {
        const noDistance: DistanceLoadResult = Object.freeze({});
        const [location, distanceResult] = await Promise.all([
          client.locations.getById(locationId),
          origin ? loadDistance(client, merchantLocation, origin) : Promise.resolve(noDistance),
        ]);

        if (
          !isObject(location) ||
          location.id !== merchantLocation.id ||
          location.restaurantSlug !== merchantSlug
        ) {
          return Object.freeze({ failure: LOCATION_NOT_FOUND_FAILURE, kind: 'failed' });
        }

        if (!isStorefrontLocation(location, merchantLocation, merchantSlug)) {
          return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
        }

        const presentation = toStoreDetailPresentation(
          location,
          merchantLocation,
          distanceResult.distance,
        );
        if (!presentation) {
          return Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
        }

        return Object.freeze({
          data: Object.freeze({
            ...(distanceResult.distance ? { distance: distanceResult.distance } : {}),
            ...(distanceResult.failure ? { distanceFailure: distanceResult.failure } : {}),
            location,
            merchantLocation,
            presentation,
          }),
          kind: 'ready',
        });
      } catch (error) {
        return Object.freeze({ failure: mapStorefrontError(error), kind: 'failed' });
      }
    },

    async list(origin?: DistanceRequest): Promise<LocationDirectoryResult> {
      if (origin && !isDistanceOrigin(origin)) {
        return Object.freeze({ failure: INVALID_ORIGIN_FAILURE, kind: 'failed' });
      }

      const directory = await loadMerchantLocations(client, merchantSlug);
      if (directory.kind === 'failed') return directory;

      const distanceResults = origin
        ? await loadDistances(client, directory.locations, origin)
        : [];
      const distances = distanceResults.flatMap((result) =>
        result.distance ? [result.distance] : [],
      );
      const distanceFailure = distanceResults.find((result) => result.failure)?.failure;

      return Object.freeze({
        data: Object.freeze({
          distances,
          ...(distanceFailure ? { distanceFailure } : {}),
          items: toLocationPickerItems(directory.locations, distances),
          locations: directory.locations,
        }),
        kind: 'ready',
      });
    },
  });
}

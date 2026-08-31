import type { DistanceRequest } from '@craveup/storefront-sdk';

import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type {
  LocationDetailResult,
  LocationDirectoryService,
} from './location-directory-service.ts';

export type StoreMapCoordinate = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type RestrictedNativeMapKeys = Readonly<{
  androidApiKey?: string;
  iosApiKey?: string;
}>;

export function hasRestrictedNativeMapKey(
  platform: string,
  maps: RestrictedNativeMapKeys,
): boolean {
  if (platform === 'android') return Boolean(maps.androidApiKey);
  if (platform === 'ios') return Boolean(maps.iosApiKey);
  return false;
}

export async function loadStoreDetailProgressively(
  directory: Pick<LocationDirectoryService, 'get'>,
  locationId: string,
  getOrigin: () => Promise<DistanceRequest | undefined>,
  publish: (result: LocationDetailResult) => void,
): Promise<void> {
  const initial = await directory.get(locationId);
  publish(initial);
  if (initial.kind !== 'ready') return;

  try {
    const origin = await getOrigin();
    if (!origin) return;

    const enriched = await directory.get(locationId, origin);
    if (enriched.kind === 'ready') publish(enriched);
  } catch {
    // Distance is optional; the already-published detail stays usable.
  }
}

export function isConfiguredOrderingLocation(
  locationId: string,
  configuredLocationId: string,
): boolean {
  return locationId === configuredLocationId;
}

export function createStoreDirectionsUrl(
  coordinate: StoreMapCoordinate,
): string | undefined {
  if (
    !Number.isFinite(coordinate.latitude) ||
    coordinate.latitude < -90 ||
    coordinate.latitude > 90 ||
    !Number.isFinite(coordinate.longitude) ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {
    return undefined;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${coordinate.latitude},${coordinate.longitude}`;
}

export function getStoreDetailFailureMessage(
  failure: StorefrontFailure,
): string {
  if (failure.kind === 'not_found') return 'This store is unavailable.';
  if (failure.kind === 'timeout' || failure.kind === 'unavailable') {
    return 'We could not load this store. Check your connection and try again.';
  }
  return 'We could not load this store. Try again.';
}

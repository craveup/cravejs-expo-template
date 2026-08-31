import type { DistanceRequest } from '@craveup/storefront-sdk';

export type DeviceCoordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

export function toDistanceOrigin(
  coordinates: DeviceCoordinates,
): DistanceRequest | undefined {
  if (
    !Number.isFinite(coordinates.latitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    return undefined;
  }

  return Object.freeze({
    lat: coordinates.latitude,
    lng: coordinates.longitude,
  });
}

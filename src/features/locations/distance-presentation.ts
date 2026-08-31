import type { DistanceResponse } from '@craveup/storefront-sdk';

type DistanceMeasurement = DistanceResponse['distance'];

const distanceUnitLabels: Record<DistanceMeasurement['unit'], string> = {
  kilometers: 'km',
  miles: 'mi',
};

export function formatDistanceLabel(distance: DistanceMeasurement): string | undefined {
  if (!Number.isFinite(distance.value) || distance.value < 0) return undefined;

  const roundedValue = Math.round(distance.value * 10) / 10;
  return `${roundedValue} ${distanceUnitLabels[distance.unit]}`;
}

export function getDistanceLabelForLocation(
  locationId: string,
  response?: DistanceResponse,
): string | undefined {
  if (
    !response ||
    response.locationId !== locationId ||
    response.location.id !== locationId
  ) {
    return undefined;
  }

  return formatDistanceLabel(response.distance);
}

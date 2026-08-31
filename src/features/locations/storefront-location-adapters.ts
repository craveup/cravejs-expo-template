import type {
  DistanceResponse,
  MerchantLocation,
  StorefrontLocation,
} from '@craveup/storefront-sdk';

import type { LocationPickerItem } from './location-picker.ts';
import { getDistanceLabelForLocation } from './distance-presentation.ts';

export type StoreDetailPresentationData = {
  address: string;
  distanceLabel?: string;
  fulfillmentMethodLabels: readonly string[];
  name: string;
};

type LocationPickerCandidate = {
  item: LocationPickerItem;
  originalIndex: number;
  sortDistanceMiles?: number;
};

function getMatchingDistance(
  locationId: string,
  distances: readonly DistanceResponse[],
): DistanceResponse | undefined {
  const matches = distances.filter(
    (response) => response.locationId === locationId && response.location.id === locationId,
  );

  return matches.length === 1 ? matches[0] : undefined;
}

function toLocationPickerCandidate(
  location: MerchantLocation,
  distances: readonly DistanceResponse[],
  originalIndex: number,
): LocationPickerCandidate {
  const distance = getMatchingDistance(location.id, distances);
  const sortDistanceMiles = distance?.distance.miles;

  return {
    item: toLocationPickerItem(location, distance),
    originalIndex,
    sortDistanceMiles:
      Number.isFinite(sortDistanceMiles) && Number(sortDistanceMiles) >= 0
        ? sortDistanceMiles
        : undefined,
  };
}

export function getOrderingFulfillmentMethodLabels(
  methodsStatus: MerchantLocation['methodsStatus'],
): string[] {
  const labels: string[] = [];
  if (methodsStatus.pickup) labels.push('Pickup');
  if (methodsStatus.delivery) labels.push('Delivery');
  return labels;
}

export function toLocationPickerItem(
  location: MerchantLocation,
  distance?: DistanceResponse,
): LocationPickerItem {
  return {
    address: location.addressString,
    distanceLabel: getDistanceLabelForLocation(location.id, distance),
    id: location.id,
    name: location.restaurantDisplayName,
  };
}

export function toLocationPickerItems(
  locations: readonly MerchantLocation[],
  distances: readonly DistanceResponse[],
): LocationPickerItem[] {
  return locations
    .map((location, index) => toLocationPickerCandidate(location, distances, index))
    .sort((left, right) => {
      if (left.sortDistanceMiles === undefined) {
        return right.sortDistanceMiles === undefined
          ? left.originalIndex - right.originalIndex
          : 1;
      }
      if (right.sortDistanceMiles === undefined) return -1;
      return (
        left.sortDistanceMiles - right.sortDistanceMiles || left.originalIndex - right.originalIndex
      );
    })
    .map(({ item }) => item);
}

export function toStoreDetailPresentation(
  location: StorefrontLocation,
  merchantLocation?: MerchantLocation,
  distance?: DistanceResponse,
): StoreDetailPresentationData | undefined {
  if (!merchantLocation || merchantLocation.id !== location.id) return undefined;

  return {
    address: merchantLocation.addressString,
    distanceLabel: getDistanceLabelForLocation(location.id, distance),
    fulfillmentMethodLabels: getOrderingFulfillmentMethodLabels(merchantLocation.methodsStatus),
    name: merchantLocation.restaurantDisplayName,
  };
}

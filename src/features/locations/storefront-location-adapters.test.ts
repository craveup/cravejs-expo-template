import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type {
  DistanceResponse,
  MerchantLocation,
  StorefrontLocation,
} from '@craveup/storefront-sdk';

import {
  getOrderingFulfillmentMethodLabels,
  toLocationPickerItem,
  toLocationPickerItems,
  toStoreDetailPresentation,
} from './storefront-location-adapters.ts';

const merchantLocation: MerchantLocation = {
  addressString: '1260 3rd Street Promenade',
  coverPhoto: '',
  id: 'santa-monica',
  lat: 34.017,
  lng: -118.499,
  methodsStatus: { delivery: true, pickup: true, roomService: true, table: true },
  restaurantBio: '',
  restaurantDisplayName: 'Santa Monica',
  restaurantLogo: '',
};

const detailLocation: StorefrontLocation = {
  addressData: {
    city: 'Santa Monica',
    country: 'US',
    lat: 34.017,
    lng: -118.499,
    state: 'CA',
    street: '1260 3rd Street Promenade',
    zipCode: '90401',
  },
  addressString: merchantLocation.addressString,
  coverPhoto: '',
  id: merchantLocation.id,
  restaurantBio: '',
  restaurantDisplayName: merchantLocation.restaurantDisplayName,
  restaurantLogo: '',
  restaurantSlug: 'santa-monica',
};

const distance: DistanceResponse = {
  distance: { kilometers: 0.64, miles: 0.4, unit: 'miles', value: 0.4 },
  location: {
    addressString: merchantLocation.addressString,
    coordinates: { lat: 34.017, lng: -118.499 },
    id: merchantLocation.id,
    restaurantDisplayName: merchantLocation.restaurantDisplayName,
  },
  locationId: merchantLocation.id,
};

test('merchant locations become picker items without changing supplied copy', () => {
  assert.deepEqual(toLocationPickerItem(merchantLocation, distance), {
    address: '1260 3rd Street Promenade',
    distanceLabel: '0.4 mi',
    id: 'santa-monica',
    name: 'Santa Monica',
  });

  assert.equal(
    toLocationPickerItem(merchantLocation, { ...distance, locationId: 'sawtelle' })
      .distanceLabel,
    undefined,
  );
});

test('picker items are ordered by validated server distance with unknown distances last', () => {
  const sawtelle: MerchantLocation = {
    ...merchantLocation,
    addressString: '2130 Sawtelle Boulevard',
    id: 'sawtelle',
    restaurantDisplayName: 'Sawtelle',
  };
  const arcadia: MerchantLocation = {
    ...merchantLocation,
    addressString: '1220 South Golden West Avenue',
    id: 'arcadia',
    restaurantDisplayName: 'Arcadia',
  };
  const sawtelleDistance: DistanceResponse = {
    ...distance,
    distance: { ...distance.distance, kilometers: 4.99, miles: 3.1, value: 3.1 },
    location: {
      ...distance.location,
      addressString: sawtelle.addressString,
      id: sawtelle.id,
      restaurantDisplayName: sawtelle.restaurantDisplayName,
    },
    locationId: sawtelle.id,
  };

  assert.deepEqual(
    toLocationPickerItems(
      [arcadia, sawtelle, merchantLocation],
      [sawtelleDistance, distance],
    ).map((item) => item.id),
    ['santa-monica', 'sawtelle', 'arcadia'],
  );
});

test('store details expose only pickup and delivery in stable order', () => {
  assert.deepEqual(getOrderingFulfillmentMethodLabels(merchantLocation.methodsStatus), [
    'Pickup',
    'Delivery',
  ]);
  assert.deepEqual(toStoreDetailPresentation(detailLocation, merchantLocation, distance), {
    address: merchantLocation.addressString,
    distanceLabel: '0.4 mi',
    fulfillmentMethodLabels: ['Pickup', 'Delivery'],
    name: merchantLocation.restaurantDisplayName,
  });
  assert.equal(
    toStoreDetailPresentation(detailLocation, { ...merchantLocation, id: 'sawtelle' }),
    undefined,
  );
  assert.equal(toStoreDetailPresentation(detailLocation), undefined);
});

test('location adapters contain no client-owned nearest-store decision', () => {
  const source = readFileSync(
    new URL('./storefront-location-adapters.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /NearestStorePresentation|toNearestStorePresentation|nearbyThreshold|distanceThreshold|haversine/i,
  );
});

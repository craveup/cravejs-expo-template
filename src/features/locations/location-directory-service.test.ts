import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { MerchantApiResponse } from '@craveup/storefront-sdk';

import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import {
  createLocationDirectoryService,
  type LocationDirectoryClient,
} from './location-directory-service.ts';

const fixture = createCanonicalStorefrontFixture();

function client(
  overrides: Partial<{
    distance: LocationDirectoryClient['locations']['distance'];
    getById: LocationDirectoryClient['locations']['getById'];
    getBySlug: LocationDirectoryClient['merchant']['getBySlug'];
  }> = {},
): LocationDirectoryClient {
  return {
    locations: {
      distance: overrides.distance ?? (async () => fixture.distances[0]!),
      getById: overrides.getById ?? (async () => fixture.location),
    },
    merchant: {
      getBySlug: overrides.getBySlug ?? (async () => fixture.merchant),
    },
  };
}

test('lists merchant locations and orders presentation by validated server distance', async () => {
  const second = {
    ...fixture.merchant.locations[0]!,
    addressString: '200 Example Avenue, Sample City',
    id: 'fedcba9876543210fedcba98',
    restaurantDisplayName: 'Second Fixture Merchant',
  };
  const merchant: MerchantApiResponse = {
    ...fixture.merchant,
    locations: [second, fixture.merchant.locations[0]!],
  };
  const calls: unknown[] = [];
  const service = createLocationDirectoryService(
    client({
      async distance(locationId, origin) {
        calls.push(['distance', locationId, origin]);
        const merchantLocation = merchant.locations.find((location) => location.id === locationId)!;
        const miles = locationId === second.id ? 3.1 : 0.4;
        return {
          distance: {
            kilometers: miles * 1.60934,
            miles,
            unit: 'miles',
            value: miles,
          },
          location: {
            addressString: merchantLocation.addressString,
            coordinates: { lat: 34.017, lng: -118.499 },
            id: locationId,
            restaurantDisplayName: merchantLocation.restaurantDisplayName,
          },
          locationId,
        };
      },
      async getBySlug(slug) {
        calls.push(['merchant', slug]);
        return merchant;
      },
    }),
    fixture.scope.merchantSlug,
  );

  const result = await service.list({ lat: 34, lng: -118, unit: 'miles' });

  assert.equal(result.kind, 'ready');
  assert.deepEqual(
    result.kind === 'ready' ? result.data.items.map((item) => item.id) : [],
    [fixture.scope.locationId, second.id],
  );
  assert.deepEqual(calls, [
    ['merchant', fixture.scope.merchantSlug],
    ['distance', second.id, { lat: 34, lng: -118, unit: 'miles' }],
    ['distance', fixture.scope.locationId, { lat: 34, lng: -118, unit: 'miles' }],
  ]);
});

test('keeps locations usable when an optional distance request fails', async () => {
  const result = await createLocationDirectoryService(
    client({
      async distance() {
        throw { body: { private: 'hidden' }, status: 503 };
      },
    }),
    fixture.scope.merchantSlug,
  ).list({ lat: 34, lng: -118 });

  assert.equal(result.kind, 'ready');
  assert.equal(result.kind === 'ready' ? result.data.locations.length : 0, 1);
  assert.equal(result.kind === 'ready' ? result.data.distances.length : 1, 0);
  assert.equal(result.kind === 'ready' ? result.data.distanceFailure?.kind : undefined, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /private|hidden/);
});

test('loads a merchant-owned detail and keeps distance failure non-fatal', async () => {
  const result = await createLocationDirectoryService(
    client({
      async distance() {
        throw { status: 429 };
      },
    }),
    fixture.scope.merchantSlug,
  ).get(fixture.scope.locationId, { lat: 34, lng: -118 });

  assert.equal(result.kind, 'ready');
  assert.equal(
    result.kind === 'ready' ? result.data.presentation.name : undefined,
    fixture.merchant.locations[0]!.restaurantDisplayName,
  );
  assert.equal(result.kind === 'ready' ? result.data.distanceFailure?.kind : undefined, 'rate_limited');
});

test('fails closed for invalid coordinates, duplicate locations, and cross-merchant details', async () => {
  let calls = 0;
  const invalidOrigin = await createLocationDirectoryService(
    client({
      async getBySlug() {
        calls += 1;
        return fixture.merchant;
      },
    }),
    fixture.scope.merchantSlug,
  ).list({ lat: Number.NaN, lng: -118 });
  assert.equal(invalidOrigin.kind, 'failed');
  assert.equal(calls, 0);

  const duplicate = await createLocationDirectoryService(
    client({
      async getBySlug() {
        return {
          ...fixture.merchant,
          locations: [fixture.merchant.locations[0]!, fixture.merchant.locations[0]!],
        };
      },
    }),
    fixture.scope.merchantSlug,
  ).list();
  assert.equal(duplicate.kind, 'failed');

  const crossMerchant = await createLocationDirectoryService(
    client(),
    fixture.scope.merchantSlug,
  ).get('fedcba9876543210fedcba98');
  assert.equal(crossMerchant.kind, 'failed');
  assert.deepEqual(
    crossMerchant.kind === 'failed' ? crossMerchant.failure : undefined,
    {
      code: 'LOCATION_NOT_FOUND',
      kind: 'not_found',
      retryable: false,
    },
  );
});

test('rejects mismatched distance and detail identities without losing valid directory data', async () => {
  const mismatchedDistance = await createLocationDirectoryService(
    client({
      async distance() {
        return { ...fixture.distances[0]!, locationId: 'fedcba9876543210fedcba98' };
      },
    }),
    fixture.scope.merchantSlug,
  ).list({ lat: 34, lng: -118 });
  assert.equal(mismatchedDistance.kind, 'ready');
  assert.equal(
    mismatchedDistance.kind === 'ready' ? mismatchedDistance.data.distanceFailure?.code : undefined,
    'INVALID_STOREFRONT_RESPONSE',
  );

  const mismatchedDetail = await createLocationDirectoryService(
    client({
      async getById() {
        return { ...fixture.location, id: 'fedcba9876543210fedcba98' };
      },
    }),
    fixture.scope.merchantSlug,
  ).get(fixture.scope.locationId);
  assert.equal(mismatchedDetail.kind, 'failed');

  const crossMerchantDetail = await createLocationDirectoryService(
    client({
      async getById() {
        return { ...fixture.location, restaurantSlug: 'another-merchant' };
      },
    }),
    fixture.scope.merchantSlug,
  ).get(fixture.scope.locationId);
  assert.equal(crossMerchantDetail.kind, 'failed');
  assert.equal(
    crossMerchantDetail.kind === 'failed' ? crossMerchantDetail.failure.code : undefined,
    'LOCATION_NOT_FOUND',
  );
  assert.equal(
    crossMerchantDetail.kind === 'failed' ? crossMerchantDetail.failure.kind : undefined,
    'not_found',
  );
});

test('reports invalid location and distance inputs without making Storefront requests', async () => {
  let calls = 0;
  const service = createLocationDirectoryService(
    client({
      async getBySlug() {
        calls += 1;
        return fixture.merchant;
      },
    }),
    fixture.scope.merchantSlug,
  );

  const invalidLocation = await service.get('');
  const invalidOrigin = await service.get(fixture.scope.locationId, {
    lat: Number.NaN,
    lng: -118,
  });

  assert.equal(
    invalidLocation.kind === 'failed' ? invalidLocation.failure.code : undefined,
    'INVALID_LOCATION_ID',
  );
  assert.equal(
    invalidOrigin.kind === 'failed' ? invalidOrigin.failure.code : undefined,
    'INVALID_DISTANCE_ORIGIN',
  );
  assert.equal(calls, 0);
});

test('bounds concurrent distance requests for large merchant directories', async () => {
  const locations = Array.from({ length: 12 }, (_, index) => ({
    ...fixture.merchant.locations[0]!,
    addressString: `${index} Example Avenue, Sample City`,
    id: `location_${index}`,
    restaurantDisplayName: `Fixture Merchant ${index}`,
  }));
  let active = 0;
  let maximumActive = 0;

  const result = await createLocationDirectoryService(
    client({
      async distance(locationId) {
        const location = locations.find((candidate) => candidate.id === locationId)!;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => setImmediate(resolve));
        active -= 1;
        return {
          distance: {
            kilometers: 0.64,
            miles: 0.4,
            unit: 'miles',
            value: 0.4,
          },
          location: {
            addressString: location.addressString,
            coordinates: { lat: 34.017, lng: -118.499 },
            id: location.id,
            restaurantDisplayName: location.restaurantDisplayName,
          },
          locationId: location.id,
        };
      },
      async getBySlug() {
        return { ...fixture.merchant, locations };
      },
    }),
    fixture.scope.merchantSlug,
  ).list({ lat: 34, lng: -118 });

  assert.equal(result.kind, 'ready');
  assert.equal(result.kind === 'ready' ? result.data.distances.length : 0, locations.length);
  assert.ok(maximumActive > 1);
  assert.ok(maximumActive <= 4, `expected at most 4 concurrent requests, got ${maximumActive}`);
});

test('location service has no distance math, threshold, persistence, logging, or direct transport', () => {
  const source = readFileSync(new URL('./location-directory-service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|haversine|nearbyThreshold|serviceability|open(?:ing)?Status|expo-secure-store|AsyncStorage|console\.|process\.env/,
  );
  assert.match(source, /import type \{ StorefrontClient \}/);
  assert.match(source, /toLocationPickerItems/);
  assert.match(source, /toStoreDetailPresentation/);
  assert.doesNotMatch(source, /nearestStore|toNearestStorePresentation/);
});

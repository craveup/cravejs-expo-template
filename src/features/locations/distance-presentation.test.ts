import assert from 'node:assert/strict';
import test from 'node:test';

import type { DistanceResponse } from '@craveup/storefront-sdk';

import { formatDistanceLabel, getDistanceLabelForLocation } from './distance-presentation.ts';

function distanceResponse(
  value: number,
  unit: DistanceResponse['distance']['unit'] = 'miles',
): DistanceResponse {
  return {
    distance: {
      kilometers: unit === 'kilometers' ? value : value * 1.60934,
      miles: unit === 'miles' ? value : value / 1.60934,
      unit,
      value,
    },
    location: {
      addressString: '1260 3rd Street Promenade',
      coordinates: { lat: 34.017, lng: -118.499 },
      id: 'santa-monica',
      restaurantDisplayName: 'Santa Monica',
    },
    locationId: 'santa-monica',
  };
}

test('distance labels use the supplied value and unit with at most one decimal', () => {
  assert.equal(formatDistanceLabel(distanceResponse(0.4).distance), '0.4 mi');
  assert.equal(formatDistanceLabel(distanceResponse(3.1).distance), '3.1 mi');
  assert.equal(formatDistanceLabel(distanceResponse(18).distance), '18 mi');
  assert.equal(formatDistanceLabel(distanceResponse(2.46, 'kilometers').distance), '2.5 km');
});

test('distance labels fail closed for invalid display values', () => {
  assert.equal(formatDistanceLabel(distanceResponse(-1).distance), undefined);
  assert.equal(formatDistanceLabel(distanceResponse(Number.NaN).distance), undefined);
  assert.equal(formatDistanceLabel(distanceResponse(Number.POSITIVE_INFINITY).distance), undefined);
});

test('a distance is attached only to its matching location', () => {
  const response = distanceResponse(0.4);
  assert.equal(getDistanceLabelForLocation('santa-monica', response), '0.4 mi');
  assert.equal(getDistanceLabelForLocation('sawtelle', response), undefined);
  assert.equal(getDistanceLabelForLocation('santa-monica'), undefined);

  const mismatchedNestedLocation = {
    ...response,
    location: { ...response.location, id: 'sawtelle' },
  };
  assert.equal(getDistanceLabelForLocation('santa-monica', mismatchedNestedLocation), undefined);
});

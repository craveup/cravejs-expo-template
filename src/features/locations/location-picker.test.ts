import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  filterLocations,
  getLocationPickerSectionLabel,
  getLocationPickerState,
  type LocationPickerItem,
} from './location-picker.ts';

const locations: LocationPickerItem[] = [
  { id: 'one', name: 'Shoreditch', address: '12 Redchurch Street', distanceLabel: '0.8 mi' },
  { id: 'two', name: 'Soho', address: '8 Greek Street', distanceLabel: '1.4 mi' },
];

test('location search matches name or address without altering supplied results', () => {
  assert.deepEqual(filterLocations(locations, 'shore'), [locations[0]]);
  assert.deepEqual(filterLocations(locations, 'Greek'), [locations[1]]);
  assert.deepEqual(filterLocations(locations, ''), locations);
});

test('location picker chooses loading, error, empty, and result presentation states', () => {
  assert.equal(getLocationPickerState(2, true), 'loading');
  assert.equal(getLocationPickerState(2, false, 'Unavailable'), 'error');
  assert.equal(getLocationPickerState(0, false), 'empty');
  assert.equal(getLocationPickerState(2, false), 'results');
});

test('location picker calls results nearest only when server distance is available', () => {
  assert.equal(getLocationPickerSectionLabel(locations), 'NEAREST TO YOU');
  assert.equal(
    getLocationPickerSectionLabel([
      locations[0],
      { id: 'three', name: 'Camden', address: '24 Parkway' },
    ]),
    'PICKUP LOCATIONS',
  );
  assert.equal(
    getLocationPickerSectionLabel(
      locations.map(({ distanceLabel: _distanceLabel, ...location }) => location),
    ),
    'PICKUP LOCATIONS',
  );
});

test('location presentation has no client-owned nearby or unsupported store claims', () => {
  const source = readFileSync(new URL('./LocationPickerScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ready in|open until|nearby threshold|haversine/i);
  assert.match(source, /distanceLabel/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /Where are you picking up\?/);
  assert.match(source, /variant="heading">Where are you picking up\?/);
  assert.match(source, /Search by address or store/);
  assert.match(source, /getLocationPickerSectionLabel\(filteredLocations\)/);
  assert.match(source, /SELECTED/);
  assert.match(source, /bordered=\{false\}/);
  assert.match(source, /paddingVertical: spacing\['2xl'\]/);
  assert.match(source, /MerchantLocationHeader/);
  assert.match(source, /merchantHeaderState/);
  assert.match(source, /background="contentCanvas"/);
  assert.match(source, /minHeight: sizes\.minimumTouchTarget/);
  assert.doesNotMatch(source, /minHeight: 52/);
});

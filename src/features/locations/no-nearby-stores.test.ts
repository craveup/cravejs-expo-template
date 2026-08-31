import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getNoPublishedLocationsSupportingCopy,
  getNoPublishedLocationsTitle,
} from './no-nearby-stores.ts';

test('zero published locations use reduced copy without inventing a nearest store', () => {
  assert.equal(getNoPublishedLocationsTitle(), 'No pickup shops available');
  assert.equal(
    getNoPublishedLocationsSupportingCopy(),
    'There are no pickup shops available right now. You can still browse the menu.',
  );
});

test('no-nearby presentation does not calculate proximity or claim unsupported behavior', () => {
  const source = readFileSync(new URL('./NoNearbyStoresScreen.tsx', import.meta.url), 'utf8');
  const helperSource = readFileSync(new URL('./no-nearby-stores.ts', import.meta.url), 'utf8');
  assert.match(source, /getNoPublishedLocationsTitle\(\)/);
  assert.match(source, /Browse the menu anyway/);
  assert.doesNotMatch(source, /Browse the menu anyway\./);
  assert.doesNotMatch(
    `${source}\n${helperSource}`,
    /near you|nearestStore|NEAREST STORE|closest shop|open until|tell me when|notification|nearbyThreshold|distanceThreshold|haversine/i,
  );
  assert.match(source, /backgroundColor: colors\.imageSurface/);
  assert.match(source, /maxWidth: 290/);
  assert.match(source, /height: spacing\['7xl'\] \* 4 \+ spacing\.md/);
});

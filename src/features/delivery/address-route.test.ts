import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  requiresForegroundPermissionForGeocoding,
  toAddressCandidate,
  toLocationPermissionPresentation,
} from './address-candidate-contract.ts';
import { getAddressGeocoderErrorMessage } from './address-route.ts';

const nativeAddress = {
  city: 'Santa Monica',
  country: 'United States',
  district: null,
  formattedAddress: '123 Main Street, Santa Monica, CA 90401',
  isoCountryCode: 'US',
  name: '123 Main Street',
  postalCode: '90401',
  region: 'CA',
  street: 'Main Street',
  streetNumber: '123',
  subregion: 'Los Angeles County',
};

test('native geocoding creates separate customer and cart address contracts', () => {
  assert.deepEqual(
    toAddressCandidate(
      'address-1',
      { latitude: 34.0195, longitude: -118.4912 },
      nativeAddress,
    ),
    {
      cartAddress: {
        city: 'Santa Monica',
        country: 'United States',
        lat: 34.0195,
        lng: -118.4912,
        state: 'CA',
        street: '123 Main Street',
        zipCode: '90401',
      },
      customerAddressInput: {
        fullAddress: '123 Main Street, Santa Monica, CA 90401',
        lat: 34.0195,
        line1: '123 Main Street',
        line2: 'Los Angeles County',
        lng: -118.4912,
      },
      id: 'address-1',
      primaryLabel: '123 Main Street',
      secondaryLabel: 'Santa Monica, CA 90401',
    },
  );
});

test('incomplete, unsupported-country, and invalid-coordinate candidates fail closed', () => {
  assert.equal(
    toAddressCandidate(
      'address-1',
      { latitude: 34.0195, longitude: -118.4912 },
      { ...nativeAddress, postalCode: null },
    ),
    undefined,
  );
  assert.equal(
    toAddressCandidate(
      'address-1',
      { latitude: 34.0195, longitude: -118.4912 },
      { ...nativeAddress, country: 'Canada', isoCountryCode: 'CA' },
    ),
    undefined,
  );
  assert.equal(
    toAddressCandidate(
      'address-1',
      { latitude: Number.NaN, longitude: -118.4912 },
      nativeAddress,
    ),
    undefined,
  );
});

test('permission states remain explicit and geocoder errors use fixed copy', () => {
  assert.equal(toLocationPermissionPresentation('granted', true), 'granted');
  assert.equal(toLocationPermissionPresentation('undetermined', true), 'prompt');
  assert.equal(toLocationPermissionPresentation('denied', false), 'denied');
  assert.equal(
    getAddressGeocoderErrorMessage({
      kind: 'permission_denied',
      permission: 'denied',
    }),
    'Location permission is needed to find address candidates.',
  );
});

test('manual geocoding requests foreground permission only where the native API requires it', () => {
  assert.equal(requiresForegroundPermissionForGeocoding('android'), true);
  assert.equal(requiresForegroundPermissionForGeocoding('ios'), false);
  assert.equal(requiresForegroundPermissionForGeocoding('web'), false);
});

test('address route never claims serviceability or mutates customer/cart state', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/delivery/address.tsx', import.meta.url),
    'utf8',
  );
  const provider = readFileSync(
    new URL('./native-address-geocoder.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    `${route}\n${provider}`,
    /deliverable|serviceable|serviceability|setDelivery|createAddress|updateAddress|cart\.|customer\.|console\.|\bfetch\s*\(/i,
  );
  assert.doesNotMatch(provider, /googleapis\.com|maps\.google|apiKey|process\.env/i);
});

test('address candidate entry stays available without enabling delivery ordering', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/delivery/address.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /useMerchantLocationHeader/);
  assert.doesNotMatch(route, /brandConfig\.capabilities\.delivery|<Redirect/);
  assert.doesNotMatch(route, /setDelivery|cart\.|serviceable|deliverable/i);
});

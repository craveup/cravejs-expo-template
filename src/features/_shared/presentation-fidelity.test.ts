import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screenSources = [
  '../account/AccountHomeScreen.tsx',
  '../auth/OtpScreen.tsx',
  '../auth/SignInScreen.tsx',
  '../delivery/DeliveryAddressScreen.tsx',
  '../fulfillment/FulfillmentChoiceScreen.tsx',
  '../fulfillment/StoreClosedScreen.tsx',
  '../locations/LocationPickerScreen.tsx',
  '../locations/NoNearbyStoresScreen.tsx',
  '../locations/StoreDetailScreen.tsx',
  '../schedule/PickupScheduleScreen.tsx',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('fulfillment presentations use reviewed canvas tokens instead of raw colors', () => {
  for (const source of screenSources) {
    assert.doesNotMatch(source, /#[\dA-F]{6}/i);
    assert.match(source, /colors\.canvas|background="contentCanvas"/);
  }
});

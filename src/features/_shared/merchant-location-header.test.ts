import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import { toMerchantLocationHeaderState } from './merchant-location-header.ts';

test('merchant chrome projects only validated public merchant and location fields', () => {
  const fixture = createCanonicalStorefrontFixture();

  assert.deepEqual(
    toMerchantLocationHeaderState({
      location: fixture.location,
      merchant: fixture.merchant,
    }),
    {
      locationAddress: fixture.location.addressString,
      locationName: fixture.location.restaurantDisplayName,
      merchantName: fixture.merchant.name,
      status: 'ready',
    },
  );
});

test('merchant chrome fails closed for malformed labels and unsafe images', () => {
  const fixture = createCanonicalStorefrontFixture();

  assert.deepEqual(
    toMerchantLocationHeaderState({
      location: { ...fixture.location, addressString: ' ' },
      merchant: fixture.merchant,
    }),
    { status: 'unavailable' },
  );
  assert.deepEqual(
    toMerchantLocationHeaderState({
      location: fixture.location,
      merchant: { ...fixture.merchant, logo: 'http://unsafe.example/logo.svg' },
    }),
    { status: 'unavailable' },
  );
});

test('the six reduced member screens render shared merchant chrome', () => {
  const screens = [
    '../account/AccountHomeScreen.tsx',
    '../order-status/OrderStatusPresentation.tsx',
    '../orders/OrderHistoryPresentation.tsx',
    '../rewards/PointsHistoryPresentation.tsx',
    '../rewards/RewardRedemptionPresentation.tsx',
    '../favourites/FavouritesPresentation.tsx',
  ];

  for (const path of screens) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /MerchantLocationHeader/);
    assert.match(source, /merchantHeaderState/);
  }
});

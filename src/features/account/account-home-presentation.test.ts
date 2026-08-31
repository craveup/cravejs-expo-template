import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  toAccountLoyaltyPresentation,
  toAccountProfilePresentation,
  toSavedStorePresentation,
} from './account-home-presentation.ts';

const profile = {
  customerEmail: 'tea@example.com',
  customerName: 'Ada',
  id: 'customer_fixture_123',
  lastName: 'Lovelace',
  phoneNumber: '+15550124567',
  profilePicture: '',
};

test('account profile maps only supported customer identity fields', () => {
  assert.deepEqual(toAccountProfilePresentation(profile), {
    displayName: 'Ada Lovelace',
    email: 'tea@example.com',
    phone: '+15550124567',
  });
  assert.deepEqual(
    toAccountProfilePresentation({
      ...profile,
      customerEmail: null,
      customerName: '',
      lastName: '',
      phoneNumber: null,
    }),
    {},
  );
});

test('account loyalty uses only a validated points balance', () => {
  assert.deepEqual(
    toAccountLoyaltyPresentation({
      balances: [
        {
          asOf: '2026-08-11T00:00:00Z',
          available: 120,
          label: 'points',
          posted: 120,
          reserved: 0,
          unit: 'points',
        },
      ],
      enabled: true,
    }),
    { balanceLabel: '120 points' },
  );
  assert.equal(toAccountLoyaltyPresentation({ enabled: false }), undefined);
  assert.equal(
    toAccountLoyaltyPresentation({
      balances: [
        {
          asOf: '2026-08-11T00:00:00Z',
          available: 12,
          posted: 12,
          reserved: 0,
          unit: 'stamps',
        },
      ],
      enabled: true,
    }),
    undefined,
  );
});

test('selected merchant location becomes the saved-store summary unchanged', () => {
  assert.deepEqual(
    toSavedStorePresentation({
      addressString: '8 Greek Street, London',
      coverPhoto: '',
      id: 'location_fixture_123',
      lat: 51.513,
      lng: -0.133,
      methodsStatus: {
        delivery: true,
        pickup: true,
        roomService: false,
        table: false,
      },
      restaurantBio: '',
      restaurantDisplayName: 'Soho',
      restaurantLogo: '',
    }),
    {
      address: '8 Greek Street, London',
      name: 'Soho',
    },
  );
});

test('account adapter cannot introduce unsupported account claims or runtime work', () => {
  const source = readFileSync(
    new URL('./account-home-presentation.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /tier|totalOrders|notificationStatus|cardSummary|expo-router|SecureStore|process\.env|\bfetch\s*\(|getStorefrontRuntime|console\./i,
  );
});

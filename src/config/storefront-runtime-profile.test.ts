import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { brandConfig } from './brand.config.ts';
import type { BrandConfig } from './brand.types.ts';
import {
  StorefrontRuntimeProfileError,
  parseStorefrontRuntimeProfile,
  type StorefrontRuntimeProfile,
} from './storefront-runtime-profile.ts';

const validInput = {
  EXPO_PUBLIC_CRAVEUP_API_URL: 'https://api.staging.example.com',
  EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN: 'https://checkout.staging.example.com',
  EXPO_PUBLIC_CRAVEUP_LOCATION_ID: '0123456789abcdef01234567',
  EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: 'fixture-merchant',
  EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: 'android-restricted-public-key',
  EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: 'ios-restricted-public-key',
} as const;

function brandWithCapabilities(
  capabilities: Partial<BrandConfig['capabilities']>,
): BrandConfig {
  return {
    ...brandConfig,
    capabilities: { ...brandConfig.capabilities, ...capabilities },
  };
}

test('gated delivery keeps native map configuration optional', () => {
  const profile = parseStorefrontRuntimeProfile(
    brandWithCapabilities({ delivery: 'gated' }),
    {
      ...validInput,
      EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: undefined,
      EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: undefined,
    },
  );

  assert.deepEqual(profile.environment.maps, {});
  assert.equal(profile.capabilities.delivery, 'gated');
});

test('enabled delivery requires both separately restricted native map keys', () => {
  const deliveryBrand = brandWithCapabilities({ delivery: 'enabled' });

  assert.throws(
    () =>
      parseStorefrontRuntimeProfile(deliveryBrand, {
        ...validInput,
        EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: undefined,
      }),
    (error: unknown) =>
      error instanceof StorefrontRuntimeProfileError &&
      error.capability === 'delivery' &&
      error.field === 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY',
  );
  assert.throws(
    () =>
      parseStorefrontRuntimeProfile(deliveryBrand, {
        ...validInput,
        EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: undefined,
      }),
    (error: unknown) =>
      error instanceof StorefrontRuntimeProfileError &&
      error.capability === 'delivery' &&
      error.field === 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
  );
});

test('enabled delivery preserves validated platform-specific map keys', () => {
  const profile = parseStorefrontRuntimeProfile(
    brandWithCapabilities({ delivery: 'enabled' }),
    validInput,
  );

  assert.deepEqual(profile.environment.maps, {
    androidApiKey: 'android-restricted-public-key',
    iosApiKey: 'ios-restricted-public-key',
  });
});

test('runtime profiles publish checkout origin without provider configuration', () => {
  const walletBrand = brandWithCapabilities({
    applePay: 'enabled',
    googlePay: 'enabled',
  });
  const profile = parseStorefrontRuntimeProfile(walletBrand, validInput);

  assert.equal(
    profile.environment.checkoutOrigin,
    'https://checkout.staging.example.com',
  );
  assert.equal('stripe' in profile.environment, false);
});

test('runtime profile copies capability state without mixing brand identity into tenant config', () => {
  const sourceBrand = brandWithCapabilities({ favourites: 'disabled' });
  const profile: StorefrontRuntimeProfile = parseStorefrontRuntimeProfile(
    sourceBrand,
    validInput,
  );

  assert.notEqual(profile.capabilities, sourceBrand.capabilities);
  assert.equal(profile.capabilities.favourites, 'disabled');
  assert.equal('brand' in profile.environment, false);
  assert.equal('displayName' in profile.environment, false);
  assert.equal('scheme' in profile.environment, false);
});

test('runtime profile boundary has no transport, storage, or private configuration path', () => {
  const source = readFileSync(
    new URL('./storefront-runtime-profile.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /\bfetch\b|SecureStore|createStorefrontClient/);
  for (const forbidden of [
    ['EXPO', 'PUBLIC', 'CRAVEUP', 'API', 'KEY'].join('_'),
    ['EXPO', 'PUBLIC', 'STRIPE', ''].join('_'),
    ['STRIPE', 'SECRET', 'KEY'].join('_'),
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
  assert.doesNotMatch(
    source,
    /customerJwt|cartCapability|@stripe\/stripe-react-native/i,
  );
});

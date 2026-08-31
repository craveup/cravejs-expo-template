import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { brandConfig } from './brand.config.ts';

const requiredPublicFields = [
  'EXPO_PUBLIC_CRAVEUP_API_URL',
  'EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN',
  'EXPO_PUBLIC_CRAVEUP_LOCATION_ID',
  'EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG',
] as const;

const optionalPublicFields = [
  'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY',
] as const;

function releaseEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };

  for (const field of [...requiredPublicFields, ...optionalPublicFields]) {
    delete environment[field];
  }

  return environment;
}

function runReleasePreflight(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['scripts/check-public-environment.mjs'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
    env: environment,
  });
}

test('release public-environment preflight accepts a complete valid configuration', () => {
  const result = runReleasePreflight({
    ...releaseEnvironment(),
    EXPO_PUBLIC_CRAVEUP_API_URL: 'https://api.staging.example.com',
    EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN:
      'https://checkout.staging.example.com',
    EXPO_PUBLIC_CRAVEUP_LOCATION_ID: '0123456789abcdef01234567',
    EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: 'fixture-merchant',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    apiOrigin: 'https://api.staging.example.com',
    capabilities: brandConfig.capabilities,
    checkoutOrigin: 'https://checkout.staging.example.com',
    locationConfigured: true,
    maps: { android: false, ios: false },
    merchantSlug: 'fixture-merchant',
  });
});

test('release public-environment preflight rejects missing required values safely', () => {
  const result = runReleasePreflight(releaseEnvironment());

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPO_PUBLIC_CRAVEUP_API_URL/);
  assert.doesNotMatch(result.stderr, /Cannot find module|checkout\.staging\.example\.com/i);
});

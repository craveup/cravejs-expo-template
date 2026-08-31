import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { LocationDetailSnapshot } from './location-directory-service.ts';
import {
  createStoreDirectionsUrl,
  getStoreDetailFailureMessage,
  hasRestrictedNativeMapKey,
  isConfiguredOrderingLocation,
  loadStoreDetailProgressively,
} from './store-detail-route.ts';

test('store maps require the matching restricted native platform key', () => {
  const maps = { androidApiKey: 'android_key', iosApiKey: 'ios_key' };
  assert.equal(hasRestrictedNativeMapKey('android', maps), true);
  assert.equal(hasRestrictedNativeMapKey('ios', maps), true);
  assert.equal(hasRestrictedNativeMapKey('web', maps), false);
  assert.equal(hasRestrictedNativeMapKey('android', { iosApiKey: 'ios_key' }), false);
  assert.equal(hasRestrictedNativeMapKey('ios', { androidApiKey: 'android_key' }), false);
});

test('store selection is enabled only for the configured ordering location', () => {
  assert.equal(isConfiguredOrderingLocation('location_1', 'location_1'), true);
  assert.equal(isConfiguredOrderingLocation('location_2', 'location_1'), false);
});

test('directions use a bounded native-safe universal URL without an API key', () => {
  const directions = createStoreDirectionsUrl({
    latitude: 34.0195,
    longitude: -118.4912,
  });
  assert.equal(
    directions,
    'https://www.google.com/maps/dir/?api=1&destination=34.0195,-118.4912',
  );
  assert.equal(
    createStoreDirectionsUrl({ latitude: 100, longitude: 0 }),
    undefined,
  );
  assert.doesNotMatch(directions ?? '', /key=/i);
});

test('store detail failures use fixed safe copy', () => {
  assert.equal(
    getStoreDetailFailureMessage({
      code: 'LOCATION_NOT_FOUND',
      kind: 'not_found',
      retryable: false,
    }),
    'This store is unavailable.',
  );
});

test('native map configuration keeps iOS and Android restricted keys separate', () => {
  const appConfig = readFileSync(
    new URL('../../../app.config.ts', import.meta.url),
    'utf8',
  );
  const packageJson = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as { dependencies: Record<string, string> };

  assert.equal(packageJson.dependencies['react-native-maps'], '1.27.2');
  assert.match(appConfig, /'react-native-maps'/);
  assert.match(
    appConfig,
    /androidGoogleMapsApiKey:\s*process\.env\.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY/,
  );
  assert.match(
    appConfig,
    /iosGoogleMapsApiKey:\s*process\.env\.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY/,
  );
});

test('store detail route omits unsupported operational claims and direct transport', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/locations/[locationId].tsx', import.meta.url),
    'utf8',
  );
  const map = readFileSync(
    new URL('./StoreLocationMap.native.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    `${route}\n${map}`,
    /openingHours|closingTime|openNow|phoneNumber|\bCall\b|console\.|\bfetch\s*\(/i,
  );
  assert.match(route, /onSelectStore=\{\(\) => router\.replace\('\/menu'/);
});

test('store details render before optional device distance enrichment settles', async () => {
  let releaseOrigin: ((origin: { lat: number; lng: number }) => void) | undefined;
  const origin = new Promise<{ lat: number; lng: number }>((resolve) => {
    releaseOrigin = resolve;
  });
  const calls: string[] = [];
  const updates: unknown[] = [];
  const loading = loadStoreDetailProgressively(
    {
      async get(locationId, requestOrigin) {
        calls.push(`${locationId}:${requestOrigin ? 'distance' : 'base'}`);
        return {
          data: {} as LocationDetailSnapshot,
          kind: 'ready' as const,
        };
      },
    },
    'location_1',
    () => origin,
    (result) => updates.push(result),
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['location_1:base']);
  assert.equal(updates.length, 1);

  releaseOrigin!({ lat: 34.02, lng: -118.49 });
  await loading;
  assert.deepEqual(calls, ['location_1:base', 'location_1:distance']);
  assert.equal(updates.length, 2);
});

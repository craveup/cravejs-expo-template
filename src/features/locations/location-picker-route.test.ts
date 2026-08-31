import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { toDistanceOrigin } from './device-location-origin-contract.ts';
import {
  getLocationDirectoryRouteState,
  getLocationDirectoryFailureMessage,
  loadLocationDirectoryProgressively,
} from './location-picker-route.ts';

import type { LocationDirectorySnapshot } from './location-directory-service.ts';

function snapshot(
  overrides: Partial<LocationDirectorySnapshot> = {},
): LocationDirectorySnapshot {
  return {
    distances: [],
    items: [],
    locations: [],
    ...overrides,
  };
}

test('device coordinates become a server distance origin without client distance math', () => {
  assert.deepEqual(toDistanceOrigin({ latitude: 34.02, longitude: -118.49 }), {
    lat: 34.02,
    lng: -118.49,
  });
  assert.equal(
    toDistanceOrigin({ latitude: Number.NaN, longitude: -118.49 }),
    undefined,
  );
  assert.equal(
    toDistanceOrigin({ latitude: 91, longitude: -118.49 }),
    undefined,
  );
});

test('location request failures map to fixed safe picker copy', () => {
  assert.equal(
    getLocationDirectoryFailureMessage({
      code: 'NETWORK_ERROR',
      kind: 'unavailable',
      retryable: true,
    }),
    'We could not load stores. Check your connection and try again.',
  );
});

test('route distinguishes an empty published directory from unknown distance', () => {
  assert.equal(getLocationDirectoryRouteState(undefined), 'loading');
  assert.equal(
    getLocationDirectoryRouteState({ errorMessage: 'Unavailable' }),
    'error',
  );
  assert.equal(
    getLocationDirectoryRouteState({ data: snapshot() }),
    'no-published-locations',
  );
  assert.equal(
    getLocationDirectoryRouteState({
      data: snapshot({
        items: [{ address: '100 Example Avenue', id: 'one', name: 'One' }],
        locations: [{} as LocationDirectorySnapshot['locations'][number]],
      }),
    }),
    'directory',
  );
});

test('picker route owns no distance calculation, persistence, or direct transport', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/locations/index.tsx', import.meta.url),
    'utf8',
  );
  const provider = readFileSync(
    new URL('./device-location-origin.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    `${route}\n${provider}`,
    /haversine|earthRadius|AsyncStorage|SecureStore|console\.|\bfetch\s*\(/i,
  );
  assert.match(route, /NoNearbyStoresScreen/);
  assert.match(route, /router\.replace\('\/menu'/);
});

test('pickup locations render before optional device distance enrichment settles', async () => {
  let releaseOrigin: ((origin: { lat: number; lng: number }) => void) | undefined;
  const origin = new Promise<{ lat: number; lng: number }>((resolve) => {
    releaseOrigin = resolve;
  });
  const calls: string[] = [];
  const updates: unknown[] = [];
  const loading = loadLocationDirectoryProgressively(
    {
      async list(requestOrigin) {
        calls.push(requestOrigin ? 'distance' : 'base');
        return {
          data: {
            distances: [],
            items: [{ address: '100 Example Avenue', id: 'one', name: 'One' }],
            locations: [{} as LocationDirectorySnapshot['locations'][number]],
          },
          kind: 'ready' as const,
        };
      },
    },
    () => origin,
    (result) => updates.push(result),
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['base']);
  assert.equal(updates.length, 1);

  releaseOrigin!({ lat: 34.02, lng: -118.49 });
  await loading;
  assert.deepEqual(calls, ['base', 'distance']);
  assert.equal(updates.length, 2);
});

test('an empty published directory does not request unnecessary device location', async () => {
  let originCalls = 0;
  let directoryCalls = 0;
  const updates: unknown[] = [];

  await loadLocationDirectoryProgressively(
    {
      async list() {
        directoryCalls += 1;
        return { data: snapshot(), kind: 'ready' as const };
      },
    },
    async () => {
      originCalls += 1;
      return { lat: 34.02, lng: -118.49 };
    },
    (result) => updates.push(result),
  );

  assert.equal(directoryCalls, 1);
  assert.equal(originCalls, 0);
  assert.equal(updates.length, 1);
});

test('Expo native config requests foreground location only', () => {
  const appConfig = readFileSync(
    new URL('../../../app.config.ts', import.meta.url),
    'utf8',
  );
  const packageJson = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as { dependencies: Record<string, string> };

  assert.equal(packageJson.dependencies['expo-location'], '~57.0.14');
  assert.match(appConfig, /'expo-location'/);
  assert.match(appConfig, /locationWhenInUsePermission/);
  assert.doesNotMatch(appConfig, /isIosBackgroundLocationEnabled|isAndroidBackgroundLocationEnabled/);
});

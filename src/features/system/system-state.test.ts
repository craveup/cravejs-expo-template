import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canResumeFromOffline,
  isSystemNetworkReachable,
} from './system-state.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('network recovery requires an explicitly connected and reachable state', () => {
  assert.equal(
    isSystemNetworkReachable({ isConnected: true, isInternetReachable: true }),
    true,
  );
  assert.equal(isSystemNetworkReachable({ isConnected: true }), false);
  assert.equal(isSystemNetworkReachable({ isInternetReachable: true }), false);
  assert.equal(
    isSystemNetworkReachable({ isConnected: false, isInternetReachable: true }),
    false,
  );
});

test('a refreshed probe resumes only when it is explicitly reachable', () => {
  const connected = { isConnected: true, isInternetReachable: true } as const;

  assert.equal(canResumeFromOffline(connected), true);
  assert.equal(
    canResumeFromOffline({
      isConnected: false,
      isInternetReachable: false,
    }),
    false,
  );
  assert.equal(
    canResumeFromOffline({
      isConnected: true,
      isInternetReachable: false,
    }),
    false,
  );
});

test('an inconclusive refresh never resumes from an older observation', () => {
  assert.equal(canResumeFromOffline({}), false);
  assert.equal(
    canResumeFromOffline({ isConnected: true, isInternetReachable: undefined }),
    false,
  );
});

test('a fresh reachable probe permits recovery', () => {
  const refreshed = { isConnected: true, isInternetReachable: true } as const;

  assert.equal(canResumeFromOffline(refreshed), true);
});

test('system presentation keeps retry, references, and claims controlled', () => {
  const presentation = read('./SystemStatePresentation.tsx');

  assert.match(presentation, /state\.status === 'error' && state\.requestId/);
  assert.match(presentation, /state\.status === 'error' && state\.retryable/);
  assert.match(presentation, /Boolean\(onRetry\)/);
  assert.match(presentation, /maxWidth: 342/);
  assert.match(presentation, /width: '100%'/);
  assert.match(presentation, /accessibilityLiveRegion="polite"/);
  assert.match(presentation, /accessibilityRole="header"/);
  assert.doesNotMatch(
    presentation,
    /not been charged|placing order|order number|bag is saved|drinks|\$\d|Date\(|new Date/iu,
  );
  assert.doesNotMatch(
    presentation,
    /@craveup\/storefront-sdk|SecureStore|expo-router|expo-network|\bfetch\s*\(/,
  );
});

test('system routes remain thin and keep update-required gated', () => {
  const offlineRoute = read('../../app/offline.tsx');
  const errorRoute = read('../../app/error.tsx');

  assert.match(offlineRoute, /Network\.getNetworkStateAsync\(\)/);
  assert.match(offlineRoute, /canResumeFromOffline/);
  assert.match(offlineRoute, /router\.canGoBack\(\)/);
  assert.match(errorRoute, /state=\{\{ retryable: false, status: 'error' \}\}/);
  assert.doesNotMatch(
    `${offlineRoute}\n${errorRoute}`,
    /@craveup\/storefront-sdk|SecureStore|process\.env|\bfetch\s*\(|cart\.|checkout\./,
  );
  assert.equal(
    existsSync(new URL('../../app/update-required.tsx', import.meta.url)),
    false,
  );
});

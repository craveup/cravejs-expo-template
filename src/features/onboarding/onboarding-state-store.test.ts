import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createInMemoryLocalStateStore } from '../../lib/local-state-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import {
  createOnboardingStateStore,
  ONBOARDING_JOURNEY_VERSION,
} from './onboarding-state-store.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

test('onboarding completion survives restart within the exact environment and merchant', async () => {
  const storage = createInMemoryLocalStateStore();
  const first = createOnboardingStateStore(scope, storage);

  assert.deepEqual(await first.get(), {
    completed: false,
    journeyVersion: ONBOARDING_JOURNEY_VERSION,
  });
  await first.complete();

  assert.deepEqual(await createOnboardingStateStore(scope, storage).get(), {
    completed: true,
    journeyVersion: ONBOARDING_JOURNEY_VERSION,
  });
});

test('onboarding state cannot cross API environment or merchant boundaries', async () => {
  const storage = createInMemoryLocalStateStore();
  const staging = createOnboardingStateStore(scope, storage);
  const production = createOnboardingStateStore(
    { ...scope, environmentNamespace: 'env-fedcba9876543210' },
    storage,
  );
  const anotherMerchant = createOnboardingStateStore(
    { ...scope, merchantSlug: 'another-merchant' },
    storage,
  );

  await staging.complete();

  assert.equal((await staging.get()).completed, true);
  assert.equal((await production.get()).completed, false);
  assert.equal((await anotherMerchant.get()).completed, false);
});

test('unsupported records are cleared instead of being migrated silently', async () => {
  const records = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return records.get(key) ?? null;
    },
    async removeItem(key: string) {
      records.delete(key);
    },
    async setItem(key: string, value: string) {
      records.set(key, value);
    },
  };
  const store = createOnboardingStateStore(scope, storage);
  const key = `storefront.onboarding.v1.${scope.environmentNamespace}.${scope.merchantSlug}`;

  records.set(
    key,
    JSON.stringify({
      completed: true,
      environmentNamespace: scope.environmentNamespace,
      journeyVersion: 0,
      merchantSlug: scope.merchantSlug,
      schemaVersion: 0,
    }),
  );

  assert.equal((await store.get()).completed, false);
  assert.equal(records.has(key), false);
});

test('local lifecycle storage is non-sensitive and isolated from SecureStore', () => {
  const onboardingSource = readFileSync(
    new URL('./onboarding-state-store.ts', import.meta.url),
    'utf8',
  );
  const nativeSource = readFileSync(
    new URL('../../lib/async-local-state-store.ts', import.meta.url),
    'utf8',
  );

  assert.match(nativeSource, /@react-native-async-storage\/async-storage/);
  assert.doesNotMatch(
    `${onboardingSource}\n${nativeSource}`,
    /expo-secure-store|accessToken|receiptToken|customerJwt|\bfetch\s*\(|console\./i,
  );
});

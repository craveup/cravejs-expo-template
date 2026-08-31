import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createInMemoryLocalStateStore } from '../../lib/local-state-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import { createOnboardingStateStore } from './onboarding-state-store.ts';
import {
  completeOnboardingForDestination,
  getCompletedOnboardingDestination,
  getOnboardingEntryDestination,
  ONBOARDING_HOME_DESTINATION,
  ONBOARDING_ROUTE_PATH,
  ONBOARDING_SIGN_IN_DESTINATION,
} from './onboarding-route.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

test('first launch enters 5A and completed onboarding returns to home', async () => {
  const store = createOnboardingStateStore(
    scope,
    createInMemoryLocalStateStore(),
  );

  assert.equal(
    getOnboardingEntryDestination(await store.get()),
    ONBOARDING_ROUTE_PATH,
  );
  assert.equal(getCompletedOnboardingDestination(await store.get()), undefined);

  await store.complete();

  assert.equal(getOnboardingEntryDestination(await store.get()), undefined);
  assert.equal(
    getCompletedOnboardingDestination(await store.get()),
    ONBOARDING_HOME_DESTINATION,
  );
});

test('both 5A actions persist completion before returning their destination', async () => {
  for (const destination of [
    ONBOARDING_HOME_DESTINATION,
    ONBOARDING_SIGN_IN_DESTINATION,
  ] as const) {
    const store = createOnboardingStateStore(
      scope,
      createInMemoryLocalStateStore(),
    );

    assert.equal(
      await completeOnboardingForDestination(store, destination),
      destination,
    );
    assert.equal((await store.get()).completed, true);
  }
});

test('5A does not navigate when completion cannot be persisted', async () => {
  const failure = new Error('storage unavailable');
  const store = {
    async clear() {},
    async complete() {
      throw failure;
    },
    async get() {
      return { completed: false, journeyVersion: 1 } as const;
    },
  };

  await assert.rejects(
    completeOnboardingForDestination(store, ONBOARDING_HOME_DESTINATION),
    failure,
  );
});

test('5A route reuses the welcome primitive without unsupported permissions', () => {
  const route = readFileSync(
    new URL('../../app/onboarding.tsx', import.meta.url),
    'utf8',
  );
  const entry = readFileSync(new URL('../../app/index.tsx', import.meta.url), 'utf8');

  assert.match(route, /<WelcomeOnboarding/);
  assert.match(route, /onGetStarted=/);
  assert.match(route, /onSignIn=/);
  assert.match(route, /ONBOARDING_SIGN_IN_DESTINATION/);
  assert.match(entry, /getOnboardingEntryDestination/);
  assert.doesNotMatch(
    route,
    /notifications|expo-notifications|requestPermissions/i,
  );
});

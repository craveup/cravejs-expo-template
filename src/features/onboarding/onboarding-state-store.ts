import type { LocalStateStore } from '../../lib/local-state-store.ts';
import {
  createStorefrontSessionScope,
  type StorefrontSessionScope,
} from '../../lib/storefront-session-scope.ts';

export const ONBOARDING_SCHEMA_VERSION = 1 as const;
export const ONBOARDING_JOURNEY_VERSION = 1 as const;

export type OnboardingState = Readonly<{
  completed: boolean;
  journeyVersion: typeof ONBOARDING_JOURNEY_VERSION;
}>;

type StoredOnboardingState = OnboardingState &
  Readonly<{
    environmentNamespace: string;
    merchantSlug: string;
    schemaVersion: typeof ONBOARDING_SCHEMA_VERSION;
  }>;

export interface OnboardingStateStore {
  clear(): Promise<void>;
  complete(): Promise<OnboardingState>;
  get(): Promise<OnboardingState>;
}

function onboardingKey(scope: StorefrontSessionScope): string {
  return `storefront.onboarding.v1.${scope.environmentNamespace}.${scope.merchantSlug}`;
}

function initialState(): OnboardingState {
  return Object.freeze({
    completed: false,
    journeyVersion: ONBOARDING_JOURNEY_VERSION,
  });
}

function parseRecord(
  value: string,
  scope: StorefrontSessionScope,
): StoredOnboardingState | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;

  if (
    record.schemaVersion !== ONBOARDING_SCHEMA_VERSION ||
    record.journeyVersion !== ONBOARDING_JOURNEY_VERSION ||
    record.environmentNamespace !== scope.environmentNamespace ||
    record.merchantSlug !== scope.merchantSlug ||
    record.completed !== true
  ) {
    return undefined;
  }

  return Object.freeze({
    completed: true,
    environmentNamespace: scope.environmentNamespace,
    journeyVersion: ONBOARDING_JOURNEY_VERSION,
    merchantSlug: scope.merchantSlug,
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
  });
}

export function createOnboardingStateStore(
  inputScope: StorefrontSessionScope,
  storage: LocalStateStore,
): OnboardingStateStore {
  const scope = createStorefrontSessionScope(inputScope);
  const key = onboardingKey(scope);

  return Object.freeze({
    async clear(): Promise<void> {
      await storage.removeItem(key);
    },
    async complete(): Promise<OnboardingState> {
      const record: StoredOnboardingState = Object.freeze({
        completed: true,
        environmentNamespace: scope.environmentNamespace,
        journeyVersion: ONBOARDING_JOURNEY_VERSION,
        merchantSlug: scope.merchantSlug,
        schemaVersion: ONBOARDING_SCHEMA_VERSION,
      });

      await storage.setItem(key, JSON.stringify(record));
      return Object.freeze({
        completed: true,
        journeyVersion: ONBOARDING_JOURNEY_VERSION,
      });
    },
    async get(): Promise<OnboardingState> {
      const value = await storage.getItem(key);
      if (value === null) return initialState();

      const record = parseRecord(value, scope);

      if (!record) {
        await storage.removeItem(key);
        return initialState();
      }

      return Object.freeze({
        completed: record.completed,
        journeyVersion: record.journeyVersion,
      });
    },
  });
}

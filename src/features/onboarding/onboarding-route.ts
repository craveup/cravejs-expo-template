import type { OnboardingState, OnboardingStateStore } from './onboarding-state-store.ts';

export const ONBOARDING_ROUTE_PATH = '/onboarding' as const;
export const ONBOARDING_HOME_DESTINATION = '/' as const;
export const ONBOARDING_SIGN_IN_DESTINATION = '/sign-in' as const;

export type OnboardingCompletionDestination =
  | typeof ONBOARDING_HOME_DESTINATION
  | typeof ONBOARDING_SIGN_IN_DESTINATION;

export function getOnboardingEntryDestination(
  state: OnboardingState,
): typeof ONBOARDING_ROUTE_PATH | undefined {
  return state.completed ? undefined : ONBOARDING_ROUTE_PATH;
}

export function getCompletedOnboardingDestination(
  state: OnboardingState,
): typeof ONBOARDING_HOME_DESTINATION | undefined {
  return state.completed ? ONBOARDING_HOME_DESTINATION : undefined;
}

export async function completeOnboardingForDestination<
  Destination extends OnboardingCompletionDestination,
>(
  store: OnboardingStateStore,
  destination: Destination,
): Promise<Destination> {
  await store.complete();
  return destination;
}

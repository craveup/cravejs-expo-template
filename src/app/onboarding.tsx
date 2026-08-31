import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  completeOnboardingForDestination,
  getCompletedOnboardingDestination,
  ONBOARDING_HOME_DESTINATION,
  ONBOARDING_SIGN_IN_DESTINATION,
  WelcomeOnboarding,
} from '@/features/onboarding';
import { getStorefrontRuntime } from '@/lib/storefront';

const persistenceErrorTitle = 'Unable to continue';
const persistenceErrorMessage =
  'Your onboarding choice could not be saved. Please try again.';

export default function OnboardingRoute() {
  const onboarding = getStorefrontRuntime().services.onboarding;
  const [ready, setReady] = useState(false);
  const actionPending = useRef(false);

  useEffect(() => {
    let active = true;

    void onboarding.get().then(
      (state) => {
        if (!active) return;
        const destination = getCompletedOnboardingDestination(state);
        if (destination) router.replace(destination as Href);
        else setReady(true);
      },
      () => {
        if (active) setReady(true);
      },
    );

    return () => {
      active = false;
    };
  }, [onboarding]);

  if (!ready) return null;

  const completeAndNavigate = async (
    destination:
      | typeof ONBOARDING_HOME_DESTINATION
      | typeof ONBOARDING_SIGN_IN_DESTINATION,
  ) => {
    if (actionPending.current) return;
    actionPending.current = true;

    try {
      const completedDestination = await completeOnboardingForDestination(
        onboarding,
        destination,
      );
      router.replace(completedDestination as Href);
    } catch {
      Alert.alert(persistenceErrorTitle, persistenceErrorMessage);
    } finally {
      actionPending.current = false;
    }
  };

  return (
    <WelcomeOnboarding
      onGetStarted={() => {
        void completeAndNavigate(ONBOARDING_HOME_DESTINATION);
      }}
      onSignIn={() => {
        void completeAndNavigate(ONBOARDING_SIGN_IN_DESTINATION);
      }}
    />
  );
}

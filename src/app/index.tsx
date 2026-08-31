import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  getOnboardingEntryDestination,
  ONBOARDING_ROUTE_PATH,
} from '@/features/onboarding';
import { getStorefrontRuntime } from '@/lib/storefront';

/** Preserve first-launch onboarding before entering the catalog tab shell. */
export default function Index() {
  const onboarding = getStorefrontRuntime().services.onboarding;
  const [entryDestination, setEntryDestination] = useState<
    typeof ONBOARDING_ROUTE_PATH | null
  >(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    let active = true;

    void onboarding.get().then(
      (state) => {
        if (!active) return;
        setEntryDestination(getOnboardingEntryDestination(state) ?? null);
        setOnboardingChecked(true);
      },
      () => {
        if (!active) return;
        setEntryDestination(ONBOARDING_ROUTE_PATH);
        setOnboardingChecked(true);
      },
    );

    return () => {
      active = false;
    };
  }, [onboarding]);

  if (!onboardingChecked) return null;
  if (entryDestination) return <Redirect href={entryDestination as Href} />;
  return <Redirect href={'/(tabs)' as Href} />;
}

import { router, type Href, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';

import { brandConfig } from '@/config/brand.config';
import type { BrandConfig } from '@/config/brand.types';
import type { CustomerAuthState } from '@/features/auth/customer-auth-state';
import { useCustomerAuthState } from '@/features/auth/use-customer-auth-state';
import {
  loadRewardsAccount,
  RewardsAccountPresentation,
  type RewardsAccountPresentationState,
} from '@/features/rewards';
import { getStorefrontRuntime } from '@/lib/storefront';

type CustomerAuthenticatedState = Extract<
  CustomerAuthState,
  Readonly<{ status: 'authenticated' }>
>;

type RewardsLoad = Readonly<{
  attempt: number;
  presentation: RewardsAccountPresentationState;
  session: CustomerAuthenticatedState;
}>;

const runtimeBrand: BrandConfig = brandConfig;

export default function RewardsRoute() {
  if (runtimeBrand.capabilities.loyalty !== 'enabled') {
    return (
      <>
        <StatusBar style="light" />
        <RewardsAccountPresentation state={{ status: 'unavailable' }} />
      </>
    );
  }

  return <EnabledRewardsRoute />;
}

function EnabledRewardsRoute() {
  const runtime = getStorefrontRuntime();
  const auth = runtime.services.customerAuth;
  const authState = useCustomerAuthState(auth);
  const restoreStarted = useRef(false);
  const [sessionChecked, setSessionChecked] = useState(
    () => authState.status !== 'signed_out',
  );
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<RewardsLoad>();

  useEffect(() => {
    if (restoreStarted.current || authState.status !== 'signed_out') return;

    restoreStarted.current = true;
    void auth.restore().finally(() => setSessionChecked(true));
  }, [auth, authState.status]);

  useFocusEffect(
    useCallback(() => {
      if (authState.status !== 'authenticated') return;

      let active = true;
      const authenticatedState = authState;

      void loadRewardsAccount({
        cartSessions: runtime.cartSessions,
        locationId: runtime.environment.locationId,
        loyalty: runtime.services.loyalty,
      }).then((nextPresentation) => {
        if (active) {
          setLoad({
            attempt,
            presentation: nextPresentation,
            session: authenticatedState,
          });
        }
      });

      return () => {
        active = false;
      };
    }, [attempt, authState, runtime]),
  );

  const presentation: RewardsAccountPresentationState =
    !sessionChecked || authState.status === 'restoring'
      ? { status: 'loading' }
      : authState.status === 'profile_unavailable'
        ? { status: 'error' }
        : authState.status !== 'authenticated'
          ? { status: 'signed_out' }
          : load?.attempt === attempt && load.session === authState
            ? load.presentation
            : { status: 'loading' };

  return (
    <>
      <StatusBar style="light" />
      <RewardsAccountPresentation
        onHistory={
          presentation.status === 'ready'
            ? () => router.push('/rewards/history' as Href)
            : undefined
        }
        onRedeem={(rewardId) =>
          router.push(
            `/rewards/redeem/${encodeURIComponent(rewardId)}` as Href,
          )
        }
        onRetry={
          authState.status === 'profile_unavailable'
            ? () => void auth.retryProfile()
            : () => setAttempt((value) => value + 1)
        }
        onSignIn={() => router.push('/sign-in' as Href)}
        state={presentation}
      />
    </>
  );
}

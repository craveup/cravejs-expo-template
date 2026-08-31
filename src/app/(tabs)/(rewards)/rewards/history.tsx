import { router, type Href, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';

import { brandConfig } from '@/config/brand.config';
import type { BrandConfig } from '@/config/brand.types';
import type { CustomerAuthState } from '@/features/auth/customer-auth-state';
import { useCustomerAuthState } from '@/features/auth/use-customer-auth-state';
import { useMerchantLocationHeader } from '@/features/_shared';
import {
  appendPointsHistoryPage,
  beginPointsHistoryLoadMore,
  failPointsHistoryLoadMore,
  PointsHistoryPresentation,
  toPointsHistoryFailureStatus,
  toPointsHistoryPresentation,
  type PointsHistoryPresentationState,
} from '@/features/rewards';
import { getStorefrontRuntime } from '@/lib/storefront';

type CustomerAuthenticatedState = Extract<
  CustomerAuthState,
  Readonly<{ status: 'authenticated' }>
>;

type PointsHistoryLoad = Readonly<{
  attempt: number;
  presentation: PointsHistoryPresentationState;
  session: CustomerAuthenticatedState;
}>;

const PAGE_LIMIT = 20;
const runtimeBrand: BrandConfig = brandConfig;

export default function PointsHistoryRoute() {
  if (runtimeBrand.capabilities.loyalty !== 'enabled') {
    return (
      <>
        <StatusBar style="dark" />
        <PointsHistoryPresentation
          merchantHeaderState={{ status: 'unavailable' }}
          state={{ status: 'unavailable' }}
        />
      </>
    );
  }

  return <EnabledPointsHistoryRoute />;
}

function EnabledPointsHistoryRoute() {
  const runtime = getStorefrontRuntime();
  const auth = runtime.services.customerAuth;
  const loyalty = runtime.services.loyalty;
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const authState = useCustomerAuthState(auth);
  const restoreStarted = useRef(false);
  const focusGeneration = useRef(0);
  const pendingCursor = useRef<string | undefined>(undefined);
  const consumedCursors = useRef(new Set<string>());
  const [sessionChecked, setSessionChecked] = useState(
    () => authState.status !== 'signed_out',
  );
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<PointsHistoryLoad>();

  useEffect(() => {
    if (restoreStarted.current || authState.status !== 'signed_out') return;

    restoreStarted.current = true;
    void auth.restore().finally(() => setSessionChecked(true));
  }, [auth, authState.status]);

  useFocusEffect(
    useCallback(() => {
      const generation = ++focusGeneration.current;
      pendingCursor.current = undefined;
      consumedCursors.current.clear();
      if (authState.status !== 'authenticated') {
        return () => {
          focusGeneration.current += 1;
        };
      }

      const authenticatedState = authState;
      setLoad(undefined);
      void loyalty.getLedger({ limit: PAGE_LIMIT }).then((result) => {
        if (focusGeneration.current !== generation) return;

        setLoad({
          attempt,
          presentation:
            result.kind === 'ready'
              ? toPointsHistoryPresentation(result.data)
              : { status: toPointsHistoryFailureStatus(result.failure) },
          session: authenticatedState,
        });
      });

      return () => {
        if (focusGeneration.current === generation) {
          focusGeneration.current += 1;
        }
        pendingCursor.current = undefined;
      };
    }, [attempt, authState, loyalty]),
  );

  const presentation: PointsHistoryPresentationState =
    !sessionChecked || authState.status === 'restoring'
      ? { status: 'loading' }
      : authState.status === 'profile_unavailable'
        ? { status: 'error' }
        : authState.status !== 'authenticated'
          ? { status: 'signed_out' }
          : load?.attempt === attempt && load.session === authState
            ? load.presentation
            : { status: 'loading' };

  async function loadMore() {
    if (
      authState.status !== 'authenticated' ||
      presentation.status !== 'ready' ||
      !presentation.nextCursor ||
      pendingCursor.current
    ) {
      return;
    }

    const cursor = presentation.nextCursor;
    const generation = focusGeneration.current;
    const authenticatedState = authState;
    pendingCursor.current = cursor;
    consumedCursors.current.add(cursor);
    setLoad((current) =>
      current?.attempt === attempt && current.session === authenticatedState
        ? {
            ...current,
            presentation: beginPointsHistoryLoadMore(current.presentation),
          }
        : current,
    );

    const result = await loyalty.getLedger({ cursor, limit: PAGE_LIMIT });
    if (
      focusGeneration.current !== generation ||
      pendingCursor.current !== cursor
    ) {
      return;
    }
    pendingCursor.current = undefined;

    setLoad((current) => {
      if (
        current?.attempt !== attempt ||
        current.session !== authenticatedState
      ) {
        return current;
      }

      if (result.kind === 'ready') {
        return {
          ...current,
          presentation: appendPointsHistoryPage(
            current.presentation,
            result.data,
            cursor,
            [...consumedCursors.current],
          ),
        };
      }

      const failureStatus = toPointsHistoryFailureStatus(result.failure);
      return {
        ...current,
        presentation:
          failureStatus === 'error'
            ? failPointsHistoryLoadMore(current.presentation)
            : { status: failureStatus },
      };
    });
  }

  return (
    <>
      <StatusBar style="dark" />
      <PointsHistoryPresentation
        merchantHeaderState={merchantHeader.state}
        onLoadMore={() => void loadMore()}
        onOpenAccount={() => router.push('/account' as Href)}
        onRetry={() => {
          merchantHeader.retry();
          if (authState.status === 'profile_unavailable') void auth.retryProfile();
          else setAttempt((value) => value + 1);
        }}
        onSignIn={() => router.push('/sign-in' as Href)}
        state={presentation}
      />
    </>
  );
}

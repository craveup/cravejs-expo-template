import type {
  PublicOrderDetail,
  PublicOrderSummary,
} from '@craveup/storefront-sdk';
import { useNetworkState } from 'expo-network';
import { router, type Href, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CustomerAuthState } from '@/features/auth/customer-auth-state';
import { useCustomerAuthState } from '@/features/auth/use-customer-auth-state';
import { useMerchantLocationHeader } from '@/features/_shared';
import {
  getNextOrderHistoryCursor,
  isOrderHistoryOffline,
  loadOrderHistoryPage,
  OrderHistoryPresentation,
  toOrderHistoryFailureStatus,
  toOrderHistoryPresentationRows,
  type HydratedOrderHistoryPage,
  type OrderHistoryPresentationState,
} from '@/features/orders';
import { getStorefrontRuntime } from '@/lib/storefront';

type CustomerAuthenticatedState = Extract<
  CustomerAuthState,
  Readonly<{ status: 'authenticated' }>
>;

type OrderHistoryLoad = Readonly<{
  attempt: number;
  details: readonly PublicOrderDetail[];
  nextCursor?: string;
  presentation: OrderHistoryPresentationState;
  session: CustomerAuthenticatedState;
  summaries: readonly PublicOrderSummary[];
}>;

const PAGE_LIMIT = 20;

function readyLoad(
  page: HydratedOrderHistoryPage,
  session: CustomerAuthenticatedState,
  attempt: number,
): OrderHistoryLoad {
  return Object.freeze({
    attempt,
    details: page.details,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    presentation: Object.freeze({
      data: toOrderHistoryPresentationRows(page.summaries, 'en', {
        details: page.details,
      }),
      hasMore: Boolean(page.nextCursor),
      status: 'ready',
    }),
    session,
    summaries: page.summaries,
  });
}

export default function OrderHistoryRoute() {
  const runtime = getStorefrontRuntime();
  const auth = runtime.services.customerAuth;
  const orders = runtime.services.orders;
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const authState = useCustomerAuthState(auth);
  const networkState = useNetworkState();
  const offline = isOrderHistoryOffline(networkState);
  const restoreStarted = useRef(false);
  const focusGeneration = useRef(0);
  const pendingCursor = useRef<string | undefined>(undefined);
  const refreshPending = useRef(false);
  const consumedCursors = useRef(new Set<string>());
  const [sessionChecked, setSessionChecked] = useState(
    () => authState.status !== 'signed_out',
  );
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<OrderHistoryLoad>();

  useEffect(() => {
    if (restoreStarted.current || authState.status !== 'signed_out') return;

    restoreStarted.current = true;
    void auth.restore().finally(() => setSessionChecked(true));
  }, [auth, authState.status]);

  useFocusEffect(
    useCallback(() => {
      const generation = ++focusGeneration.current;
      pendingCursor.current = undefined;
      refreshPending.current = false;
      consumedCursors.current.clear();

      if (authState.status !== 'authenticated') {
        setLoad(undefined);
        return () => {
          focusGeneration.current += 1;
        };
      }

      const authenticatedState = authState;
      if (offline) {
        setLoad({
          attempt,
          details: [],
          presentation: { status: 'offline' },
          session: authenticatedState,
          summaries: [],
        });
      } else {
        void loadOrderHistoryPage(orders, { limit: PAGE_LIMIT })
          .then((result) => {
            if (focusGeneration.current !== generation) return;

            setLoad(
              result.kind === 'ready'
                ? readyLoad(result.data, authenticatedState, attempt)
                : {
                    attempt,
                    details: [],
                    presentation: {
                      status: toOrderHistoryFailureStatus(result.failure),
                    },
                    session: authenticatedState,
                    summaries: [],
                  },
            );
          })
          .catch(() => {
            if (focusGeneration.current !== generation) return;
            setLoad({
              attempt,
              details: [],
              presentation: { status: 'error' },
              session: authenticatedState,
              summaries: [],
            });
          });
      }

      return () => {
        focusGeneration.current += 1;
        pendingCursor.current = undefined;
        refreshPending.current = false;
      };
    }, [attempt, authState, offline, orders]),
  );

  const presentation: OrderHistoryPresentationState =
    !sessionChecked || authState.status === 'restoring'
      ? { status: 'loading' }
      : authState.status === 'profile_unavailable'
        ? { status: 'error' }
        : authState.status !== 'authenticated'
          ? { status: 'signed_out' }
          : load?.attempt === attempt && load.session === authState
            ? load.presentation
            : { status: 'loading' };

  async function refresh() {
    if (
      authState.status !== 'authenticated' ||
      presentation.status !== 'ready' ||
      refreshPending.current
    ) {
      return;
    }

    const authenticatedState = authState;
    const generation = ++focusGeneration.current;
    refreshPending.current = true;
    pendingCursor.current = undefined;
    consumedCursors.current.clear();

    if (offline) {
      refreshPending.current = false;
      setLoad({
        attempt,
        details: [],
        presentation: { status: 'offline' },
        session: authenticatedState,
        summaries: [],
      });
      return;
    }

    setLoad((current) =>
      current?.attempt === attempt && current.session === authenticatedState
        ? {
            ...current,
            presentation:
              current.presentation.status === 'ready'
                ? { ...current.presentation, refreshing: true }
                : current.presentation,
          }
        : current,
    );

    try {
      const result = await loadOrderHistoryPage(orders, { limit: PAGE_LIMIT });
      if (focusGeneration.current !== generation) return;

      setLoad(
        result.kind === 'ready'
          ? readyLoad(result.data, authenticatedState, attempt)
          : {
              attempt,
              details: [],
              presentation: {
                status: toOrderHistoryFailureStatus(result.failure),
              },
              session: authenticatedState,
              summaries: [],
            },
      );
    } catch {
      if (focusGeneration.current !== generation) return;
      setLoad({
        attempt,
        details: [],
        presentation: { status: 'error' },
        session: authenticatedState,
        summaries: [],
      });
    } finally {
      if (focusGeneration.current === generation) {
        refreshPending.current = false;
      }
    }
  }

  async function loadMore() {
    if (
      authState.status !== 'authenticated' ||
      presentation.status !== 'ready' ||
      !load?.nextCursor ||
      load.session !== authState ||
      pendingCursor.current ||
      refreshPending.current
    ) {
      return;
    }

    const cursor = load.nextCursor;
    const generation = focusGeneration.current;
    const authenticatedState = authState;
    pendingCursor.current = cursor;
    consumedCursors.current.add(cursor);
    setLoad((current) =>
      current?.attempt === attempt && current.session === authenticatedState
        ? {
            ...current,
            presentation:
              current.presentation.status === 'ready'
                ? {
                    ...current.presentation,
                    loadMoreFailed: false,
                    loadingMore: true,
                  }
                : current.presentation,
          }
        : current,
    );

    try {
      const result = await loadOrderHistoryPage(orders, {
        cursor,
        limit: PAGE_LIMIT,
      });
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
          current.session !== authenticatedState ||
          current.nextCursor !== cursor
        ) {
          return current;
        }

        if (result.kind === 'failed') {
          const status = toOrderHistoryFailureStatus(result.failure);
          return status === 'error' && current.presentation.status === 'ready'
            ? {
                ...current,
                presentation: {
                  ...current.presentation,
                  loadMoreFailed: true,
                  loadingMore: false,
                },
              }
            : {
                ...current,
                nextCursor: undefined,
                presentation: { status },
              };
        }

        const summaries = Object.freeze([
          ...current.summaries,
          ...result.data.summaries,
        ]);
        const details = Object.freeze([
          ...current.details,
          ...result.data.details,
        ]);
        const nextCursor = getNextOrderHistoryCursor(
          result.data.nextCursor,
          consumedCursors.current,
        );

        return Object.freeze({
          ...current,
          details,
          ...(nextCursor ? { nextCursor } : { nextCursor: undefined }),
          presentation: Object.freeze({
            data: toOrderHistoryPresentationRows(summaries, 'en', { details }),
            hasMore: Boolean(nextCursor),
            loadingMore: false,
            status: 'ready',
          }),
          summaries,
        });
      });
    } catch {
      if (
        focusGeneration.current !== generation ||
        pendingCursor.current !== cursor
      ) {
        return;
      }
      pendingCursor.current = undefined;
      setLoad((current) =>
        current?.attempt === attempt &&
        current.session === authenticatedState &&
        current.presentation.status === 'ready'
          ? {
              ...current,
              presentation: {
                ...current.presentation,
                loadMoreFailed: true,
                loadingMore: false,
              },
            }
          : current,
      );
    }
  }

  return (
    <>
      <StatusBar style="dark" />
      <OrderHistoryPresentation
        merchantHeaderState={merchantHeader.state}
        onLoadMore={() => void loadMore()}
        onOpenAccount={() => router.push('/account' as Href)}
        onRefresh={() => void refresh()}
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

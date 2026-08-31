import { useNetworkState } from 'expo-network';
import { router, type Href, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';

import {
  createFavouriteCartIntentKey,
  FavouritesPresentation,
  loadFavouritesRoute,
  submitFavouriteToCart,
  toFavouritePresentationRows,
  type FavouriteAddActionState,
  type FavouriteCartIntentIds,
  type FavouriteCartRetryPhase,
  type FavouritesRouteLoadResult,
} from '@/features/favourites';
import { useMerchantLocationHeader } from '@/features/_shared';
import { getStorefrontRuntime } from '@/lib/storefront';

type FavouriteAddSubmission = Readonly<{
  intents: FavouriteCartIntentIds;
  productId: string;
  retryPhase?: FavouriteCartRetryPhase;
  status: FavouriteAddActionState['status'];
}>;

type FavouritesRouteRequest = Readonly<{
  attempt: number;
  result: FavouritesRouteLoadResult;
}>;

export default function FavouritesRoute() {
  const runtime = getStorefrontRuntime();
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const networkState = useNetworkState();
  const focusGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const intentSequence = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<FavouritesRouteRequest>();
  const [submission, setSubmission] = useState<FavouriteAddSubmission>();

  useFocusEffect(
    useCallback(() => {
      const generation = ++focusGeneration.current;
      const requestedAttempt = attempt;
      mutationGeneration.current += 1;
      setSubmission(undefined);

      if (runtime.capabilities.favourites !== 'enabled') {
        setRequest({
          attempt: requestedAttempt,
          result: { kind: 'failed', status: 'unavailable' },
        });
        return () => {
          focusGeneration.current += 1;
          mutationGeneration.current += 1;
        };
      }

      setRequest(undefined);
      void loadFavouritesRoute(
        {
          bootstrap: runtime.services.bootstrap,
          favourites: runtime.services.favourites,
          locationId: runtime.environment.locationId,
          products: runtime.client.products,
        },
        {
          isConnected: networkState.isConnected,
          isInternetReachable: networkState.isInternetReachable,
        },
      )
        .then((result) => {
          if (
            focusGeneration.current === generation &&
            requestedAttempt === attempt
          ) {
            setRequest({ attempt: requestedAttempt, result });
          }
        })
        .catch(() => {
          if (
            focusGeneration.current === generation &&
            requestedAttempt === attempt
          ) {
            setRequest({
              attempt: requestedAttempt,
              result: { kind: 'failed', status: 'error' },
            });
          }
        });

      return () => {
        focusGeneration.current += 1;
        mutationGeneration.current += 1;
      };
    }, [
      attempt,
      networkState.isConnected,
      networkState.isInternetReachable,
      runtime,
    ]),
  );

  const load = request?.attempt === attempt ? request.result : undefined;

  async function addFavourite(productId: string) {
    if (
      load?.kind !== 'ready' ||
      !load.canAdd ||
      submission?.status === 'pending'
    ) {
      return;
    }

    const resolution = load.resolutions.find(
      (candidate) =>
        candidate.kind === 'ready' && candidate.item.productId === productId,
    );
    if (!resolution || resolution.kind !== 'ready') return;

    const retryPhase =
      submission?.productId === productId &&
      submission.status === 'retryable'
        ? submission.retryPhase
        : undefined;
    const intents =
      retryPhase && submission?.productId === productId
        ? submission.intents
        : Object.freeze({
            add: createFavouriteCartIntentKey(
              'add',
              Date.now(),
              ++intentSequence.current,
            ),
            start: createFavouriteCartIntentKey(
              'start',
              Date.now(),
              ++intentSequence.current,
            ),
          });
    const generation = ++mutationGeneration.current;
    setSubmission({
      intents,
      productId,
      ...(retryPhase ? { retryPhase } : {}),
      status: 'pending',
    });

    const result = await submitFavouriteToCart(
      runtime.services.cart,
      resolution,
      intents,
      retryPhase,
    );
    if (mutationGeneration.current !== generation) return;

    setSubmission(
      result.kind === 'added'
        ? { intents, productId, status: 'added' }
        : result.kind === 'refresh_required'
          ? { intents, productId, status: 'refresh_required' }
          : result.kind === 'retryable'
            ? {
                intents,
                productId,
                ...(result.retry === 'same_intent' && result.phase
                  ? { retryPhase: result.phase }
                  : {}),
                status: 'retryable',
              }
            : { intents, productId, status: 'unavailable' },
    );
  }

  const presentationState =
    !load
      ? { status: 'loading' as const }
      : load.kind === 'failed'
        ? { status: load.status }
        : {
            data: toFavouritePresentationRows(load.resolutions),
            status: 'ready' as const,
          };
  const actionState: FavouriteAddActionState | undefined = submission
    ? { productId: submission.productId, status: submission.status }
    : undefined;

  return (
    <>
      <StatusBar style="dark" />
      <FavouritesPresentation
        actionState={actionState}
        merchantHeaderState={merchantHeader.state}
        onAdd={
          load?.kind === 'ready' && load.canAdd
            ? (productId) => void addFavourite(productId)
            : undefined
        }
        onOpenAccount={() => router.push('/account' as Href)}
        onRetry={() => {
          merchantHeader.retry();
          setAttempt((value) => value + 1);
        }}
        orderingAvailable={load?.kind === 'ready' ? load.canAdd : undefined}
        state={presentationState}
      />
    </>
  );
}

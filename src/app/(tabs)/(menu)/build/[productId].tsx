import type { SelectedModifierTypes } from '@craveup/storefront-sdk';
import { useNetworkState } from 'expo-network';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  BuildPresentation,
  loadBuildYourOrder,
  projectBuildYourOrder,
  type BuildYourOrderLoadResult,
} from '@/features/build';
import {
  createItemCartIntentKey,
  setItemOptionQuantity,
  submitItemToCart,
  type ItemAddActionStatus,
  type ItemCartIntentIds,
  type ItemCartRetryPhase,
} from '@/features/item';
import { getStorefrontRuntime, type StorefrontRuntime } from '@/lib/storefront';

type BuildRequest = Readonly<{
  attempt: number;
  productId: string;
  result: BuildYourOrderLoadResult;
}>;

type BuildSubmission = Readonly<{
  intents: ItemCartIntentIds;
  retryPhase?: ItemCartRetryPhase;
  status: ItemAddActionStatus;
}>;

function readProductId(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function tryGetBuildRuntime(): StorefrontRuntime | undefined {
  try {
    return getStorefrontRuntime();
  } catch {
    return undefined;
  }
}

export default function BuildYourOrderRoute() {
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = readProductId(params.productId);
  const runtime = useMemo(() => tryGetBuildRuntime(), []);
  const network = useNetworkState();
  const generation = useRef(0);
  const addGeneration = useRef(0);
  const intentSequence = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<BuildRequest>();
  const [selections, setSelections] = useState<readonly SelectedModifierTypes[]>([]);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [submission, setSubmission] = useState<BuildSubmission>();

  useFocusEffect(
    useCallback(() => {
      const activeGeneration = ++generation.current;
      const requestedAttempt = attempt;
      addGeneration.current += 1;
      setRequest(undefined);
      setSelections([]);
      setValidationAttempted(false);
      setSubmission(undefined);

      if (!runtime) {
        setRequest({
          attempt: requestedAttempt,
          productId,
          result: { kind: 'failed', status: 'unavailable' },
        });
        return () => {
          generation.current += 1;
          addGeneration.current += 1;
        };
      }

      void loadBuildYourOrder(
        {
          bootstrap: runtime.services.bootstrap,
          locationId: runtime.environment.locationId,
          products: runtime.client.products,
        },
        productId,
        {
          isConnected: network.isConnected,
          isInternetReachable: network.isInternetReachable,
        },
      )
        .then((result) => {
          if (
            generation.current === activeGeneration &&
            requestedAttempt === attempt
          ) {
            setRequest({ attempt: requestedAttempt, productId, result });
          }
        })
        .catch(() => {
          if (
            generation.current === activeGeneration &&
            requestedAttempt === attempt
          ) {
            setRequest({
              attempt: requestedAttempt,
              productId,
              result: { kind: 'failed', status: 'error' },
            });
          }
        });

      return () => {
        generation.current += 1;
        addGeneration.current += 1;
      };
    }, [
      attempt,
      network.isConnected,
      network.isInternetReachable,
      productId,
      runtime,
    ]),
  );

  const load =
    request?.attempt === attempt && request.productId === productId
      ? request.result
      : undefined;
  const model = useMemo(
    () =>
      load?.kind === 'ready'
        ? projectBuildYourOrder(
            load.product,
            selections,
            validationAttempted,
          )
        : undefined,
    [load, selections, validationAttempted],
  );

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/menu');
  }

  async function addItem() {
    if (
      !runtime ||
      !model ||
      load?.kind !== 'ready' ||
      submission?.status === 'pending'
    ) {
      return;
    }
    if (!model.canAdd) {
      setValidationAttempted(true);
      return;
    }

    const retryPhase =
      submission?.status === 'retryable' ? submission.retryPhase : undefined;
    const intents =
      retryPhase && submission
        ? submission.intents
        : Object.freeze({
            add: createItemCartIntentKey(
              'add',
              Date.now(),
              ++intentSequence.current,
            ),
            start: createItemCartIntentKey(
              'start',
              Date.now(),
              ++intentSequence.current,
            ),
          });
    const activeGeneration = ++addGeneration.current;
    setSubmission({
      intents,
      ...(retryPhase ? { retryPhase } : {}),
      status: 'pending',
    });

    const result = await submitItemToCart({
      cart: runtime.services.cart,
      intents,
      locationId: runtime.environment.locationId,
      productId: model.id,
      products: runtime.client.products,
      quantity: 1,
      ...(retryPhase ? { retryPhase } : {}),
      selections,
    });
    if (addGeneration.current !== activeGeneration) return;

    setSubmission(
      result.kind === 'retryable'
        ? {
            intents,
            ...(result.retry === 'same_intent' && result.phase
              ? { retryPhase: result.phase }
              : {}),
            status: 'retryable',
          }
        : { intents, status: result.kind },
    );
  }

  const state = !load
    ? ({ status: 'loading' } as const)
    : load.kind === 'failed'
      ? ({ status: load.status } as const)
      : ({ data: model!, status: 'ready' } as const);

  return (
    <>
      <StatusBar style="dark" />
      <BuildPresentation
        actionStatus={submission?.status}
        onAdd={runtime ? () => void addItem() : undefined}
        onBack={goBack}
        onRetry={() => setAttempt((value) => value + 1)}
        onSetOptionQuantity={(path, optionId, optionQuantity) => {
          if (load?.kind !== 'ready' || submission?.status === 'pending') return;
          setSelections((current) =>
            setItemOptionQuantity(
              load.product,
              current,
              path,
              optionId,
              optionQuantity,
            ),
          );
          setSubmission(undefined);
        }}
        orderingAvailable={
          runtime && load?.kind === 'ready' ? load.canStartOrder : false
        }
        state={state}
      />
    </>
  );
}

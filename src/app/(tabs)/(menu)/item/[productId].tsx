import { useNetworkState } from 'expo-network';
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  createItemCartIntentKey,
  ItemDetailPresentation,
  loadItemDetail,
  projectItemFavourite,
  projectItemDetail,
  setItemOptionQuantity,
  submitItemToCart,
  type ItemAddActionStatus,
  type ItemCartIntentIds,
  type ItemCartRetryPhase,
  type ItemDetailLoadResult,
} from '@/features/item';
import {
  getStorefrontRuntime,
  type StorefrontRuntime,
} from '@/lib/storefront';
import type { SelectedModifierTypes } from '@craveup/storefront-sdk';

type ItemRequest = Readonly<{
  attempt: number;
  productId: string;
  result: ItemDetailLoadResult;
}>;

type ItemSubmission = Readonly<{
  intents: ItemCartIntentIds;
  retryPhase?: ItemCartRetryPhase;
  status: ItemAddActionStatus;
}>;

function readProductId(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function tryGetItemRuntime(): StorefrontRuntime | undefined {
  try {
    return getStorefrontRuntime();
  } catch {
    return undefined;
  }
}

export default function ItemDetailRoute() {
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = readProductId(params.productId);
  const runtime = useMemo(() => tryGetItemRuntime(), []);
  const network = useNetworkState();
  const generation = useRef(0);
  const addGeneration = useRef(0);
  const favouriteGeneration = useRef(0);
  const intentSequence = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<ItemRequest>();
  const [selections, setSelections] = useState<readonly SelectedModifierTypes[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [favourite, setFavourite] = useState(false);
  const [favouritePending, setFavouritePending] = useState(false);
  const [submission, setSubmission] = useState<ItemSubmission>();

  useFocusEffect(
    useCallback(() => {
      const activeGeneration = ++generation.current;
      const requestedAttempt = attempt;
      addGeneration.current += 1;
      favouriteGeneration.current += 1;
      setRequest(undefined);
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
          favouriteGeneration.current += 1;
        };
      }

      void Promise.all([
        loadItemDetail(
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
        ),
        runtime.capabilities.favourites === 'enabled'
          ? runtime.services.favourites.list().catch(() => [])
          : Promise.resolve([]),
      ])
        .then(([result, favourites]) => {
          if (
            generation.current !== activeGeneration ||
            requestedAttempt !== attempt
          ) {
            return;
          }
          const saved =
            result.kind === 'ready'
              ? projectItemFavourite(result.product, favourites)
              : { favourite: false, selections: [] };
          setSelections(saved.selections);
          setQuantity(1);
          setFavourite(saved.favourite);
          setRequest({ attempt: requestedAttempt, productId, result });
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
        favouriteGeneration.current += 1;
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
        ? projectItemDetail(
            load.product,
            selections,
            quantity,
            load.nutrition,
            load.alternatives,
          )
        : undefined,
    [load, quantity, selections],
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
      quantity,
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

  async function toggleFavourite() {
    if (
      load?.kind !== 'ready' ||
      !runtime ||
      runtime.capabilities.favourites !== 'enabled' ||
      favouritePending
    ) {
      return;
    }
    const activeGeneration = ++favouriteGeneration.current;
    setFavouritePending(true);

    try {
      if (favourite) {
        const removed = await runtime.services.favourites.remove(load.product.id);
        if (favouriteGeneration.current === activeGeneration && removed) {
          setFavourite(false);
        }
      } else {
        const saved = await runtime.services.favourites.save(
          load.product,
          selections,
        );
        if (favouriteGeneration.current === activeGeneration && saved.ok) {
          setFavourite(true);
        }
      }
    } catch {
      // Local favourites are optional item decoration; retain the confirmed state.
    } finally {
      if (favouriteGeneration.current === activeGeneration) {
        setFavouritePending(false);
      }
    }
  }

  const state = !load
    ? ({ status: 'loading' } as const)
    : load.kind === 'failed'
      ? ({ status: load.status } as const)
      : ({ data: model!, status: 'ready' } as const);

  return (
    <>
      <StatusBar style="dark" />
      <ItemDetailPresentation
        actionStatus={submission?.status}
        favourite={favourite}
        favouritePending={favouritePending}
        onAdd={runtime && model?.canAdd ? () => void addItem() : undefined}
        onBack={goBack}
        onChangeQuantity={(nextQuantity) => {
          if (submission?.status === 'pending') return;
          setQuantity(nextQuantity);
        }}
        onRetry={() => setAttempt((value) => value + 1)}
        onSelectAlternative={(nextProductId) =>
          router.replace({
            pathname: '/item/[productId]',
            params: { productId: nextProductId },
          })
        }
        onSetOptionQuantity={(path, optionId, optionQuantity) => {
          if (
            load?.kind !== 'ready' ||
            submission?.status === 'pending' ||
            favouritePending
          ) {
            return;
          }
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
        onToggleFavourite={
          runtime?.capabilities.favourites === 'enabled'
            ? () => void toggleFavourite()
            : undefined
        }
        onViewNutrition={() =>
          router.push({
            pathname: '/item/[productId]/nutrition',
            params: { productId },
          })
        }
        orderingAvailable={
          runtime && load?.kind === 'ready' ? load.canStartOrder : false
        }
        state={state}
      />
    </>
  );
}

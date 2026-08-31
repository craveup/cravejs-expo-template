import { useNetworkState } from 'expo-network';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { loadItemDetail, type ItemDetailLoadResult } from '@/features/item';
import {
  NutritionPresentation,
  projectNutritionPresentation,
} from '@/features/nutrition';
import { getStorefrontRuntime, type StorefrontRuntime } from '@/lib/storefront';

type NutritionRequest = Readonly<{
  attempt: number;
  productId: string;
  result: ItemDetailLoadResult;
}>;

function readProductId(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function tryGetNutritionRuntime(): StorefrontRuntime | undefined {
  try {
    return getStorefrontRuntime();
  } catch {
    return undefined;
  }
}

export default function NutritionRoute() {
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = readProductId(params.productId);
  const runtime = useMemo(() => tryGetNutritionRuntime(), []);
  const network = useNetworkState();
  const generation = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<NutritionRequest>();

  useFocusEffect(
    useCallback(() => {
      const activeGeneration = ++generation.current;
      const requestedAttempt = attempt;
      setRequest(undefined);

      if (!runtime) {
        setRequest({
          attempt: requestedAttempt,
          productId,
          result: { kind: 'failed', status: 'unavailable' },
        });
        return () => {
          generation.current += 1;
        };
      }

      void loadItemDetail(
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
  const state = load
    ? projectNutritionPresentation(load)
    : ({ status: 'loading' } as const);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/item/[productId]',
      params: { productId },
    });
  }

  return (
    <NutritionPresentation
      onBack={goBack}
      onRetry={() => setAttempt((value) => value + 1)}
      state={state}
    />
  );
}

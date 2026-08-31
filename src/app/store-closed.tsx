import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  createFulfillmentAvailabilityService,
  createFulfillmentIntentKey,
  FulfillmentRouteStateScreen,
  loadFulfillmentFlow,
  StoreClosedScreen,
  type FulfillmentFlowClosed,
} from '@/features/fulfillment';
import { getStorefrontRuntime, type StorefrontRuntime } from '@/lib/storefront';
import { hasScheduledPickupOption } from '@/features/schedule/storefront-order-times';

type ClosedLoad = Readonly<{
  attempt: number;
  data?: FulfillmentFlowClosed;
  status: 'closed' | 'unavailable';
}>;

function tryGetRuntime(): StorefrontRuntime | undefined {
  try {
    return getStorefrontRuntime();
  } catch {
    return undefined;
  }
}

export default function StoreClosedRoute() {
  const runtime = useMemo(() => tryGetRuntime(), []);
  const availability = useMemo(
    () =>
      runtime
        ? createFulfillmentAvailabilityService(
            runtime.client,
            runtime.environment.merchantSlug,
          )
        : undefined,
    [runtime],
  );
  const generation = useRef(0);
  const sequence = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<ClosedLoad>();

  useFocusEffect(
    useCallback(() => {
      const activeGeneration = ++generation.current;
      const requestedAttempt = attempt;
      setLoad(undefined);

      if (!runtime || !availability) {
        setLoad({ attempt: requestedAttempt, status: 'unavailable' });
        return () => {
          generation.current += 1;
        };
      }

      const intentId = createFulfillmentIntentKey(
        'load',
        Date.now(),
        ++sequence.current,
      );
      void loadFulfillmentFlow(
        {
          availability,
          cart: runtime.services.cart,
          cartSessions: runtime.cartSessions,
          locationId: runtime.environment.locationId,
        },
        intentId,
      ).then((result) => {
        if (
          generation.current !== activeGeneration ||
          requestedAttempt !== attempt
        ) {
          return;
        }
        if (result.kind === 'missing-cart') {
          router.replace('/menu');
          return;
        }
        if (result.kind === 'ready') {
          router.replace('/fulfillment');
          return;
        }
        if (result.kind !== 'closed') {
          setLoad({ attempt: requestedAttempt, status: 'unavailable' });
          return;
        }
        setLoad({ attempt: requestedAttempt, data: result.data, status: 'closed' });
      }).catch(() => {
        if (
          generation.current === activeGeneration &&
          requestedAttempt === attempt
        ) {
          setLoad({ attempt: requestedAttempt, status: 'unavailable' });
        }
      });

      return () => {
        generation.current += 1;
      };
    }, [attempt, availability, runtime]),
  );

  const currentLoad = load?.attempt === attempt ? load : undefined;
  const schedule = currentLoad?.data?.schedule;
  const canSchedule =
    currentLoad?.data?.cart.fulfilmentMethod === 'takeout' &&
    schedule !== undefined &&
    hasScheduledPickupOption(schedule);

  return (
    <>
      <StatusBar style="dark" />
      {!currentLoad ? (
        <FulfillmentRouteStateScreen loading />
      ) : currentLoad.status !== 'closed' || !currentLoad.data ? (
        <FulfillmentRouteStateScreen
          loading={false}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : (
        <StoreClosedScreen
          nextOrderingSlotLabel={currentLoad.data.nextOrderingSlotLabel}
          onFindAnotherStore={() => router.replace('/locations')}
          onScheduleLater={
            canSchedule ? () => router.replace('/schedule') : undefined
          }
          storeName={currentLoad.data.locationName}
        />
      )}
    </>
  );
}

import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  applyPickupSchedule,
  createFulfillmentAvailabilityService,
  createFulfillmentIntentKey,
  FulfillmentRouteStateScreen,
  loadPickupScheduleFlow,
  type PickupScheduleFlowReady,
} from '@/features/fulfillment';
import { useMerchantLocationHeader } from '@/features/_shared';
import {
  PickupScheduleScreen,
  type PickupScheduleScreenProps,
} from '@/features/schedule/PickupScheduleScreen';
import {
  getInitialScheduleSelection,
  getIntervalsForDay,
  type PickupScheduleSelection,
} from '@/features/schedule/pickup-schedule';
import { getStorefrontRuntime, type StorefrontRuntime } from '@/lib/storefront';

type ScheduleLoad =
  | Readonly<{
      attempt: number;
      data: PickupScheduleFlowReady;
      status: 'ready';
    }>
  | Readonly<{
      attempt: number;
      status: 'unavailable';
    }>;

type ReadyScheduleProps = Omit<
  PickupScheduleScreenProps,
  'merchantHeaderState' | 'onOpenAccount'
> &
  Readonly<{ runtime: StorefrontRuntime }>;

function ReadyPickupSchedule({ runtime, ...props }: ReadyScheduleProps) {
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);

  return (
    <PickupScheduleScreen
      {...props}
      merchantHeaderState={merchantHeader.state}
      onOpenAccount={() => router.push('/account')}
    />
  );
}

function tryGetRuntime(): StorefrontRuntime | undefined {
  try {
    return getStorefrontRuntime();
  } catch {
    return undefined;
  }
}

export default function PickupScheduleRoute() {
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
  const mutationGeneration = useRef(0);
  const sequence = useRef(0);
  const retryIntent = useRef<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<ScheduleLoad>();
  const [selection, setSelection] = useState<PickupScheduleSelection>();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [retrySameIntent, setRetrySameIntent] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const activeGeneration = ++generation.current;
      const requestedAttempt = attempt;
      mutationGeneration.current += 1;
      setLoad(undefined);
      setSelection(undefined);
      setPending(false);
      setErrorMessage(undefined);
      setRetrySameIntent(false);
      retryIntent.current = undefined;

      if (!runtime || !availability) {
        setLoad({ attempt: requestedAttempt, status: 'unavailable' });
        return () => {
          generation.current += 1;
          mutationGeneration.current += 1;
        };
      }

      const intentId = createFulfillmentIntentKey(
        'load',
        Date.now(),
        ++sequence.current,
      );
      void loadPickupScheduleFlow(
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
        if (result.kind === 'pickup-required') {
          router.replace('/fulfillment');
          return;
        }
        if (result.kind !== 'ready') {
          setLoad({ attempt: requestedAttempt, status: 'unavailable' });
          return;
        }
        const initial = getInitialScheduleSelection(
          result.data.schedule.days,
          result.data.schedule.allowAsap,
          result.data.cart,
        );
        if (!initial) {
          setLoad({ attempt: requestedAttempt, status: 'unavailable' });
          return;
        }
        setSelection(initial);
        setLoad({ attempt: requestedAttempt, data: result.data, status: 'ready' });
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
        mutationGeneration.current += 1;
      };
    }, [attempt, availability, runtime]),
  );

  const currentLoad = load?.attempt === attempt ? load : undefined;

  function replaceSelection(next: PickupScheduleSelection) {
    setSelection(next);
    setErrorMessage(undefined);
    setRetrySameIntent(false);
    retryIntent.current = undefined;
  }

  async function submitSchedule(next: PickupScheduleSelection) {
    if (!runtime || currentLoad?.status !== 'ready' || pending) return;
    const readyLoad = currentLoad;
    const intentId =
      retrySameIntent && retryIntent.current
        ? retryIntent.current
        : createFulfillmentIntentKey(
            'schedule',
            Date.now(),
            ++sequence.current,
          );
    const activeGeneration = ++mutationGeneration.current;
    retryIntent.current = intentId;
    setPending(true);
    setErrorMessage(undefined);

    const result = await applyPickupSchedule(
      {
        cart: runtime.services.cart,
        locationId: runtime.environment.locationId,
      },
      readyLoad.data.cart,
      readyLoad.data.schedule,
      next,
      intentId,
      retrySameIntent,
    );
    if (mutationGeneration.current !== activeGeneration) return;
    setPending(false);

    if (result.kind === 'completed') {
      retryIntent.current = undefined;
      router.replace('/bag');
      return;
    }
    if (result.kind === 'refresh-required') {
      if (result.cart.fulfilmentMethod !== 'takeout') {
        retryIntent.current = undefined;
        router.replace('/fulfillment');
        return;
      }
      setLoad({
        attempt,
        data: { ...readyLoad.data, cart: result.cart },
        status: 'ready',
      });
      setRetrySameIntent(false);
      retryIntent.current = undefined;
      setErrorMessage('Your bag changed. Confirm this pickup time again.');
      return;
    }
    if (result.kind === 'retryable') {
      setRetrySameIntent(result.retry === 'same-intent');
      if (result.retry !== 'same-intent') retryIntent.current = undefined;
      setErrorMessage('We could not schedule pickup. Try again safely.');
      return;
    }
    setRetrySameIntent(false);
    retryIntent.current = undefined;
    setErrorMessage(
      result.kind === 'selection-invalid'
        ? 'Choose one of the available pickup times.'
        : 'Pickup could not be scheduled right now.',
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {!runtime || !currentLoad ? (
        <FulfillmentRouteStateScreen loading />
      ) : currentLoad.status !== 'ready' || !selection ? (
        <FulfillmentRouteStateScreen
          loading={false}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : (
        <ReadyPickupSchedule
          allowAsap={currentLoad.data.schedule.allowAsap}
          asapSelected={selection.pickupType === 'ASAP'}
          days={currentLoad.data.schedule.days}
          errorMessage={errorMessage}
          onAsapSelect={() => replaceSelection({ pickupType: 'ASAP' })}
          onDayChange={(dayValue) => {
            const intervalValue =
              getIntervalsForDay(currentLoad.data.schedule.days, dayValue)[0]
                ?.value ?? '';
            replaceSelection({ dayValue, intervalValue, pickupType: 'LATER' });
          }}
          onIntervalChange={(intervalValue) => {
            const dayValue =
              selection.pickupType === 'LATER'
                ? selection.dayValue
                : currentLoad.data.schedule.days[0]?.value ?? '';
            replaceSelection({ dayValue, intervalValue, pickupType: 'LATER' });
          }}
          onSchedule={(next) => void submitSchedule(next)}
          pending={pending}
          runtime={runtime}
          selectedDayValue={
            selection.pickupType === 'LATER'
              ? selection.dayValue
              : currentLoad.data.schedule.days[0]?.value ?? ''
          }
          selectedIntervalValue={
            selection.pickupType === 'LATER' ? selection.intervalValue : ''
          }
          storeName={currentLoad.data.locationName}
        />
      )}
    </>
  );
}

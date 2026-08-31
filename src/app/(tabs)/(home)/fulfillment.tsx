import { useFocusEffect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  applyPickupFulfillment,
  createFulfillmentAvailabilityService,
  createFulfillmentIntentKey,
  FulfillmentChoiceScreen,
  FulfillmentRouteStateScreen,
  loadFulfillmentFlow,
  type FulfillmentFlowReady,
  type FulfillmentPresentationChoice,
  type FulfillmentChoiceScreenProps,
} from '@/features/fulfillment';
import { useMerchantLocationHeader } from '@/features/_shared';
import { getStorefrontRuntime, type StorefrontRuntime } from '@/lib/storefront';
import { hasScheduledPickupOption } from '@/features/schedule/storefront-order-times';

type RouteLoad = Readonly<{
  attempt: number;
  data?: FulfillmentFlowReady;
  status: 'ready' | 'unavailable';
}>;

type ReadyChoiceProps = Omit<
  FulfillmentChoiceScreenProps,
  'merchantHeaderState' | 'onOpenAccount'
> &
  Readonly<{ runtime: StorefrontRuntime }>;

function ReadyFulfillmentChoice({ runtime, ...props }: ReadyChoiceProps) {
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);

  return (
    <FulfillmentChoiceScreen
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

export default function FulfillmentRoute() {
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
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<RouteLoad>();
  const [selectedChoice, setSelectedChoice] =
    useState<FulfillmentPresentationChoice>('pickup');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [retrySameIntent, setRetrySameIntent] = useState(false);
  const retryIntent = useRef<string | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      const activeGeneration = ++generation.current;
      const requestedAttempt = attempt;
      mutationGeneration.current += 1;
      setLoad(undefined);
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
        if (result.kind === 'closed') {
          router.replace('/store-closed');
          return;
        }
        if (result.kind !== 'ready') {
          setLoad({ attempt: requestedAttempt, status: 'unavailable' });
          return;
        }
        setSelectedChoice(result.data.selectedChoice);
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

  async function continueWithChoice(choice: FulfillmentPresentationChoice) {
    if (
      choice !== 'pickup' ||
      !runtime ||
      !availability ||
      currentLoad?.status !== 'ready' ||
      !currentLoad.data ||
      pending
    ) {
      return;
    }

    const intentId =
      retrySameIntent && retryIntent.current
        ? retryIntent.current
        : createFulfillmentIntentKey(
            'pickup',
            Date.now(),
            ++sequence.current,
          );
    const activeGeneration = ++mutationGeneration.current;
    retryIntent.current = intentId;
    setPending(true);
    setErrorMessage(undefined);

    const result = await applyPickupFulfillment(
      {
        availability,
        cart: runtime.services.cart,
        locationId: runtime.environment.locationId,
      },
      currentLoad.data.cart,
      intentId,
      retrySameIntent,
    );
    if (mutationGeneration.current !== activeGeneration) return;
    setPending(false);

    if (result.kind === 'completed') {
      retryIntent.current = undefined;
      router.replace(
        result.schedule && hasScheduledPickupOption(result.schedule)
          ? '/schedule'
          : '/bag',
      );
      return;
    }
    if (result.kind === 'closed') {
      retryIntent.current = undefined;
      router.replace('/store-closed');
      return;
    }
    if (result.kind === 'refresh-required') {
      setLoad({
        attempt,
        data: {
          ...currentLoad.data,
          cart: result.cart,
          selectedChoice:
            result.cart.fulfilmentMethod === 'delivery' ? 'delivery' : 'pickup',
        },
        status: 'ready',
      });
      setSelectedChoice(
        result.cart.fulfilmentMethod === 'delivery' ? 'delivery' : 'pickup',
      );
      setRetrySameIntent(false);
      retryIntent.current = undefined;
      setErrorMessage('Your bag changed. Confirm pickup again.');
      return;
    }
    if (result.kind === 'retryable') {
      setRetrySameIntent(result.retry === 'same-intent');
      if (result.retry !== 'same-intent') retryIntent.current = undefined;
      setErrorMessage('We could not update your bag. Try again safely.');
      return;
    }
    setRetrySameIntent(false);
    retryIntent.current = undefined;
    setErrorMessage('Pickup could not be selected right now.');
  }

  return (
    <>
      <StatusBar style="dark" />
      {!runtime || !currentLoad ? (
        <FulfillmentRouteStateScreen loading />
      ) : currentLoad.status !== 'ready' || !currentLoad.data ? (
        <FulfillmentRouteStateScreen
          loading={false}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : (
        <ReadyFulfillmentChoice
          deliveryUnavailableCopy="Enter an address to check availability."
          deliveryEntryEnabled={currentLoad.data.deliveryEntryEnabled}
          errorMessage={errorMessage}
          onContinue={(choice) => void continueWithChoice(choice)}
          onSelectChoice={(choice) => {
            if (pending) return;
            setSelectedChoice(choice);
            setErrorMessage(undefined);
            setRetrySameIntent(false);
            retryIntent.current = undefined;
          }}
          pending={pending}
          pickupLocation={currentLoad.data.pickupLocation}
          runtime={runtime}
          selectedChoice={selectedChoice}
        />
      )}
    </>
  );
}

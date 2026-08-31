import * as Network from 'expo-network';
import { router, Stack, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import {
  applyCheckoutGratuity,
  CheckoutAvailabilityRecoveryScreen,
  CheckoutReviewScreen,
  CheckoutRouteStateScreen,
  createCheckoutIntentKey,
  loadCheckoutFlow,
  projectCheckoutAvailabilityRecovery,
  type CheckoutAvailabilityRecovery,
  type CheckoutFlowReady,
} from '@/features/checkout';
import type { CheckoutHandoffState } from '@/domain/checkout';
import { createHostedCheckoutService } from '@/lib/hosted-checkout';
import { createExpoHostedCheckoutBrowser } from '@/lib/hosted-checkout-browser';
import { getStorefrontRuntime, type StorefrontRuntime } from '@/lib/storefront';
import type { StorefrontFailure } from '@/lib/storefront-errors';
import { createTranslator } from '@/i18n';

type CheckoutLoad =
  | Readonly<{ attempt: number; data: CheckoutFlowReady; status: 'ready' }>
  | Readonly<{ attempt: number; status: 'unavailable' }>;

type HandoffStatus = 'handed_off' | 'idle' | 'outcome_unknown' | 'preparing';

type TipRetry = Readonly<{
  intentId: string;
  selection: string;
}>;

type PendingAvailabilityRecovery = Readonly<{
  failure: StorefrontFailure;
  handoffState: CheckoutHandoffState;
  previous: CheckoutFlowReady;
  targetAttempt: number;
}>;

function tryGetRuntime(): StorefrontRuntime | undefined {
  try {
    return getStorefrontRuntime();
  } catch {
    return undefined;
  }
}

async function isOnline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.isConnected === true && state.isInternetReachable !== false;
}

export default function CheckoutRoute() {
  const t = useMemo(() => createTranslator('en'), []);
  const runtime = useMemo(() => tryGetRuntime(), []);
  const checkout = useMemo(
    () =>
      runtime
        ? createHostedCheckoutService({
            browser: createExpoHostedCheckoutBrowser(),
            checkout: runtime.client.checkout,
            checkoutOrigin: runtime.environment.checkoutOrigin,
            isOnline,
            locationId: runtime.environment.locationId,
            recovery: runtime.services.checkoutRecovery,
          })
        : undefined,
    [runtime],
  );
  const generation = useRef(0);
  const operationGeneration = useRef(0);
  const sequence = useRef(0);
  const tipRetry = useRef<TipRetry | undefined>(undefined);
  const reloadMessage = useRef<string | undefined>(undefined);
  const pendingAvailabilityRecovery = useRef<
    PendingAvailabilityRecovery | undefined
  >(undefined);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<CheckoutLoad>();
  const [availabilityRecovery, setAvailabilityRecovery] = useState<
    CheckoutAvailabilityRecovery | undefined
  >(undefined);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [handoffStatus, setHandoffStatus] = useState<HandoffStatus>('idle');
  const [handoffRetrySameIntent, setHandoffRetrySameIntent] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const activeGeneration = ++generation.current;
      const requestedAttempt = attempt;
      operationGeneration.current += 1;
      setLoad(undefined);
      setPending(false);
      const serviceStatus = checkout?.getState().status;
      setHandoffStatus('preparing');
      setHandoffRetrySameIntent(false);
      setRecoveryPending(true);
      tipRetry.current = undefined;
      if (
        pendingAvailabilityRecovery.current?.targetAttempt !== requestedAttempt
      ) {
        pendingAvailabilityRecovery.current = undefined;
        setAvailabilityRecovery(undefined);
      }

      if (!runtime || !checkout) {
        pendingAvailabilityRecovery.current = undefined;
        setAvailabilityRecovery(undefined);
        setRecoveryPending(false);
        setLoad({ attempt: requestedAttempt, status: 'unavailable' });
        return () => {
          generation.current += 1;
          operationGeneration.current += 1;
        };
      }

      const intentId = createCheckoutIntentKey(
        'load',
        Date.now(),
        ++sequence.current,
      );
      const recoveryPromise = runtime.services.checkoutRecovery.get();
      void recoveryPromise
        .then((recovery) => {
          if (
            generation.current !== activeGeneration ||
            requestedAttempt !== attempt
          ) {
            return;
          }
          const retryablePrepare =
            recovery.status === 'preparing_handoff' &&
            (serviceStatus === 'editing' ||
              serviceStatus === 'preparing_handoff');
          setHandoffRetrySameIntent(retryablePrepare);
          setHandoffStatus(
            serviceStatus === 'handed_off'
              ? 'handed_off'
              : serviceStatus === 'handoff_ready' ||
                  serviceStatus === 'opening_hosted_checkout' ||
                  serviceStatus === 'outcome_unknown' ||
                  (recovery.status !== 'unlocked' && !retryablePrepare)
                ? 'outcome_unknown'
                : 'idle',
          );
          setRecoveryPending(false);
        })
        .catch(() => {
          if (
            generation.current === activeGeneration &&
            requestedAttempt === attempt
          ) {
            setHandoffRetrySameIntent(false);
            setHandoffStatus('outcome_unknown');
            setRecoveryPending(false);
            router.replace('/order/status');
          }
        });
      void Promise.all([
        loadCheckoutFlow(
          {
            auth: runtime.services.customerAuth,
            bootstrap: runtime.services.bootstrap,
            cart: runtime.services.cart,
            cartSessions: runtime.cartSessions,
            gratuity: runtime.client.locations,
            locationId: runtime.environment.locationId,
            ...(runtime.capabilities.loyalty === 'enabled'
              ? { loyalty: runtime.services.loyalty }
              : {}),
          },
          intentId,
        ),
        recoveryPromise,
      ])
        .then(([result, recovery]) => {
          if (
            generation.current !== activeGeneration ||
            requestedAttempt !== attempt
          ) {
            return;
          }
          const recoveryLocked = recovery.status !== 'unlocked';
          const pendingRecovery =
            pendingAvailabilityRecovery.current?.targetAttempt ===
            requestedAttempt
              ? pendingAvailabilityRecovery.current
              : undefined;
          if (result.kind === 'missing_cart') {
            pendingAvailabilityRecovery.current = undefined;
            setAvailabilityRecovery(undefined);
            router.replace(recoveryLocked ? '/order/status' : '/menu');
            return;
          }
          if (result.kind === 'empty_cart') {
            const availability =
              !recoveryLocked && pendingRecovery
                ? projectCheckoutAvailabilityRecovery(
                    pendingRecovery.previous,
                    result.data,
                    pendingRecovery.failure,
                    pendingRecovery.handoffState,
                  )
                : undefined;
            pendingAvailabilityRecovery.current = undefined;
            if (availability) {
              setAvailabilityRecovery(availability);
              setErrorMessage(undefined);
              reloadMessage.current = undefined;
              return;
            }
            setAvailabilityRecovery(undefined);
            router.replace(recoveryLocked ? '/order/status' : '/menu');
            return;
          }
          if (result.kind !== 'ready') {
            pendingAvailabilityRecovery.current = undefined;
            setAvailabilityRecovery(undefined);
            if (recoveryLocked) {
              router.replace('/order/status');
              return;
            }
            setLoad({ attempt: requestedAttempt, status: 'unavailable' });
            return;
          }
          if (
            recovery.status === 'preparing_handoff' &&
            (recovery.cartId !== result.data.cart.id ||
              recovery.revision !== result.data.cart.revision)
          ) {
            setHandoffRetrySameIntent(false);
            setHandoffStatus('outcome_unknown');
          }
          const availability = pendingRecovery
            ? projectCheckoutAvailabilityRecovery(
                pendingRecovery.previous,
                result.data,
                pendingRecovery.failure,
                pendingRecovery.handoffState,
              )
            : undefined;
          pendingAvailabilityRecovery.current = undefined;
          setAvailabilityRecovery(availability);
          setLoad({
            attempt: requestedAttempt,
            data: result.data,
            status: 'ready',
          });
          setErrorMessage(availability ? undefined : reloadMessage.current);
          reloadMessage.current = undefined;
        })
        .catch(() => {
          if (
            generation.current === activeGeneration &&
            requestedAttempt === attempt
          ) {
            pendingAvailabilityRecovery.current = undefined;
            setAvailabilityRecovery(undefined);
            setLoad({ attempt: requestedAttempt, status: 'unavailable' });
          }
        });

      return () => {
        generation.current += 1;
        operationGeneration.current += 1;
      };
    }, [attempt, checkout, runtime]),
  );

  const currentLoad = load?.attempt === attempt ? load : undefined;
  const terminalHandoff =
    handoffStatus === 'handed_off' || handoffStatus === 'outcome_unknown';
  const navigationLocked =
    recoveryPending || terminalHandoff || handoffRetrySameIntent;

  useEffect(() => {
    if (!navigationLocked) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => true,
    );
    return () => subscription.remove();
  }, [navigationLocked]);

  async function changeGratuity(selection: string) {
    if (
      !runtime ||
      currentLoad?.status !== 'ready' ||
      pending ||
      availabilityRecovery !== undefined ||
      handoffRetrySameIntent ||
      terminalHandoff
    ) {
      return;
    }
    const activeGeneration = ++operationGeneration.current;
    const retryCommand = tipRetry.current;
    const retry = retryCommand?.selection === selection;
    const intentId = retry
      ? retryCommand.intentId
      : createCheckoutIntentKey('tip', Date.now(), ++sequence.current);
    setPending(true);
    setErrorMessage(undefined);

    const result = await applyCheckoutGratuity(
      {
        cart: runtime.services.cart,
        locationId: runtime.environment.locationId,
        ...(runtime.capabilities.loyalty === 'enabled'
          ? { loyalty: runtime.services.loyalty }
          : {}),
      },
      currentLoad.data,
      selection,
      intentId,
      retry,
    );
    if (operationGeneration.current !== activeGeneration) return;
    setPending(false);

    if (result.kind === 'completed' || result.kind === 'refresh_required') {
      setLoad({ attempt, data: result.data, status: 'ready' });
      tipRetry.current = undefined;
      setErrorMessage(
        result.kind === 'refresh_required'
          ? t('checkout.error.cartChanged')
          : undefined,
      );
      return;
    }
    if (result.kind === 'retryable') {
      tipRetry.current =
        result.retry === 'same_intent' ? { intentId, selection } : undefined;
      setErrorMessage(t('checkout.error.tipRetry'));
      return;
    }
    tipRetry.current = undefined;
    setErrorMessage(t('checkout.error.totalsUnavailable'));
  }

  async function continueToHostedCheckout() {
    if (
      !runtime ||
      !checkout ||
      currentLoad?.status !== 'ready' ||
      pending ||
      availabilityRecovery !== undefined ||
      terminalHandoff
    ) {
      return;
    }
    if (tipRetry.current) {
      setErrorMessage(t('checkout.error.tipPending'));
      return;
    }
    const cartState = runtime.services.cart.getState();
    if (
      cartState.status !== 'ready' ||
      cartState.cart.id !== currentLoad.data.cart.id ||
      cartState.cart.revision !== currentLoad.data.cart.revision
    ) {
      reloadMessage.current =
        t('checkout.error.cartChanged');
      setAttempt((value) => value + 1);
      return;
    }
    const activeGeneration = ++operationGeneration.current;
    setPending(true);
    setErrorMessage(undefined);
    setHandoffStatus('preparing');

    const result = handoffRetrySameIntent
      ? checkout.getState().status === 'preparing_handoff'
        ? await checkout.retry()
        : await checkout.resume(currentLoad.data.cart)
      : await checkout.start(
          currentLoad.data.cart,
          createCheckoutIntentKey('handoff', Date.now(), ++sequence.current),
        );
    if (operationGeneration.current !== activeGeneration) return;
    setPending(false);

    if (result.kind === 'handed_off') {
      setHandoffRetrySameIntent(false);
      setHandoffStatus('handed_off');
      return;
    }
    if (result.kind === 'outcome_unknown') {
      setHandoffRetrySameIntent(false);
      setHandoffStatus('outcome_unknown');
      return;
    }
    setHandoffStatus('idle');
    if (result.kind === 'retryable') {
      setHandoffRetrySameIntent(true);
      setErrorMessage(
        t('checkout.error.prepareUnknown'),
      );
      return;
    }
    setHandoffRetrySameIntent(false);
    if (result.kind === 'expired') {
      setErrorMessage(t('checkout.error.expired'));
      return;
    }
    if (result.kind === 'failed') {
      if (
        result.failure.kind !== 'timeout' &&
        result.failure.code !== 'NETWORK_OFFLINE'
      ) {
        const targetAttempt = attempt + 1;
        pendingAvailabilityRecovery.current = Object.freeze({
          failure: result.failure,
          handoffState: result.state,
          previous: currentLoad.data,
          targetAttempt,
        });
        reloadMessage.current =
          t('checkout.error.validationRefresh');
        setAttempt(targetAttempt);
        return;
      }
      setErrorMessage(t('checkout.error.offline'));
      return;
    }
    setErrorMessage(t('checkout.error.start'));
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack.Screen options={{ gestureEnabled: !navigationLocked }} />
      {availabilityRecovery ? (
        <CheckoutAvailabilityRecoveryScreen
          onBack={() => router.replace('/bag')}
          onBrowseMenu={() => router.replace('/menu')}
          onReviewUpdatedCheckout={() => {
            if (availabilityRecovery.current.kind === 'empty') {
              router.replace('/bag');
              return;
            }
            setAvailabilityRecovery(undefined);
          }}
          recovery={availabilityRecovery}
        />
      ) : !currentLoad ? (
        <CheckoutRouteStateScreen loading />
      ) : currentLoad.status !== 'ready' ? (
        <CheckoutRouteStateScreen
          loading={false}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : (
        <CheckoutReviewScreen
          errorMessage={errorMessage}
          handoffStatus={handoffStatus}
          onCheckStatus={() => router.replace('/order/status')}
          onContinue={() => void continueToHostedCheckout()}
          onGratuityChange={(selection) => void changeGratuity(selection)}
          pending={pending}
          reviewLocked={handoffRetrySameIntent}
          retrySameIntent={handoffRetrySameIntent}
          review={currentLoad.data.review}
        />
      )}
    </>
  );
}

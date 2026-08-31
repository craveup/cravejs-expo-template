import { useNetworkState } from 'expo-network';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  isOrderStatusOffline,
  loadActiveOrderStatus,
  type ActiveOrderStatusService,
  type OrderStatusLifecycle,
} from './order-status-loader';
import {
  getOrderStatusPollDelay,
  toOrderStatusPresentationState,
  type OrderStatusPresentationState,
} from './order-status-presentation';

type PollTimer = ReturnType<typeof setTimeout>;
type RefreshRequest = Readonly<{ showLoading: boolean; version: number }>;

export type UseActiveOrderStatusInput = Readonly<{
  lifecycle: OrderStatusLifecycle;
  orders: ActiveOrderStatusService;
}>;

export type ActiveOrderStatusController = Readonly<{
  retry(): void;
  state: OrderStatusPresentationState;
}>;

export function useActiveOrderStatus({
  lifecycle,
  orders,
}: UseActiveOrderStatusInput): ActiveOrderStatusController {
  const networkState = useNetworkState();
  const offline = isOrderStatusOffline(networkState);
  const navigation = useNavigation();
  const [refreshRequest, setRefreshRequest] = useState<RefreshRequest>({
    showLoading: true,
    version: 0,
  });
  const [state, setState] = useState<OrderStatusPresentationState>({
    status: 'loading',
  });
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const focusGeneration = useRef(0);
  const focused = useRef(false);
  const pending = useRef(false);
  const pollTimer = useRef<PollTimer | undefined>(undefined);
  const refreshOnForeground = useRef(false);
  const requestInFlight = useRef(false);

  useEffect(
    () =>
      navigation.addListener('blur', () => setState({ status: 'loading' })),
    [navigation],
  );

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      pending.current = false;
      refreshOnForeground.current = false;
      requestInFlight.current = false;
      const generation = ++focusGeneration.current;
      if (refreshRequest.showLoading) setState({ status: 'loading' });

      if (appState.current !== 'active') {
        refreshOnForeground.current = true;
      } else if (offline) {
        setState({ status: 'offline' });
      } else {
        requestInFlight.current = true;
        void loadActiveOrderStatus(lifecycle, orders)
          .then((result) => {
            if (!focused.current || focusGeneration.current !== generation) {
              return;
            }

            requestInFlight.current = false;
            const nextState = toOrderStatusPresentationState(result);
            const delay = getOrderStatusPollDelay(nextState);
            pending.current = delay !== undefined;
            setState(nextState);

            if (delay !== undefined && appState.current === 'active') {
              pollTimer.current = setTimeout(() => {
                if (
                  focused.current &&
                  focusGeneration.current === generation
                ) {
                  setRefreshRequest((current) => ({
                    showLoading: false,
                    version: current.version + 1,
                  }));
                }
              }, delay);
            }
          })
          .catch(() => {
            if (!focused.current || focusGeneration.current !== generation) {
              return;
            }
            requestInFlight.current = false;
            pending.current = false;
            setState({ status: 'error' });
          });
      }

      return () => {
        focused.current = false;
        pending.current = false;
        requestInFlight.current = false;
        focusGeneration.current += 1;
        if (pollTimer.current !== undefined) {
          clearTimeout(pollTimer.current);
          pollTimer.current = undefined;
        }
      };
    }, [lifecycle, offline, orders, refreshRequest]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;

      if (
        nextState !== 'active' &&
        focused.current &&
        (pending.current || requestInFlight.current)
      ) {
        focusGeneration.current += 1;
        pending.current = false;
        requestInFlight.current = false;
        refreshOnForeground.current = true;
        if (pollTimer.current !== undefined) {
          clearTimeout(pollTimer.current);
          pollTimer.current = undefined;
        }
      }

      if (
        nextState === 'active' &&
        previousState !== 'active' &&
        focused.current &&
        refreshOnForeground.current
      ) {
        refreshOnForeground.current = false;
        setRefreshRequest((current) => ({
          showLoading: false,
          version: current.version + 1,
        }));
      }
    });

    return () => subscription.remove();
  }, []);

  const retry = useCallback(() => {
    setRefreshRequest((current) => ({
      showLoading: true,
      version: current.version + 1,
    }));
  }, []);

  return { retry, state };
}

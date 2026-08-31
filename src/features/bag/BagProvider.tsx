import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import type { CheckoutHandoffRecoveryStore } from '../../lib/checkout-handoff-recovery-store.ts';
import {
  loadBag,
  resolveBagMutation,
  retryBagLoad,
  type BagLoaderDependencies,
} from './bag-loader.ts';
import {
  createBagIntentKey,
  itemFromBag,
  type BagItemPresentation,
  type BagPresentationState,
  type BagReadyPresentation,
} from './bag-presentation.ts';

export type BagMutationOutcome =
  | 'completed'
  | 'refresh_required'
  | 'retryable_error'
  | 'terminal_error';

export type BagSelection = Readonly<{
  cartId: string;
  item: BagItemPresentation;
  revision: number;
}>;

type MutationSpec = Readonly<{
  itemId?: string;
  kind: 'clear' | 'quantity' | 'remove';
  quantity?: number;
  snapshot: BagReadyPresentation;
}>;

export type BagContextValue = Readonly<{
  actions: Readonly<{
    clear(): Promise<BagMutationOutcome>;
    clearSelection(): void;
    reload(): void;
    removeSelected(): Promise<BagMutationOutcome>;
    retry(): void;
    selectItem(itemId: string): boolean;
    updateQuantity(itemId: string, quantity: number): Promise<BagMutationOutcome>;
  }>;
  selected?: BagSelection;
  checkoutLocked: boolean;
  state: BagPresentationState;
}>;

export type BagProviderProps = Readonly<{
  active?: boolean;
  children: ReactNode;
  createDependencies: () => BagLoaderDependencies &
    Readonly<{
      cart: CartService;
      checkoutRecovery?: Pick<CheckoutHandoffRecoveryStore, 'isLocked'>;
    }>;
}>;

const BagContext = createContext<BagContextValue | undefined>(undefined);

function readyFromState(state: BagPresentationState): BagReadyPresentation | undefined {
  if (state.status === 'ready') return state;
  return state.status === 'updating' || state.status === 'error'
    ? state.previous
    : undefined;
}

function outcomeFor(state: BagPresentationState): BagMutationOutcome {
  if (state.status === 'ready' || state.status === 'empty') return 'completed';
  if (state.status === 'error') {
    return state.retry === 'same_intent' ? 'retryable_error' : 'refresh_required';
  }
  return 'terminal_error';
}

export function BagProvider({
  active = true,
  children,
  createDependencies,
}: BagProviderProps) {
  const [state, setState] = useState<BagPresentationState>({ status: 'loading' });
  const [selected, setSelected] = useState<BagSelection>();
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const [previousActive, setPreviousActive] = useState(active);
  const [reloadVersion, setReloadVersion] = useState(0);
  const dependenciesRef = useRef<ReturnType<typeof createDependencies> | undefined>(undefined);
  const sequence = useRef(0);
  const requestGeneration = useRef(0);
  const mutation = useRef<MutationSpec | undefined>(undefined);
  const mutationPending = useRef(false);

  if (previousActive !== active) {
    setPreviousActive(active);
    if (active) setCheckoutLocked(true);
  }

  const dependencies = useCallback(() => {
    dependenciesRef.current ??= createDependencies();
    return dependenciesRef.current;
  }, [createDependencies]);

  const newKey = useCallback(
    (kind: 'clear' | 'load' | 'quantity' | 'remove') =>
      createBagIntentKey(kind, Date.now(), ++sequence.current),
    [],
  );

  useEffect(() => {
    if (!active) return;
    const generation = ++requestGeneration.current;
    mutation.current = undefined;
    mutationPending.current = false;

    let configured;
    try {
      configured = dependencies();
    } catch {
      void Promise.resolve().then(() => {
        if (requestGeneration.current === generation)
          setState({ status: 'unavailable' });
      });
      return;
    }

    void Promise.all([
      loadBag(configured, newKey('load')),
      configured.checkoutRecovery?.isLocked() ?? Promise.resolve(false),
    ])
      .then(([next, locked]) => {
        if (requestGeneration.current !== generation) return;
        setCheckoutLocked(locked);
        setState(next);
        if (next.status !== 'ready') setSelected(undefined);
      })
      .catch(() => {
        if (requestGeneration.current !== generation) return;
        setCheckoutLocked(true);
        setState({ status: 'unavailable' });
        setSelected(undefined);
      });

    return () => {
      requestGeneration.current += 1;
      mutationPending.current = false;
    };
  }, [active, dependencies, newKey, reloadVersion]);

  const reload = useCallback(() => {
    mutation.current = undefined;
    setState({ status: 'loading' });
    mutationPending.current = false;
    setReloadVersion((version) => version + 1);
  }, []);

  const retry = useCallback(() => {
    let configured;
    try {
      configured = dependencies();
    } catch {
      setState({ status: 'unavailable' });
      return;
    }

    if (state.status === 'error' && state.retry === 'same_intent') {
      const generation = ++requestGeneration.current;
      setState({ previous: state.previous, status: 'updating' });
      void retryBagLoad(configured, configured.cart, state.previous)
        .then((next) => {
          if (requestGeneration.current === generation) setState(next);
        })
        .catch(() => {
          if (requestGeneration.current === generation)
            setState({ status: 'unavailable' });
        });
      return;
    }
    configured.cart.dismissError();
    reload();
  }, [dependencies, reload, state]);

  const runMutation = useCallback(
    async (spec: MutationSpec): Promise<BagMutationOutcome> => {
      if (checkoutLocked || mutationPending.current) return 'terminal_error';

      let configured;
      try {
        configured = dependencies();
      } catch {
        setState({ status: 'unavailable' });
        return 'terminal_error';
      }

      const serviceState = configured.cart.getState();
      let result: CartServiceResult;
      const matchesRetry =
        serviceState.status === 'error' &&
        serviceState.retry === 'same_intent' &&
        mutation.current?.kind === spec.kind &&
        mutation.current.itemId === spec.itemId &&
        mutation.current.quantity === spec.quantity &&
        mutation.current.snapshot === spec.snapshot;

      if (serviceState.status === 'error' && !matchesRetry) {
        if (!configured.cart.dismissError()) return 'terminal_error';
      }

      mutationPending.current = true;
      mutation.current = spec;
      setState({ previous: spec.snapshot, status: 'updating' });
      try {
        if (matchesRetry) {
          result = await configured.cart.retry();
        } else if (spec.kind === 'clear') {
          result = await configured.cart.clear({ id: newKey('clear') });
        } else if (spec.kind === 'remove' && spec.itemId) {
          result = await configured.cart.removeItem({
            id: newKey('remove'),
            itemId: spec.itemId,
          });
        } else if (
          spec.kind === 'quantity' &&
          spec.itemId &&
          spec.quantity !== undefined
        ) {
          result = await configured.cart.updateItemQuantity({
            id: newKey('quantity'),
            itemId: spec.itemId,
            quantity: spec.quantity,
          });
        } else {
          return 'terminal_error';
        }

        const next = await resolveBagMutation(configured, result, spec.snapshot);
        setState(next);
        const outcome = outcomeFor(next);
        if (outcome === 'completed') {
          mutation.current = undefined;
          if (spec.kind === 'remove' || spec.kind === 'clear') setSelected(undefined);
        }
        return outcome;
      } catch {
        setState({ status: 'unavailable' });
        return 'terminal_error';
      } finally {
        mutationPending.current = false;
      }
    },
    [checkoutLocked, dependencies, newKey],
  );

  const selectItem = useCallback(
    (itemId: string) => {
      const ready = readyFromState(state);
      if (!ready) return false;
      const item = itemFromBag(ready, itemId);
      if (!item) return false;
      setSelected({ cartId: ready.cartId, item, revision: ready.revision });
      return true;
    },
    [state],
  );
  const clearSelection = useCallback(() => setSelected(undefined), []);

  const actions = useMemo<BagContextValue['actions']>(
    () => ({
      clear: async () => {
        const snapshot = readyFromState(state);
        return snapshot
          ? runMutation({ kind: 'clear', snapshot })
          : 'terminal_error';
      },
      clearSelection,
      reload,
      removeSelected: async () => {
        const snapshot = readyFromState(state);
        if (
          !snapshot ||
          !selected ||
          selected.cartId !== snapshot.cartId ||
          selected.revision !== snapshot.revision
        ) {
          return 'refresh_required';
        }
        return runMutation({
          itemId: selected.item.id,
          kind: 'remove',
          snapshot,
        });
      },
      retry,
      selectItem,
      updateQuantity: async (itemId, quantity) => {
        const snapshot = readyFromState(state);
        if (
          !snapshot ||
          !itemFromBag(snapshot, itemId) ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1
        ) {
          return 'terminal_error';
        }
        return runMutation({ itemId, kind: 'quantity', quantity, snapshot });
      },
    }),
    [clearSelection, reload, retry, runMutation, selectItem, selected, state],
  );

  const value = useMemo<BagContextValue>(
    () => ({ actions, checkoutLocked, ...(selected ? { selected } : {}), state }),
    [actions, checkoutLocked, selected, state],
  );

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag(): BagContextValue {
  const value = useContext(BagContext);
  if (!value) throw new Error('useBag must be used within BagProvider');
  return value;
}

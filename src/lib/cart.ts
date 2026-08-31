import type {
  AddCartItemPayload,
  DeliveryAddress,
  SelectedModifierTypes,
  RequestConfig,
  StorefrontCart,
  UpdateCartPayload,
  UpdateGratuityPayload,
  UpdateOrderTimePayload,
  ValidateAndUpdateCustomerPayload,
} from '@craveup/storefront-sdk';

import {
  initialCartState,
  transitionCart,
  type CartIntent,
  type CartIntentKind,
  type CartState,
  type CartTransitionFailure,
} from '../domain/cart/index.ts';
import type { StorefrontCartSessionStore } from './cart-session.ts';
import { refreshCartAfterConflict } from './cart-reconciliation.ts';
import type { CheckoutHandoffRecoveryStore } from './checkout-handoff-recovery-store.ts';
import type { CustomerSessionStore } from './customer-session.ts';
import {
  mapCustomerRequestFailure,
  SECURE_STORAGE_FAILURE,
  type CustomerAuthenticationFailureHandler,
} from './customer-request-failure.ts';
import type {
  ClaimOrderingIntent,
  OrderingSessionResult,
  OrderingSessionService,
  StartOrderingIntent,
} from './ordering-session-service.ts';
import type { StorefrontClient } from './storefront.ts';
import {
  mapStorefrontError,
  type StorefrontFailure,
} from './storefront-errors.ts';
import { isScopedStorefrontCart } from './storefront-response-contracts.ts';
import {
  assertSafeIdempotencyKey,
  assertSafeStorefrontResourceId,
} from './storefront-session-scope.ts';

export type CartClient = Pick<
  StorefrontClient['cart'],
  | 'addItem'
  | 'applyDiscount'
  | 'delete'
  | 'get'
  | 'removeDiscount'
  | 'removeItem'
  | 'setDelivery'
  | 'update'
  | 'updateGratuity'
  | 'updateItemQuantity'
  | 'updateOrderTime'
  | 'validateAndUpdateCustomer'
>;

export type CartMutationIntent = Readonly<{
  id: string;
}>;

export type StartCartIntent = CartMutationIntent &
  Pick<StartOrderingIntent, 'channel' | 'fulfillmentMethod'>;

export type AddCartItemIntent = CartMutationIntent &
  Readonly<{ payload: AddCartItemPayload }>;

export type UpdateCartItemQuantityIntent = CartMutationIntent &
  Readonly<{ itemId: string; quantity: number }>;

export type RemoveCartItemIntent = CartMutationIntent &
  Readonly<{ itemId: string }>;

export type ApplyCartDiscountIntent = CartMutationIntent &
  Readonly<{ code: string }>;

export type SetCartGratuityIntent = CartMutationIntent &
  Readonly<{ payload: UpdateGratuityPayload }>;

export type SetCartCustomerIntent = CartMutationIntent &
  Readonly<{ payload: ValidateAndUpdateCustomerPayload }>;

export type SetCartFulfillmentIntent = CartMutationIntent &
  Readonly<{ payload: UpdateCartPayload }>;

export type SetCartDeliveryAddressIntent = CartMutationIntent &
  Readonly<{ payload: DeliveryAddress }>;

export type SetCartOrderTimeIntent = CartMutationIntent &
  Readonly<{ payload: UpdateOrderTimePayload }>;

export type CartServiceResult =
  | Readonly<{ cart: StorefrontCart; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>
  | Readonly<{
      cart?: StorefrontCart;
      failure: StorefrontFailure;
      kind: 'reconciliation_required';
    }>
  | Readonly<{
      kind: 'transition_rejected';
      reason: CartTransitionFailure;
    }>
  | Readonly<{
      kind: 'terminal';
      reason: 'deleted' | 'expired' | 'immutable' | 'unauthorized';
    }>;

export interface CartService {
  addItem(intent: AddCartItemIntent): Promise<CartServiceResult>;
  applyDiscount(intent: ApplyCartDiscountIntent): Promise<CartServiceResult>;
  claim(intent: CartMutationIntent): Promise<CartServiceResult>;
  clear(intent: CartMutationIntent): Promise<CartServiceResult>;
  dismissError(): boolean;
  getState(): CartState<StorefrontCart>;
  load(intent: CartMutationIntent): Promise<CartServiceResult>;
  removeDiscount(intent: CartMutationIntent): Promise<CartServiceResult>;
  removeItem(intent: RemoveCartItemIntent): Promise<CartServiceResult>;
  retry(): Promise<CartServiceResult>;
  setCustomer(intent: SetCartCustomerIntent): Promise<CartServiceResult>;
  setDeliveryAddress(
    intent: SetCartDeliveryAddressIntent,
  ): Promise<CartServiceResult>;
  setFulfillment(intent: SetCartFulfillmentIntent): Promise<CartServiceResult>;
  setGratuity(intent: SetCartGratuityIntent): Promise<CartServiceResult>;
  setOrderTime(intent: SetCartOrderTimeIntent): Promise<CartServiceResult>;
  start(intent: StartCartIntent): Promise<CartServiceResult>;
  updateItemQuantity(
    intent: UpdateCartItemQuantityIntent,
  ): Promise<CartServiceResult>;
}

type MutationCommand = Readonly<{
  cartId: string;
  execute: () => Promise<StorefrontCart>;
  intent: CartIntent;
  revision: number;
  terminalOnSuccess?: 'deleted';
}>;

type OrderingCommand = Readonly<{
  execute: () => Promise<OrderingSessionResult>;
  intent: CartIntent;
}>;

const INVALID_INTENT_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CLIENT_VALIDATION_ERROR',
  kind: 'invalid_request',
  retryable: false,
});

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

const CART_CONFLICT_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CART_CONFLICT',
  kind: 'conflict',
  retryable: false,
});

function freezeResult<T extends CartServiceResult>(result: T): T {
  return Object.freeze(result);
}

function requestConfig(id: string, revision: number): RequestConfig {
  return Object.freeze({ idempotencyKey: id, revision });
}

function cloneSelection(
  selection: SelectedModifierTypes,
): SelectedModifierTypes {
  return {
    groupId: selection.groupId,
    selectedOptions: selection.selectedOptions.map((option) => ({
      ...(option.children
        ? { children: option.children.map(cloneSelection) }
        : {}),
      optionId: option.optionId,
      quantity: option.quantity,
    })),
  };
}

function cloneAddItemPayload(payload: AddCartItemPayload): AddCartItemPayload {
  return {
    ...payload,
    selections: payload.selections.map(cloneSelection),
  };
}

function cloneDeliveryAddress(payload: DeliveryAddress): DeliveryAddress {
  return { ...payload };
}

function terminalReason(
  cart: StorefrontCart,
): 'expired' | 'immutable' | 'invalid' | undefined {
  switch (cart.status) {
    case 'OPEN':
      return undefined;
    case 'EXPIRED':
      return 'expired';
    case 'LOCKED':
    case 'COMPLETED':
      return 'immutable';
    default:
      return 'invalid';
  }
}

function validIntentId(id: string): boolean {
  try {
    return assertSafeIdempotencyKey(id) === id;
  } catch {
    return false;
  }
}

function validDiscountCode(code: string): boolean {
  return (
    code.length > 0 &&
    code.length <= 128 &&
    code === code.trim() &&
    !/[\u0000-\u001f\u007f]/.test(code)
  );
}

function validQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

function requiresSameIntentRetry(failure: StorefrontFailure): boolean {
  return (
    failure.kind === 'timeout' ||
    (failure.kind === 'unavailable' && failure.status === undefined)
  );
}

export function createCartService(
  client: CartClient,
  sessions: StorefrontCartSessionStore,
  ordering: OrderingSessionService,
  locationId: string,
  customerSessions?: CustomerSessionStore,
  onAuthenticationFailure?: CustomerAuthenticationFailureHandler,
  checkoutRecovery?: Pick<CheckoutHandoffRecoveryStore, 'isLocked'>,
): CartService {
  let state = initialCartState<StorefrontCart>();
  let retryCommand: MutationCommand | undefined;

  let orderingRetryCommand: OrderingCommand | undefined;
  function transition(
    event: Parameters<typeof transitionCart<StorefrontCart>>[1],
  ): boolean {
    const result = transitionCart(state, event);
    if (!result.ok) return false;
    state = result.state;
    return true;
  }

  function rejected(reason: CartTransitionFailure): CartServiceResult {
    return freezeResult({ kind: 'transition_rejected', reason });
  }

  function begin(intent: CartIntent): CartTransitionFailure | undefined {
    const result = transitionCart(state, { type: 'begin', intent });
    if (!result.ok) return result.reason;
    state = result.state;
    return undefined;
  }

  async function checkoutHandoffLocked(cartId?: string): Promise<boolean> {
    if (!checkoutRecovery) return false;
    try {
      return await checkoutRecovery.isLocked(cartId);
    } catch {
      return true;
    }
  }

  function failureResult(failure: StorefrontFailure): CartServiceResult {
    return freezeResult({ failure, kind: 'failed' });
  }

  async function clearMatching(
    cartId: string,
  ): Promise<StorefrontFailure | undefined> {
    try {
      await sessions.clearMatching(locationId, cartId);
      return undefined;
    } catch {
      return SECURE_STORAGE_FAILURE;
    }
  }

  async function customerCredentialUsed(
    cartAccessToken?: string,
  ): Promise<boolean | undefined> {
    if (cartAccessToken !== undefined) return false;
    if (customerSessions === undefined) return false;
    try {
      return (await customerSessions.getAuthToken()) !== null;
    } catch {
      return undefined;
    }
  }

  async function requestFailure(
    error: unknown,
    usedCustomerCredential: boolean,
  ): Promise<StorefrontFailure> {
    const failure = mapStorefrontError(error);
    if (
      failure.kind !== 'authentication_required' ||
      !usedCustomerCredential ||
      customerSessions === undefined
    ) {
      return failure;
    }

    return mapCustomerRequestFailure(
      error,
      customerSessions,
      onAuthenticationFailure,
    );
  }

  async function terminal(
    intentId: string,
    reason: 'deleted' | 'expired' | 'immutable' | 'unauthorized',
    cartId: string,
  ): Promise<CartServiceResult> {
    if (
      reason === 'deleted' ||
      reason === 'expired' ||
      reason === 'unauthorized'
    ) {
      const storageFailure = await clearMatching(cartId);
      if (storageFailure) {
        transition({ type: 'failed', intentId, retry: 'new_intent' });
        return failureResult(storageFailure);
      }
    }
    transition({ type: 'became_terminal', intentId, reason });
    retryCommand = undefined;
    orderingRetryCommand = undefined;
    return freezeResult({ kind: 'terminal', reason });
  }

  async function acceptCart(
    intentId: string,
    cartId: string,
    cart: StorefrontCart,
  ): Promise<CartServiceResult> {
    if (!isScopedStorefrontCart(cart, locationId, cartId)) {
      transition({ type: 'failed', intentId, retry: 'new_intent' });
      return failureResult(INVALID_RESPONSE_FAILURE);
    }

    const cartTerminal = terminalReason(cart);
    if (cartTerminal === 'invalid') {
      transition({ type: 'failed', intentId, retry: 'new_intent' });
      return failureResult(INVALID_RESPONSE_FAILURE);
    }
    if (cartTerminal === 'expired') {
      return terminal(intentId, cartTerminal, cartId);
    }

    let persisted;
    try {
      persisted = await sessions.get(locationId);
    } catch {
      transition({ type: 'failed', intentId, retry: 'new_intent' });
      return failureResult(SECURE_STORAGE_FAILURE);
    }

    if (persisted?.cartId !== cartId || persisted.revision < cart.revision) {
      transition({ type: 'failed', intentId, retry: 'new_intent' });
      return failureResult(INVALID_RESPONSE_FAILURE);
    }

    if (persisted.revision > cart.revision) {
      const activeIntent =
        state.status === 'loading' && state.intent.id === intentId
          ? state.intent
          : undefined;
      if (!activeIntent) {
        transition({ type: 'failed', intentId, retry: 'new_intent' });
        return failureResult(INVALID_RESPONSE_FAILURE);
      }
      return reconcile(activeIntent, cartId, CART_CONFLICT_FAILURE);
    }
    if (cartTerminal === 'immutable') {
      return terminal(intentId, cartTerminal, cartId);
    }

    if (
      !transition({
        type: 'succeeded',
        intentId,
        cart,
        revision: cart.revision,
      })
    ) {
      return rejected('stale_revision');
    }

    retryCommand = undefined;
    orderingRetryCommand = undefined;
    return freezeResult({ cart, kind: 'ready' });
  }

  async function reconcile(
    intent: CartIntent,
    cartId: string,
    failure: StorefrontFailure,
  ): Promise<CartServiceResult> {
    transition({ type: 'conflict', intentId: intent.id });
    retryCommand = undefined;
    orderingRetryCommand = undefined;

    const cart = await refreshCartAfterConflict(
      client,
      sessions,
      locationId,
      cartId,
    );

    if (cart) {
      const cartTerminal = terminalReason(cart);
      if (cartTerminal === 'invalid') {
        transition({
          type: 'reconciliation_failed',
          intentId: intent.id,
          retry: 'new_intent',
        });
        return freezeResult({
          failure: INVALID_RESPONSE_FAILURE,
          kind: 'reconciliation_required',
        });
      }
      if (cartTerminal) {
        return terminal(intent.id, cartTerminal, cartId);
      }
      transition({
        type: 'reconciled',
        intentId: intent.id,
        cart,
        revision: cart.revision,
      });
      return freezeResult({
        cart,
        failure,
        kind: 'reconciliation_required',
      });
    }

    transition({
      type: 'reconciliation_failed',
      intentId: intent.id,
      retry: 'new_intent',
    });
    return freezeResult({ failure, kind: 'reconciliation_required' });
  }

  async function runMutation(
    command: MutationCommand,
  ): Promise<CartServiceResult> {
    let current;
    try {
      current = await sessions.get(locationId);
    } catch {
      transition({
        type: 'failed',
        intentId: command.intent.id,
        retry: 'new_intent',
      });
      retryCommand = undefined;
      return failureResult(SECURE_STORAGE_FAILURE);
    }

    if (
      current?.cartId !== command.cartId ||
      current.revision !== command.revision
    ) {
      return reconcile(command.intent, command.cartId, CART_CONFLICT_FAILURE);
    }

    const usedCustomerCredential = await customerCredentialUsed(
      current.accessToken,
    );
    if (usedCustomerCredential === undefined) {
      transition({
        type: 'failed',
        intentId: command.intent.id,
        retry: 'new_intent',
      });
      retryCommand = undefined;
      return failureResult(SECURE_STORAGE_FAILURE);
    }

    try {
      const cart = await command.execute();
      if (command.terminalOnSuccess === 'deleted') {
        return terminal(command.intent.id, 'deleted', command.cartId);
      }
      return acceptCart(command.intent.id, command.cartId, cart);
    } catch (error) {
      const mappedFailure = mapStorefrontError(error);
      if (requiresSameIntentRetry(mappedFailure)) {
        transition({ type: 'timed_out', intentId: command.intent.id });
        retryCommand = command;
        return failureResult(mappedFailure);
      }
      if (mappedFailure.kind === 'conflict') {
        return reconcile(command.intent, command.cartId, mappedFailure);
      }

      const failure = await requestFailure(error, usedCustomerCredential);
      if (failure.code === SECURE_STORAGE_FAILURE.code) {
        transition({
          type: 'failed',
          intentId: command.intent.id,
          retry: 'new_intent',
        });
        retryCommand = undefined;
        return failureResult(failure);
      }
      if (
        mappedFailure.kind === 'authentication_required' ||
        mappedFailure.kind === 'forbidden' ||
        mappedFailure.kind === 'not_found'
      ) {
        return terminal(command.intent.id, 'unauthorized', command.cartId);
      }

      transition({
        type: 'failed',
        intentId: command.intent.id,
        retry: mappedFailure.retryable ? 'new_intent' : 'none',
      });
      retryCommand = undefined;
      return failureResult(failure);
    }
  }

  async function mutate(
    kind: CartIntentKind,
    input: CartMutationIntent,
    execute: (cartId: string, config: RequestConfig) => Promise<StorefrontCart>,
    terminalOnSuccess?: 'deleted',
  ): Promise<CartServiceResult> {
    const intent = Object.freeze({ id: input.id, kind });
    const activeCartId = state.status === 'ready' ? state.cart.id : undefined;
    if (await checkoutHandoffLocked(activeCartId)) {
      return rejected('checkout_handoff_locked');
    }
    const beginFailure = begin(intent);
    if (beginFailure) return rejected(beginFailure);

    const previous = state.status === 'loading' ? state.previous : undefined;
    if (!previous) {
      transition({ type: 'failed', intentId: intent.id, retry: 'none' });
      return failureResult(INVALID_INTENT_FAILURE);
    }

    const cartId = previous.cart.id;
    const revision = previous.revision;
    const config = requestConfig(intent.id, revision);
    const command: MutationCommand = Object.freeze({
      cartId,
      execute: () => execute(cartId, config),
      intent,
      revision,
      ...(terminalOnSuccess ? { terminalOnSuccess } : {}),
    });
    retryCommand = command;
    orderingRetryCommand = undefined;
    return runMutation(command);
  }

  function validResourceId(
    value: string,
    field: 'itemId' | 'productId',
  ): boolean {
    try {
      return assertSafeStorefrontResourceId(value, field) === value;
    } catch {
      return false;
    }
  }

  async function fromOrderingResult(
    intent: CartIntent,
    result: OrderingSessionResult,
  ): Promise<CartServiceResult> {
    if (result.kind === 'ready') {
      return acceptCart(intent.id, result.cart.id, result.cart);
    }

    if (result.kind === 'reconciliation_required') {
      const expectedCartId =
        state.status === 'loading' ? state.previous?.cart.id : undefined;
      transition({ type: 'conflict', intentId: intent.id });
      orderingRetryCommand = undefined;

      if (
        !result.cart ||
        !isScopedStorefrontCart(result.cart, locationId, expectedCartId)
      ) {
        transition({
          type: 'reconciliation_failed',
          intentId: intent.id,
          retry: 'new_intent',
        });
        return freezeResult({
          failure: result.cart ? INVALID_RESPONSE_FAILURE : result.failure,
          kind: 'reconciliation_required',
        });
      }

      let persisted;
      try {
        persisted = await sessions.get(locationId);
      } catch {
        transition({
          type: 'reconciliation_failed',
          intentId: intent.id,
          retry: 'new_intent',
        });
        return failureResult(SECURE_STORAGE_FAILURE);
      }

      if (
        persisted?.cartId !== result.cart.id ||
        persisted.revision < result.cart.revision
      ) {
        transition({
          type: 'reconciliation_failed',
          intentId: intent.id,
          retry: 'new_intent',
        });
        return freezeResult({
          failure: INVALID_RESPONSE_FAILURE,
          kind: 'reconciliation_required',
        });
      }

      const cart =
        persisted.revision === result.cart.revision
          ? result.cart
          : await refreshCartAfterConflict(
              client,
              sessions,
              locationId,
              result.cart.id,
            );
      if (!cart) {
        transition({
          type: 'reconciliation_failed',
          intentId: intent.id,
          retry: 'new_intent',
        });
        return freezeResult({
          failure: result.failure,
          kind: 'reconciliation_required',
        });
      }

      const cartTerminal = terminalReason(cart);
      if (cartTerminal === 'invalid') {
        transition({
          type: 'reconciliation_failed',
          intentId: intent.id,
          retry: 'new_intent',
        });
        return freezeResult({
          failure: INVALID_RESPONSE_FAILURE,
          kind: 'reconciliation_required',
        });
      }
      if (cartTerminal) return terminal(intent.id, cartTerminal, cart.id);
      transition({
        type: 'reconciled',
        intentId: intent.id,
        cart,
        revision: cart.revision,
      });
      return freezeResult({
        cart,
        failure: result.failure,
        kind: 'reconciliation_required',
      });
    }

    if (
      (result.failure.kind === 'authentication_required' ||
        result.failure.kind === 'forbidden' ||
        result.failure.kind === 'not_found') &&
      state.status === 'loading' &&
      state.previous
    ) {
      return terminal(intent.id, 'unauthorized', state.previous.cart.id);
    }

    if (requiresSameIntentRetry(result.failure)) {
      transition({ type: 'timed_out', intentId: intent.id });
      return failureResult(result.failure);
    }

    transition({
      type: 'failed',
      intentId: intent.id,
      retry: result.failure.retryable ? 'new_intent' : 'none',
    });
    orderingRetryCommand = undefined;
    return failureResult(result.failure);
  }

  async function runOrdering(
    command: OrderingCommand,
  ): Promise<CartServiceResult> {
    return fromOrderingResult(command.intent, await command.execute());
  }

  return Object.freeze({
    addItem(intent: AddCartItemIntent): Promise<CartServiceResult> {
      if (
        !validIntentId(intent.id) ||
        !validResourceId(intent.payload.productId, 'productId') ||
        !validQuantity(intent.payload.quantity)
      ) {
        return Promise.resolve(failureResult(INVALID_INTENT_FAILURE));
      }
      const payload = cloneAddItemPayload(intent.payload);
      return mutate('add_item', intent, (cartId, config) =>
        client.addItem(locationId, cartId, payload, config),
      );
    },
    applyDiscount(intent: ApplyCartDiscountIntent): Promise<CartServiceResult> {
      if (!validIntentId(intent.id) || !validDiscountCode(intent.code)) {
        return Promise.resolve(failureResult(INVALID_INTENT_FAILURE));
      }
      const code = intent.code;
      return mutate('apply_discount', intent, (cartId, config) =>
        client.applyDiscount(locationId, cartId, code, config),
      );
    },
    async claim(intent: CartMutationIntent): Promise<CartServiceResult> {
      const activeCartId = state.status === 'ready' ? state.cart.id : undefined;
      if (await checkoutHandoffLocked(activeCartId)) {
        return rejected('checkout_handoff_locked');
      }
      const cartIntent = Object.freeze({
        id: intent.id,
        kind: 'claim' as const,
      });
      const beginFailure = begin(cartIntent);
      if (beginFailure) return rejected(beginFailure);
      const previous = state.status === 'loading' ? state.previous : undefined;
      if (!previous) {
        transition({ type: 'failed', intentId: cartIntent.id, retry: 'none' });
        return failureResult(INVALID_INTENT_FAILURE);
      }
      const claimIntent: ClaimOrderingIntent = Object.freeze({
        cartId: previous.cart.id,
        idempotencyKey: cartIntent.id,
        revision: previous.revision,
      });
      const command: OrderingCommand = Object.freeze({
        execute: () => ordering.claim(claimIntent),
        intent: cartIntent,
      });
      retryCommand = undefined;
      orderingRetryCommand = command;
      return runOrdering(command);
    },
    clear(intent: CartMutationIntent): Promise<CartServiceResult> {
      return mutate(
        'clear',
        intent,
        (cartId, config) => client.delete(locationId, cartId, config),
        'deleted',
      );
    },
    dismissError(): boolean {
      const result = transitionCart(state, { type: 'dismiss_error' });
      if (!result.ok) return false;
      state = result.state;
      retryCommand = undefined;
      orderingRetryCommand = undefined;
      return true;
    },
    getState(): CartState<StorefrontCart> {
      return state;
    },
    async load(intent: CartMutationIntent): Promise<CartServiceResult> {
      const cartIntent = Object.freeze({
        id: intent.id,
        kind: 'refresh' as const,
      });
      const beginFailure = begin(cartIntent);
      if (beginFailure) return rejected(beginFailure);

      let session;
      try {
        session = await sessions.get(locationId);
      } catch {
        transition({
          type: 'failed',
          intentId: cartIntent.id,
          retry: 'new_intent',
        });
        return failureResult(SECURE_STORAGE_FAILURE);
      }
      if (!session) {
        transition({ type: 'failed', intentId: cartIntent.id, retry: 'none' });
        return failureResult(INVALID_INTENT_FAILURE);
      }

      const usedCustomerCredential = await customerCredentialUsed(
        session.accessToken,
      );
      if (usedCustomerCredential === undefined) {
        transition({
          type: 'failed',
          intentId: cartIntent.id,
          retry: 'new_intent',
        });
        return failureResult(SECURE_STORAGE_FAILURE);
      }

      try {
        const cart = await client.get(locationId, session.cartId);
        return acceptCart(cartIntent.id, session.cartId, cart);
      } catch (error) {
        const failure = await requestFailure(error, usedCustomerCredential);
        if (failure.code === SECURE_STORAGE_FAILURE.code) {
          transition({
            type: 'failed',
            intentId: cartIntent.id,
            retry: 'new_intent',
          });
          return failureResult(failure);
        }

        if (
          failure.kind === 'authentication_required' ||
          failure.kind === 'forbidden' ||
          failure.kind === 'not_found'
        ) {
          return terminal(cartIntent.id, 'unauthorized', session.cartId);
        }
        transition({
          type: 'failed',
          intentId: cartIntent.id,
          retry: failure.retryable ? 'new_intent' : 'none',
        });
        return failureResult(failure);
      }
    },
    removeDiscount(intent: CartMutationIntent): Promise<CartServiceResult> {
      return mutate('remove_discount', intent, (cartId, config) =>
        client.removeDiscount(locationId, cartId, config),
      );
    },
    removeItem(intent: RemoveCartItemIntent): Promise<CartServiceResult> {
      if (
        !validIntentId(intent.id) ||
        !validResourceId(intent.itemId, 'itemId')
      ) {
        return Promise.resolve(failureResult(INVALID_INTENT_FAILURE));
      }
      const itemId = intent.itemId;
      return mutate('remove_item', intent, (cartId, config) =>
        client.removeItem(locationId, cartId, itemId, config),
      );
    },
    async retry(): Promise<CartServiceResult> {
      if (await checkoutHandoffLocked(retryCommand?.cartId)) {
        return rejected('checkout_handoff_locked');
      }
      const result = transitionCart(state, { type: 'retry' });
      if (!result.ok || (!retryCommand && !orderingRetryCommand)) {
        return rejected(result.ok ? 'invalid_transition' : result.reason);
      }
      state = result.state;
      return retryCommand
        ? runMutation(retryCommand)
        : runOrdering(orderingRetryCommand!);
    },
    setCustomer(intent: SetCartCustomerIntent): Promise<CartServiceResult> {
      const payload = { ...intent.payload };
      return mutate('set_customer', intent, (cartId, config) =>
        client.validateAndUpdateCustomer(locationId, cartId, payload, config),
      );
    },
    setDeliveryAddress(
      intent: SetCartDeliveryAddressIntent,
    ): Promise<CartServiceResult> {
      const payload = cloneDeliveryAddress(intent.payload);
      return mutate('set_delivery_address', intent, (cartId, config) =>
        client.setDelivery(locationId, cartId, payload, config),
      );
    },
    setFulfillment(
      intent: SetCartFulfillmentIntent,
    ): Promise<CartServiceResult> {
      const payload = { ...intent.payload };
      return mutate('set_fulfillment', intent, (cartId, config) =>
        client.update(locationId, cartId, payload, config),
      );
    },
    setGratuity(intent: SetCartGratuityIntent): Promise<CartServiceResult> {
      const payload = { ...intent.payload };
      return mutate('set_gratuity', intent, (cartId, config) =>
        client.updateGratuity(locationId, cartId, payload, config),
      );
    },
    setOrderTime(intent: SetCartOrderTimeIntent): Promise<CartServiceResult> {
      const payload = { ...intent.payload };
      return mutate('set_order_time', intent, (cartId, config) =>
        client.updateOrderTime(locationId, cartId, payload, config),
      );
    },
    async start(intent: StartCartIntent): Promise<CartServiceResult> {
      if (await checkoutHandoffLocked()) {
        return rejected('checkout_handoff_locked');
      }
      const cartIntent = Object.freeze({
        id: intent.id,
        kind: 'start_session' as const,
      });
      const transitionResult =
        state.status === 'terminal'
          ? transitionCart<StorefrontCart>(state, {
              type: 'start_new_session',
              intent: cartIntent,
            })
          : transitionCart<StorefrontCart>(state, {
              type: 'begin',
              intent: cartIntent,
            });
      if (!transitionResult.ok) return rejected(transitionResult.reason);
      state = transitionResult.state;

      let existing;
      try {
        existing = await sessions.get(locationId);
      } catch {
        transition({
          type: 'failed',
          intentId: cartIntent.id,
          retry: 'new_intent',
        });
        return failureResult(SECURE_STORAGE_FAILURE);
      }

      if (existing) {
        const usedCustomerCredential = await customerCredentialUsed(
          existing.accessToken,
        );
        if (usedCustomerCredential === undefined) {
          transition({
            type: 'failed',
            intentId: cartIntent.id,
            retry: 'new_intent',
          });
          return failureResult(SECURE_STORAGE_FAILURE);
        }

        try {
          const cart = await client.get(locationId, existing.cartId);
          return acceptCart(cartIntent.id, existing.cartId, cart);
        } catch (error) {
          const failure = await requestFailure(error, usedCustomerCredential);
          if (failure.code === SECURE_STORAGE_FAILURE.code) {
            transition({
              type: 'failed',
              intentId: cartIntent.id,
              retry: 'new_intent',
            });
            return failureResult(failure);
          }
          if (
            failure.kind === 'authentication_required' ||
            failure.kind === 'forbidden' ||
            failure.kind === 'not_found'
          ) {
            return terminal(cartIntent.id, 'unauthorized', existing.cartId);
          }
          transition({
            type: 'failed',
            intentId: cartIntent.id,
            retry: failure.retryable ? 'new_intent' : 'none',
          });
          return failureResult(failure);
        }
      }

      const startIntent: StartOrderingIntent = Object.freeze({
        ...(intent.channel ? { channel: intent.channel } : {}),
        fulfillmentMethod: intent.fulfillmentMethod,
        idempotencyKey: intent.id,
      });
      const command: OrderingCommand = Object.freeze({
        execute: () => ordering.start(startIntent),
        intent: cartIntent,
      });
      retryCommand = undefined;
      orderingRetryCommand = command;
      return runOrdering(command);
    },
    updateItemQuantity(
      intent: UpdateCartItemQuantityIntent,
    ): Promise<CartServiceResult> {
      if (
        !validIntentId(intent.id) ||
        !validResourceId(intent.itemId, 'itemId') ||
        !validQuantity(intent.quantity)
      ) {
        return Promise.resolve(failureResult(INVALID_INTENT_FAILURE));
      }
      const itemId = intent.itemId;
      const quantity = intent.quantity;
      return mutate('update_quantity', intent, (cartId, config) =>
        client.updateItemQuantity(locationId, cartId, itemId, quantity, config),
      );
    },
  });
}

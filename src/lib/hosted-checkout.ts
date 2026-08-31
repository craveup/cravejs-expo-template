import type { RequestConfig, StorefrontCart } from '@craveup/storefront-sdk';

import {
  canStartNewCheckoutHandoff,
  initialCheckoutHandoffState,
  transitionCheckoutHandoff,
  type CheckoutHandoffEvent,
  type CheckoutHandoffState,
  type CheckoutHandoffTransitionFailure,
} from '../domain/checkout/index.ts';
import { mapStorefrontError, type StorefrontFailure } from './storefront-errors.ts';
import type { CheckoutHandoffRecoveryStore } from './checkout-handoff-recovery-store.ts';
import { isScopedStorefrontCart } from './storefront-response-contracts.ts';
import { assertSafeIdempotencyKey } from './storefront-session-scope.ts';
export interface HostedCheckoutClient {
  prepare(
    locationId: string,
    cartId: string,
    config?: RequestConfig,
  ): Promise<unknown>;
}

export type HostedBrowserOpenResult = 'closed' | 'opened' | 'unknown';

export interface HostedCheckoutBrowser {
  open(url: string): Promise<HostedBrowserOpenResult>;
}

export type HostedCheckoutActionResult =
  | Readonly<{ kind: 'handed_off'; state: CheckoutHandoffState }>
  | Readonly<{ kind: 'expired'; state: CheckoutHandoffState }>
  | Readonly<{
      failure: StorefrontFailure;
      kind: 'failed';
      state: CheckoutHandoffState;
    }>
  | Readonly<{
      failure: StorefrontFailure;
      kind: 'retryable';
      retry: 'same_intent';
      state: CheckoutHandoffState;
    }>
  | Readonly<{ kind: 'outcome_unknown'; state: CheckoutHandoffState }>
  | Readonly<{
      kind: 'transition_rejected';
      reason: CheckoutHandoffTransitionFailure;
      state: CheckoutHandoffState;
    }>;

export interface HostedCheckoutService {
  getState(): CheckoutHandoffState;
  resume(cart: StorefrontCart): Promise<HostedCheckoutActionResult>;
  retry(): Promise<HostedCheckoutActionResult>;
  start(
    cart: StorefrontCart,
    attemptId: string,
  ): Promise<HostedCheckoutActionResult>;
}

export type HostedCheckoutDependencies = Readonly<{
  browser: HostedCheckoutBrowser;
  checkout: HostedCheckoutClient;
  checkoutOrigin: string;
  isOnline: () => Promise<boolean>;
  locationId: string;
  now?: () => number;
  recovery: CheckoutHandoffRecoveryStore;
}>;

type PrepareCommand = Readonly<{
  attemptId: string;
  cartId: string;
}>;

const INVALID_INPUT_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CLIENT_VALIDATION_ERROR',
  kind: 'invalid_request',
  retryable: false,
});

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_CHECKOUT_HANDOFF_RESPONSE',
  kind: 'unavailable',
  retryable: false,
});

const OFFLINE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'NETWORK_OFFLINE',
  kind: 'unavailable',
  retryable: true,
});

const RECOVERY_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CHECKOUT_RECOVERY_UNAVAILABLE',
  kind: 'unavailable',
  retryable: true,
});

function canonicalCheckoutOrigin(value: string): string | undefined {
  if (value.length < 1 || value.length > 2_048 || value !== value.trim()) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.origin === value
      ? parsed.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function safeCheckoutUrl(
  value: unknown,
  checkoutOrigin: string,
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4_096 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.origin === checkoutOrigin
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function expiryTimestamp(value: unknown): number | undefined {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim()
  ) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function responseProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

function validCheckoutCart(cart: StorefrontCart, locationId: string): boolean {
  return (
    isScopedStorefrontCart(cart, locationId, cart.id) &&
    cart.status === 'OPEN' &&
    cart.locationId === locationId &&
    cart.fulfilmentMethod === 'takeout' &&
    cart.items.length > 0 &&
    cart.totalQuantity > 0 &&
    (cart.pickupType === 'ASAP' ||
      (cart.pickupType === 'LATER' &&
        cart.orderDate.length > 0 &&
        cart.orderTime.length > 0))
  );
}

function sameIntentRetry(failure: StorefrontFailure): boolean {
  return (
    failure.kind === 'timeout' ||
    (failure.kind === 'unavailable' && failure.status === undefined)
  );
}

export function mapHostedBrowserResult(value: unknown): HostedBrowserOpenResult {
  if (value === 'opened') return 'opened';
  if (value === 'cancel' || value === 'dismiss') return 'closed';
  return 'unknown';
}

export function createHostedCheckoutService(
  dependencies: HostedCheckoutDependencies,
): HostedCheckoutService {
  const configuredCheckoutOrigin = canonicalCheckoutOrigin(
    dependencies.checkoutOrigin,
  );
  if (!configuredCheckoutOrigin) {
    throw new TypeError('Invalid hosted checkout origin');
  }
  const checkoutOrigin: string = configuredCheckoutOrigin;

  const now = dependencies.now ?? Date.now;
  let state = initialCheckoutHandoffState();
  let prepareCommand: PrepareCommand | undefined;
  let operationPending = false;

  function transition(event: CheckoutHandoffEvent): CheckoutHandoffTransitionFailure | undefined {
    const result = transitionCheckoutHandoff(state, event);
    if (!result.ok) return result.reason;
    state = result.state;
    return undefined;
  }

  function rejected(reason: CheckoutHandoffTransitionFailure): HostedCheckoutActionResult {
    return Object.freeze({ kind: 'transition_rejected', reason, state });
  }

  function failed(failure: StorefrontFailure): HostedCheckoutActionResult {
    return Object.freeze({ failure, kind: 'failed', state });
  }

  async function openPreparedHandoff(
    attemptId: string,
    url: string,
    expiresAt: string,
  ): Promise<HostedCheckoutActionResult> {
    if (Date.parse(expiresAt) <= now()) {
      let cleared = false;
      try {
        cleared = await dependencies.recovery.clearBeforeOpen(attemptId);
      } catch {
        cleared = false;
      }
      if (!cleared) {
        transition({ type: 'open_started', attemptId });
        transition({ type: 'open_failed', attemptId });
        return Object.freeze({ kind: 'outcome_unknown', state });
      }
      const reason = transition({ type: 'handoff_expired', attemptId });
      return reason
        ? rejected(reason)
        : Object.freeze({ kind: 'expired', state });
    }

    let markedOpening = false;
    try {
      markedOpening = await dependencies.recovery.markOpening(attemptId);
    } catch {
      markedOpening = false;
    }
    const openReason = transition({ type: 'open_started', attemptId });
    if (openReason) return rejected(openReason);
    if (!markedOpening) {
      transition({ type: 'open_failed', attemptId });
      return Object.freeze({ kind: 'outcome_unknown', state });
    }

    let browserResult: HostedBrowserOpenResult;
    try {
      browserResult = await dependencies.browser.open(url);
    } catch {
      const reason = transition({ type: 'open_failed', attemptId });
      await dependencies.recovery
        .markOutcome(attemptId, 'outcome_unknown')
        .catch(() => false);
      return reason
        ? rejected(reason)
        : Object.freeze({ kind: 'outcome_unknown', state });
    }

    if (browserResult === 'opened') {
      const reason = transition({ type: 'open_succeeded', attemptId });
      await dependencies.recovery
        .markOutcome(attemptId, 'handed_off')
        .catch(() => false);
      return reason
        ? rejected(reason)
        : Object.freeze({ kind: 'handed_off', state });
    }

    const reason = transition({ type: 'outcome_became_unknown', attemptId });
    await dependencies.recovery
      .markOutcome(attemptId, 'outcome_unknown')
      .catch(() => false);
    return reason
      ? rejected(reason)
      : Object.freeze({ kind: 'outcome_unknown', state });
  }

  async function runPrepare(command: PrepareCommand): Promise<HostedCheckoutActionResult> {
    let response: unknown;
    try {
      response = await dependencies.checkout.prepare(
        dependencies.locationId,
        command.cartId,
        { idempotencyKey: command.attemptId },
      );
    } catch (error) {
      const failure = mapStorefrontError(error);
      if (sameIntentRetry(failure)) {
        return Object.freeze({
          failure,
          kind: 'retryable',
          retry: 'same_intent',
          state,
        });
      }
      let cleared = false;
      try {
        cleared = await dependencies.recovery.clearBeforeOpen(
          command.attemptId,
        );
      } catch {
        cleared = false;
      }
      if (!cleared) {
        return Object.freeze({
          failure: RECOVERY_FAILURE,
          kind: 'retryable',
          retry: 'same_intent',
          state,
        });
      }
      prepareCommand = undefined;
      const reason = transition({
        type: 'prepare_failed',
        attemptId: command.attemptId,
      });
      return reason ? rejected(reason) : failed(failure);
    }

    const checkoutUrl = safeCheckoutUrl(
      responseProperty(response, 'checkoutUrl'),
      checkoutOrigin,
    );
    const expiresAt = responseProperty(response, 'expiresAt');
    const expiry = expiryTimestamp(expiresAt);
    if (!checkoutUrl || expiry === undefined || typeof expiresAt !== 'string') {
      let cleared = false;
      try {
        cleared = await dependencies.recovery.clearBeforeOpen(
          command.attemptId,
        );
      } catch {
        cleared = false;
      }
      if (!cleared) {
        return Object.freeze({
          failure: RECOVERY_FAILURE,
          kind: 'retryable',
          retry: 'same_intent',
          state,
        });
      }
      prepareCommand = undefined;
      const reason = transition({
        type: 'prepare_failed',
        attemptId: command.attemptId,
      });
      return reason ? rejected(reason) : failed(INVALID_RESPONSE_FAILURE);
    }

    let markedPrepared = false;
    try {
      markedPrepared = await dependencies.recovery.markPrepared(
        command.attemptId,
        expiresAt,
      );
    } catch {
      markedPrepared = false;
    }
    if (!markedPrepared) {
      return Object.freeze({
        failure: RECOVERY_FAILURE,
        kind: 'retryable',
        retry: 'same_intent',
        state,
      });
    }
    const reason = transition({
      type: 'prepare_succeeded',
      attemptId: command.attemptId,
      expiresAt,
    });
    if (reason) return rejected(reason);
    prepareCommand = undefined;
    return openPreparedHandoff(command.attemptId, checkoutUrl, expiresAt);
  }

  async function withOperation(
    operation: () => Promise<HostedCheckoutActionResult>,
  ): Promise<HostedCheckoutActionResult> {
    if (operationPending) return rejected('invalid_transition');
    operationPending = true;
    try {
      return await operation();
    } finally {
      operationPending = false;
    }
  }

  return Object.freeze({
    getState(): CheckoutHandoffState {
      return state;
    },
    resume(cart: StorefrontCart): Promise<HostedCheckoutActionResult> {
      return withOperation(async () => {
        if (state.status !== 'editing') {
          return rejected('invalid_transition');
        }
        let recovery;
        try {
          recovery = await dependencies.recovery.get();
        } catch {
          return failed(RECOVERY_FAILURE);
        }
        if (
          recovery.status !== 'preparing_handoff' ||
          !validCheckoutCart(cart, dependencies.locationId) ||
          recovery.cartId !== cart.id ||
          recovery.revision !== cart.revision
        ) {
          return rejected('invalid_transition');
        }
        const beginReason = transition({
          type: 'begin_validation',
          attemptId: recovery.attemptId,
        });
        if (beginReason) return rejected(beginReason);
        const validationReason = transition({
          type: 'validation_passed',
          attemptId: recovery.attemptId,
        });
        if (validationReason) return rejected(validationReason);
        prepareCommand = Object.freeze({
          attemptId: recovery.attemptId,
          cartId: recovery.cartId,
        });

        let online = false;
        try {
          online = await dependencies.isOnline();
        } catch {
          online = false;
        }
        if (!online) {
          return Object.freeze({
            failure: OFFLINE_FAILURE,
            kind: 'retryable',
            retry: 'same_intent',
            state,
          });
        }
        return runPrepare(prepareCommand);
      });
    },
    retry(): Promise<HostedCheckoutActionResult> {
      return withOperation(async () => {
        if (state.status !== 'preparing_handoff' || !prepareCommand) {
          return rejected('invalid_transition');
        }
        return runPrepare(prepareCommand);
      });
    },
    start(
      cart: StorefrontCart,
      attemptId: string,
    ): Promise<HostedCheckoutActionResult> {
      return withOperation(async () => {
        if (!canStartNewCheckoutHandoff(state)) {
          return rejected('invalid_transition');
        }
        try {
          assertSafeIdempotencyKey(attemptId);
        } catch {
          return rejected('invalid_attempt_id');
        }
        const beginReason = transition({ type: 'begin_validation', attemptId });
        if (beginReason) return rejected(beginReason);

        let online = false;
        try {
          online = await dependencies.isOnline();
        } catch {
          online = false;
        }
        if (!online || !validCheckoutCart(cart, dependencies.locationId)) {
          const reason = transition({ type: 'validation_rejected', attemptId });
          return reason
            ? rejected(reason)
            : failed(online ? INVALID_INPUT_FAILURE : OFFLINE_FAILURE);
        }

        let locked = false;
        try {
          locked = await dependencies.recovery.lockPreparing({
            attemptId,
            cartId: cart.id,
            revision: cart.revision,
          });
        } catch {
          locked = false;
        }
        if (!locked) {
          const reason = transition({ type: 'validation_rejected', attemptId });
          return reason ? rejected(reason) : failed(RECOVERY_FAILURE);
        }

        const validationReason = transition({
          type: 'validation_passed',
          attemptId,
        });
        if (validationReason) return rejected(validationReason);
        prepareCommand = Object.freeze({ attemptId, cartId: cart.id });
        return runPrepare(prepareCommand);
      });
    },
  });
}

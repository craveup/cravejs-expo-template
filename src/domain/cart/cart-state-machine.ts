import type {
  CartEvent,
  CartIntent,
  CartSnapshot,
  CartState,
  CartTransitionFailure,
  CartTransitionResult,
} from './types.ts';

import { assertSafeIdempotencyKey } from '../../lib/storefront-session-scope.ts';

export function initialCartState<TCart>(): CartState<TCart> {
  return { status: 'idle' };
}

function success<TCart>(state: CartState<TCart>): CartTransitionResult<TCart> {
  return { ok: true, state };
}

function failure<TCart>(
  state: CartState<TCart>,
  reason: CartTransitionFailure,
): CartTransitionResult<TCart> {
  return { ok: false, state, reason };
}

function validIntent(intent: CartIntent): boolean {
  try {
    return assertSafeIdempotencyKey(intent.id) === intent.id;
  } catch {
    return false;
  }
}

function validRevision(revision: number): boolean {
  return Number.isSafeInteger(revision) && revision >= 0;
}

function snapshot<TCart>(state: CartState<TCart>): CartSnapshot<TCart> | undefined {
  if (state.status === 'ready') {
    return { cart: state.cart, revision: state.revision };
  }

  return 'previous' in state ? state.previous : undefined;
}

function begin<TCart>(
  state: CartState<TCart>,
  intent: CartIntent,
): CartTransitionResult<TCart> {
  if (!validIntent(intent)) {
    return failure(state, 'invalid_intent_id');
  }

  if (state.status !== 'idle' && state.status !== 'ready') {
    return failure(state, 'invalid_transition');
  }

  if (
    (state.status === 'idle' &&
      intent.kind !== 'start_session' &&
      intent.kind !== 'refresh') ||
    (state.status === 'ready' && intent.kind === 'start_session')
  ) {
    return failure(state, 'invalid_intent_kind');
  }

  if (state.status === 'ready' && state.blockedIntentId === intent.id) {
    return failure(state, 'intent_must_change');
  }

  return success({
    status: 'loading',
    intent,
    previous: snapshot(state),
  });
}

function activeIntentMatches<TCart>(
  state: CartState<TCart>,
  intentId: string,
): state is Extract<CartState<TCart>, { status: 'loading' }> {
  return state.status === 'loading' && state.intent.id === intentId;
}

function validateReturnedRevision<TCart>(
  state: CartState<TCart>,
  revision: number,
): CartTransitionFailure | null {
  if (!validRevision(revision)) {
    return 'invalid_revision';
  }

  const previous = snapshot(state);
  return previous && revision < previous.revision ? 'stale_revision' : null;
}

export function transitionCart<TCart>(
  state: CartState<TCart>,
  event: CartEvent<TCart>,
): CartTransitionResult<TCart> {
  switch (event.type) {
    case 'begin':
      return begin(state, event.intent);

    case 'succeeded': {
      if (state.status !== 'loading') {
        return failure(state, 'invalid_transition');
      }
      if (!activeIntentMatches(state, event.intentId)) {
        return failure(state, 'intent_mismatch');
      }

      const revisionFailure = validateReturnedRevision(state, event.revision);
      return revisionFailure
        ? failure(state, revisionFailure)
        : success({
            status: 'ready',
            cart: event.cart,
            revision: event.revision,
            blockedIntentId: state.intent.id,
          });
    }

    case 'timed_out':
      if (state.status !== 'loading') {
        return failure(state, 'invalid_transition');
      }
      return activeIntentMatches(state, event.intentId)
        ? success({
            status: 'error',
            retry: 'same_intent',
            intent: state.intent,
            previous: state.previous,
          })
        : failure(state, 'intent_mismatch');

    case 'retry':
      return state.status === 'error' &&
        state.retry === 'same_intent' &&
        state.intent
        ? success({
            status: 'loading',
            intent: state.intent,
            previous: state.previous,
          })
        : failure(state, 'invalid_transition');

    case 'conflict':
      if (state.status !== 'loading') {
        return failure(state, 'invalid_transition');
      }
      return activeIntentMatches(state, event.intentId)
        ? success({
            status: 'reconciling',
            rejectedIntent: state.intent,
            previous: state.previous,
          })
        : failure(state, 'intent_mismatch');

    case 'reconciled': {
      if (state.status !== 'reconciling') {
        return failure(state, 'invalid_transition');
      }
      if (state.rejectedIntent.id !== event.intentId) {
        return failure(state, 'intent_mismatch');
      }

      const revisionFailure = validateReturnedRevision(state, event.revision);
      return revisionFailure
        ? failure(state, revisionFailure)
        : success({
            status: 'ready',
            cart: event.cart,
            revision: event.revision,
            blockedIntentId: state.rejectedIntent.id,
          });
    }

    case 'failed':
      if (state.status !== 'loading') {
        return failure(state, 'invalid_transition');
      }
      return activeIntentMatches(state, event.intentId)
        ? success({
            status: 'error',
            retry: event.retry,
            previous: state.previous,
            blockedIntentId: state.intent.id,
          })
        : failure(state, 'intent_mismatch');

    case 'reconciliation_failed':
      if (state.status !== 'reconciling') {
        return failure(state, 'invalid_transition');
      }
      return state.rejectedIntent.id === event.intentId
        ? success({
            status: 'error',
            retry: event.retry,
            blockedIntentId: state.rejectedIntent.id,
          })
        : failure(state, 'intent_mismatch');

    case 'became_terminal':
      if (state.status !== 'loading' && state.status !== 'reconciling') {
        return failure(state, 'invalid_transition');
      }
      return (state.status === 'loading'
        ? activeIntentMatches(state, event.intentId)
        : state.rejectedIntent.id === event.intentId)
        ? success({ status: 'terminal', reason: event.reason })
        : failure(state, 'intent_mismatch');

    case 'dismiss_error':
      if (state.status !== 'error' || state.retry === 'same_intent') {
        return failure(state, 'invalid_transition');
      }
      return success(
        state.previous
          ? {
              status: 'ready',
              cart: state.previous.cart,
              revision: state.previous.revision,
              blockedIntentId: state.blockedIntentId,
            }
          : { status: 'idle' },
      );

    case 'start_new_session':
      if (state.status !== 'terminal') {
        return failure(state, 'invalid_transition');
      }
      return event.intent.kind === 'start_session'
        ? begin({ status: 'idle' }, event.intent)
        : failure(state, 'invalid_intent_kind');
  }
}

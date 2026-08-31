import type {
  CheckoutHandoffEvent,
  CheckoutHandoffState,
  CheckoutHandoffTransitionFailure,
  CheckoutHandoffTransitionResult,
} from './types.ts';

import { assertSafeIdempotencyKey } from '../../lib/storefront-session-scope.ts';

export function initialCheckoutHandoffState(): CheckoutHandoffState {
  return { status: 'editing' };
}

function success(
  state: CheckoutHandoffState,
): CheckoutHandoffTransitionResult {
  return { ok: true, state };
}

function failure(
  state: CheckoutHandoffState,
  reason: CheckoutHandoffTransitionFailure,
): CheckoutHandoffTransitionResult {
  return { ok: false, state, reason };
}

function validAttemptId(attemptId: string): boolean {
  try {
    return assertSafeIdempotencyKey(attemptId) === attemptId;
  } catch {
    return false;
  }
}

function validExpiry(expiresAt: string): boolean {
  return (
    expiresAt.length > 0 &&
    expiresAt.length <= 128 &&
    expiresAt === expiresAt.trim() &&
    Number.isFinite(Date.parse(expiresAt))
  );
}

function canReplaceAttempt(state: CheckoutHandoffState): boolean {
  return state.status === 'failed' || state.status === 'canceled_before_open';
}

function replaysValidation(event: CheckoutHandoffEvent): boolean {
  return event.type === 'begin_validation' || event.type === 'validation_passed';
}

function replaysPreparation(
  state: CheckoutHandoffState,
  event: CheckoutHandoffEvent,
): boolean {
  return (
    replaysValidation(event) ||
    (event.type === 'prepare_succeeded' &&
      'expiresAt' in state &&
      state.expiresAt !== undefined &&
      event.expiresAt === state.expiresAt)
  );
}

function replaysOpenStart(
  state: CheckoutHandoffState,
  event: CheckoutHandoffEvent,
): boolean {
  return replaysPreparation(state, event) || event.type === 'open_started';
}

function duplicateCallback(
  state: CheckoutHandoffState,
  event: CheckoutHandoffEvent,
): boolean {
  switch (state.status) {
    case 'validating':
      return event.type === 'begin_validation';
    case 'preparing_handoff':
      return replaysValidation(event);
    case 'handoff_ready':
      return replaysPreparation(state, event);
    case 'opening_hosted_checkout':
      return replaysOpenStart(state, event);
    case 'handed_off':
      return replaysOpenStart(state, event) || event.type === 'open_succeeded';
    case 'failed':
      return state.failure === 'handoff_expired'
        ? replaysPreparation(state, event) || event.type === 'handoff_expired'
        : state.stage === 'validation'
          ? event.type === 'validation_rejected'
          : event.type === 'validation_passed' || event.type === 'prepare_failed';
    case 'canceled_before_open':
      return replaysOpenStart(state, event) || event.type === 'open_canceled';
    case 'outcome_unknown':
      return state.cause === 'prepare_unknown'
        ? replaysValidation(event) || event.type === 'outcome_became_unknown'
        : replaysOpenStart(state, event) ||
            (state.cause === 'open_failed'
              ? event.type === 'open_failed'
              : event.type === 'outcome_became_unknown');
    case 'editing':
      return false;
  }
}

export function transitionCheckoutHandoff(
  state: CheckoutHandoffState,
  event: CheckoutHandoffEvent,
): CheckoutHandoffTransitionResult {
  if (!validAttemptId(event.attemptId)) {
    return failure(state, 'invalid_attempt_id');
  }

  if (event.type === 'prepare_succeeded' && !validExpiry(event.expiresAt)) {
    return failure(state, 'invalid_expiry');
  }

  if (event.type === 'begin_validation') {
    if (state.status === 'editing') {
      return success({ status: 'validating', attemptId: event.attemptId });
    }
    if (canReplaceAttempt(state)) {
      return state.attemptId === event.attemptId
        ? failure(state, 'attempt_must_change')
        : success({ status: 'validating', attemptId: event.attemptId });
    }
  }

  if (state.status === 'editing') {
    return failure(state, 'invalid_transition');
  }

  if (state.attemptId !== event.attemptId) {
    return failure(state, 'attempt_mismatch');
  }

  if (duplicateCallback(state, event)) {
    return success(state);
  }

  switch (state.status) {
    case 'validating':
      if (event.type === 'validation_passed') {
        return success({
          status: 'preparing_handoff',
          attemptId: state.attemptId,
        });
      }
      if (event.type === 'validation_rejected') {
        return success({
          status: 'failed',
          attemptId: state.attemptId,
          failure: 'pre_handoff',
          stage: 'validation',
        });
      }
      return failure(state, 'invalid_transition');

    case 'preparing_handoff':
      if (event.type === 'prepare_succeeded') {
        return success({
          status: 'handoff_ready',
          attemptId: state.attemptId,
          expiresAt: event.expiresAt,
        });
      }
      if (event.type === 'prepare_failed') {
        return success({
          status: 'failed',
          attemptId: state.attemptId,
          failure: 'pre_handoff',
          stage: 'prepare',
        });
      }
      if (event.type === 'outcome_became_unknown') {
        return success({
          status: 'outcome_unknown',
          attemptId: state.attemptId,
          cause: 'prepare_unknown',
        });
      }
      return failure(state, 'invalid_transition');

    case 'handoff_ready':
      if (event.type === 'open_started') {
        return success({
          status: 'opening_hosted_checkout',
          attemptId: state.attemptId,
          expiresAt: state.expiresAt,
        });
      }
      if (event.type === 'handoff_expired') {
        return success({
          status: 'failed',
          attemptId: state.attemptId,
          failure: 'handoff_expired',
          expiresAt: state.expiresAt,
        });
      }
      return failure(state, 'invalid_transition');

    case 'opening_hosted_checkout':
      if (event.type === 'open_succeeded') {
        return success({
          status: 'handed_off',
          attemptId: state.attemptId,
          expiresAt: state.expiresAt,
        });
      }
      if (event.type === 'open_canceled') {
        return success({
          status: 'canceled_before_open',
          attemptId: state.attemptId,
          expiresAt: state.expiresAt,
        });
      }
      if (event.type === 'open_failed') {
        return success({
          status: 'outcome_unknown',
          attemptId: state.attemptId,
          cause: 'open_failed',
          expiresAt: state.expiresAt,
        });
      }
      if (event.type === 'outcome_became_unknown') {
        return success({
          status: 'outcome_unknown',
          attemptId: state.attemptId,
          cause: 'open_unknown',
          expiresAt: state.expiresAt,
        });
      }
      return failure(state, 'invalid_transition');

    case 'handed_off':
    case 'failed':
    case 'canceled_before_open':
    case 'outcome_unknown':
      return failure(state, 'invalid_transition');
  }
}

export function isProvenPreHandoffFailure(
  state: CheckoutHandoffState,
): boolean {
  return state.status === 'failed' && state.failure === 'pre_handoff';
}

export function canStartNewCheckoutHandoff(
  state: CheckoutHandoffState,
): boolean {
  return (
    state.status === 'editing' ||
    state.status === 'failed' ||
    state.status === 'canceled_before_open'
  );
}

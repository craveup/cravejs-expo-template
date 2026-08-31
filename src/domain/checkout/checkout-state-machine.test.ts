import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  canStartNewCheckoutHandoff,
  initialCheckoutHandoffState,
  isProvenPreHandoffFailure,
  transitionCheckoutHandoff,
  type CheckoutHandoffEvent,
  type CheckoutHandoffState,
} from './index.ts';

const attemptId = 'checkout-attempt-1';
const nextAttemptId = 'checkout-attempt-2';
const expiresAt = '2026-08-11T17:00:00.000Z';

function transition(
  state: CheckoutHandoffState,
  event: CheckoutHandoffEvent,
): CheckoutHandoffState {
  const result = transitionCheckoutHandoff(state, event);
  assert.equal(result.ok, true);
  return result.state;
}

function advanceToHandoffReady(): CheckoutHandoffState {
  let state = transition(initialCheckoutHandoffState(), {
    type: 'begin_validation',
    attemptId,
  });
  state = transition(state, { type: 'validation_passed', attemptId });
  return transition(state, { type: 'prepare_succeeded', attemptId, expiresAt });
}

test('models only validation, hosted-checkout preparation, and browser handoff', () => {
  let state = advanceToHandoffReady();
  assert.deepEqual(state, { status: 'handoff_ready', attemptId, expiresAt });

  state = transition(state, { type: 'open_started', attemptId });
  assert.deepEqual(state, {
    status: 'opening_hosted_checkout',
    attemptId,
    expiresAt,
  });

  state = transition(state, { type: 'open_succeeded', attemptId });
  assert.deepEqual(state, { status: 'handed_off', attemptId, expiresAt });
  assert.equal(canStartNewCheckoutHandoff(state), false);
});

test('marks a proven validation rejection as pre-handoff and requires a new attempt', () => {
  let state = transition(initialCheckoutHandoffState(), {
    type: 'begin_validation',
    attemptId,
  });
  state = transition(state, { type: 'validation_rejected', attemptId });

  assert.deepEqual(state, {
    status: 'failed',
    attemptId,
    failure: 'pre_handoff',
    stage: 'validation',
  });
  assert.deepEqual(
    transitionCheckoutHandoff(state, { type: 'validation_passed', attemptId }),
    { ok: false, state, reason: 'invalid_transition' },
  );
  assert.deepEqual(
    transitionCheckoutHandoff(state, { type: 'prepare_failed', attemptId }),
    { ok: false, state, reason: 'invalid_transition' },
  );
  assert.equal(isProvenPreHandoffFailure(state), true);
  assert.equal(canStartNewCheckoutHandoff(state), true);
  assert.deepEqual(
    transitionCheckoutHandoff(state, { type: 'begin_validation', attemptId }),
    { ok: false, state, reason: 'attempt_must_change' },
  );

  state = transition(state, { type: 'begin_validation', attemptId: nextAttemptId });
  assert.deepEqual(state, { status: 'validating', attemptId: nextAttemptId });
});

test('keeps expiration, cancellation before open, and an unknown outcome distinct', () => {
  const ready = advanceToHandoffReady();
  const expired = transition(ready, { type: 'handoff_expired', attemptId });
  assert.deepEqual(expired, {
    status: 'failed',
    attemptId,
    failure: 'handoff_expired',
    expiresAt,
  });
  assert.equal(isProvenPreHandoffFailure(expired), false);
  assert.equal(canStartNewCheckoutHandoff(expired), true);

  const opening = transition(ready, { type: 'open_started', attemptId });
  assert.deepEqual(
    transitionCheckoutHandoff(opening, { type: 'handoff_expired', attemptId }),
    { ok: false, state: opening, reason: 'invalid_transition' },
  );
  const canceled = transition(opening, { type: 'open_canceled', attemptId });
  assert.deepEqual(canceled, {
    status: 'canceled_before_open',
    attemptId,
    expiresAt,
  });
  assert.equal(canStartNewCheckoutHandoff(canceled), true);

  const unknown = transition(opening, {
    type: 'outcome_became_unknown',
    attemptId,
  });
  assert.deepEqual(unknown, {
    status: 'outcome_unknown',
    attemptId,
    cause: 'open_unknown',
    expiresAt,
  });
  assert.deepEqual(
    transitionCheckoutHandoff(unknown, { type: 'open_failed', attemptId }),
    { ok: false, state: unknown, reason: 'invalid_transition' },
  );
  assert.equal(canStartNewCheckoutHandoff(unknown), false);

  let preparing = transition(initialCheckoutHandoffState(), {
    type: 'begin_validation',
    attemptId,
  });
  preparing = transition(preparing, { type: 'validation_passed', attemptId });
  const prepareUnknown = transition(preparing, {
    type: 'outcome_became_unknown',
    attemptId,
  });
  assert.deepEqual(prepareUnknown, {
    status: 'outcome_unknown',
    attemptId,
    cause: 'prepare_unknown',
  });
  for (const event of [
    { type: 'open_started', attemptId },
    { type: 'open_failed', attemptId },
  ] as const) {
    assert.deepEqual(transitionCheckoutHandoff(prepareUnknown, event), {
      ok: false,
      state: prepareUnknown,
      reason: 'invalid_transition',
    });
  }
});

test('keeps prepare rejection retryable but treats browser-open failure as uncertain', () => {
  let state = transition(initialCheckoutHandoffState(), {
    type: 'begin_validation',
    attemptId,
  });
  state = transition(state, { type: 'validation_passed', attemptId });

  const prepareFailed = transition(state, { type: 'prepare_failed', attemptId });
  assert.deepEqual(prepareFailed, {
    status: 'failed',
    attemptId,
    failure: 'pre_handoff',
    stage: 'prepare',
  });
  assert.strictEqual(
    transition(prepareFailed, { type: 'validation_passed', attemptId }),
    prepareFailed,
  );
  assert.deepEqual(
    transitionCheckoutHandoff(prepareFailed, {
      type: 'validation_rejected',
      attemptId,
    }),
    { ok: false, state: prepareFailed, reason: 'invalid_transition' },
  );
  assert.equal(isProvenPreHandoffFailure(prepareFailed), true);

  state = transition(advanceToHandoffReady(), { type: 'open_started', attemptId });
  const openFailed = transition(state, { type: 'open_failed', attemptId });
  assert.deepEqual(openFailed, {
    status: 'outcome_unknown',
    attemptId,
    cause: 'open_failed',
    expiresAt,
  });
  assert.equal(isProvenPreHandoffFailure(openFailed), false);
  assert.equal(canStartNewCheckoutHandoff(openFailed), false);
  assert.deepEqual(
    transitionCheckoutHandoff(openFailed, {
      type: 'outcome_became_unknown',
      attemptId,
    }),
    { ok: false, state: openFailed, reason: 'invalid_transition' },
  );
  assert.strictEqual(
    transition(openFailed, { type: 'open_failed', attemptId }),
    openFailed,
  );
});

test('treats duplicate callbacks for the same settled handoff event as idempotent', () => {
  let state = advanceToHandoffReady();
  const ready = state;
  state = transition(state, { type: 'validation_passed', attemptId });
  assert.strictEqual(state, ready);
  state = transition(state, { type: 'prepare_succeeded', attemptId, expiresAt });
  assert.strictEqual(state, ready);

  state = transition(state, { type: 'open_started', attemptId });
  const opening = state;
  state = transition(state, { type: 'prepare_succeeded', attemptId, expiresAt });
  assert.strictEqual(state, opening);
  assert.deepEqual(
    transitionCheckoutHandoff(state, {
      type: 'prepare_succeeded',
      attemptId,
      expiresAt: '2026-08-11T17:01:00.000Z',
    }),
    { ok: false, state, reason: 'invalid_transition' },
  );
  state = transition(state, { type: 'open_started', attemptId });
  assert.strictEqual(state, opening);

  state = transition(state, { type: 'open_succeeded', attemptId });
  const handedOff = state;
  state = transition(state, { type: 'open_started', attemptId });
  assert.strictEqual(state, handedOff);
  state = transition(state, { type: 'open_succeeded', attemptId });
  assert.strictEqual(state, handedOff);
});

test('rejects stale callbacks, unsafe attempt identifiers, and malformed expiry values', () => {
  const ready = advanceToHandoffReady();
  assert.deepEqual(
    transitionCheckoutHandoff(ready, {
      type: 'open_started',
      attemptId: 'stale-attempt',
    }),
    { ok: false, state: ready, reason: 'attempt_mismatch' },
  );

  const editing = initialCheckoutHandoffState();
  assert.deepEqual(
    transitionCheckoutHandoff(editing, {
      type: 'begin_validation',
      attemptId: 'short',
    }),
    { ok: false, state: editing, reason: 'invalid_attempt_id' },
  );

  let state = transition(editing, { type: 'begin_validation', attemptId });
  state = transition(state, { type: 'validation_passed', attemptId });
  assert.deepEqual(
    transitionCheckoutHandoff(state, {
      type: 'prepare_succeeded',
      attemptId,
      expiresAt: 'not-a-timestamp',
    }),
    { ok: false, state, reason: 'invalid_expiry' },
  );
});

test('contains no native payment or terminal order-result contract', async () => {
  const sources = await Promise.all([
    readFile(new URL('./checkout-state-machine.ts', import.meta.url), 'utf8'),
    readFile(new URL('./types.ts', import.meta.url), 'utf8'),
  ]);
  const source = sources.join('\n');

  assert.doesNotMatch(
    source,
    /creating_intent|presenting_payment|payment_sheet|payment_declined|payment_pending|order_pending|result_completed/,
  );
  assert.doesNotMatch(source, /checkoutUrl|clientSecret|paymentIntent|Stripe/);
});

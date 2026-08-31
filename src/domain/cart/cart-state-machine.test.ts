import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialCartState,
  transitionCart,
  type CartIntent,
  type CartState,
} from './index.ts';

type TestCart = Readonly<{ id: string }>;

const startIntent: CartIntent = { id: 'intent-start', kind: 'start_session' };
const addIntent: CartIntent = { id: 'intent-add', kind: 'add_item' };

function requireState(
  result: ReturnType<typeof transitionCart<TestCart>>,
): CartState<TestCart> {
  assert.equal(result.ok, true);
  return result.state;
}

function readyState(revision = 1): CartState<TestCart> {
  return { status: 'ready', cart: { id: 'cart-1' }, revision };
}

test('loads an authoritative cart into the ready state', () => {
  const loading = requireState(
    transitionCart(initialCartState<TestCart>(), { type: 'begin', intent: startIntent }),
  );
  const ready = transitionCart(loading, {
    type: 'succeeded',
    intentId: startIntent.id,
    cart: { id: 'cart-1' },
    revision: 1,
  });

  assert.deepEqual(ready, {
    ok: true,
    state: {
      status: 'ready',
      cart: { id: 'cart-1' },
      revision: 1,
      blockedIntentId: startIntent.id,
    },
  });
});

test('retains the same intent through a timeout retry', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );
  const error = requireState(
    transitionCart(loading, { type: 'timed_out', intentId: addIntent.id }),
  );
  const retried = requireState(transitionCart(error, { type: 'retry' }));

  assert.equal(retried.status, 'loading');
  if (retried.status === 'loading') {
    assert.strictEqual(retried.intent, addIntent);
    assert.equal(retried.intent.id, 'intent-add');
  }

  assert.deepEqual(transitionCart(error, { type: 'dismiss_error' }), {
    ok: false,
    state: error,
    reason: 'invalid_transition',
  });
});

test('reconciles a conflict and requires a new user intent before retry', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );
  const reconciling = requireState(
    transitionCart(loading, { type: 'conflict', intentId: addIntent.id }),
  );
  const reconciled = requireState(
    transitionCart(reconciling, {
      type: 'reconciled',
      intentId: addIntent.id,
      cart: { id: 'cart-1' },
      revision: 2,
    }),
  );

  assert.deepEqual(transitionCart(reconciled, { type: 'begin', intent: addIntent }), {
    ok: false,
    state: reconciled,
    reason: 'intent_must_change',
  });

  const deliberateRetry = transitionCart(reconciled, {
    type: 'begin',
    intent: { ...addIntent, id: 'intent-add-after-reconcile' },
  });
  assert.equal(deliberateRetry.ok, true);
});

test('rejects concurrent intents and late responses from another intent', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );

  assert.deepEqual(
    transitionCart(loading, {
      type: 'begin',
      intent: { id: 'intent-remove', kind: 'remove_item' },
    }),
    { ok: false, state: loading, reason: 'invalid_transition' },
  );
  assert.deepEqual(
    transitionCart(loading, {
      type: 'succeeded',
      intentId: 'another-intent',
      cart: { id: 'cart-1' },
      revision: 2,
    }),
    { ok: false, state: loading, reason: 'intent_mismatch' },
  );
});

test('rejects late reconciliation callbacks from another intent', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );
  const reconciling = requireState(
    transitionCart(loading, { type: 'conflict', intentId: addIntent.id }),
  );

  assert.deepEqual(
    transitionCart(reconciling, {
      type: 'reconciled',
      intentId: 'stale-intent',
      cart: { id: 'cart-1' },
      revision: 2,
    }),
    { ok: false, state: reconciling, reason: 'intent_mismatch' },
  );
  assert.deepEqual(
    transitionCart(reconciling, {
      type: 'reconciliation_failed',
      intentId: 'stale-intent',
      retry: 'none',
    }),
    { ok: false, state: reconciling, reason: 'intent_mismatch' },
  );
});

test('moves a cart that expires during reconciliation to terminal state', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );
  const reconciling = requireState(
    transitionCart(loading, { type: 'conflict', intentId: addIntent.id }),
  );

  assert.deepEqual(
    transitionCart(reconciling, {
      type: 'became_terminal',
      intentId: addIntent.id,
      reason: 'expired',
    }),
    { ok: true, state: { status: 'terminal', reason: 'expired' } },
  );
});

test('requires a fresh key after a settled mutation intent', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );
  const settled = requireState(
    transitionCart(loading, {
      type: 'succeeded',
      intentId: addIntent.id,
      cart: { id: 'cart-1' },
      revision: 2,
    }),
  );

  assert.deepEqual(transitionCart(settled, { type: 'begin', intent: addIntent }), {
    ok: false,
    state: settled,
    reason: 'intent_must_change',
  });
});

test('rejects malformed and stale authoritative revisions', () => {
  const loading = requireState(
    transitionCart(readyState(4), { type: 'begin', intent: addIntent }),
  );

  for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const result = transitionCart(loading, {
      type: 'succeeded',
      intentId: addIntent.id,
      cart: { id: 'cart-1' },
      revision,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'invalid_revision');
    }
  }

  assert.deepEqual(
    transitionCart(loading, {
      type: 'succeeded',
      intentId: addIntent.id,
      cart: { id: 'cart-1' },
      revision: 3,
    }),
    { ok: false, state: loading, reason: 'stale_revision' },
  );
});

test('stops edits in terminal state until a deliberate new session starts', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );
  const terminal = requireState(
    transitionCart(loading, {
      type: 'became_terminal',
      intentId: addIntent.id,
      reason: 'expired',
    }),
  );

  assert.equal(
    transitionCart(terminal, { type: 'begin', intent: addIntent }).ok,
    false,
  );
  assert.deepEqual(
    transitionCart(terminal, {
      type: 'start_new_session',
      intent: { id: 'intent-new-session', kind: 'start_session' },
    }),
    {
      ok: true,
      state: {
        status: 'loading',
        intent: { id: 'intent-new-session', kind: 'start_session' },
        previous: undefined,
      },
    },
  );
});

test('dismisses an operation error back to the last authoritative snapshot', () => {
  const loading = requireState(
    transitionCart(readyState(3), { type: 'begin', intent: addIntent }),
  );
  const error = requireState(
    transitionCart(loading, {
      type: 'failed',
      intentId: addIntent.id,
      retry: 'new_intent',
    }),
  );

  assert.deepEqual(transitionCart(error, { type: 'dismiss_error' }), {
    ok: true,
    state: {
      status: 'ready',
      cart: { id: 'cart-1' },
      revision: 3,
      blockedIntentId: addIntent.id,
    },
  });
});

test('does not restore a stale cart when reconciliation fails', () => {
  const loading = requireState(
    transitionCart(readyState(), { type: 'begin', intent: addIntent }),
  );
  const reconciling = requireState(
    transitionCart(loading, { type: 'conflict', intentId: addIntent.id }),
  );
  const error = requireState(
    transitionCart(reconciling, {
      type: 'reconciliation_failed',
      intentId: addIntent.id,
      retry: 'none',
    }),
  );

  assert.deepEqual(transitionCart(error, { type: 'dismiss_error' }), {
    ok: true,
    state: { status: 'idle' },
  });
});

test('rejects empty intent identifiers', () => {
  const state = initialCartState<TestCart>();
  assert.deepEqual(
    transitionCart(state, {
      type: 'begin',
      intent: { id: '   ', kind: 'start_session' },
    }),
    { ok: false, state, reason: 'invalid_intent_id' },
  );
});

test('rejects intent identifiers outside the shared idempotency contract', () => {
  const state = initialCartState<TestCart>();

  for (const id of ['short', 'intent with spaces', 'x'.repeat(129)]) {
    assert.deepEqual(
      transitionCart(state, {
        type: 'begin',
        intent: { id, kind: 'start_session' },
      }),
      { ok: false, state, reason: 'invalid_intent_id' },
    );
  }
});

test('rejects cart mutations before an authoritative session is ready', () => {
  const state = initialCartState<TestCart>();

  assert.deepEqual(
    transitionCart(state, { type: 'begin', intent: addIntent }),
    { ok: false, state, reason: 'invalid_intent_kind' },
  );
});

test('does not replace a ready cart through the ordinary begin event', () => {
  const state = readyState();

  assert.deepEqual(
    transitionCart(state, { type: 'begin', intent: startIntent }),
    { ok: false, state, reason: 'invalid_intent_kind' },
  );
});

test('requires the explicit start-session intent after a terminal cart', () => {
  const terminal: CartState<TestCart> = {
    status: 'terminal',
    reason: 'expired',
  };

  assert.deepEqual(
    transitionCart(terminal, {
      type: 'start_new_session',
      intent: addIntent,
    }),
    { ok: false, state: terminal, reason: 'invalid_intent_kind' },
  );
});

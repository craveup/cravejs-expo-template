export type CartIntentKind =
  | 'start_session'
  | 'refresh'
  | 'add_item'
  | 'update_quantity'
  | 'remove_item'
  | 'clear'
  | 'apply_discount'
  | 'remove_discount'
  | 'set_gratuity'
  | 'set_customer'
  | 'set_fulfillment'
  | 'set_delivery_address'
  | 'set_order_time'
  | 'claim';

export type CartIntent = Readonly<{
  id: string;
  kind: CartIntentKind;
}>;

export type CartSnapshot<TCart> = Readonly<{
  cart: TCart;
  revision: number;
}>;

export type CartState<TCart> =
  | Readonly<{
      status: 'idle';
    }>
  | Readonly<{
      status: 'loading';
      intent: CartIntent;
      previous?: CartSnapshot<TCart>;
    }>
  | Readonly<{
      status: 'ready';
      cart: TCart;
      revision: number;
      blockedIntentId?: string;
    }>
  | Readonly<{
      status: 'reconciling';
      rejectedIntent: CartIntent;
      previous?: CartSnapshot<TCart>;
    }>
  | Readonly<{
      status: 'terminal';
      reason: 'deleted' | 'expired' | 'unauthorized' | 'immutable';
    }>
  | Readonly<{
      status: 'error';
      retry: 'same_intent' | 'new_intent' | 'none';
      intent?: CartIntent;
      previous?: CartSnapshot<TCart>;
      blockedIntentId?: string;
    }>;

export type CartEvent<TCart> =
  | Readonly<{
      type: 'begin';
      intent: CartIntent;
    }>
  | Readonly<{
      type: 'succeeded';
      intentId: string;
      cart: TCart;
      revision: number;
    }>
  | Readonly<{
      type: 'timed_out';
      intentId: string;
    }>
  | Readonly<{
      type: 'retry';
    }>
  | Readonly<{
      type: 'conflict';
      intentId: string;
    }>
  | Readonly<{
      type: 'reconciled';
      intentId: string;
      cart: TCart;
      revision: number;
    }>
  | Readonly<{
      type: 'failed';
      intentId: string;
      retry: 'new_intent' | 'none';
    }>
  | Readonly<{
      type: 'reconciliation_failed';
      intentId: string;
      retry: 'new_intent' | 'none';
    }>
  | Readonly<{
      type: 'became_terminal';
      intentId: string;
      reason: 'deleted' | 'expired' | 'unauthorized' | 'immutable';
    }>
  | Readonly<{
      type: 'dismiss_error';
    }>
  | Readonly<{
      type: 'start_new_session';
      intent: CartIntent;
    }>;

export type CartTransitionFailure =
  | 'checkout_handoff_locked'
  | 'invalid_transition'
  | 'invalid_intent_id'
  | 'invalid_intent_kind'
  | 'intent_mismatch'
  | 'intent_must_change'
  | 'invalid_revision'
  | 'stale_revision';

export type CartTransitionResult<TCart> =
  | Readonly<{
      ok: true;
      state: CartState<TCart>;
    }>
  | Readonly<{
      ok: false;
      state: CartState<TCart>;
      reason: CartTransitionFailure;
    }>;

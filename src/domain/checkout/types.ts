export type CheckoutHandoffState =
  | Readonly<{ status: 'editing' }>
  | Readonly<{ status: 'validating'; attemptId: string }>
  | Readonly<{ status: 'preparing_handoff'; attemptId: string }>
  | Readonly<{
      status: 'handoff_ready';
      attemptId: string;
      expiresAt: string;
    }>
  | Readonly<{
      status: 'opening_hosted_checkout';
      attemptId: string;
      expiresAt: string;
    }>
  | Readonly<{ status: 'handed_off'; attemptId: string; expiresAt: string }>
  | Readonly<{
      status: 'failed';
      attemptId: string;
      failure: 'pre_handoff';
      stage: 'validation' | 'prepare';
    }>
  | Readonly<{
      status: 'failed';
      attemptId: string;
      failure: 'handoff_expired';
      expiresAt: string;
    }>
  | Readonly<{
      status: 'canceled_before_open';
      attemptId: string;
      expiresAt: string;
    }>
  | Readonly<{
      status: 'outcome_unknown';
      attemptId: string;
      cause: 'prepare_unknown';
    }>
  | Readonly<{
      status: 'outcome_unknown';
      attemptId: string;
      cause: 'open_failed' | 'open_unknown';
      expiresAt: string;
    }>;

export type CheckoutHandoffEvent =
  | Readonly<{ type: 'begin_validation'; attemptId: string }>
  | Readonly<{ type: 'validation_passed'; attemptId: string }>
  | Readonly<{ type: 'validation_rejected'; attemptId: string }>
  | Readonly<{
      type: 'prepare_succeeded';
      attemptId: string;
      expiresAt: string;
    }>
  | Readonly<{ type: 'prepare_failed'; attemptId: string }>
  | Readonly<{ type: 'open_started'; attemptId: string }>
  | Readonly<{ type: 'open_succeeded'; attemptId: string }>
  | Readonly<{ type: 'open_canceled'; attemptId: string }>
  | Readonly<{ type: 'open_failed'; attemptId: string }>
  | Readonly<{ type: 'handoff_expired'; attemptId: string }>
  | Readonly<{ type: 'outcome_became_unknown'; attemptId: string }>;

export type CheckoutHandoffTransitionFailure =
  | 'invalid_transition'
  | 'invalid_attempt_id'
  | 'attempt_mismatch'
  | 'attempt_must_change'
  | 'invalid_expiry';

export type CheckoutHandoffTransitionResult =
  | Readonly<{ ok: true; state: CheckoutHandoffState }>
  | Readonly<{
      ok: false;
      state: CheckoutHandoffState;
      reason: CheckoutHandoffTransitionFailure;
    }>;

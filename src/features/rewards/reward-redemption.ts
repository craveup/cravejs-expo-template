import type { LoyaltyQuote } from '@craveup/storefront-sdk';

import { createTranslator, type AppLocale } from '../../i18n/localization.ts';
import type {
  StorefrontCartSession,
  StorefrontCartSessionStore,
} from '../../lib/cart-session.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import { assertSafeStorefrontResourceId } from '../../lib/storefront-session-scope.ts';
import type { LoyaltyMutationResult, LoyaltyService } from './loyalty-service.ts';

export type RewardRedemptionMode = 'cancel' | 'redeem';
export type RewardRedemptionActionStatus =
  | 'idle'
  | 'pending'
  | 'retryable_error'
  | 'terminal_error';

export type RewardRedemptionSnapshot = Readonly<{
  balanceAvailable?: number;
  cartId: string;
  mode: RewardRedemptionMode;
  revision: number;
  rewardId: string;
  rewardName: string;
  rewardPointsCost: number;
}>;

export type RewardRedemptionPresentationState =
  | Readonly<{
      status:
        | 'error'
        | 'loading'
        | 'not_found'
        | 'requires_order'
        | 'signed_out'
        | 'unavailable';
    }>
  | Readonly<{
      actionStatus: RewardRedemptionActionStatus;
      balanceLabel?: string;
      mode: RewardRedemptionMode;
      primaryLabel: string;
      rewardCostLabel: string;
      rewardName: string;
      secondaryLabel: string;
      status: 'ready';
      title: string;
    }>;

export type RewardRedemptionLoadResult =
  | Readonly<{ kind: 'ready'; snapshot: RewardRedemptionSnapshot }>
  | Readonly<{
      kind: 'failed';
      state: Exclude<RewardRedemptionPresentationState, { status: 'ready' }>;
    }>;

export type RewardRedemptionSubmitResult =
  | Readonly<{ kind: 'completed' }>
  | Readonly<{ kind: 'refresh_required' }>
  | Readonly<{ kind: 'retryable_error' }>
  | Readonly<{ kind: 'signed_out' }>
  | Readonly<{ kind: 'unavailable' }>;

export type RewardSubmissionGuard = Readonly<{
  begin(): number | undefined;
  complete(generation: number): boolean;
  invalidate(): void;
}>;

export type RewardRedemptionDependencies = Readonly<{
  cartSessions: Pick<StorefrontCartSessionStore, 'get'>;
  locationId: string;
  loyalty: Pick<LoyaltyService, 'cancel' | 'getQuote' | 'redeem'>;
}>;

const STORAGE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'SECURE_STORAGE_UNAVAILABLE',
  kind: 'unavailable',
  retryable: true,
});

export function createRewardSubmissionGuard(): RewardSubmissionGuard {
  let generation = 0;
  let pending = false;

  return Object.freeze({
    begin(): number | undefined {
      if (pending) return undefined;
      pending = true;
      return generation;
    },
    complete(completedGeneration: number): boolean {
      if (!pending || completedGeneration !== generation) return false;
      pending = false;
      return true;
    },
    invalidate(): void {
      generation += 1;
      pending = false;
    },
  });
}

function failureState(
  failure: StorefrontFailure,
): Exclude<RewardRedemptionPresentationState, { status: 'ready' }> {
  if (failure.kind === 'authentication_required') {
    return Object.freeze({ status: 'signed_out' });
  }
  if (failure.kind === 'not_found') {
    return Object.freeze({ status: 'not_found' });
  }
  return Object.freeze({
    status: failure.retryable ? 'error' : 'unavailable',
  });
}

function failed(
  state: Exclude<RewardRedemptionPresentationState, { status: 'ready' }>,
): RewardRedemptionLoadResult {
  return Object.freeze({ kind: 'failed', state });
}

function selectedReward(quote: LoyaltyQuote, rewardId: string) {
  return quote.rewards?.find((reward) => reward.id === rewardId);
}

function snapshotFromQuote(
  cart: StorefrontCartSession,
  quote: LoyaltyQuote,
  rewardId: string,
): RewardRedemptionLoadResult {
  if (!quote.enabled || quote.available === false) {
    return failed(Object.freeze({ status: 'unavailable' }));
  }

  const reward = selectedReward(quote, rewardId);
  if (!reward) return failed(Object.freeze({ status: 'not_found' }));

  const mode: RewardRedemptionMode =
    quote.appliedRewardId === rewardId ? 'cancel' : 'redeem';
  if (mode === 'redeem' && !reward.redeemable) {
    return failed(Object.freeze({ status: 'unavailable' }));
  }

  return Object.freeze({
    kind: 'ready',
    snapshot: Object.freeze({
      ...(quote.balance ? { balanceAvailable: quote.balance.available } : {}),
      cartId: cart.cartId,
      mode,
      revision: cart.revision,
      rewardId: reward.id,
      rewardName: reward.name,
      rewardPointsCost: reward.pointsCost,
    }),
  });
}

export async function loadRewardRedemption(
  dependencies: RewardRedemptionDependencies,
  rewardIdInput: string,
): Promise<RewardRedemptionLoadResult> {
  let rewardId: string;
  try {
    rewardId = assertSafeStorefrontResourceId(rewardIdInput, 'rewardId');
  } catch {
    return failed(Object.freeze({ status: 'not_found' }));
  }

  let cart: StorefrontCartSession | null;
  try {
    cart = await dependencies.cartSessions.get(dependencies.locationId);
  } catch {
    return failed(failureState(STORAGE_FAILURE));
  }

  if (!cart) return failed(Object.freeze({ status: 'requires_order' }));

  const quoteResult = await dependencies.loyalty.getQuote(cart.cartId);
  if (quoteResult.kind === 'ready') {
    return snapshotFromQuote(cart, quoteResult.data, rewardId);
  }
  return quoteResult.failure.kind === 'not_found'
    ? failed(Object.freeze({ status: 'requires_order' }))
    : failed(failureState(quoteResult.failure));
}

export function toRewardRedemptionPresentation(
  snapshot: RewardRedemptionSnapshot,
  actionStatus: RewardRedemptionActionStatus = 'idle',
  locale: AppLocale = 'en',
): RewardRedemptionPresentationState {
  const t = createTranslator(locale);
  const points = String(snapshot.rewardPointsCost);

  return Object.freeze({
    actionStatus,
    ...(snapshot.balanceAvailable === undefined
      ? {}
      : {
          balanceLabel: t('rewards.redemption.pointsValue', {
            points: snapshot.balanceAvailable,
          }),
        }),
    mode: snapshot.mode,
    primaryLabel:
      snapshot.mode === 'redeem'
        ? t('rewards.redemption.action.redeem')
        : t('rewards.redemption.action.cancel'),
    rewardCostLabel: t('rewards.redemption.rewardCostValue', { points }),
    rewardName: snapshot.rewardName,
    secondaryLabel:
      snapshot.mode === 'redeem'
        ? t('rewards.redemption.action.notYet')
        : t('rewards.redemption.action.keep'),
    status: 'ready',
    title:
      snapshot.mode === 'redeem'
        ? t('rewards.redemption.redeemTitle', { points })
        : t('rewards.redemption.cancelTitle'),
  });
}

function desiredMutationAlreadyApplied(
  quote: LoyaltyQuote,
  snapshot: RewardRedemptionSnapshot,
): boolean {
  return snapshot.mode === 'redeem'
    ? quote.appliedRewardId === snapshot.rewardId
    : quote.appliedRewardId !== snapshot.rewardId;
}

function submitFailure(failure: StorefrontFailure): RewardRedemptionSubmitResult {
  if (failure.kind === 'authentication_required') {
    return Object.freeze({ kind: 'signed_out' });
  }
  return Object.freeze({
    kind: failure.retryable ? 'retryable_error' : 'unavailable',
  });
}

function mutationResult(
  result: LoyaltyMutationResult,
): RewardRedemptionSubmitResult {
  if (result.kind === 'updated') return Object.freeze({ kind: 'completed' });
  if (result.kind === 'reconciliation_required') {
    return Object.freeze({ kind: 'refresh_required' });
  }
  if (result.failure.kind === 'not_found') {
    return Object.freeze({ kind: 'refresh_required' });
  }
  return submitFailure(result.failure);
}

export async function submitRewardRedemption(
  dependencies: RewardRedemptionDependencies,
  snapshot: RewardRedemptionSnapshot,
  idempotencyKey: string,
): Promise<RewardRedemptionSubmitResult> {
  let currentCart: StorefrontCartSession | null;
  try {
    currentCart = await dependencies.cartSessions.get(dependencies.locationId);
  } catch {
    return submitFailure(STORAGE_FAILURE);
  }

  if (!currentCart || currentCart.cartId !== snapshot.cartId) {
    return Object.freeze({ kind: 'refresh_required' });
  }

  const quoteResult = await dependencies.loyalty.getQuote(snapshot.cartId);
  if (quoteResult.kind === 'failed') {
    return quoteResult.failure.kind === 'not_found'
      ? Object.freeze({ kind: 'refresh_required' })
      : submitFailure(quoteResult.failure);
  }

  const quote = quoteResult.data;
  if (desiredMutationAlreadyApplied(quote, snapshot)) {
    return Object.freeze({ kind: 'completed' });
  }

  if (
    currentCart.revision !== snapshot.revision ||
    !quote.enabled ||
    quote.available === false
  ) {
    return Object.freeze({ kind: 'refresh_required' });
  }

  const reward = selectedReward(quote, snapshot.rewardId);
  if (
    !reward ||
    (snapshot.mode === 'redeem' && !reward.redeemable) ||
    (snapshot.mode === 'cancel' && quote.appliedRewardId !== snapshot.rewardId)
  ) {
    return Object.freeze({ kind: 'refresh_required' });
  }

  const mutation =
    snapshot.mode === 'redeem'
      ? await dependencies.loyalty.redeem({
          cartId: snapshot.cartId,
          idempotencyKey,
          revision: snapshot.revision,
          rewardId: snapshot.rewardId,
        })
      : await dependencies.loyalty.cancel({
          cartId: snapshot.cartId,
          idempotencyKey,
          revision: snapshot.revision,
        });
  if (mutation.kind !== 'updated') return mutationResult(mutation);

  const verification = await dependencies.loyalty.getQuote(snapshot.cartId);
  return verification.kind === 'ready' &&
    desiredMutationAlreadyApplied(verification.data, snapshot)
    ? Object.freeze({ kind: 'completed' })
    : Object.freeze({ kind: 'refresh_required' });
}

export function createRewardMutationKey(now: number, sequence: number): string {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error('Cannot create reward mutation key.');
  }
  return `loyalty_${now.toString(36)}_${sequence.toString(36)}`;
}

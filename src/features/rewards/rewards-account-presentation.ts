import type { LoyaltyLedger, LoyaltyQuote } from '@craveup/storefront-sdk';

import {
  createTranslator,
  type AppLocale,
} from '../../i18n/localization.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import { getPointsBalance } from './points-balance.ts';

export type RewardsAccountReward = Readonly<{
  applied: boolean;
  id: string;
  name: string;
  pointsLabel: string;
  redeemable: boolean;
}>;

export type RewardsAccountQuoteState =
  | Readonly<{ kind: 'not_started' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'ready'; quote: LoyaltyQuote }>;

export type RewardsAccountPresentationState =
  | Readonly<{ status: 'error' | 'loading' | 'signed_out' | 'unavailable' }>
  | Readonly<{
      balanceLabel: string;
      rewards: readonly RewardsAccountReward[];
      rewardsStatus: 'empty' | 'ready' | 'requires_order' | 'unavailable';
      status: 'ready';
    }>;

export function toRewardsAccountFailureState(
  failure: StorefrontFailure,
): RewardsAccountPresentationState {
  if (failure.kind === 'authentication_required') {
    return Object.freeze({ status: 'signed_out' });
  }
  return Object.freeze({
    status: failure.retryable ? 'error' : 'unavailable',
  });
}

export function toRewardsAccountPresentation(
  ledger: LoyaltyLedger,
  quoteState: RewardsAccountQuoteState,
  locale: AppLocale = 'en',
): RewardsAccountPresentationState {
  const balance = getPointsBalance(ledger);
  if (!balance) return Object.freeze({ status: 'unavailable' });

  if (quoteState.kind === 'not_started') {
    return Object.freeze({
      balanceLabel: String(balance.available),
      rewards: [],
      rewardsStatus: 'requires_order',
      status: 'ready',
    });
  }

  if (quoteState.kind === 'unavailable') {
    return Object.freeze({
      balanceLabel: String(balance.available),
      rewards: [],
      rewardsStatus: 'unavailable',
      status: 'ready',
    });
  }

  const { quote } = quoteState;
  if (!quote.enabled || quote.available === false) {
    return Object.freeze({
      balanceLabel: String(balance.available),
      rewards: [],
      rewardsStatus: 'unavailable',
      status: 'ready',
    });
  }

  const t = createTranslator(locale);
  const rewards = (quote.rewards ?? []).map((reward) =>
    Object.freeze({
      applied: quote.appliedRewardId === reward.id,
      id: reward.id,
      name: reward.name,
      pointsLabel: t('rewards.account.pointsCost', {
        points: reward.pointsCost,
      }),
      redeemable: reward.redeemable,
    }),
  );

  return Object.freeze({
    balanceLabel: String(balance.available),
    rewards: Object.freeze(rewards),
    rewardsStatus: rewards.length > 0 ? 'ready' : 'empty',
    status: 'ready',
  });
}

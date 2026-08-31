import type { AppLocale } from '../../i18n/localization.ts';
import type { StorefrontCartSessionStore } from '../../lib/cart-session.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { LoyaltyService } from './loyalty-service.ts';
import {
  toRewardsAccountFailureState,
  toRewardsAccountPresentation,
  type RewardsAccountPresentationState,
} from './rewards-account-presentation.ts';

export type RewardsAccountLoaderDependencies = Readonly<{
  cartSessions: Pick<StorefrontCartSessionStore, 'get'>;
  locationId: string;
  loyalty: Pick<LoyaltyService, 'getLedger' | 'getQuote'>;
}>;

const STORAGE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'SECURE_STORAGE_UNAVAILABLE',
  kind: 'unavailable',
  retryable: true,
});

export async function loadRewardsAccount(
  dependencies: RewardsAccountLoaderDependencies,
  locale: AppLocale = 'en',
): Promise<RewardsAccountPresentationState> {
  const ledgerResult = await dependencies.loyalty.getLedger();
  if (ledgerResult.kind === 'failed') {
    return toRewardsAccountFailureState(ledgerResult.failure);
  }

  const base = toRewardsAccountPresentation(
    ledgerResult.data,
    { kind: 'not_started' },
    locale,
  );
  if (base.status !== 'ready') return base;

  let cart;
  try {
    cart = await dependencies.cartSessions.get(dependencies.locationId);
  } catch {
    return toRewardsAccountFailureState(STORAGE_FAILURE);
  }

  if (!cart) return base;

  const quoteResult = await dependencies.loyalty.getQuote(cart.cartId);
  return quoteResult.kind === 'ready'
    ? toRewardsAccountPresentation(
        ledgerResult.data,
        { kind: 'ready', quote: quoteResult.data },
        locale,
      )
    : quoteResult.failure.kind === 'authentication_required'
      ? toRewardsAccountFailureState(quoteResult.failure)
      : toRewardsAccountPresentation(
          ledgerResult.data,
          { kind: 'unavailable' },
          locale,
        );
}

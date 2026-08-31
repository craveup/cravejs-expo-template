import {
  isProvenPreHandoffFailure,
  type CheckoutHandoffState,
} from '../../domain/checkout/index.ts';
import {
  isSafeStorefrontCode,
  isSafeStorefrontRequestId,
  type StorefrontFailure,
} from '../../lib/storefront-errors.ts';
import { createTranslator, type AppLocale } from '../../i18n/index.ts';
import type { BagItemPresentation } from '../bag/index.ts';
import type {
  CheckoutFlowEmpty,
  CheckoutFlowReady,
} from './checkout-flow.ts';

type CheckoutAvailabilityRecoveryCurrent =
  | Readonly<{ checkout: CheckoutFlowReady; kind: 'ready' }>
  | Readonly<{
      kind: 'empty';
      totalLabel: string;
    }>;

type CheckoutRemovedAvailabilityItem = Readonly<
  Pick<BagItemPresentation, 'id' | 'name' | 'quantity'>
>;

export type CheckoutAvailabilityRecovery = Readonly<{
  current: CheckoutAvailabilityRecoveryCurrent;
  removedItems: readonly CheckoutRemovedAvailabilityItem[];
  requestId?: string;
}>;

export type CheckoutAvailabilityRecoveryPresentation = Readonly<{
  backActionLabel: string;
  body: string;
  currentEmptyLabel?: string;
  currentItems: readonly Readonly<{
    id: string;
    label: string;
    priceLabel: string;
  }>[];
  currentLabel: string;
  menuActionLabel: string;
  removedItems: readonly Readonly<{
    id: string;
    label: string;
    statusLabel: string;
  }>[];
  removedLabel: string;
  requestLabel?: string;
  reviewActionLabel: string;
  title: string;
  totalLabel: string;
  totalTitle: string;
}>;

function isCheckoutFlowReady(
  value: CheckoutFlowEmpty | CheckoutFlowReady,
): value is CheckoutFlowReady {
  return 'review' in value;
}

function recoveryCurrent(
  refreshed: CheckoutFlowEmpty | CheckoutFlowReady,
): CheckoutAvailabilityRecoveryCurrent {
  if (isCheckoutFlowReady(refreshed)) {
    return Object.freeze({ checkout: refreshed, kind: 'ready' as const });
  }
  return Object.freeze({
    kind: 'empty' as const,
    totalLabel: refreshed.totalLabel,
  });
}

export function createCheckoutAvailabilityRecoveryPresentation(
  recovery: CheckoutAvailabilityRecovery,
  locale: AppLocale = 'en',
): CheckoutAvailabilityRecoveryPresentation {
  const t = createTranslator(locale);
  const currentItems =
    recovery.current.kind === 'ready'
      ? recovery.current.checkout.review.bag.items
      : [];
  return Object.freeze({
    backActionLabel: t('checkout.availability.backAction'),
    body: t('checkout.availability.body'),
    currentItems: Object.freeze(
      currentItems.map((item) =>
        Object.freeze({
          id: item.id,
          label: `${item.quantity} × ${item.name}`,
          priceLabel: item.priceLabel,
        }),
      ),
    ),
    ...(recovery.current.kind === 'empty'
      ? { currentEmptyLabel: t('checkout.availability.currentEmpty') }
      : {}),
    currentLabel: t(
      recovery.current.kind === 'empty'
        ? 'checkout.availability.currentEmptyTitle'
        : 'checkout.availability.current',
    ),
    menuActionLabel: t('checkout.availability.menuAction'),
    removedItems: Object.freeze(
      recovery.removedItems.map((item) =>
        Object.freeze({
          id: item.id,
          label: `${item.quantity} × ${item.name}`,
          statusLabel: t('checkout.availability.removedStatus'),
        }),
      ),
    ),
    removedLabel: t('checkout.availability.removed'),
    ...(recovery.requestId
      ? {
          requestLabel: t('checkout.availability.request', {
            requestId: recovery.requestId,
          }),
        }
      : {}),
    reviewActionLabel: t(
      recovery.current.kind === 'empty'
        ? 'checkout.availability.reviewEmptyAction'
        : 'checkout.availability.reviewAction',
    ),
    title: t('checkout.availability.title'),
    totalLabel:
      recovery.current.kind === 'ready'
        ? recovery.current.checkout.review.bag.totals.totalLabel
        : recovery.current.totalLabel,
    totalTitle: t('checkout.availability.total'),
  });
}

export function projectCheckoutAvailabilityRecovery(
  previous: CheckoutFlowReady,
  refreshed: CheckoutFlowEmpty | CheckoutFlowReady,
  failure: StorefrontFailure,
  handoffState: CheckoutHandoffState,
): CheckoutAvailabilityRecovery | undefined {
  const serverValidationFailure =
    isSafeStorefrontCode(failure.code) &&
    failure.kind === 'invalid_request' &&
    (failure.status === 400 || failure.status === 422);
  if (!serverValidationFailure || !isProvenPreHandoffFailure(handoffState)) {
    return undefined;
  }

  const previousCart = previous.cart;
  const refreshedCart = refreshed.cart;
  const refreshedReady = isCheckoutFlowReady(refreshed)
    ? refreshed
    : undefined;
  const refreshedEmpty = isCheckoutFlowReady(refreshed)
    ? undefined
    : refreshed;
  const refreshedReview = refreshedReady?.review;
  if (
    previousCart.status !== 'OPEN' ||
    refreshedCart.status !== 'OPEN' ||
    previousCart.id !== previous.review.cartId ||
    previous.review.cartId !== refreshedCart.id ||
    previousCart.locationId !== refreshedCart.locationId ||
    previousCart.revision !== previous.review.revision ||
    previousCart.revision !== previous.review.bag.revision ||
    (refreshedReview !== undefined &&
      (refreshedCart.id !== refreshedReview.cartId ||
        refreshedCart.revision !== refreshedReview.revision ||
        refreshedCart.revision !== refreshedReview.bag.revision)) ||
    (refreshedEmpty !== undefined &&
      (refreshedCart.items.length !== 0 ||
        refreshedCart.totalQuantity !== 0 ||
        refreshedEmpty.totalLabel !== refreshedCart.orderTotalFormatted)) ||
    refreshedCart.revision <= previousCart.revision
  ) {
    return undefined;
  }

  const refreshedQuantities = new Map(
    (refreshedReady?.review.bag.items ?? []).map((item) => [
      item.id,
      item.quantity,
    ]),
  );
  const removedItems = previous.review.bag.items.flatMap((item) => {
    const removedQuantity =
      item.quantity - (refreshedQuantities.get(item.id) ?? 0);
    return removedQuantity > 0
      ? [
          Object.freeze({
            id: item.id,
            name: item.name,
            quantity: removedQuantity,
          }),
        ]
      : [];
  });
  if (removedItems.length === 0) return undefined;
  const current = recoveryCurrent(refreshed);

  return Object.freeze({
    current,
    removedItems: Object.freeze(removedItems),
    ...(isSafeStorefrontRequestId(failure.requestId)
      ? { requestId: failure.requestId }
      : {}),
  });
}

import type { PublicOrderDetail } from '@craveup/storefront-sdk';

import {
  createTranslator,
  formatCurrency,
  formatPlural,
  type AppLocale,
} from '../../i18n/localization.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { ActiveOrderStatusLoadResult } from './order-status-loader.ts';

export type CompletedOrderStatus = Readonly<{
  detailLabel?: string;
  fulfillmentLabel?: string;
  itemCountLabel?: string;
  merchantLabel: string;
  orderLabel: string;
  tracking: Readonly<{
    createdAt: string;
    deliveryAddress?: string;
    fulfillmentMethod: string;
    status: string;
    updatedAt?: string;
  }>;
  totalLabel?: string;
}>;

export type OrderStatusPresentationState =
  | Readonly<{
      status:
        | 'error'
        | 'loading'
        | 'no_active_order'
        | 'offline'
        | 'session_expired'
        | 'unavailable';
    }>
  | Readonly<{ status: 'order_failed' | 'order_pending' | 'payment_pending' }>
  | Readonly<{ order: CompletedOrderStatus; status: 'completed' }>;

export const ORDER_STATUS_POLL_INTERVAL_MS = 3_000;

function nonempty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function formatOrderTotal(
  locale: AppLocale,
  amountValue: string,
  currencyValue: string,
): string | undefined {
  const amount = amountValue.trim();
  const currency = currencyValue.trim().toUpperCase();

  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(amount)) return undefined;
  if (!/^[A-Z]{3}$/.test(currency)) return undefined;

  return formatCurrency(locale, Number(amount), currency) ?? undefined;
}

function fulfillmentLabel(
  detail: PublicOrderDetail,
  locale: AppLocale,
): string | undefined {
  const t = createTranslator(locale);
  const method = detail.fulfillmentMethod.trim().toLowerCase();

  if (method === 'takeout' || method === 'pickup') {
    return t('orders.status.fulfillment.pickup');
  }
  if (method === 'delivery') {
    return t('orders.status.fulfillment.delivery');
  }
  if (method === 'room_service') {
    return t('orders.status.fulfillment.roomService');
  }
  if (method === 'table_service') {
    return t('orders.status.fulfillment.tableService');
  }
  return undefined;
}

function toCompletedOrderStatus(
  detail: PublicOrderDetail,
  locale: AppLocale,
): CompletedOrderStatus {
  const t = createTranslator(locale);
  const methodLabel = fulfillmentLabel(detail, locale);
  const timeLabel = nonempty(detail.orderTime);
  const detailLabel = [methodLabel, timeLabel]
    .filter((value): value is string => Boolean(value))
    .join(' \u00b7 ');
  const itemCountLabel = formatPlural(locale, detail.totalQuantity, {
    one: t('orders.status.item.one'),
    other: t('orders.status.item.other'),
  });
  const totalLabel = formatOrderTotal(
    locale,
    detail.orderTotal,
    detail.currency,
  );

  return Object.freeze({
    ...(detailLabel ? { detailLabel } : {}),
    ...(methodLabel ? { fulfillmentLabel: methodLabel } : {}),
    ...(itemCountLabel ? { itemCountLabel } : {}),
    merchantLabel: detail.restaurantDisplayName.trim(),
    orderLabel: t('orders.status.orderNumber', {
      shortId: detail.shortId.trim(),
    }),
    tracking: Object.freeze({
      createdAt: detail.createdAt.trim(),
      ...(nonempty(detail.deliveryInfo?.deliveryAddress)
        ? { deliveryAddress: detail.deliveryInfo?.deliveryAddress?.trim() }
        : {}),
      fulfillmentMethod: detail.fulfillmentMethod.trim(),
      status: detail.status.trim(),
      ...(nonempty(detail.updatedAt ?? undefined)
        ? { updatedAt: detail.updatedAt?.trim() }
        : {}),
    }),
    ...(totalLabel ? { totalLabel } : {}),
  });
}

export function toOrderStatusFailureState(
  failure: StorefrontFailure,
): OrderStatusPresentationState {
  if (
    failure.kind === 'authentication_required' ||
    failure.kind === 'forbidden'
  ) {
    return Object.freeze({ status: 'session_expired' });
  }
  return Object.freeze({
    status: failure.retryable ? 'error' : 'unavailable',
  });
}

export function toOrderStatusPresentationState(
  result: ActiveOrderStatusLoadResult,
  locale: AppLocale = 'en',
): OrderStatusPresentationState {
  if (result.kind === 'failed') {
    return toOrderStatusFailureState(result.failure);
  }
  if (result.kind === 'no_active_order') {
    return Object.freeze({ status: 'no_active_order' });
  }
  if (result.data.state === 'completed') {
    return Object.freeze({
      order: toCompletedOrderStatus(result.data.order, locale),
      status: 'completed',
    });
  }
  if (result.data.state === 'failed') {
    return Object.freeze({ status: 'order_failed' });
  }
  return Object.freeze({ status: result.data.state });
}

export function getOrderStatusPollDelay(
  state: OrderStatusPresentationState,
): number | undefined {
  return state.status === 'payment_pending' || state.status === 'order_pending'
    ? ORDER_STATUS_POLL_INTERVAL_MS
    : undefined;
}

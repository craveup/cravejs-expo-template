import type {
  PublicOrderDetail,
  PublicOrderSummary,
} from '@craveup/storefront-sdk';

import {
  createTranslator,
  formatCurrency,
  formatDate,
  type AppLocale,
} from '../../i18n/localization.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';

export type OrderHistoryPresentationRow = Readonly<{
  headerLabel: string;
  id: string;
  inProgress: boolean;
  itemSummary?: string;
  orderLabel: string;
  priceLabel?: string;
}>;

export type OrderHistoryPresentationState =
  | Readonly<{
      status: 'error' | 'loading' | 'offline' | 'signed_out' | 'unavailable';
    }>
  | Readonly<{
      data: readonly OrderHistoryPresentationRow[];
      hasMore: boolean;
      loadMoreFailed?: boolean;
      loadingMore?: boolean;
      refreshing?: boolean;
      status: 'ready';
    }>;

export type OrderHistoryPresentationOptions = Readonly<{
  activeOrderIds?: readonly string[];
  details?: readonly PublicOrderDetail[];
}>;

function nonempty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function formatOrderDate(locale: AppLocale, value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return (
    formatDate(locale, date, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    }) ?? undefined
  );
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

function summarizeItems(detail: PublicOrderDetail | undefined): string | undefined {
  if (!detail) return undefined;

  const labels = detail.items.flatMap((item) => {
    const name = nonempty(item.name);
    if (
      !name ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 1_000
    ) {
      return [];
    }

    return [item.quantity === 1 ? name : `${name} ×${item.quantity}`];
  });

  return labels.length > 0 ? labels.join(', ') : undefined;
}

export function toOrderHistoryPresentationRows(
  summaries: readonly PublicOrderSummary[],
  locale: AppLocale = 'en',
  options: OrderHistoryPresentationOptions = {},
): readonly OrderHistoryPresentationRow[] {
  const t = createTranslator(locale);
  const activeOrderIds = new Set(options.activeOrderIds ?? []);
  const details = new Map(
    (options.details ?? []).map((detail) => [detail.id, detail]),
  );
  const seenIds = new Set<string>();
  const rows: OrderHistoryPresentationRow[] = [];

  for (const summary of summaries) {
    if (seenIds.has(summary.id)) continue;
    seenIds.add(summary.id);

    const inProgress = activeOrderIds.has(summary.id);
    const orderLabel = t('orders.history.orderNumber', {
      shortId: nonempty(summary.shortId) ?? '—',
    });
    const headerLabel = [
      formatOrderDate(locale, summary.orderDate),
      ...(inProgress ? [nonempty(summary.orderTime)] : []),
      nonempty(summary.restaurantDisplayName),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' · ');
    const detail = details.get(summary.id);
    const itemSummary = summarizeItems(
      detail?.id === summary.id ? detail : undefined,
    );
    const priceLabel = formatOrderTotal(
      locale,
      summary.orderTotal,
      summary.currency,
    );

    rows.push(
      Object.freeze({
        headerLabel: headerLabel || orderLabel,
        id: summary.id,
        inProgress,
        ...(itemSummary ? { itemSummary } : {}),
        orderLabel,
        ...(priceLabel ? { priceLabel } : {}),
      }),
    );
  }

  return Object.freeze(rows);
}

export function toOrderHistoryFailureStatus(
  failure: StorefrontFailure,
): Exclude<OrderHistoryPresentationState['status'], 'loading' | 'ready'> {
  if (failure.kind === 'authentication_required') {
    return 'signed_out';
  }

  return failure.retryable ? 'error' : 'unavailable';
}

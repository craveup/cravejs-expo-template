import type { LoyaltyLedger } from '@craveup/storefront-sdk';

import {
  createTranslator,
  formatDate,
  formatSignedNumber,
  formatTime,
  type AppLocale,
} from '../../i18n/localization.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import { getPointsBalance } from './points-balance.ts';

type LoyaltyLedgerEntry = NonNullable<LoyaltyLedger['entries']>[number];

function isValidOccurredAt(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

export type PointsHistoryRow = Readonly<{
  accessibilityLabel: string;
  amountLabel: string;
  dateLabel: string;
  orderReference?: string;
  title: string;
  tone: 'earned' | 'neutral' | 'spent';
}>;

export type PointsHistoryPresentationState =
  | Readonly<{
      status: 'error' | 'loading' | 'signed_out' | 'unavailable';
    }>
  | Readonly<{
      balanceLabel: string;
      data: readonly PointsHistoryRow[];
      loadMoreStatus: 'error' | 'idle' | 'pending';
      nextCursor?: string;
      status: 'ready';
    }>;

function entryDateLabel(
  entry: LoyaltyLedgerEntry,
  locale: AppLocale,
  now: Date,
): string {
  const t = createTranslator(locale);
  if (!isValidOccurredAt(entry.occurredAt)) {
    return t('rewards.history.dateUnavailable');
  }
  const occurredAt = new Date(entry.occurredAt);
  const isToday =
    occurredAt.getFullYear() === now.getFullYear() &&
    occurredAt.getMonth() === now.getMonth() &&
    occurredAt.getDate() === now.getDate();

  if (isToday) {
    const time = formatTime(locale, occurredAt, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return time
      ? t('rewards.history.dateAndTime', {
          date: t('rewards.history.today'),
          time,
        })
      : t('rewards.history.dateUnavailable');
  }

  const weekday = formatDate(locale, occurredAt, { weekday: 'short' });
  const day = formatDate(locale, occurredAt, { day: 'numeric' });
  const month = formatDate(locale, occurredAt, { month: 'short' });
  if (!weekday || !day || !month) {
    return t('rewards.history.dateUnavailable');
  }
  if (occurredAt.getFullYear() === now.getFullYear()) {
    return t('rewards.history.dateShort', { day, month, weekday });
  }

  return t('rewards.history.dateShortWithYear', {
    day,
    month,
    weekday,
    year: occurredAt.getFullYear(),
  });
}

function entryTitle(
  entry: LoyaltyLedgerEntry,
  locale: AppLocale,
): Readonly<{ orderReference?: string; title: string }> {
  const t = createTranslator(locale);
  const orderReference = entry.orderReference?.trim();
  if (orderReference) {
    return Object.freeze({
      orderReference,
      title: t('rewards.history.orderReference', { orderReference }),
    });
  }

  const suppliedLabel = entry.classification?.trim() || entry.operation.trim();
  return Object.freeze({
    title: suppliedLabel || t('rewards.history.entryUnavailable'),
  });
}

function toPointsHistoryRow(
  entry: LoyaltyLedgerEntry,
  locale: AppLocale,
  now: Date,
): PointsHistoryRow | undefined {
  const t = createTranslator(locale);
  const amountLabel = formatSignedNumber(locale, entry.amount);
  const unit = entry.unit.trim();
  if (!amountLabel || !unit) return undefined;

  const dateLabel = entryDateLabel(entry, locale, now);
  const title = entryTitle(entry, locale);

  return Object.freeze({
    accessibilityLabel: t('rewards.history.entryAccessibility', {
      amount: amountLabel,
      date: dateLabel,
      title: title.title,
      unit,
    }),
    amountLabel,
    dateLabel,
    ...(title.orderReference
      ? { orderReference: title.orderReference }
      : {}),
    title: title.title,
    tone:
      entry.amount > 0 ? 'earned' : entry.amount < 0 ? 'spent' : 'neutral',
  });
}

function rowsFromLedger(
  ledger: LoyaltyLedger,
  locale: AppLocale,
  now: Date,
): readonly PointsHistoryRow[] {
  return Object.freeze(
    (ledger.entries ?? [])
      .filter((entry) => entry.unit.trim().toLowerCase() === 'points')
      .flatMap((entry) => {
        const row = toPointsHistoryRow(entry, locale, now);
        return row ? [row] : [];
      }),
  );
}

export function toPointsHistoryPresentation(
  ledger: LoyaltyLedger,
  locale: AppLocale = 'en',
  now: Date = new Date(),
): PointsHistoryPresentationState {
  const balance = getPointsBalance(ledger);
  if (!balance) return Object.freeze({ status: 'unavailable' });

  const t = createTranslator(locale);
  return Object.freeze({
    balanceLabel: t('rewards.history.pointsValue', {
      points: balance.available,
    }),
    data: rowsFromLedger(ledger, locale, now),
    loadMoreStatus: 'idle',
    ...(ledger.nextCursor ? { nextCursor: ledger.nextCursor } : {}),
    status: 'ready',
  });
}

export function beginPointsHistoryLoadMore(
  state: PointsHistoryPresentationState,
): PointsHistoryPresentationState {
  return state.status === 'ready' && state.nextCursor
    ? Object.freeze({ ...state, loadMoreStatus: 'pending' })
    : state;
}

export function failPointsHistoryLoadMore(
  state: PointsHistoryPresentationState,
): PointsHistoryPresentationState {
  return state.status === 'ready'
    ? Object.freeze({ ...state, loadMoreStatus: 'error' })
    : state;
}

export function appendPointsHistoryPage(
  state: PointsHistoryPresentationState,
  ledger: LoyaltyLedger,
  requestedCursor: string,
  consumedCursors: readonly string[] = [requestedCursor],
  locale: AppLocale = 'en',
  now: Date = new Date(),
): PointsHistoryPresentationState {
  if (state.status !== 'ready' || state.nextCursor !== requestedCursor) {
    return state;
  }
  if (!ledger.enabled) return Object.freeze({ status: 'unavailable' });

  const nextCursor =
    ledger.nextCursor && !consumedCursors.includes(ledger.nextCursor)
      ? ledger.nextCursor
      : undefined;

  return Object.freeze({
    balanceLabel: state.balanceLabel,
    data: Object.freeze([
      ...state.data,
      ...rowsFromLedger(ledger, locale, now),
    ]),
    loadMoreStatus: 'idle',
    ...(nextCursor ? { nextCursor } : {}),
    status: 'ready',
  });
}

export function toPointsHistoryFailureStatus(
  failure: StorefrontFailure,
): Exclude<PointsHistoryPresentationState['status'], 'loading' | 'ready'> {
  if (failure.kind === 'authentication_required') return 'signed_out';
  return failure.retryable ? 'error' : 'unavailable';
}

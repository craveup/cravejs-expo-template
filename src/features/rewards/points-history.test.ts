import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LoyaltyLedger } from '@craveup/storefront-sdk';

import {
  appendPointsHistoryPage,
  beginPointsHistoryLoadMore,
  failPointsHistoryLoadMore,
  toPointsHistoryFailureStatus,
  toPointsHistoryPresentation,
} from './points-history.ts';

const ledger: LoyaltyLedger = {
  balances: [
    {
      asOf: '2026-08-11T12:00:00.000Z',
      available: 340,
      label: 'Points',
      posted: 340,
      reserved: 0,
      unit: 'points',
    },
  ],
  enabled: true,
  entries: [
    {
      amount: 24,
      classification: 'Order purchase',
      occurredAt: '2026-08-11T12:00:00.000Z',
      operation: 'credit',
      orderReference: 'OOO-4417',
      unit: 'points',
    },
    {
      amount: -100,
      classification: 'Reward redemption',
      occurredAt: '2026-08-01T12:00:00.000Z',
      operation: 'debit',
      unit: 'points',
    },
  ],
  nextCursor: 'cursor_page_2',
};

test('3A maps only public ledger balance and entry fields', () => {
  const state = toPointsHistoryPresentation(ledger);
  assert.equal(state.status, 'ready');
  if (state.status !== 'ready') throw new Error('Expected ready history.');

  assert.equal(state.balanceLabel, '340 pts');
  assert.equal(state.nextCursor, 'cursor_page_2');
  assert.equal(state.data.length, 2);
  assert.deepEqual(
    state.data.map(({ amountLabel, orderReference, title, tone }) => ({
      amountLabel,
      orderReference,
      title,
      tone,
    })),
    [
      {
        amountLabel: '+24',
        orderReference: 'OOO-4417',
        title: 'Order OOO-4417',
        tone: 'earned',
      },
      {
        amountLabel: '−100',
        orderReference: undefined,
        title: 'Reward redemption',
        tone: 'spent',
      },
    ],
  );
  assert.match(state.data[0]?.dateLabel ?? '', /11 Aug/);
  assert.doesNotMatch(JSON.stringify(state), /memberId|programId|drinks|tier/i);
});

test('3A shows only entries from the authoritative points balance unit', () => {
  const state = toPointsHistoryPresentation({
    ...ledger,
    entries: [
      ledger.entries![0]!,
      {
        amount: 1,
        classification: 'Visit stamp',
        occurredAt: '2026-08-10T12:00:00.000Z',
        operation: 'credit',
        unit: 'stamps',
      },
    ],
  });

  assert.equal(state.status, 'ready');
  assert.deepEqual(
    state.status === 'ready'
      ? state.data.map(({ amountLabel, title }) => ({ amountLabel, title }))
      : [],
    [{ amountLabel: '+24', title: 'Order OOO-4417' }],
  );
});

test('3A fails closed when loyalty or the authoritative points balance is unavailable', () => {
  assert.deepEqual(toPointsHistoryPresentation({ enabled: false }), {
    status: 'unavailable',
  });
  assert.deepEqual(
    toPointsHistoryPresentation({
      balances: [
        {
          asOf: '2026-08-11T12:00:00.000Z',
          available: 12,
          posted: 12,
          reserved: 0,
          unit: 'stamps',
        },
      ],
      enabled: true,
    }),
    { status: 'unavailable' },
  );
});

test('3A does not normalize an invalid server timestamp into a different day', () => {
  const malformed = toPointsHistoryPresentation({
    ...ledger,
    entries: [
      {
        ...ledger.entries![0]!,
        occurredAt: '2026-02-30T12:00:00.000Z',
      },
    ],
  });

  assert.equal(malformed.status, 'ready');
  assert.equal(
    malformed.status === 'ready' ? malformed.data[0]?.dateLabel : undefined,
    'Date unavailable',
  );
});

test('3A formats current-day and prior activity like the reviewed history rows', () => {
  const now = new Date(2025, 7, 11, 18, 0);
  const state = toPointsHistoryPresentation(
    {
      ...ledger,
      entries: [
        {
          ...ledger.entries![0]!,
          occurredAt: new Date(2025, 7, 11, 14, 41).toISOString(),
        },
        {
          ...ledger.entries![1]!,
          occurredAt: new Date(2025, 7, 2, 12, 0).toISOString(),
        },
      ],
    },
    'en',
    now,
  );

  assert.equal(state.status, 'ready');
  assert.deepEqual(
    state.status === 'ready'
      ? state.data.map(({ dateLabel }) => dateLabel)
      : [],
    ['Today · 2:41 PM', 'Sat 2 Aug'],
  );
});

test('3A pagination preserves current balance and stops a repeated cursor', () => {
  const initial = toPointsHistoryPresentation(ledger);
  const pending = beginPointsHistoryLoadMore(initial);
  assert.equal(
    pending.status === 'ready' ? pending.loadMoreStatus : undefined,
    'pending',
  );

  const appended = appendPointsHistoryPage(
    pending,
    {
      enabled: true,
      entries: [
        {
          amount: 50,
          classification: 'Birthday bonus',
          occurredAt: '2026-07-27T12:00:00.000Z',
          operation: 'credit',
          unit: 'points',
        },
      ],
      nextCursor: 'cursor_page_2',
    },
    'cursor_page_2',
  );

  assert.equal(appended.status, 'ready');
  if (appended.status !== 'ready') throw new Error('Expected appended history.');
  assert.equal(appended.balanceLabel, '340 pts');
  assert.equal(appended.data.length, 3);
  assert.equal(appended.nextCursor, undefined);
  assert.equal(appended.loadMoreStatus, 'idle');
  assert.equal(
    appendPointsHistoryPage(appended, ledger, 'stale_cursor'),
    appended,
  );

  const cycleStopped = appendPointsHistoryPage(
    beginPointsHistoryLoadMore(initial),
    { enabled: true, entries: [], nextCursor: 'cursor_page_1' },
    'cursor_page_2',
    ['cursor_page_1', 'cursor_page_2'],
  );
  assert.equal(
    cycleStopped.status === 'ready' ? cycleStopped.nextCursor : 'not-ready',
    undefined,
  );
});

test('3A keeps retryable pagination failure separate from auth and terminal failure', () => {
  const initial = toPointsHistoryPresentation(ledger);
  const failed = failPointsHistoryLoadMore(initial);
  assert.equal(
    failed.status === 'ready' ? failed.loadMoreStatus : undefined,
    'error',
  );
  assert.equal(
    toPointsHistoryFailureStatus({
      kind: 'authentication_required',
      retryable: false,
    }),
    'signed_out',
  );
  assert.equal(
    toPointsHistoryFailureStatus({ kind: 'timeout', retryable: true }),
    'error',
  );
  assert.equal(
    toPointsHistoryFailureStatus({ kind: 'forbidden', retryable: false }),
    'unavailable',
  );
});

test('3A presentation and route stay responsive, gated, and contract-only', () => {
  const presentation = readFileSync(
    new URL('./PointsHistoryPresentation.tsx', import.meta.url),
    'utf8',
  );
  const mapper = readFileSync(new URL('./points-history.ts', import.meta.url), 'utf8');
  const route = readFileSync(
    new URL('../../app/(tabs)/(rewards)/rewards/history.tsx', import.meta.url),
    'utf8',
  );

  assert.match(presentation, /getResponsiveLayout\(width, fontScale\)/);
  assert.match(presentation, /background="contentCanvas"/);
  assert.match(presentation, /accessibilityRole="list"/);
  assert.match(presentation, /state\.loadMoreStatus === 'error'/);
  assert.match(route, /runtimeBrand\.capabilities\.loyalty !== 'enabled'/);
  assert.match(route, /useFocusEffect/);
  assert.match(route, /session: CustomerAuthenticatedState/);
  assert.match(route, /load\.session === authState/);
  assert.match(route, /getLedger\(\{ cursor, limit: PAGE_LIMIT \}\)/);
  assert.doesNotMatch(
    `${presentation}\n${mapper}\n${route}`,
    /SCAN|memberId|programId|pointsToGo|FLAVOURSMITH|\bfetch\s*\(|SecureStore|#[0-9A-Fa-f]{3,8}/i,
  );
  assert.doesNotMatch(mapper, /Date\.now|setTimeout|orderTotal|totalQuantity/);
});

test('3A clears a previous page before each focused ledger refresh', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(rewards)/rewards/history.tsx', import.meta.url),
    'utf8',
  );
  const clearPreviousLoad = route.indexOf('setLoad(undefined)');
  const focusedLedgerRequest = route.indexOf(
    'loyalty.getLedger({ limit: PAGE_LIMIT })',
  );

  assert.ok(clearPreviousLoad >= 0);
  assert.ok(focusedLedgerRequest > clearPreviousLoad);
});

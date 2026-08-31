import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import type { OrderTimesResponse } from '@craveup/storefront-sdk';

import {
  getNextOrderingSlotLabel,
  hasScheduledPickupOption,
  toPickupSchedulePresentation,
} from './storefront-order-times.ts';

test('preserves labeled days, intervals, order, and server-provided ASAP exactly', () => {
  const response: OrderTimesResponse = {
    orderDays: [
      {
        intervals: ['ASAP', '10:30 AM - 10:45 AM'],
        label: 'Today, July 12',
        value: '2026-07-12',
      },
      {
        intervals: ['8:00 AM - 8:15 AM'],
        label: 'Tomorrow, July 13',
        value: '2026-07-13',
      },
    ],
    requireScheduledOrders: true,
    scheduleAllowed: true,
  };

  assert.deepEqual(toPickupSchedulePresentation(response), {
    allowAsap: false,
    days: [
      {
        intervals: [
          { label: 'ASAP', value: 'ASAP' },
          { label: '10:30 AM - 10:45 AM', value: '10:30 AM - 10:45 AM' },
        ],
        label: 'Today, July 12',
        value: '2026-07-12',
      },
      {
        intervals: [
          { label: '8:00 AM - 8:15 AM', value: '8:00 AM - 8:15 AM' },
        ],
        label: 'Tomorrow, July 13',
        value: '2026-07-13',
      },
    ],
    kind: 'options',
  });
});

test('keeps optional scheduled choices and allows ASAP when the server does not require scheduling', () => {
  const response: OrderTimesResponse = {
    orderDays: [
      {
        intervals: ['8:00 AM - 8:15 AM'],
        label: 'Today',
        value: '2026-07-12',
      },
    ],
    requireScheduledOrders: false,
    scheduleAllowed: true,
  };

  assert.deepEqual(toPickupSchedulePresentation(response), {
    allowAsap: true,
    days: [
      {
        intervals: [
          { label: '8:00 AM - 8:15 AM', value: '8:00 AM - 8:15 AM' },
        ],
        label: 'Today',
        value: '2026-07-12',
      },
    ],
    kind: 'options',
  });
});

test('reports schedule-unavailable responses without presenting options', () => {
  const response: OrderTimesResponse = {
    orderDays: [],
    requireScheduledOrders: true,
    scheduleAllowed: false,
  };

  assert.deepEqual(toPickupSchedulePresentation(response), { kind: 'unavailable' });
});

test('a schedule has a selectable slot only when a returned day has an interval', () => {
  assert.equal(
    hasScheduledPickupOption({
      allowAsap: true,
      days: [{ intervals: [], label: 'Today', value: 'today' }],
      kind: 'options',
    }),
    false,
  );
  assert.equal(
    hasScheduledPickupOption({
      allowAsap: false,
      days: [
        {
          intervals: [{ label: '10:30 AM', value: '10:30 AM' }],
          label: 'Tomorrow',
          value: 'tomorrow',
        },
      ],
      kind: 'options',
    }),
    true,
  );
});

test('derives the store-closed label only from the first supplied labeled interval', () => {
  const result = toPickupSchedulePresentation({
    orderDays: [
      { intervals: [], label: 'Today', value: 'today' },
      {
        intervals: ['9:15 AM - 9:30 AM'],
        label: 'Tomorrow, July 13',
        value: 'tomorrow',
      },
    ],
    requireScheduledOrders: true,
    scheduleAllowed: true,
  });

  assert.equal(
    getNextOrderingSlotLabel(result),
    'Tomorrow, July 13 · 9:15 AM - 9:30 AM',
  );
  assert.equal(
    getNextOrderingSlotLabel({ kind: 'unavailable' }),
    undefined,
  );
});

test('does not use device time or invent scheduling labels', () => {
  const source = readFileSync(new URL('./storefront-order-times.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /new Date|Date\.now|Intl\.|getTimezoneOffset/);
  assert.doesNotMatch(source, /label:\s*['"]ASAP['"]/);
});

import type { OrderTimesResponse } from '@craveup/storefront-sdk';

import type { PickupDayPresentation } from './pickup-schedule';

export type OrderTimesPresentationResult =
  | {
      allowAsap: boolean;
      days: readonly PickupDayPresentation[];
      kind: 'options';
    }
  | {
      kind: 'unavailable';
    };

export function toPickupSchedulePresentation(
  response: OrderTimesResponse,
): OrderTimesPresentationResult {
  if (!response.scheduleAllowed) {
    return { kind: 'unavailable' };
  }

  return {
    allowAsap: response.requireScheduledOrders !== true,
    days: response.orderDays.map((day) => ({
      intervals: day.intervals.map((interval) => ({
        label: interval,
        value: interval,
      })),
      label: day.label,
      value: day.value,
    })),
    kind: 'options',
  };
}

export function getNextOrderingSlotLabel(
  result: OrderTimesPresentationResult,
): string | undefined {
  if (result.kind !== 'options') {
    return undefined;
  }

  for (const day of result.days) {
    const firstInterval = day.intervals[0];

    if (firstInterval) {
      return `${day.label} · ${firstInterval.label}`;
    }
  }

  return undefined;
}

export function hasScheduledPickupOption(
  result: OrderTimesPresentationResult,
): result is Extract<OrderTimesPresentationResult, { kind: 'options' }> {
  return (
    result.kind === 'options' &&
    result.days.some((day) => day.intervals.length > 0)
  );
}

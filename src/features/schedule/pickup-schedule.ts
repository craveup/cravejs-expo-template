export type PickupIntervalPresentation = {
  label: string;
  value: string;
};

export type PickupDayPresentation = {
  intervals: readonly PickupIntervalPresentation[];
  label: string;
  value: string;
};

export type PickupScheduleSelection =
  | { pickupType: 'ASAP' }
  | {
      dayValue: string;
      intervalValue: string;
      pickupType: 'LATER';
    };

export function getIntervalsForDay(
  days: readonly PickupDayPresentation[],
  selectedDayValue: string,
): readonly PickupIntervalPresentation[] {
  return days.find((day) => day.value === selectedDayValue)?.intervals ?? [];
}

export function isScheduleSelectionValid(
  days: readonly PickupDayPresentation[],
  selection: PickupScheduleSelection,
  allowAsap = false,
): boolean {
  if (selection.pickupType === 'ASAP') return allowAsap;
  return getIntervalsForDay(days, selection.dayValue).some(
    (interval) => interval.value === selection.intervalValue,
  );
}

export function buildScheduleSelection(
  dayValue: string,
  intervalValue: string,
): PickupScheduleSelection {
  return { dayValue, intervalValue, pickupType: 'LATER' };
}

export function buildAsapScheduleSelection(): PickupScheduleSelection {
  return { pickupType: 'ASAP' };
}

export function getInitialScheduleSelection(
  days: readonly PickupDayPresentation[],
  allowAsap: boolean,
  current?: Readonly<{
    orderDate: string;
    orderTime: string;
    pickupType: 'ASAP' | 'LATER';
  }>,
): PickupScheduleSelection | undefined {
  if (current?.pickupType === 'LATER') {
    const selected = buildScheduleSelection(current.orderDate, current.orderTime);
    if (isScheduleSelectionValid(days, selected)) return selected;
  }
  if (allowAsap) return buildAsapScheduleSelection();

  const day = days.find((candidate) => candidate.intervals.length > 0);
  const interval = day?.intervals[0];
  return day && interval
    ? buildScheduleSelection(day.value, interval.value)
    : undefined;
}

export function shouldChangeScheduleValue(
  currentValue: string,
  requestedValue: string,
): boolean {
  return requestedValue !== currentValue;
}

export function getScheduleActionLabel(
  days: readonly PickupDayPresentation[],
  selection: PickupScheduleSelection,
): string {
  if (selection.pickupType === 'ASAP') return 'Use as soon as possible';
  const selectedInterval = getIntervalsForDay(days, selection.dayValue).find(
    (interval) => interval.value === selection.intervalValue,
  );
  return selectedInterval ? `Schedule for ${selectedInterval.label}` : 'Schedule pickup';
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildScheduleSelection,
  buildAsapScheduleSelection,
  getScheduleActionLabel,
  getIntervalsForDay,
  getInitialScheduleSelection,
  isScheduleSelectionValid,
  shouldChangeScheduleValue,
  type PickupDayPresentation,
} from './pickup-schedule.ts';

const days: PickupDayPresentation[] = [
  {
    value: '2026-08-10',
    label: 'Tomorrow',
    intervals: [
      { value: 'asap-server-value', label: 'ASAP' },
      { value: '12:30:00', label: '12:30 PM' },
    ],
  },
];

test('schedule preserves server-supplied day and interval values exactly', () => {
  assert.equal(getIntervalsForDay(days, '2026-08-10'), days[0]?.intervals);
  assert.deepEqual(buildScheduleSelection('2026-08-10', '12:30:00'), {
    dayValue: '2026-08-10',
    intervalValue: '12:30:00',
    pickupType: 'LATER',
  });
  assert.equal(
    isScheduleSelectionValid(days, {
      dayValue: '2026-08-10',
      intervalValue: 'asap-server-value',
      pickupType: 'LATER',
    }),
    true,
  );
  assert.deepEqual(buildAsapScheduleSelection(), { pickupType: 'ASAP' });
  assert.equal(isScheduleSelectionValid(days, buildAsapScheduleSelection(), true), true);
  assert.equal(isScheduleSelectionValid(days, buildAsapScheduleSelection(), false), false);
});

test('schedule action uses the selected server-supplied interval label', () => {
  assert.equal(
    getScheduleActionLabel(days, {
      dayValue: '2026-08-10',
      intervalValue: '12:30:00',
      pickupType: 'LATER',
    }),
    'Schedule for 12:30 PM',
  );
  assert.equal(
    getScheduleActionLabel(days, {
      dayValue: '2026-08-10',
      intervalValue: 'missing',
      pickupType: 'LATER',
    }),
    'Schedule pickup',
  );
  assert.equal(
    getScheduleActionLabel(days, buildAsapScheduleSelection()),
    'Use as soon as possible',
  );
});

test('schedule rejects an interval not supplied for the selected day', () => {
  assert.equal(
    isScheduleSelectionValid(days, {
      dayValue: '2026-08-10',
      intervalValue: '09:00:00',
      pickupType: 'LATER',
    }),
    false,
  );
  assert.deepEqual(getIntervalsForDay(days, 'missing'), []);
});

test('reselecting the active day or interval is a no-op', () => {
  assert.equal(shouldChangeScheduleValue('2026-08-10', '2026-08-10'), false);
  assert.equal(shouldChangeScheduleValue('12:30:00', '12:30:00'), false);
  assert.equal(shouldChangeScheduleValue('2026-08-10', '2026-08-11'), true);
});

test('initial selection preserves an exact cart value and otherwise uses a backed default', () => {
  assert.deepEqual(
    getInitialScheduleSelection(days, true, {
      orderDate: '2026-08-10',
      orderTime: '12:30:00',
      pickupType: 'LATER',
    }),
    {
      dayValue: '2026-08-10',
      intervalValue: '12:30:00',
      pickupType: 'LATER',
    },
  );
  assert.deepEqual(
    getInitialScheduleSelection(days, true, {
      orderDate: '',
      orderTime: '',
      pickupType: 'ASAP',
    }),
    { pickupType: 'ASAP' },
  );
  assert.deepEqual(getInitialScheduleSelection(days, false), {
    dayValue: '2026-08-10',
    intervalValue: 'asap-server-value',
    pickupType: 'LATER',
  });
  assert.equal(getInitialScheduleSelection([], false), undefined);
});

test('schedule presentation does not reinterpret time or invent operational claims', () => {
  const source = readFileSync(new URL('./PickupScheduleScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /open until|about \d+ minutes|prep|busy|timezone|Date\(|toLocaleTimeString/i);
  assert.match(source, /As soon as possible/);
  assert.match(source, /accessibilityRole="radiogroup"/);
  assert.match(source, /accessibilityRole="radio"/);
  assert.match(source, /\{day\.label\}/);
  assert.match(source, /\{interval\.label\}/);
  assert.match(source, /When do you want it\?/);
  assert.match(source, /variant="heading">When do you want it\?/);
  assert.match(source, /getScheduleActionLabel/);
  assert.match(source, /borderRadius: radii\.pill/);
  assert.match(source, /minHeight: sizes\.minimumTouchTarget/);
  assert.match(source, /borderColor: colors\.surface/);
  assert.match(source, /MerchantLocationHeader/);
  assert.match(source, /background="contentCanvas"/);
  assert.match(source, /heading: \{[\s\S]{0,100}marginTop: spacing\.sm/);
  assert.match(source, /interval: \{[\s\S]{0,180}borderRadius: radii\.md/);
});

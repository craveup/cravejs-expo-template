import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as accountHome from './account-home.ts';
import { getProfileInitials, getVisibleAccountRows } from './account-home.ts';

test('account rows appear only when their real action is supplied', () => {
  assert.deepEqual(
    getVisibleAccountRows({
      help: true,
      orderHistory: true,
      savedStores: true,
    }),
    ['orderHistory', 'savedStores', 'help'],
  );
  assert.deepEqual(getVisibleAccountRows({}), []);
});

test('profile initials derive only from the supplied display name', () => {
  assert.equal(getProfileInitials('Sam Rivera'), 'SR');
  assert.equal(getProfileInitials('  Sam  '), 'S');
  assert.equal(getProfileInitials(), '');
});

test('account row affordances point forward in both locale directions', () => {
  const getAccountRowIconName = (
    accountHome as Record<string, unknown>
  ).getAccountRowIconName as
    | ((direction: 'ltr' | 'rtl') => 'arrowBack' | 'arrowForward')
    | undefined;

  assert.equal(typeof getAccountRowIconName, 'function');
  assert.equal(getAccountRowIconName?.('ltr'), 'arrowForward');
  assert.equal(getAccountRowIconName?.('rtl'), 'arrowBack');
});

test('account presentation omits unsupported tier, totals, notifications, and card summary', () => {
  const source = readFileSync(new URL('./AccountHomeScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /FLAVOURSMITH|total.?orders|notification status|saved.?card/i);
  assert.match(source, /balanceLabel/);
  assert.match(source, /savedStore/);
  assert.doesNotMatch(source, /\|\| 'OO'/);
  assert.match(source, /name="person"/);
  assert.match(source, /savedStore && !onSavedStores/);
  assert.match(source, /row === 'savedStores'/);
  assert.match(source, /MerchantLocationHeader/);
  assert.match(source, /merchantHeaderState/);
  assert.match(source, /getResponsiveLayout/);
  assert.match(source, /createTranslator/);
  assert.match(source, /sizes\.minimumTouchTarget/);
  assert.match(source, /backgroundColor: colors\.surface/);
  assert.match(source, /accessibilityRole="summary"/);
  assert.match(source, /\saccessible\s/);
  assert.match(source, /name=\{rowIconName\}/);
  assert.doesNotMatch(source, /My account/);
  assert.doesNotMatch(source, /presentation\.icon/);
  assert.doesNotMatch(source, /styles\.rowBorder/);
});

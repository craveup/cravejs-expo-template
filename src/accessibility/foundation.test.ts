import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMinimumTouchTarget,
  getTouchTargetInsets,
  resolveMotionDuration,
  supportsTwoHundredPercentText,
} from './foundation.ts';

test('touch targets meet native platform minimums without changing compact visual dimensions', () => {
  assert.equal(getMinimumTouchTarget('ios'), 44);
  assert.equal(getMinimumTouchTarget('android'), 48);
  assert.deepEqual(getTouchTargetInsets(38, 'ios'), { bottom: 3, left: 3, right: 3, top: 3 });
  assert.deepEqual(getTouchTargetInsets(38, 'android'), { bottom: 5, left: 5, right: 5, top: 5 });
  assert.equal(getTouchTargetInsets(48, 'android'), undefined);
});

test('reduced motion and 200 percent text behavior fail closed for invalid values', () => {
  assert.equal(resolveMotionDuration(240, false), 240);
  assert.equal(resolveMotionDuration(240, true), 0);
  assert.equal(resolveMotionDuration(-1, false), 0);
  assert.equal(supportsTwoHundredPercentText(2), true);
  assert.equal(supportsTwoHundredPercentText(1.99), false);
});

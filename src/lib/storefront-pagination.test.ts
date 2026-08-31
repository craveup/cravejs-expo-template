import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidStorefrontCursor,
  isValidStorefrontPageLimit,
} from './storefront-pagination.ts';

test('accepts opaque cursors and bounded integer page limits', () => {
  assert.equal(isValidStorefrontCursor('eyJpZCI6IjEyMyJ9=='), true);
  assert.equal(isValidStorefrontCursor('cursor+/=_-.'), true);
  assert.equal(isValidStorefrontPageLimit(1), true);
  assert.equal(isValidStorefrontPageLimit(100), true);
});

test('rejects malformed cursors and invalid page limits', () => {
  assert.equal(isValidStorefrontCursor(''), false);
  assert.equal(isValidStorefrontCursor(' cursor'), false);
  assert.equal(isValidStorefrontCursor('cursor\n'), false);
  assert.equal(isValidStorefrontCursor('x'.repeat(1_025)), false);
  assert.equal(isValidStorefrontCursor(null), false);
  assert.equal(isValidStorefrontPageLimit(0), false);
  assert.equal(isValidStorefrontPageLimit(101), false);
  assert.equal(isValidStorefrontPageLimit(1.5), false);
  assert.equal(isValidStorefrontPageLimit('10'), false);
});

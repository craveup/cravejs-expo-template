import assert from 'node:assert/strict';
import test from 'node:test';

import { getResponsiveLayout, getViewportClass } from './responsive.ts';

test('viewport utilities cover compact, Figma reference, and large phones', () => {
  assert.equal(getViewportClass(320), 'compact');
  assert.equal(getViewportClass(390), 'reference');
  assert.equal(getViewportClass(430), 'large');
  assert.deepEqual(getResponsiveLayout(320), {
    contentMaxWidth: 480,
    horizontalPadding: 16,
    keyboardOpen: false,
    shouldScroll: false,
    viewport: 'compact',
  });
  assert.equal(getResponsiveLayout(390).horizontalPadding, 20);
  assert.equal(getResponsiveLayout(480).horizontalPadding, 24);
});

test('200 percent text and keyboard-open states opt into scrolling without changing width class', () => {
  assert.equal(getResponsiveLayout(390, 2).shouldScroll, true);
  assert.equal(getResponsiveLayout(390, 1, true).shouldScroll, true);
  assert.equal(getResponsiveLayout(390, 2, true).viewport, 'reference');
});

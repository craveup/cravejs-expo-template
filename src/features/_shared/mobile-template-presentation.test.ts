import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as presentationState from './presentation-state.ts';

const { getPresentationMessageKey } = presentationState;

const presentationFiles = [
  '../catalog/CatalogPresentation.tsx',
  '../item/ItemDetailPresentation.tsx',
  '../build/BuildPresentation.tsx',
  '../search/SearchPresentation.tsx',
  '../system/SystemStatePresentation.tsx',
  '../system/UpdateRequiredPresentation.tsx',
  './PresentationLayout.tsx',
  './PresentationState.tsx',
];

const presentationSources = presentationFiles.map((path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8'),
);

test('route-free presentation states select keyed loading, empty, unavailable, error, and unknown copy', () => {
  assert.equal(getPresentationMessageKey('catalog', 'loading'), 'catalog.loading');
  assert.equal(getPresentationMessageKey('catalog', 'empty'), 'catalog.empty');
  assert.equal(getPresentationMessageKey('item', 'unavailable'), 'item.unavailable');
  assert.equal(getPresentationMessageKey('build', 'error'), 'build.error');
  assert.equal(getPresentationMessageKey('search', 'unknown'), 'common.unknown');
});

test('product card accessibility labels retain every visible product detail', () => {
  assert.equal(typeof presentationState.getProductAccessibilityLabel, 'function');
  if (typeof presentationState.getProductAccessibilityLabel !== 'function') return;

  assert.equal(
    presentationState.getProductAccessibilityLabel({
      badgeLabel: 'Popular',
      description: 'Sample product description',
      name: 'The One',
      priceLabel: '$7.50',
    }),
    'The One, $7.50, Sample product description, Popular',
  );
  assert.equal(
    presentationState.getProductAccessibilityLabel({ name: 'The One' }),
    'The One',
  );
});

test('catalog, item, build, search, and system presentations remain controlled and route-free', () => {
  const source = presentationSources.join('\n');
  assert.doesNotMatch(
    source,
    /expo-router|@craveup\/storefront-sdk|SecureStore|process\.env|\bfetch\s*\(|useState|useReducer/,
  );
  assert.doesNotMatch(source, /#[\dA-F]{6}/i);
  assert.match(source, /onSelectProduct/);
  assert.match(source, /onAdd/);
  assert.match(source, /onSetOptionQuantity/);
  assert.match(source, /onQueryChange/);
  assert.match(source, /onRetry/);
  assert.match(source, /onBack/);
  assert.match(source, /onUpdate/);
  assert.equal((source.match(/getProductAccessibilityLabel\(/g) ?? []).length, 2);
});

test('presentation layout responds to device width, font scale, keyboard, and locale direction', () => {
  const layout = presentationSources[presentationFiles.indexOf('./PresentationLayout.tsx')];
  const system = presentationSources[presentationFiles.indexOf('../system/SystemStatePresentation.tsx')];
  assert.match(layout, /useWindowDimensions/);
  assert.match(layout, /getResponsiveLayout\(width, fontScale, keyboardOpen\)/);
  assert.match(layout, /getLocaleDirection\(locale\)/);
  assert.match(layout, /maxWidth: layout\.contentMaxWidth/);
  assert.match(layout, /paddingBottom: layout\.keyboardOpen/);
  assert.match(layout, /centered\?: boolean/);
  assert.match(layout, /centered && styles\.centeredContent/);
  assert.match(system, /<PresentationLayout[^>]+centered/);
});

test('shared text and controls preserve font scaling and platform touch targets', () => {
  const appText = readFileSync(
    new URL('../../components/ui/AppText.tsx', import.meta.url),
    'utf8',
  );
  const button = readFileSync(new URL('../../components/ui/Button.tsx', import.meta.url), 'utf8');
  const iconButton = readFileSync(
    new URL('../../components/ui/IconButton.tsx', import.meta.url),
    'utf8',
  );
  assert.match(appText, /allowFontScaling = true/);
  assert.match(appText, /allowFontScaling=\{allowFontScaling\}/);
  assert.match(button, /getMinimumTouchTarget/);
  assert.match(iconButton, /getTouchTargetInsets/);
});

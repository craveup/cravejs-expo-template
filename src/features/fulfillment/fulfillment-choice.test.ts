import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getDeliveryChoicePresentation,
  getFulfillmentChoiceViewState,
  getSelectableFulfillmentChoice,
} from './fulfillment-choice.ts';

test('fulfillment action labels follow the controlled presentation choice', () => {
  assert.equal(
    getFulfillmentChoiceViewState('pickup', true, false).actionLabel,
    'Continue with pickup',
  );
  assert.equal(
    getFulfillmentChoiceViewState('delivery', true, false).actionLabel,
    'Enter delivery address',
  );
});

test('pending and disabled delivery states prevent submission', () => {
  assert.deepEqual(getFulfillmentChoiceViewState('pickup', true, true), {
    actionLabel: 'Continue with pickup',
    canContinue: false,
    deliveryDisabled: true,
    displayedChoice: 'pickup',
    interactionsDisabled: true,
  });
  assert.deepEqual(getFulfillmentChoiceViewState('delivery', false, false), {
    actionLabel: 'Enter delivery address',
    canContinue: false,
    deliveryDisabled: true,
    displayedChoice: undefined,
    interactionsDisabled: false,
  });
  assert.equal(
    getFulfillmentChoiceViewState('delivery', true, true).displayedChoice,
    'delivery',
  );
});

test('delivery copy is design-backed when enabled and fail-closed while gated', () => {
  assert.deepEqual(getDeliveryChoicePresentation(true), {
    supportingCopy: 'Enter an address to see if we reach you',
    visible: true,
  });
  assert.deepEqual(getDeliveryChoicePresentation(false), { visible: false });
  assert.deepEqual(getDeliveryChoicePresentation(false, 'Delivery is coming soon.'), {
    supportingCopy: 'Delivery is coming soon.',
    visible: true,
  });
  assert.deepEqual(getDeliveryChoicePresentation(false, '   '), { visible: false });
});

test('only enabled choices can reach the controlled selection callback', () => {
  assert.equal(
    getSelectableFulfillmentChoice('pickup', 'delivery', false, false),
    'pickup',
  );
  assert.equal(
    getSelectableFulfillmentChoice('delivery', 'pickup', true, false),
    'delivery',
  );
  assert.equal(
    getSelectableFulfillmentChoice('delivery', 'pickup', false, false),
    undefined,
  );
  assert.equal(
    getSelectableFulfillmentChoice('pickup', 'delivery', true, true),
    undefined,
  );
  assert.equal(
    getSelectableFulfillmentChoice('delivery', 'pickup', true, true),
    undefined,
  );
});

test('reselecting the active choice is a no-op so an exact retry intent is preserved', () => {
  assert.equal(
    getSelectableFulfillmentChoice('pickup', 'pickup', false, false),
    undefined,
  );
  assert.equal(
    getSelectableFulfillmentChoice('delivery', 'delivery', true, false),
    undefined,
  );
});

test('fulfillment presentation omits unsupported operational claims and runtime wiring', () => {
  const source = readFileSync(
    new URL('./FulfillmentChoiceScreen.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /How do you want it\?/);
  assert.match(source, /deliveryUnavailableCopy/);
  assert.match(source, /accessibilityRole="radiogroup"/);
  assert.match(source, /accessibilityRole="radio"/);
  assert.match(source, /getSelectableFulfillmentChoice/);
  assert.match(source, /state\.displayedChoice === 'delivery'/);
  assert.match(
    source,
    /accessibilityState=\{\{ busy: pending, checked: selected, disabled \}\}/,
  );
  assert.match(source, /aria-checked=\{selected\}/);
  assert.doesNotMatch(
    source,
    /ready in|\$3\.99|no fee|delivery fee|open until|deliverable|serviceability/i,
  );
  assert.doesNotMatch(
    source,
    /expo-router|SecureStore|process\.env|EXPO_PUBLIC|@craveup\/storefront-sdk|fetch\(|cart/i,
  );
});

test('fulfillment presentation uses shared responsive design tokens', () => {
  const source = readFileSync(
    new URL('./FulfillmentChoiceScreen.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /variant="heading"/);
  assert.match(source, /variant="subheading"/);
  assert.match(source, /radius="action"/);
  assert.match(source, /paddingHorizontal: spacing\['5xl'\]/);
  assert.match(source, /paddingHorizontal: spacing\['4xl'\]/);
  assert.match(source, /paddingVertical: spacing\['4xl'\]/);
  assert.match(source, /gap: spacing\.xl/);
  assert.match(source, /minHeight: sizes\.actionControl/);
  assert.match(source, /minHeight: sizes\.minimumTouchTarget/);
  assert.match(source, /backgroundColor: colors\.contentCanvas/);
  assert.match(source, /fontFamily: fontFamilies\.bodyRegular/);
  assert.match(source, /letterSpacing: 1\.2/);
  assert.doesNotMatch(source, /#[\dA-F]{6}|width:\s*390/i);
});

test('fulfillment presentation composes the shared merchant header inside the Home shell', () => {
  const screen = readFileSync(
    new URL('./FulfillmentChoiceScreen.tsx', import.meta.url),
    'utf8',
  );
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/fulfillment.tsx', import.meta.url),
    'utf8',
  );
  const homeLayout = readFileSync(
    new URL('../../app/(tabs)/(home)/_layout.tsx', import.meta.url),
    'utf8',
  );
  const rootLayout = readFileSync(
    new URL('../../app/_layout.tsx', import.meta.url),
    'utf8',
  );

  assert.match(screen, /MerchantLocationHeader/);
  assert.match(screen, /background="contentCanvas"/);
  assert.match(screen, /style=\{styles\.heading\}/);
  assert.match(
    screen,
    /heading: \{[\s\S]{0,80}marginTop: spacing\.sm/,
  );
  assert.match(route, /useMerchantLocationHeader/);
  assert.match(route, /deliveryUnavailableCopy="Enter an address to check availability\."/);
  assert.match(homeLayout, /name="fulfillment"/);
  assert.doesNotMatch(rootLayout, /<Stack\.Screen name="fulfillment"/);
});

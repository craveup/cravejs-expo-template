import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('tab controls expose their selected state to web and native accessibility APIs', () => {
  for (const relativePath of [
    '../catalog/MenuCatalogPresentation.tsx',
    '../search/SearchPresentation.tsx',
  ]) {
    const presentation = source(relativePath);

    assert.match(presentation, /accessibilityRole="tab"/);
    assert.match(presentation, /accessibilityState=\{\{ selected \}\}/);
    assert.match(presentation, /aria-selected=\{selected\}/);
  }
});

test('radio controls expose checked rather than selected semantics', () => {
  for (const relativePath of [
    '../checkout/CheckoutReviewScreen.tsx',
    '../fulfillment/FulfillmentChoiceScreen.tsx',
    '../schedule/PickupScheduleScreen.tsx',
  ]) {
    const presentation = source(relativePath);

    assert.match(presentation, /accessibilityRole="radio"/);
    assert.match(presentation, /aria-checked=\{/);
    assert.doesNotMatch(
      presentation,
      /accessibilityRole="radio"[\s\S]{0,220}accessibilityState=\{\{[\s\S]{0,100}\bselected\s*:/,
    );
  }
});

test('checkout tip availability uses one visual and semantic disabled condition', () => {
  const presentation = source('../checkout/CheckoutReviewScreen.tsx');

  assert.match(
    presentation,
    /const optionDisabled =[\s\S]{0,160}!onGratuityChange/,
  );
  assert.match(
    presentation,
    /accessibilityState=\{\{ checked: selected, disabled: optionDisabled \}\}/,
  );
  assert.match(presentation, /aria-disabled=\{optionDisabled\}/);
  assert.match(presentation, /disabled=\{optionDisabled\}/);
});

test('selected button-style choices expose a pressed state on web', () => {
  for (const relativePath of [
    '../delivery/DeliveryAddressScreen.tsx',
    '../locations/LocationPickerScreen.tsx',
    '../schedule/PickupScheduleScreen.tsx',
  ]) {
    assert.match(source(relativePath), /aria-pressed=\{selected\}/);
  }
});

test('item option and favourite controls expose their current state on web', () => {
  const presentation = source('../item/ItemDetailPresentation.tsx');

  assert.match(presentation, /aria-checked=\{selected\}/);
  assert.match(presentation, /aria-pressed=\{favourite\}/);
});

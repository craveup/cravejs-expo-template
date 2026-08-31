import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getFulfillmentSummary, getStoreDetailActions } from './store-detail.ts';

test('store detail exposes only actions backed by supplied callbacks', () => {
  assert.deepEqual(getStoreDetailActions({ canGetDirections: true, canShare: false }), [
    'directions',
  ]);
  assert.deepEqual(getStoreDetailActions({ canGetDirections: true, canShare: true }), [
    'directions',
    'share',
  ]);
});

test('fulfillment labels are displayed without reinterpretation', () => {
  assert.equal(getFulfillmentSummary(['Pickup', 'Delivery']), 'Pickup · Delivery');
  assert.equal(getFulfillmentSummary([]), '');
});

test('store detail omits unsupported phone, hours, and open-status claims', () => {
  const source = readFileSync(new URL('./StoreDetailScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /\bphone\b|label="Call"|>Call<|weekly hours|open now|closes at|closing time/i,
  );
  assert.match(source, /mapSlot \?/);
  assert.doesNotMatch(source, /fake map|map placeholder/i);
  assert.match(source, /label="Order from this store"/);
  assert.match(source, /variant="heading">\{name\}/);
  assert.match(source, /bordered=\{false\}[\s\S]{0,120}styles\.methodCard/);
  assert.match(source, /MerchantLocationHeader/);
  assert.match(source, /merchantHeaderState/);
  assert.match(source, /background="contentCanvas"/);
  assert.match(source, /minHeight: 150/);
  assert.match(source, /backgroundColor: colors\.surface/);
  assert.match(source, /minHeight: sizes\.minimumTouchTarget/);
  assert.doesNotMatch(source, /onBack|detailsWithoutMap|minHeight: 48/);
});

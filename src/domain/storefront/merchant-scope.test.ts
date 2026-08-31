import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMerchantSlug } from './merchant-scope.ts';

test('normalizes merchant slugs to the released public contract', () => {
  assert.deepEqual(normalizeMerchantSlug('  example-merchant  '), {
    ok: true,
    value: 'example-merchant',
  });
});

test('rejects merchant slugs outside the released public contract', () => {
  for (const merchantSlug of [
    '',
    'Example Merchant',
    'example_merchant',
    `${'a'.repeat(101)}`,
  ]) {
    assert.deepEqual(normalizeMerchantSlug(merchantSlug), {
      field: 'merchantSlug',
      ok: false,
    });
  }
});

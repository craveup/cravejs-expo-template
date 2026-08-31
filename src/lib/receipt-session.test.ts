import assert from 'node:assert/strict';
import test from 'node:test';

import { createReceiptSessionStore } from './receipt-session.ts';
import {
  createStorefrontSessionScope,
  StorefrontSessionContractError,
} from './storefront-session-scope.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

test('receipt capability stays bound to its exact receipt', () => {
  const receipts = createReceiptSessionStore(scope);

  receipts.capture('receipt_123', 'receipt-capability');

  assert.deepEqual(receipts.getRequestConfig('receipt_123'), {
    receiptToken: 'receipt-capability',
  });
  assert.equal(receipts.getRequestConfig('receipt_456'), undefined);
});

test('receipt capabilities clear explicitly and never survive adapter restart', () => {
  const receipts = createReceiptSessionStore(scope);

  receipts.capture('receipt_123', 'first-capability');
  receipts.capture('receipt_456', 'second-capability');
  receipts.clear('receipt_123');

  assert.equal(receipts.getRequestConfig('receipt_123'), undefined);
  assert.ok(receipts.getRequestConfig('receipt_456'));

  receipts.clearAll();
  assert.equal(receipts.getRequestConfig('receipt_456'), undefined);
  assert.equal(
    createReceiptSessionStore(scope).getRequestConfig('receipt_456'),
    undefined,
  );
});

test('receipt session rejects malformed identifiers and capability fragments', () => {
  const receipts = createReceiptSessionStore(scope);

  assert.throws(
    () => receipts.capture('../receipt', 'receipt-capability'),
    StorefrontSessionContractError,
  );
  assert.throws(
    () => receipts.capture('receipt_123', 'invalid\ncapability'),
    (error: unknown) => {
      assert.ok(error instanceof StorefrontSessionContractError);
      assert.doesNotMatch(error.message, /invalid/);
      return true;
    },
  );
});

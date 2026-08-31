import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryStorefrontSecretStore } from './storefront-secret-store.ts';
import {
  assertSafeStorefrontResourceId,
  assertStorefrontSecret,
  cartSessionKey,
  createStorefrontSessionScope,
  customerSessionKey,
  StorefrontSessionContractError,
} from './storefront-session-scope.ts';

const scopeInput = {
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
} as const;

test('session scope creates exact SecureStore-safe cart and customer keys', () => {
  const scope = createStorefrontSessionScope(scopeInput);

  assert.equal(
    cartSessionKey(scope),
    'storefront.cart.v1.env-0123456789abcdef.example-merchant.0123456789abcdef01234567',
  );
  assert.equal(
    customerSessionKey(scope),
    'storefront.customer.v1.env-0123456789abcdef.example-merchant',
  );
  assert.doesNotMatch(cartSessionKey(scope), /[:/]/);
});

test('session scope fails closed for noncanonical tenant components', () => {
  for (const input of [
    { ...scopeInput, environmentNamespace: 'https://staging.example.com' },
    { ...scopeInput, locationId: 'NOT-A-LOCATION' },
    { ...scopeInput, merchantSlug: 'Merchant With Spaces' },
  ]) {
    assert.throws(
      () => createStorefrontSessionScope(input),
      StorefrontSessionContractError,
    );
  }
});

test('opaque identifiers and secrets are bounded without leaking rejected values', () => {
  assert.equal(
    assertSafeStorefrontResourceId('receipt_abc-123', 'receiptId'),
    'receipt_abc-123',
  );
  assert.equal(assertStorefrontSecret('opaque.jwt.token', 'token'), 'opaque.jwt.token');

  const secret = 'do-not-emit-this\nvalue';

  assert.throws(
    () => assertStorefrontSecret(secret, 'token'),
    (error: unknown) => {
      assert.ok(error instanceof StorefrontSessionContractError);
      assert.doesNotMatch(error.message, /do-not-emit-this/);
      return true;
    },
  );
  assert.throws(
    () => assertSafeStorefrontResourceId('../receipt', 'receiptId'),
    StorefrontSessionContractError,
  );
});

test('in-memory secret store mirrors SecureStore key constraints', async () => {
  const store = createInMemoryStorefrontSecretStore();

  await store.setItem('storefront.customer.v1.env-a.merchant', 'record');
  assert.equal(
    await store.getItem('storefront.customer.v1.env-a.merchant'),
    'record',
  );
  await store.deleteItem('storefront.customer.v1.env-a.merchant');
  assert.equal(
    await store.getItem('storefront.customer.v1.env-a.merchant'),
    null,
  );
  await assert.rejects(() => store.getItem('https://unsafe:key'));
});

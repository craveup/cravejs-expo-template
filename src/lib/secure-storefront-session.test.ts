import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSecureStorefrontSecretStore,
  type SecureStoreAccessOptions,
  type SecureStoreDriver,
} from './secure-storefront-session.ts';

test('SecureStore adapter uses only async native methods with stable options', async () => {
  const calls: {
    key: string;
    operation: 'delete' | 'get' | 'set';
    options?: SecureStoreAccessOptions;
    value?: string;
  }[] = [];
  const records = new Map<string, string>();
  const driver: SecureStoreDriver = {
    async deleteItemAsync(key, options) {
      calls.push({ key, operation: 'delete', options });
      records.delete(key);
    },
    async getItemAsync(key, options) {
      calls.push({ key, operation: 'get', options });
      return records.get(key) ?? null;
    },
    async setItemAsync(key, value, options) {
      calls.push({ key, operation: 'set', options, value });
      records.set(key, value);
    },
  };
  const options = Object.freeze({
    keychainAccessible: 6,
    keychainService: 'storefront.sessions.v1',
  });
  const store = createSecureStorefrontSecretStore(driver, options);

  await store.setItem('storefront.customer.v1.env-a.merchant', 'secret');
  assert.equal(
    await store.getItem('storefront.customer.v1.env-a.merchant'),
    'secret',
  );
  await store.deleteItem('storefront.customer.v1.env-a.merchant');

  assert.deepEqual(calls, [
    {
      key: 'storefront.customer.v1.env-a.merchant',
      operation: 'set',
      options,
      value: 'secret',
    },
    {
      key: 'storefront.customer.v1.env-a.merchant',
      operation: 'get',
      options,
    },
    {
      key: 'storefront.customer.v1.env-a.merchant',
      operation: 'delete',
      options,
    },
  ]);
});

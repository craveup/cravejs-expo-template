import type { StorefrontSecretStore } from './storefront-secret-store.ts';

export type SecureStoreAccessOptions = Readonly<{
  keychainAccessible?: number;
  keychainService: string;
}>;

export interface SecureStoreDriver {
  deleteItemAsync(key: string, options?: SecureStoreAccessOptions): Promise<void>;
  getItemAsync(
    key: string,
    options?: SecureStoreAccessOptions,
  ): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options?: SecureStoreAccessOptions,
  ): Promise<void>;
}

export function createSecureStorefrontSecretStore(
  driver: SecureStoreDriver,
  options: SecureStoreAccessOptions,
): StorefrontSecretStore {
  return Object.freeze({
    async deleteItem(key: string): Promise<void> {
      await driver.deleteItemAsync(key, options);
    },
    async getItem(key: string): Promise<string | null> {
      return driver.getItemAsync(key, options);
    },
    async setItem(key: string, value: string): Promise<void> {
      await driver.setItemAsync(key, value, options);
    },
  });
}

export interface StorefrontSecretStore {
  deleteItem(key: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const SECURE_STORE_KEY_PATTERN = /^[A-Za-z0-9._-]{1,512}$/;

function assertSecureStoreKey(key: string): void {
  if (!SECURE_STORE_KEY_PATTERN.test(key)) {
    throw new TypeError('Storefront secret-store key is not SecureStore-safe.');
  }
}

export function createInMemoryStorefrontSecretStore(): StorefrontSecretStore {
  const records = new Map<string, string>();

  return Object.freeze({
    async deleteItem(key: string): Promise<void> {
      assertSecureStoreKey(key);
      records.delete(key);
    },
    async getItem(key: string): Promise<string | null> {
      assertSecureStoreKey(key);
      return records.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      assertSecureStoreKey(key);
      records.set(key, value);
    },
  });
}

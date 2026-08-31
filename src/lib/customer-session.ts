import type { StorefrontSecretStore } from './storefront-secret-store.ts';
import {
  assertStorefrontSecret,
  createStorefrontSessionScope,
  customerSessionKey,
  StorefrontSessionContractError,
  type StorefrontSessionScope,
} from './storefront-session-scope.ts';

export const CUSTOMER_SESSION_SCHEMA_VERSION = 1 as const;

export type StoredCustomerSession = Readonly<{
  environmentNamespace: string;
  merchantSlug: string;
  schemaVersion: typeof CUSTOMER_SESSION_SCHEMA_VERSION;
  token: string;
}>;

export interface CustomerSessionStore {
  clear(): Promise<void>;
  getAuthToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
}

function parseStoredCustomerSession(
  value: string,
  scope: StorefrontSessionScope,
): StoredCustomerSession | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  if (
    record.schemaVersion !== CUSTOMER_SESSION_SCHEMA_VERSION ||
    record.environmentNamespace !== scope.environmentNamespace ||
    record.merchantSlug !== scope.merchantSlug ||
    typeof record.token !== 'string'
  ) {
    return null;
  }

  try {
    return Object.freeze({
      environmentNamespace: scope.environmentNamespace,
      merchantSlug: scope.merchantSlug,
      schemaVersion: CUSTOMER_SESSION_SCHEMA_VERSION,
      token: assertStorefrontSecret(record.token, 'token'),
    });
  } catch (error) {
    if (error instanceof StorefrontSessionContractError) return null;
    throw error;
  }
}

export function createCustomerSessionStore(
  inputScope: StorefrontSessionScope,
  storage: StorefrontSecretStore,
): CustomerSessionStore {
  const scope = createStorefrontSessionScope(inputScope);
  const key = customerSessionKey(scope);

  return Object.freeze({
    async clear(): Promise<void> {
      await storage.deleteItem(key);
    },
    async getAuthToken(): Promise<string | null> {
      const value = await storage.getItem(key);

      if (value === null) return null;

      const record = parseStoredCustomerSession(value, scope);

      if (record === null) {
        await storage.deleteItem(key);
        return null;
      }

      return record.token;
    },
    async setToken(token: string): Promise<void> {
      const record: StoredCustomerSession = Object.freeze({
        environmentNamespace: scope.environmentNamespace,
        merchantSlug: scope.merchantSlug,
        schemaVersion: CUSTOMER_SESSION_SCHEMA_VERSION,
        token: assertStorefrontSecret(token, 'token'),
      });

      await storage.setItem(key, JSON.stringify(record));
    },
  });
}

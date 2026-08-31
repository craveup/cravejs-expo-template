import type { StorefrontSecretStore } from './storefront-secret-store.ts';
import {
  assertCartRevision,
  assertSafeStorefrontResourceId,
  assertStorefrontSecret,
  cartSessionKey,
  createStorefrontSessionScope,
  StorefrontSessionContractError,
  type StorefrontSessionScope,
} from './storefront-session-scope.ts';

export const CART_SESSION_SCHEMA_VERSION = 1 as const;

export type StorefrontCartSession = Readonly<{
  accessToken?: string;
  cartId: string;
  locationId: string;
  merchantSlug?: string;
  revision: number;
}>;

export type StoredCartSession = Readonly<{
  accessToken?: string;
  cartId: string;
  environmentNamespace: string;
  locationId: string;
  merchantSlug: string;
  revision: number;
  schemaVersion: typeof CART_SESSION_SCHEMA_VERSION;
}>;

export interface StorefrontCartSessionStore {
  clear(locationId: string): Promise<void>;
  clearMatching(locationId: string, cartId: string): Promise<boolean>;
  get(locationId: string): Promise<StorefrontCartSession | null>;
  set(session: StorefrontCartSession): Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStoredCartSession(
  value: string,
  scope: StorefrontSessionScope,
): StoredCartSession | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;

  const accessToken = parsed.accessToken;

  try {
    if (
      parsed.schemaVersion !== CART_SESSION_SCHEMA_VERSION ||
      parsed.environmentNamespace !== scope.environmentNamespace ||
      parsed.merchantSlug !== scope.merchantSlug ||
      parsed.locationId !== scope.locationId ||
      typeof parsed.cartId !== 'string' ||
      typeof parsed.revision !== 'number' ||
      (accessToken !== undefined && typeof accessToken !== 'string')
    ) {
      return null;
    }

    const cartId = assertSafeStorefrontResourceId(parsed.cartId, 'cartId');
    const revision = assertCartRevision(parsed.revision);
    const validatedAccessToken =
      accessToken === undefined
        ? undefined
        : assertStorefrontSecret(accessToken, 'accessToken');

    return Object.freeze({
      ...(validatedAccessToken ? { accessToken: validatedAccessToken } : {}),
      cartId,
      environmentNamespace: scope.environmentNamespace,
      locationId: scope.locationId,
      merchantSlug: scope.merchantSlug,
      revision,
      schemaVersion: CART_SESSION_SCHEMA_VERSION,
    });
  } catch (error) {
    if (error instanceof StorefrontSessionContractError) return null;
    throw error;
  }
}

function toSdkSession(record: StoredCartSession): StorefrontCartSession {
  return Object.freeze({
    ...(record.accessToken ? { accessToken: record.accessToken } : {}),
    cartId: record.cartId,
    locationId: record.locationId,
    merchantSlug: record.merchantSlug,
    revision: record.revision,
  });
}

function assertLocation(locationId: string, scope: StorefrontSessionScope): void {
  if (locationId !== scope.locationId) {
    throw new StorefrontSessionContractError(
      'locationId',
      'does not match the configured tenant scope',
    );
  }
}

export function createCartSessionStore(
  inputScope: StorefrontSessionScope,
  storage: StorefrontSecretStore,
): StorefrontCartSessionStore {
  const scope = createStorefrontSessionScope(inputScope);
  const key = cartSessionKey(scope);
  let operationTail: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.catch(() => undefined).then(operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function read(): Promise<StoredCartSession | null> {
    const value = await storage.getItem(key);

    if (value === null) return null;

    const record = parseStoredCartSession(value, scope);

    if (record === null) {
      await storage.deleteItem(key);
    }

    return record;
  }

  return Object.freeze({
    async clear(locationId: string): Promise<void> {
      assertLocation(locationId, scope);
      await enqueue(() => storage.deleteItem(key));
    },
    async clearMatching(locationId: string, cartIdInput: string): Promise<boolean> {
      assertLocation(locationId, scope);
      const cartId = assertSafeStorefrontResourceId(cartIdInput, 'cartId');

      return enqueue(async () => {
        const record = await read();
        if (record?.cartId !== cartId) return false;
        await storage.deleteItem(key);
        return true;
      });
    },
    async get(locationId: string): Promise<StorefrontCartSession | null> {
      assertLocation(locationId, scope);
      return enqueue(async () => {
        const record = await read();
        return record ? toSdkSession(record) : null;
      });
    },
    async set(session: StorefrontCartSession): Promise<void> {
      assertLocation(session.locationId, scope);

      if (
        session.merchantSlug !== undefined &&
        session.merchantSlug !== scope.merchantSlug
      ) {
        throw new StorefrontSessionContractError(
          'merchantSlug',
          'does not match the configured tenant scope',
        );
      }

      await enqueue(async () => {
        const cartId = assertSafeStorefrontResourceId(session.cartId, 'cartId');
        const suppliedRevision = assertCartRevision(session.revision);
        const accessToken =
          session.accessToken === undefined
            ? undefined
            : assertStorefrontSecret(session.accessToken, 'accessToken');
        const existing = await read();

        if (
          existing?.cartId === cartId &&
          (suppliedRevision < existing.revision ||
            (suppliedRevision === existing.revision &&
              existing.accessToken === undefined &&
              accessToken !== undefined))
        ) {
          return;
        }

        const record: StoredCartSession = Object.freeze({
          ...(accessToken ? { accessToken } : {}),
          cartId,
          environmentNamespace: scope.environmentNamespace,
          locationId: scope.locationId,
          merchantSlug: scope.merchantSlug,
          revision: suppliedRevision,
          schemaVersion: CART_SESSION_SCHEMA_VERSION,
        });

        await storage.setItem(key, JSON.stringify(record));
      });
    },
  });
}

import type { LocalStateStore } from './local-state-store.ts';
import {
  assertCartRevision,
  assertSafeIdempotencyKey,
  assertSafeStorefrontResourceId,
  createStorefrontSessionScope,
  type StorefrontSessionScope,
} from './storefront-session-scope.ts';

export const CHECKOUT_HANDOFF_RECOVERY_SCHEMA_VERSION = 1 as const;

export type CheckoutHandoffRecoveryState =
  | Readonly<{ status: 'unlocked' }>
  | Readonly<{ status: 'recovery_unavailable' }>
  | Readonly<{
      attemptId: string;
      cartId: string;
      revision: number;
      status: 'preparing_handoff';
    }>
  | Readonly<{
      attemptId: string;
      cartId: string;
      expiresAt: string;
      revision: number;
      status:
        | 'handoff_ready'
        | 'handed_off'
        | 'opening_hosted_checkout'
        | 'outcome_unknown';
    }>;

export type CheckoutHandoffRecoveryCommand = Readonly<{
  attemptId: string;
  cartId: string;
  revision: number;
}>;

export interface CheckoutHandoffRecoveryStore {
  clearBeforeOpen(attemptId: string): Promise<boolean>;
  get(): Promise<CheckoutHandoffRecoveryState>;
  isLocked(cartId?: string): Promise<boolean>;
  lockPreparing(command: CheckoutHandoffRecoveryCommand): Promise<boolean>;
  markOpening(attemptId: string): Promise<boolean>;
  markOutcome(
    attemptId: string,
    status: 'handed_off' | 'outcome_unknown',
  ): Promise<boolean>;
  markPrepared(attemptId: string, expiresAt: string): Promise<boolean>;
}

type StoredCheckoutHandoffRecovery = Exclude<
  CheckoutHandoffRecoveryState,
  { status: 'recovery_unavailable' | 'unlocked' }
> &
  Readonly<{
    environmentNamespace: string;
    locationId: string;
    merchantSlug: string;
    schemaVersion: typeof CHECKOUT_HANDOFF_RECOVERY_SCHEMA_VERSION;
  }>;

function recoveryKey(scope: StorefrontSessionScope): string {
  return `storefront.checkout-handoff.v1.${scope.environmentNamespace}.${scope.merchantSlug}.${scope.locationId}`;
}

function validExpiry(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    Number.isFinite(Date.parse(value))
  );
}

function validCommand(
  attemptId: unknown,
  cartId: unknown,
  revision: unknown,
): attemptId is string {
  try {
    return (
      typeof attemptId === 'string' &&
      assertSafeIdempotencyKey(attemptId) === attemptId &&
      typeof cartId === 'string' &&
      assertSafeStorefrontResourceId(cartId, 'cartId') === cartId &&
      typeof revision === 'number' &&
      assertCartRevision(revision) === revision
    );
  } catch {
    return false;
  }
}

function parseRecord(
  value: string,
  scope: StorefrontSessionScope,
): StoredCheckoutHandoffRecovery | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const commonFields = new Set([
    'attemptId',
    'cartId',
    'environmentNamespace',
    'locationId',
    'merchantSlug',
    'revision',
    'schemaVersion',
    'status',
  ]);
  if (
    record.schemaVersion !== CHECKOUT_HANDOFF_RECOVERY_SCHEMA_VERSION ||
    record.environmentNamespace !== scope.environmentNamespace ||
    record.merchantSlug !== scope.merchantSlug ||
    record.locationId !== scope.locationId ||
    !validCommand(record.attemptId, record.cartId, record.revision)
  ) {
    return undefined;
  }
  const common = {
    attemptId: record.attemptId,
    cartId: record.cartId as string,
    environmentNamespace: scope.environmentNamespace,
    locationId: scope.locationId,
    merchantSlug: scope.merchantSlug,
    revision: record.revision as number,
    schemaVersion: CHECKOUT_HANDOFF_RECOVERY_SCHEMA_VERSION,
  } as const;
  if (record.status === 'preparing_handoff') {
    if (Object.keys(record).some((field) => !commonFields.has(field))) {
      return undefined;
    }
    return Object.freeze({ ...common, status: record.status });
  }
  if (
    (record.status === 'handoff_ready' ||
      record.status === 'opening_hosted_checkout' ||
      record.status === 'handed_off' ||
      record.status === 'outcome_unknown') &&
    validExpiry(record.expiresAt)
  ) {
    if (
      Object.keys(record).some(
        (field) => field !== 'expiresAt' && !commonFields.has(field),
      )
    ) {
      return undefined;
    }
    return Object.freeze({
      ...common,
      expiresAt: record.expiresAt,
      status: record.status,
    });
  }
  return undefined;
}

export function createCheckoutHandoffRecoveryStore(
  inputScope: StorefrontSessionScope,
  storage: LocalStateStore,
  now: () => number = Date.now,
): CheckoutHandoffRecoveryStore {
  const scope = createStorefrontSessionScope(inputScope);
  const key = recoveryKey(scope);
  let operationTail: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.catch(() => undefined).then(operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function read(
    releaseExpiredPrepared = true,
  ): Promise<CheckoutHandoffRecoveryState> {
    const value = await storage.getItem(key);
    if (value === null) return Object.freeze({ status: 'unlocked' });
    const record = parseRecord(value, scope);
    if (!record) {
      return Object.freeze({ status: 'recovery_unavailable' });
    }
    if (
      releaseExpiredPrepared &&
      record.status === 'handoff_ready' &&
      Date.parse(record.expiresAt) <= now()
    ) {
      await storage.removeItem(key);
      return Object.freeze({ status: 'unlocked' });
    }
    const {
      environmentNamespace: _environmentNamespace,
      locationId: _locationId,
      merchantSlug: _merchantSlug,
      schemaVersion: _schemaVersion,
      ...state
    } = record;
    return Object.freeze(state);
  }

  async function write(
    state: Exclude<
      CheckoutHandoffRecoveryState,
      { status: 'recovery_unavailable' | 'unlocked' }
    >,
  ) {
    const record: StoredCheckoutHandoffRecovery = Object.freeze({
      ...state,
      environmentNamespace: scope.environmentNamespace,
      locationId: scope.locationId,
      merchantSlug: scope.merchantSlug,
      schemaVersion: CHECKOUT_HANDOFF_RECOVERY_SCHEMA_VERSION,
    });
    await storage.setItem(key, JSON.stringify(record));
  }

  return Object.freeze({
    clearBeforeOpen(attemptId: string): Promise<boolean> {
      return enqueue(async () => {
        const state = await read(false);
        if (
          state.status === 'unlocked' ||
          state.status === 'recovery_unavailable' ||
          state.attemptId !== attemptId ||
          (state.status !== 'preparing_handoff' &&
            state.status !== 'handoff_ready')
        ) {
          return false;
        }
        await storage.removeItem(key);
        return true;
      });
    },
    get(): Promise<CheckoutHandoffRecoveryState> {
      return enqueue(read);
    },
    isLocked(cartId?: string): Promise<boolean> {
      return enqueue(async () => {
        const state = await read();
        return (
          state.status !== 'unlocked' &&
          (state.status === 'recovery_unavailable' ||
            cartId === undefined ||
            state.cartId === cartId)
        );
      });
    },
    lockPreparing(command: CheckoutHandoffRecoveryCommand): Promise<boolean> {
      return enqueue(async () => {
        if (!validCommand(command.attemptId, command.cartId, command.revision)) {
          return false;
        }
        const state = await read();
        if (state.status !== 'unlocked') {
          return (
            state.status === 'preparing_handoff' &&
            state.attemptId === command.attemptId &&
            state.cartId === command.cartId &&
            state.revision === command.revision
          );
        }
        await write(Object.freeze({ ...command, status: 'preparing_handoff' }));
        return true;
      });
    },
    markOpening(attemptId: string): Promise<boolean> {
      return enqueue(async () => {
        const state = await read(false);
        if (state.status !== 'handoff_ready' || state.attemptId !== attemptId) {
          return false;
        }
        await write(Object.freeze({ ...state, status: 'opening_hosted_checkout' }));
        return true;
      });
    },
    markOutcome(
      attemptId: string,
      status: 'handed_off' | 'outcome_unknown',
    ): Promise<boolean> {
      return enqueue(async () => {
        const state = await read(false);
        if (
          state.status !== 'opening_hosted_checkout' ||
          state.attemptId !== attemptId
        ) {
          return false;
        }
        await write(Object.freeze({ ...state, status }));
        return true;
      });
    },
    markPrepared(attemptId: string, expiresAt: string): Promise<boolean> {
      return enqueue(async () => {
        const state = await read(false);
        if (
          state.status !== 'preparing_handoff' ||
          state.attemptId !== attemptId ||
          !validExpiry(expiresAt)
        ) {
          return false;
        }
        await write(Object.freeze({ ...state, expiresAt, status: 'handoff_ready' }));
        return true;
      });
    },
  });
}

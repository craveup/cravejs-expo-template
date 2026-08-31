import type {
  LoyaltyLedger,
  LoyaltyQuote,
  StorefrontCart,
} from '@craveup/storefront-sdk';

import { refreshCartAfterConflict } from '../../lib/cart-reconciliation.ts';
import type { StorefrontCartSessionStore } from '../../lib/cart-session.ts';
import type { CustomerSessionStore } from '../../lib/customer-session.ts';
import {
  mapCustomerRequestFailure,
  type CustomerAuthenticationFailureHandler,
} from '../../lib/customer-request-failure.ts';
import {
  isValidStorefrontCursor,
  isValidStorefrontPageLimit,
} from '../../lib/storefront-pagination.ts';
import { isScopedStorefrontCart } from '../../lib/storefront-response-contracts.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import {
  assertCartRevision,
  assertSafeIdempotencyKey,
  assertSafeStorefrontResourceId,
} from '../../lib/storefront-session-scope.ts';

export type LoyaltyClient = Readonly<{
  cart: Pick<StorefrontClient['cart'], 'get'>;
  loyalty: Pick<
    StorefrontClient['loyalty'],
    'cancel' | 'ledger' | 'quote' | 'redeem'
  >;
}>;

export type LoyaltyDataResult<T> =
  | Readonly<{ data: T; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export type LoyaltyMutationResult =
  | Readonly<{
      cart: StorefrontCart;
      kind: 'updated';
      ledger?: LoyaltyLedger;
      refreshFailure?: StorefrontFailure;
    }>
  | Readonly<{
      cart?: StorefrontCart;
      failure: StorefrontFailure;
      kind: 'reconciliation_required';
    }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export type LoyaltyCartIntent = Readonly<{
  cartId: string;
  idempotencyKey: string;
  revision: number;
}>;

export type LoyaltyRedeemIntent = LoyaltyCartIntent &
  Readonly<{ rewardId: string }>;

export interface LoyaltyService {
  cancel(intent: LoyaltyCartIntent): Promise<LoyaltyMutationResult>;
  getLedger(params?: Readonly<{
    cursor?: string;
    limit?: number;
  }>): Promise<LoyaltyDataResult<LoyaltyLedger>>;
  getQuote(cartId: string): Promise<LoyaltyDataResult<LoyaltyQuote>>;
  redeem(intent: LoyaltyRedeemIntent): Promise<LoyaltyMutationResult>;
}

const INVALID_INPUT_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CLIENT_VALIDATION_ERROR',
  kind: 'invalid_request',
  retryable: false,
});

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

function isBoundedText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 500 &&
    value === value.trim()
  );
}

function isFiniteAmount(value: unknown, nonNegative = false): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER &&
    (!nonNegative || value >= 0)
  );
}

function projectLoyaltyQuote(value: unknown): LoyaltyQuote | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const enabled = Reflect.get(value, 'enabled');
  const available = Reflect.get(value, 'available');
  const pointsToEarn = Reflect.get(value, 'pointsToEarn');
  const balance = Reflect.get(value, 'balance');
  const rewards = Reflect.get(value, 'rewards');
  const appliedRewardId = Reflect.get(value, 'appliedRewardId');

  if (
    typeof enabled !== 'boolean' ||
    (available !== undefined && typeof available !== 'boolean') ||
    (pointsToEarn !== undefined && !isFiniteAmount(pointsToEarn, true))
  ) {
    return undefined;
  }

  let projectedBalance: LoyaltyQuote['balance'];
  if (balance !== undefined) {
    if (typeof balance !== 'object' || balance === null) return undefined;
    const posted = Reflect.get(balance, 'posted');
    const balanceAvailable = Reflect.get(balance, 'available');
    const reserved = Reflect.get(balance, 'reserved');
    if (
      !isFiniteAmount(posted, true) ||
      !isFiniteAmount(balanceAvailable, true) ||
      !isFiniteAmount(reserved, true)
    ) {
      return undefined;
    }
    projectedBalance = Object.freeze({
      available: balanceAvailable,
      posted,
      reserved,
    });
  }

  let projectedRewards: LoyaltyQuote['rewards'];
  if (rewards !== undefined) {
    if (!Array.isArray(rewards) || rewards.length > 100) return undefined;
    projectedRewards = [];
    const rewardIds = new Set<string>();
    for (const reward of rewards) {
      if (typeof reward !== 'object' || reward === null) return undefined;
      const id = Reflect.get(reward, 'id');
      const name = Reflect.get(reward, 'name');
      const status = Reflect.get(reward, 'status');
      const unavailableReasons = Reflect.get(reward, 'unavailableReasons');
      const pointsCost = Reflect.get(reward, 'pointsCost');
      const amountOff = Reflect.get(reward, 'amountOff');
      const redeemable = Reflect.get(reward, 'redeemable');

      try {
        if (
          typeof id !== 'string' ||
          !isBoundedText(name) ||
          !isBoundedText(status) ||
          !isFiniteAmount(pointsCost, true) ||
          (amountOff !== undefined && !isFiniteAmount(amountOff, true)) ||
          typeof redeemable !== 'boolean' ||
          (unavailableReasons !== undefined &&
            (!Array.isArray(unavailableReasons) ||
              unavailableReasons.length > 100 ||
              !unavailableReasons.every(isBoundedText)))
        ) {
          return undefined;
        }
        const projectedId = assertSafeStorefrontResourceId(id, 'rewardId');
        if (rewardIds.has(projectedId)) return undefined;
        rewardIds.add(projectedId);
        projectedRewards.push(Object.freeze({
          ...(amountOff === undefined ? {} : { amountOff }),
          id: projectedId,
          name,
          pointsCost,
          redeemable,
          status,
          ...(unavailableReasons === undefined ? {} : { unavailableReasons }),
        }));
      } catch {
        return undefined;
      }
    }
  }

  let projectedAppliedRewardId: string | undefined;
  if (appliedRewardId !== undefined) {
    if (typeof appliedRewardId !== 'string') return undefined;
    try {
      projectedAppliedRewardId = assertSafeStorefrontResourceId(
        appliedRewardId,
        'rewardId',
      );
    } catch {
      return undefined;
    }
  }

  return Object.freeze({
    ...(projectedAppliedRewardId === undefined
      ? {}
      : { appliedRewardId: projectedAppliedRewardId }),
    ...(available === undefined ? {} : { available }),
    ...(projectedBalance === undefined ? {} : { balance: projectedBalance }),
    enabled,
    ...(pointsToEarn === undefined ? {} : { pointsToEarn }),
    ...(projectedRewards === undefined ? {} : { rewards: projectedRewards }),
  });
}

function projectLoyaltyLedger(value: unknown): LoyaltyLedger | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'enabled') !== 'boolean'
  ) {
    return undefined;
  }

  const enabled = Reflect.get(value, 'enabled') as boolean;
  const balances = Reflect.get(value, 'balances');
  const entries = Reflect.get(value, 'entries');
  const nextCursor = Reflect.get(value, 'nextCursor');

  if (
    (balances !== undefined && (!Array.isArray(balances) || balances.length > 100)) ||
    (entries !== undefined && (!Array.isArray(entries) || entries.length > 100)) ||
    (nextCursor !== undefined && !isValidStorefrontCursor(nextCursor))
  ) {
    return undefined;
  }

  const projectedBalances: NonNullable<LoyaltyLedger['balances']> = [];
  const balanceUnits = new Set<string>();
  for (const balance of balances ?? []) {
    if (typeof balance !== 'object' || balance === null) return undefined;
    const unit = Reflect.get(balance, 'unit');
    const label = Reflect.get(balance, 'label');
    const posted = Reflect.get(balance, 'posted');
    const reserved = Reflect.get(balance, 'reserved');
    const available = Reflect.get(balance, 'available');
    const asOf = Reflect.get(balance, 'asOf');
    if (
      !isBoundedText(unit) ||
      (label !== undefined && !isBoundedText(label)) ||
      !isFiniteAmount(posted, true) ||
      !isFiniteAmount(reserved, true) ||
      !isFiniteAmount(available, true) ||
      !isBoundedText(asOf)
    ) {
      return undefined;
    }
    const normalizedUnit = unit.toLowerCase();
    if (balanceUnits.has(normalizedUnit)) return undefined;
    balanceUnits.add(normalizedUnit);
    projectedBalances.push(Object.freeze({
      asOf,
      available,
      ...(label === undefined ? {} : { label }),
      posted,
      reserved,
      unit,
    }));
  }

  const projectedEntries: NonNullable<LoyaltyLedger['entries']> = [];
  for (const entry of entries ?? []) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const operation = Reflect.get(entry, 'operation');
    const amount = Reflect.get(entry, 'amount');
    const unit = Reflect.get(entry, 'unit');
    const classification = Reflect.get(entry, 'classification');
    const orderReference = Reflect.get(entry, 'orderReference');
    const expiresAt = Reflect.get(entry, 'expiresAt');
    const occurredAt = Reflect.get(entry, 'occurredAt');
    if (
      !isBoundedText(operation) ||
      !isFiniteAmount(amount) ||
      !isBoundedText(unit) ||
      (classification !== undefined && !isBoundedText(classification)) ||
      (orderReference !== undefined && !isBoundedText(orderReference)) ||
      (expiresAt !== undefined && !isBoundedText(expiresAt)) ||
      !isBoundedText(occurredAt)
    ) {
      return undefined;
    }
    projectedEntries.push(Object.freeze({
      amount,
      ...(classification === undefined ? {} : { classification }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      occurredAt,
      operation,
      ...(orderReference === undefined ? {} : { orderReference }),
      unit,
    }));
  }

  return Object.freeze({
    ...(balances === undefined ? {} : { balances: projectedBalances }),
    enabled,
    ...(entries === undefined ? {} : { entries: projectedEntries }),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

export function createLoyaltyService(
  client: LoyaltyClient,
  cartSessions: StorefrontCartSessionStore,
  customerSessions: CustomerSessionStore,
  locationId: string,
  onAuthenticationFailure?: CustomerAuthenticationFailureHandler,
): LoyaltyService {
  async function getLedger(
    params: Readonly<{ cursor?: string; limit?: number }> = {},
  ): Promise<LoyaltyDataResult<LoyaltyLedger>> {
    if (
      (params.cursor !== undefined &&
        !isValidStorefrontCursor(params.cursor)) ||
      (params.limit !== undefined &&
        !isValidStorefrontPageLimit(params.limit))
    ) {
      return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
    }

    try {
      const ledger = projectLoyaltyLedger(await client.loyalty.ledger(params));
      return ledger
        ? Object.freeze({ data: ledger, kind: 'ready' })
        : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
    } catch (error) {
      return Object.freeze({
        failure: await mapCustomerRequestFailure(
          error,
          customerSessions,
          onAuthenticationFailure,
        ),
        kind: 'failed',
      });
    }
  }

  async function mutate(
    intent: LoyaltyCartIntent,
    operation: (
      cartId: string,
      config: Readonly<{ idempotencyKey: string; revision: number }>,
    ) => Promise<StorefrontCart>,
  ): Promise<LoyaltyMutationResult> {
    let cartId: string;
    let idempotencyKey: string;
    let revision: number;

    try {
      cartId = assertSafeStorefrontResourceId(intent.cartId, 'cartId');
      idempotencyKey = assertSafeIdempotencyKey(intent.idempotencyKey);
      revision = assertCartRevision(intent.revision);
    } catch {
      return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
    }

    try {
      const cart = await operation(cartId, { idempotencyKey, revision });

      if (!isScopedStorefrontCart(cart, locationId, cartId)) {
        return Object.freeze({
          failure: INVALID_RESPONSE_FAILURE,
          kind: 'failed',
        });
      }

      const current = await cartSessions.get(locationId);
      if (current?.cartId !== cartId || current.revision < cart.revision) {
        return Object.freeze({
          failure: INVALID_RESPONSE_FAILURE,
          kind: 'failed',
        });
      }

      const refreshed = await getLedger();

      return Object.freeze({
        cart,
        kind: 'updated' as const,
        ...(refreshed.kind === 'ready'
          ? { ledger: refreshed.data }
          : { refreshFailure: refreshed.failure }),
      });
    } catch (error) {
      const failure = await mapCustomerRequestFailure(
        error,
        customerSessions,
        onAuthenticationFailure,
      );

      if (failure.kind === 'conflict') {
        const cart = await refreshCartAfterConflict(
          client.cart,
          cartSessions,
          locationId,
          cartId,
        );
        return Object.freeze({
          ...(cart ? { cart } : {}),
          failure,
          kind: 'reconciliation_required' as const,
        });
      }

      return Object.freeze({ failure, kind: 'failed' });
    }
  }

  return Object.freeze({
    cancel(intent: LoyaltyCartIntent): Promise<LoyaltyMutationResult> {
      return mutate(intent, (cartId, config) =>
        client.loyalty.cancel(locationId, cartId, config),
      );
    },
    getLedger,
    async getQuote(cartIdInput: string): Promise<LoyaltyDataResult<LoyaltyQuote>> {
      let cartId: string;

      try {
        cartId = assertSafeStorefrontResourceId(cartIdInput, 'cartId');
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const quote = projectLoyaltyQuote(
          await client.loyalty.quote(locationId, cartId),
        );
        return quote
          ? Object.freeze({ data: quote, kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            customerSessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
    redeem(intent: LoyaltyRedeemIntent): Promise<LoyaltyMutationResult> {
      let rewardId: string;

      try {
        rewardId = assertSafeStorefrontResourceId(intent.rewardId, 'rewardId');
      } catch {
        return Promise.resolve(
          Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' }),
        );
      }

      return mutate(intent, (cartId, config) =>
        client.loyalty.redeem(locationId, cartId, rewardId, config),
      );
    },
  });
}

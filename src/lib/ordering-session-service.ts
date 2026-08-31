import type {
  FulfilmentMethod,
  RequestConfig,
  StorefrontCart,
  StartOrderingSessionRequest,
} from '@craveup/storefront-sdk';

import { mapStorefrontError, type StorefrontFailure } from './storefront-errors.ts';
import type { StorefrontClient } from './storefront.ts';
import type { StorefrontCartSessionStore } from './cart-session.ts';
import { refreshCartAfterConflict } from './cart-reconciliation.ts';
import type { CustomerSessionStore } from './customer-session.ts';
import {
  mapCustomerRequestFailure,
  SECURE_STORAGE_FAILURE,
  type CustomerAuthenticationFailureHandler,
} from './customer-request-failure.ts';
import {
  assertCartRevision,
  assertSafeIdempotencyKey,
  assertSafeStorefrontResourceId,
} from './storefront-session-scope.ts';
import { isScopedStorefrontCart } from './storefront-response-contracts.ts';

export type OrderingSessionClient = Readonly<{
  cart: Pick<StorefrontClient['cart'], 'claim' | 'get'>;
  orderingSessions: Pick<StorefrontClient['orderingSessions'], 'start'>;
}>;

export type OrderingSessionReady = Readonly<{
  cart: StorefrontCart;
  kind: 'ready';
}>;

export type OrderingSessionFailure = Readonly<{
  failure: StorefrontFailure;
  kind: 'failed';
}>;

export type OrderingSessionReconciliation = Readonly<{
  cart?: StorefrontCart;
  failure: StorefrontFailure;
  kind: 'reconciliation_required';
}>;

export type OrderingSessionResult =
  | OrderingSessionReady
  | OrderingSessionFailure
  | OrderingSessionReconciliation;

export type StartOrderingIntent = Readonly<{
  channel?: StartOrderingSessionRequest['channel'];
  fulfillmentMethod: FulfilmentMethod;
  idempotencyKey: string;
}>;

export type RecoverOrderingIntent = StartOrderingIntent &
  Readonly<{
    cartId: string;
    revision: number;
  }>;

export type ClaimOrderingIntent = Readonly<{
  cartId: string;
  idempotencyKey: string;
  revision: number;
}>;

export interface OrderingSessionService {
  claim(intent: ClaimOrderingIntent): Promise<OrderingSessionResult>;
  recover(intent: RecoverOrderingIntent): Promise<OrderingSessionResult>;
  start(intent: StartOrderingIntent): Promise<OrderingSessionResult>;
}

const FULFILLMENT_METHODS = new Set<FulfilmentMethod>([
  'delivery',
  'room_service',
  'table_side',
  'takeout',
]);

const INVALID_INTENT_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CLIENT_VALIDATION_ERROR',
  kind: 'invalid_request',
  retryable: false,
});

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

function validIntentKey(value: string): boolean {
  try {
    assertSafeIdempotencyKey(value);
    return true;
  } catch {
    return false;
  }
}

function requestConfig(
  idempotencyKey: string,
  revision?: number,
): RequestConfig {
  return {
    idempotencyKey,
    ...(revision === undefined ? {} : { revision }),
  };
}

export function createOrderingSessionService(
  client: OrderingSessionClient,
  sessions: StorefrontCartSessionStore,
  locationId: string,
  customerSessions?: CustomerSessionStore,
  onAuthenticationFailure?: CustomerAuthenticationFailureHandler,
): OrderingSessionService {
  async function requestFailure(
    error: unknown,
    customerCredentialUsed: boolean,
  ): Promise<StorefrontFailure> {
    const failure = mapStorefrontError(error);
    if (
      failure.kind !== 'authentication_required' ||
      !customerCredentialUsed ||
      customerSessions === undefined
    ) {
      return failure;
    }

    return mapCustomerRequestFailure(
      error,
      customerSessions,
      onAuthenticationFailure,
    );
  }

  async function clearInaccessibleCart(
    cartId: string,
  ): Promise<StorefrontFailure | undefined> {
    try {
      await sessions.clearMatching(locationId, cartId);
      return undefined;
    } catch {
      return SECURE_STORAGE_FAILURE;
    }
  }

  async function reconcile(
    cartId: string,
    failure: StorefrontFailure,
  ): Promise<OrderingSessionReconciliation> {
    const cart = await refreshCartAfterConflict(
      client.cart,
      sessions,
      locationId,
      cartId,
    );

    return Object.freeze({
      ...(cart ? { cart } : {}),
      failure,
      kind: 'reconciliation_required' as const,
    });
  }

  async function startOrRecover(
    intent: StartOrderingIntent | RecoverOrderingIntent,
  ): Promise<OrderingSessionResult> {
    if (
      !validIntentKey(intent.idempotencyKey) ||
      !FULFILLMENT_METHODS.has(intent.fulfillmentMethod)
    ) {
      return Object.freeze({ failure: INVALID_INTENT_FAILURE, kind: 'failed' });
    }

    const recovering = 'cartId' in intent;
    let cartId: string | undefined;
    let revision: number | undefined;
    let customerCredentialUsed = true;

    try {
      if (recovering) {
        cartId = assertSafeStorefrontResourceId(intent.cartId, 'cartId');
        revision = assertCartRevision(intent.revision);
      }
    } catch {
      return Object.freeze({
        failure: INVALID_INTENT_FAILURE,
        kind: 'failed',
      });
    }

    if (recovering && cartId !== undefined) {
      try {
        const current = await sessions.get(locationId);
        customerCredentialUsed = !(
          current?.cartId === cartId && current.accessToken
        );
      } catch {
        return Object.freeze({
          failure: SECURE_STORAGE_FAILURE,
          kind: 'failed',
        });
      }
    }

    const payload: StartOrderingSessionRequest = {
      ...(intent.channel ? { channel: intent.channel } : {}),
      existingCartId: cartId ?? null,
      fulfillmentMethod: intent.fulfillmentMethod,
    };

    try {
      const response = await client.orderingSessions.start(
        locationId,
        payload,
        requestConfig(intent.idempotencyKey, revision),
      );

      if (!isScopedStorefrontCart(response.cart, locationId, cartId)) {
        return Object.freeze({
          failure: INVALID_RESPONSE_FAILURE,
          kind: 'failed',
        });
      }

      let sdkSession;
      try {
        sdkSession = await sessions.get(locationId);
      } catch {
        return Object.freeze({
          failure: SECURE_STORAGE_FAILURE,
          kind: 'failed',
        });
      }
      if (
        sdkSession?.cartId !== response.cart.id ||
        sdkSession.revision < response.cart.revision ||
        (response.cartAccessToken !== undefined &&
          sdkSession.accessToken !== response.cartAccessToken)
      ) {
        return Object.freeze({
          failure: INVALID_RESPONSE_FAILURE,
          kind: 'failed',
        });
      }

      return Object.freeze({ cart: response.cart, kind: 'ready' });
    } catch (error) {
      const mappedFailure = mapStorefrontError(error);
      const failure = await requestFailure(error, customerCredentialUsed);
      if (mappedFailure.kind === 'conflict' && cartId) {
        return reconcile(cartId, mappedFailure);
      }
      if (
        cartId &&
        (mappedFailure.kind === 'authentication_required' ||
          mappedFailure.kind === 'forbidden')
      ) {
        const storageFailure = await clearInaccessibleCart(cartId);
        if (storageFailure) {
          return Object.freeze({ failure: storageFailure, kind: 'failed' });
        }
      }
      return Object.freeze({ failure, kind: 'failed' });
    }
  }

  return Object.freeze({
    async claim(intent: ClaimOrderingIntent): Promise<OrderingSessionResult> {
      let cartId: string;
      let revision: number;

      try {
        cartId = assertSafeStorefrontResourceId(intent.cartId, 'cartId');
        revision = assertCartRevision(intent.revision);
      } catch {
        return Object.freeze({ failure: INVALID_INTENT_FAILURE, kind: 'failed' });
      }

      if (!validIntentKey(intent.idempotencyKey)) {
        return Object.freeze({ failure: INVALID_INTENT_FAILURE, kind: 'failed' });
      }

      try {
        const cart = await client.cart.claim(
          locationId,
          cartId,
          requestConfig(intent.idempotencyKey, revision),
        );

        if (!isScopedStorefrontCart(cart, locationId, cartId)) {
          return Object.freeze({
            failure: INVALID_RESPONSE_FAILURE,
            kind: 'failed',
          });
        }

        let sdkSession;
        try {
          sdkSession = await sessions.get(locationId);
        } catch {
          return Object.freeze({
            failure: SECURE_STORAGE_FAILURE,
            kind: 'failed',
          });
        }
        if (
          sdkSession?.cartId !== cartId ||
          sdkSession.revision < cart.revision ||
          sdkSession.accessToken !== undefined
        ) {
          return Object.freeze({
            failure: INVALID_RESPONSE_FAILURE,
            kind: 'failed',
          });
        }

        return Object.freeze({ cart, kind: 'ready' });
      } catch (error) {
        const mappedFailure = mapStorefrontError(error);
        const failure = await requestFailure(error, true);
        if (mappedFailure.kind === 'conflict') {
          return reconcile(cartId, mappedFailure);
        }
        if (
          mappedFailure.kind === 'authentication_required' ||
          mappedFailure.kind === 'forbidden'
        ) {
          const storageFailure = await clearInaccessibleCart(cartId);
          if (storageFailure) {
            return Object.freeze({ failure: storageFailure, kind: 'failed' });
          }
        }
        return Object.freeze({ failure, kind: 'failed' });
      }
    },
    recover(intent: RecoverOrderingIntent): Promise<OrderingSessionResult> {
      return startOrRecover(intent);
    },
    start(intent: StartOrderingIntent): Promise<OrderingSessionResult> {
      return startOrRecover(intent);
    },
  });
}

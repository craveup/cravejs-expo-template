import type { StorefrontCart } from '@craveup/storefront-sdk';

import type {
  CustomerAuthService,
} from '../features/auth/customer-auth-service.ts';
import type { CustomerAuthState } from '../features/auth/customer-auth-state.ts';
import type { StorefrontCartSessionStore } from './cart-session.ts';
import {
  isCustomerAuthenticationFailure,
  SECURE_STORAGE_FAILURE,
} from './customer-request-failure.ts';
import { isScopedStorefrontCart } from './storefront-response-contracts.ts';
import { mapStorefrontError, type StorefrontFailure } from './storefront-errors.ts';
import type { StorefrontClient } from './storefront.ts';

export type StorefrontLifecycleClient = Readonly<{
  cart: Pick<StorefrontClient['cart'], 'get'>;
}>;

export type StorefrontLifecycleSnapshot = Readonly<{
  auth: CustomerAuthState;
  cart?: StorefrontCart;
  cartFailure?: StorefrontFailure;
}>;

export interface StorefrontLifecycleService {
  restore(): Promise<StorefrontLifecycleSnapshot>;
}

export function createStorefrontLifecycleService(
  client: StorefrontLifecycleClient,
  auth: CustomerAuthService,
  carts: StorefrontCartSessionStore,
  locationId: string,
): StorefrontLifecycleService {
  async function restoreAuth(): Promise<CustomerAuthState> {
    const current = auth.getState();

    if (current.status === 'signed_out') {
      return (await auth.restore()).state;
    }
    if (current.status === 'profile_unavailable') {
      return (await auth.retryProfile()).state;
    }

    return current;
  }

  return Object.freeze({
    async restore(): Promise<StorefrontLifecycleSnapshot> {
      let authState = await restoreAuth();
      let session;

      try {
        session = await carts.get(locationId);
      } catch {
        return Object.freeze({
          auth: authState,
          cartFailure: SECURE_STORAGE_FAILURE,
        });
      }

      if (!session) return Object.freeze({ auth: authState });

      try {
        const cart = await client.cart.get(locationId, session.cartId);

        if (!isScopedStorefrontCart(cart, locationId, session.cartId)) {
          return Object.freeze({
            auth: authState,
            cartFailure: Object.freeze({
              code: 'INVALID_STOREFRONT_RESPONSE',
              kind: 'unavailable',
              retryable: true,
            }),
          });
        }

        if (cart.status === 'EXPIRED') {
          try {
            await carts.clearMatching(locationId, session.cartId);
          } catch {
            return Object.freeze({
              auth: authState,
              cartFailure: SECURE_STORAGE_FAILURE,
            });
          }
          return Object.freeze({ auth: authState });
        }

        return Object.freeze({ auth: authState, cart });
      } catch (error) {
        let failure = mapStorefrontError(error);

        if (
          isCustomerAuthenticationFailure(failure) &&
          !session.accessToken
        ) {
          failure = await auth.invalidateSession(failure);
          authState = auth.getState();
        }

        if (
          failure.kind === 'authentication_required' ||
          failure.kind === 'forbidden' ||
          failure.kind === 'not_found'
        ) {
          try {
            await carts.clearMatching(locationId, session.cartId);
          } catch {
            return Object.freeze({
              auth: authState,
              cartFailure: SECURE_STORAGE_FAILURE,
            });
          }
        }

        return Object.freeze({ auth: authState, cartFailure: failure });
      }
    },
  });
}

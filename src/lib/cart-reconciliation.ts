import type { StorefrontCart } from '@craveup/storefront-sdk';

import type { StorefrontCartSessionStore } from './cart-session.ts';
import { isScopedStorefrontCart } from './storefront-response-contracts.ts';

export type CartReadClient = Readonly<{
  get(
    locationId: string,
    cartId: string,
  ): Promise<StorefrontCart>;
}>;

export async function refreshCartAfterConflict(
  cartClient: CartReadClient,
  sessions: StorefrontCartSessionStore,
  locationId: string,
  cartId: string,
): Promise<StorefrontCart | undefined> {
  try {
    const cart = await cartClient.get(locationId, cartId);
    if (!isScopedStorefrontCart(cart, locationId, cartId)) return undefined;

    const current = await sessions.get(locationId);
    return current?.cartId === cartId && current.revision >= cart.revision
      ? cart
      : undefined;
  } catch {
    return undefined;
  }
}

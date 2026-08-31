import type { OrderResult } from '@craveup/storefront-sdk';

import type { OrderAccessService } from '../orders/order-access-service.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';

export type OrderStatusLifecycle = Readonly<{
  restore(): Promise<
    Readonly<{
      cart?: Readonly<{ id: string }>;
      cartFailure?: StorefrontFailure;
    }>
  >;
}>;

export type ActiveOrderStatusService = Pick<
  OrderAccessService,
  'getActiveResult'
>;

export type ActiveOrderStatusLoadResult =
  | Readonly<{ kind: 'no_active_order' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>
  | Readonly<{ data: OrderResult; kind: 'ready' }>;

export type OrderStatusNetworkState = Readonly<{
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}>;

export function isOrderStatusOffline(network: OrderStatusNetworkState): boolean {
  return (
    network.isConnected === false || network.isInternetReachable === false
  );
}

export async function loadActiveOrderStatus(
  lifecycle: OrderStatusLifecycle,
  orders: ActiveOrderStatusService,
): Promise<ActiveOrderStatusLoadResult> {
  const snapshot = await lifecycle.restore();

  if (snapshot.cartFailure) {
    return Object.freeze({ failure: snapshot.cartFailure, kind: 'failed' });
  }
  if (!snapshot.cart) {
    return Object.freeze({ kind: 'no_active_order' });
  }

  const result = await orders.getActiveResult(snapshot.cart.id);
  return result.kind === 'ready'
    ? Object.freeze({ data: result.data, kind: 'ready' })
    : result;
}

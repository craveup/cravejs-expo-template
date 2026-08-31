import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import {
  handoffDeliveryStatus,
  isDeliveryStatusOrder,
} from '@/features/delivery-status';
import {
  OrderStatusPresentation,
  useActiveOrderStatus,
} from '@/features/order-status';
import { useMerchantLocationHeader } from '@/features/_shared';
import { getStorefrontRuntime } from '@/lib/storefront';

export default function OrderStatusRoute() {
  const runtime = getStorefrontRuntime();
  const lifecycle = runtime.services.lifecycle;
  const orders = runtime.services.orders;
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const orderStatus = useActiveOrderStatus({ lifecycle, orders });
  const deliveryStatusAvailable = isDeliveryStatusOrder(orderStatus.state);

  useEffect(() => {
    if (deliveryStatusAvailable) {
      handoffDeliveryStatus(orders, orderStatus.state, () => {
        router.replace('/delivery/status' as Href);
      });
    }
  }, [deliveryStatusAvailable, orderStatus.state, orders]);

  return (
    <>
      <StatusBar style="dark" />
      <OrderStatusPresentation
        merchantHeaderState={merchantHeader.state}
        onOpenAccount={() => router.push('/account' as Href)}
        onRetry={() => {
          merchantHeader.retry();
          orderStatus.retry();
        }}
        state={orderStatus.state}
      />
    </>
  );
}

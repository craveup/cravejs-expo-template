import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import {
  clearDeliveryStatusHandoff,
  DeliveryStatusPresentation,
  readDeliveryStatusHandoff,
  selectDeliveryStatusSourceState,
  toDeliveryStatusPresentationState,
} from '@/features/delivery-status';
import { useActiveOrderStatus } from '@/features/order-status';
import { useMerchantLocationHeader } from '@/features/_shared';
import { getStorefrontRuntime } from '@/lib/storefront';

export default function DeliveryStatusRoute() {
  const runtime = getStorefrontRuntime();
  const lifecycle = runtime.services.lifecycle;
  const orders = runtime.services.orders;
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const [rememberedOrderStatus] = useState(() =>
    readDeliveryStatusHandoff(orders),
  );
  const orderStatus = useActiveOrderStatus({ lifecycle, orders });

  useEffect(() => {
    if (rememberedOrderStatus) {
      clearDeliveryStatusHandoff(orders, rememberedOrderStatus);
    }
  }, [orders, rememberedOrderStatus]);

  return (
    <>
      <StatusBar style="dark" />
      <DeliveryStatusPresentation
        merchantHeaderState={merchantHeader.state}
        onOpenAccount={() => router.push('/account' as Href)}
        onRetry={() => {
          merchantHeader.retry();
          orderStatus.retry();
        }}
        state={toDeliveryStatusPresentationState(
          selectDeliveryStatusSourceState(
            orderStatus.state,
            rememberedOrderStatus,
          ),
        )}
      />
    </>
  );
}

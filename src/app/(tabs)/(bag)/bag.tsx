import { router, type Href } from 'expo-router';

import { BagPresentation, useBag } from '@/features/bag';

export default function BagRoute() {
  const { actions, checkoutLocked, state } = useBag();

  return (
    <BagPresentation
      checkoutEnabled={state.status === 'ready' && !checkoutLocked}
      checkoutLocked={checkoutLocked}
      onBrowseMenu={() => router.push('/menu' as Href)}
      onCheckout={
        checkoutLocked ? undefined : () => router.push('/checkout' as Href)
      }
      onClear={
        checkoutLocked ? undefined : () => router.push('/bag-clear' as Href)
      }
      onChangeFulfillment={
        checkoutLocked ? undefined : () => router.push('/fulfillment' as Href)
      }
      onRemoveItem={(itemId) => {
        if (!checkoutLocked && actions.selectItem(itemId)) {
          router.push('/bag-remove-item' as Href);
        }
      }}
      onRetry={actions.retry}
      onUpdateQuantity={(itemId, quantity) => {
        if (!checkoutLocked) void actions.updateQuantity(itemId, quantity);
      }}
      state={state}
    />
  );
}

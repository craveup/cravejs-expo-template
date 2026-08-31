import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  BagConfirmationPresentation,
  type BagConfirmationState,
  useBag,
} from '@/features/bag';

type ActionStatus =
  | 'idle'
  | 'pending'
  | 'retryable_error'
  | 'terminal_error';

function dismiss() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/bag' as Href);
  }
}

export default function BagClearRoute() {
  const { actions, state } = useBag();
  const [actionStatus, setActionStatus] = useState<ActionStatus>('idle');
  const bag =
    state.status === 'ready'
      ? state
      : state.status === 'updating' || state.status === 'error'
        ? state.previous
        : undefined;

  const confirmation: BagConfirmationState = bag
    ? {
        actionStatus,
        fulfillmentLabel: bag.fulfillmentLabel,
        items: bag.items,
        locationLabel: bag.locationLabel,
        ...(bag.merchantLogoUrl ? { merchantLogoUrl: bag.merchantLogoUrl } : {}),
        merchantName: bag.merchantName,
        status: 'ready',
        totalQuantity: bag.totalQuantity,
      }
    : {
        status:
          state.status === 'loading' || state.status === 'updating'
            ? 'loading'
            : 'unavailable',
      };

  const submit = useCallback(async () => {
    setActionStatus('pending');
    const outcome = await actions.clear();
    if (outcome === 'completed') {
      dismiss();
    } else if (outcome === 'refresh_required') {
      actions.reload();
      dismiss();
    } else if (outcome === 'retryable_error') {
      setActionStatus('retryable_error');
    } else {
      setActionStatus('terminal_error');
    }
  }, [actions]);

  return (
    <BagConfirmationPresentation
      kind="clear"
      onDismiss={dismiss}
      onSubmit={submit}
      state={confirmation}
    />
  );
}

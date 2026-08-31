import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

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

export default function BagRemoveItemRoute() {
  const { actions, selected, state } = useBag();
  const { clearSelection } = actions;
  const [actionStatus, setActionStatus] = useState<ActionStatus>('idle');
  const bag =
    state.status === 'ready'
      ? state
      : state.status === 'updating' || state.status === 'error'
        ? state.previous
        : undefined;
  const selectionMatches =
    bag &&
    selected &&
    selected.cartId === bag.cartId &&
    selected.revision === bag.revision;

  useEffect(
    () => () => {
      clearSelection();
    },
    [clearSelection],
  );

  const confirmation: BagConfirmationState = selectionMatches
    ? {
        actionStatus,
        fulfillmentLabel: bag.fulfillmentLabel,
        items: [selected.item],
        locationLabel: bag.locationLabel,
        ...(bag.merchantLogoUrl ? { merchantLogoUrl: bag.merchantLogoUrl } : {}),
        merchantName: bag.merchantName,
        status: 'ready',
        totalQuantity: selected.item.quantity,
      }
    : {
        status:
          state.status === 'loading' || state.status === 'updating'
            ? 'loading'
            : 'unavailable',
      };

  const submit = useCallback(async () => {
    setActionStatus('pending');
    const outcome = await actions.removeSelected();
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
      kind="remove"
      onDismiss={dismiss}
      onSubmit={selectionMatches ? submit : undefined}
      state={confirmation}
    />
  );
}

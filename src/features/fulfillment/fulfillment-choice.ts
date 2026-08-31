export const FULFILLMENT_PRESENTATION_CHOICES = ['pickup', 'delivery'] as const;

export type FulfillmentPresentationChoice =
  (typeof FULFILLMENT_PRESENTATION_CHOICES)[number];

export type PickupLocationPresentation = {
  address: string;
  locationName: string;
};

export type FulfillmentChoiceViewState = {
  actionLabel: 'Continue with pickup' | 'Enter delivery address';
  canContinue: boolean;
  deliveryDisabled: boolean;
  displayedChoice: FulfillmentPresentationChoice | undefined;
  interactionsDisabled: boolean;
};

export type DeliveryChoicePresentation =
  | { visible: false }
  | { supportingCopy: string; visible: true };

export function getDeliveryChoicePresentation(
  deliveryEntryEnabled: boolean,
  unavailableCopy?: string,
): DeliveryChoicePresentation {
  if (deliveryEntryEnabled) {
    return {
      supportingCopy: 'Enter an address to see if we reach you',
      visible: true,
    };
  }

  return unavailableCopy?.trim()
    ? { supportingCopy: unavailableCopy, visible: true }
    : { visible: false };
}

export function getFulfillmentChoiceViewState(
  selectedChoice: FulfillmentPresentationChoice,
  deliveryEntryEnabled: boolean,
  pending: boolean,
): FulfillmentChoiceViewState {
  const interactionsDisabled = pending;
  const deliveryDisabled = interactionsDisabled || !deliveryEntryEnabled;

  return {
    actionLabel:
      selectedChoice === 'pickup' ? 'Continue with pickup' : 'Enter delivery address',
    canContinue:
      !interactionsDisabled && (selectedChoice === 'pickup' || deliveryEntryEnabled),
    deliveryDisabled,
    displayedChoice:
      selectedChoice === 'delivery' && !deliveryEntryEnabled ? undefined : selectedChoice,
    interactionsDisabled,
  };
}

export function getSelectableFulfillmentChoice(
  requestedChoice: FulfillmentPresentationChoice,
  selectedChoice: FulfillmentPresentationChoice,
  deliveryEntryEnabled: boolean,
  pending: boolean,
): FulfillmentPresentationChoice | undefined {
  if (
    pending ||
    requestedChoice === selectedChoice ||
    (requestedChoice === 'delivery' && !deliveryEntryEnabled)
  ) {
    return undefined;
  }

  return requestedChoice;
}

export const STORE_CLOSED_SUPPORTING_COPY =
  'Choose a later pickup time or find another store.';

export type StoreClosedPresentation = {
  nextOrderingSlotLabel?: string;
  storeName: string;
  supportingCopy: typeof STORE_CLOSED_SUPPORTING_COPY;
};

export function getStoreClosedPresentation(
  storeName: string,
  nextOrderingSlotLabel?: string,
): StoreClosedPresentation {
  return {
    nextOrderingSlotLabel,
    storeName,
    supportingCopy: STORE_CLOSED_SUPPORTING_COPY,
  };
}

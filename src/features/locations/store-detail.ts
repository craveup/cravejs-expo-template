export type StoreDetailAction = 'directions' | 'share';

export function getStoreDetailActions(options: {
  canGetDirections: boolean;
  canShare: boolean;
}): StoreDetailAction[] {
  const actions: StoreDetailAction[] = [];
  if (options.canGetDirections) actions.push('directions');
  if (options.canShare) actions.push('share');
  return actions;
}

export function getFulfillmentSummary(methodLabels: readonly string[]): string {
  return methodLabels.join(' · ');
}

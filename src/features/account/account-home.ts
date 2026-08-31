export const ACCOUNT_ROW_IDS = [
  'orderHistory',
  'savedStores',
  'help',
] as const;

export type AccountRowId = (typeof ACCOUNT_ROW_IDS)[number];
export type AccountRowIconName = 'arrowBack' | 'arrowForward';

export type AccountActionAvailability = Partial<Record<AccountRowId, boolean>>;

export function getAccountRowIconName(
  direction: 'ltr' | 'rtl',
): AccountRowIconName {
  return direction === 'rtl' ? 'arrowBack' : 'arrowForward';
}

export function getVisibleAccountRows(availability: AccountActionAvailability): AccountRowId[] {
  return ACCOUNT_ROW_IDS.filter((row) => availability[row] === true);
}

export function getProfileInitials(displayName?: string): string {
  if (!displayName?.trim()) return '';
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

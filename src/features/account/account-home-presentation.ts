import type { LoyaltyLedger, MerchantLocation } from '@craveup/storefront-sdk';

import type { StorefrontCustomerContract } from '../auth/customer-auth-contract.ts';
import { getPointsBalance } from '../rewards/points-balance.ts';
import type {
  AccountProfilePresentation,
  LoyaltyPresentation,
  SavedStorePresentation,
} from './AccountHomeScreen.tsx';

function nonempty(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function toAccountProfilePresentation(
  profile: StorefrontCustomerContract,
): AccountProfilePresentation {
  const displayName = [nonempty(profile.customerName), nonempty(profile.lastName)]
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return Object.freeze({
    ...(displayName ? { displayName } : {}),
    ...(nonempty(profile.customerEmail)
      ? { email: nonempty(profile.customerEmail) }
      : {}),
    ...(nonempty(profile.phoneNumber)
      ? { phone: nonempty(profile.phoneNumber) }
      : {}),
  });
}

export function toAccountLoyaltyPresentation(
  ledger: LoyaltyLedger,
): LoyaltyPresentation | undefined {
  const pointsBalance = getPointsBalance(ledger);
  if (!pointsBalance) return undefined;

  const unitLabel = nonempty(pointsBalance.label) ?? pointsBalance.unit;
  return Object.freeze({
    balanceLabel: `${pointsBalance.available} ${unitLabel}`,
  });
}

export function toSavedStorePresentation(
  location: MerchantLocation,
): SavedStorePresentation {
  return Object.freeze({
    address: location.addressString,
    name: location.restaurantDisplayName,
  });
}

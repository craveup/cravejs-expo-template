import type { LoyaltyLedger } from '@craveup/storefront-sdk';

export type PointsBalance = Readonly<{
  available: number;
  label?: string;
  unit: string;
}>;

export function getPointsBalance(
  ledger: LoyaltyLedger,
): PointsBalance | undefined {
  if (!ledger.enabled) return undefined;

  const balance = ledger.balances?.find(
    (candidate) => candidate.unit.trim().toLowerCase() === 'points',
  );
  if (!balance || !Number.isFinite(balance.available)) return undefined;

  const label = balance.label?.trim();
  return Object.freeze({
    available: balance.available,
    ...(label ? { label } : {}),
    unit: balance.unit,
  });
}

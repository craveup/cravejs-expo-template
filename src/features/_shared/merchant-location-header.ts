import type { StorefrontShellSnapshot } from '../../lib/storefront-bootstrap-service.ts';

export type MerchantLocationHeaderState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{
      locationAddress: string;
      locationName: string;
      merchantLogoUrl?: string;
      merchantName: string;
      status: 'ready';
    }>;

function requiredLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.trim();
  return label.length > 0 && label.length <= 300 ? label : undefined;
}

function optionalHttpsUrl(value: unknown): string | undefined | false {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value !== value.trim()) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : false;
  } catch {
    return false;
  }
}

export function toMerchantLocationHeaderState(
  source: StorefrontShellSnapshot,
): MerchantLocationHeaderState {
  const merchantName = requiredLabel(source.merchant.name);
  const locationName = requiredLabel(source.location.restaurantDisplayName);
  const locationAddress = requiredLabel(source.location.addressString);
  const merchantLogoUrl = optionalHttpsUrl(
    source.merchant.logo || source.location.restaurantLogo,
  );

  if (!merchantName || !locationName || !locationAddress || merchantLogoUrl === false) {
    return Object.freeze({ status: 'unavailable' });
  }

  return Object.freeze({
    locationAddress,
    locationName,
    ...(merchantLogoUrl ? { merchantLogoUrl } : {}),
    merchantName,
    status: 'ready',
  });
}

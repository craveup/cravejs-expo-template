import type {
  CustomerAddressInput,
  DeliveryAddress,
  SupportedCountry,
} from '@craveup/storefront-sdk';

import type {
  AddressCandidatePresentation,
  LocationPermissionPresentation,
} from './address-entry.ts';

export type NativeAddressFields = Readonly<{
  city: string | null;
  country: string | null;
  district: string | null;
  formattedAddress: string | null;
  isoCountryCode: string | null;
  name: string | null;
  postalCode: string | null;
  region: string | null;
  street: string | null;
  streetNumber: string | null;
  subregion: string | null;
}>;

export type AddressCandidateData = AddressCandidatePresentation &
  Readonly<{
    cartAddress: DeliveryAddress;
    customerAddressInput: CustomerAddressInput;
  }>;

const COUNTRY_BY_ISO_CODE: Readonly<Record<string, SupportedCountry>> = {
  AE: 'United Arab Emirates',
  AU: 'Australia',
  GB: 'United Kingdom',
  US: 'United States',
};

const SUPPORTED_COUNTRIES = new Set<SupportedCountry>(
  Object.values(COUNTRY_BY_ISO_CODE),
);

export function requiresForegroundPermissionForGeocoding(
  platform: string,
): boolean {
  return platform === 'android';
}

function bounded(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= 500 ? normalized : undefined;
}

function supportedCountry(
  isoCountryCode: string | null,
  country: string | null,
): SupportedCountry | undefined {
  const fromCode = isoCountryCode
    ? COUNTRY_BY_ISO_CODE[isoCountryCode.trim().toUpperCase()]
    : undefined;
  if (fromCode) return fromCode;

  const normalizedCountry = bounded(country);
  return normalizedCountry &&
    SUPPORTED_COUNTRIES.has(normalizedCountry as SupportedCountry)
    ? (normalizedCountry as SupportedCountry)
    : undefined;
}

function isCoordinate(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function toAddressCandidate(
  candidateId: string,
  coordinates: Readonly<{ latitude: number; longitude: number }>,
  address: NativeAddressFields,
): AddressCandidateData | undefined {
  const street = bounded(address.street);
  const streetNumber = bounded(address.streetNumber);
  const city = bounded(address.city);
  const state = bounded(address.region);
  const zipCode = bounded(address.postalCode);
  const country = supportedCountry(address.isoCountryCode, address.country);
  const id = candidateId.trim();

  if (
    !id ||
    id.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(id) ||
    !street ||
    !city ||
    !state ||
    !zipCode ||
    !country ||
    !isCoordinate(coordinates.latitude, -90, 90) ||
    !isCoordinate(coordinates.longitude, -180, 180)
  ) {
    return undefined;
  }

  const line1 = [streetNumber, street].filter(Boolean).join(' ');
  const line2 = bounded(address.district) ?? bounded(address.subregion);
  const fullAddress =
    bounded(address.formattedAddress) ??
    [line1, city, state, zipCode, country].join(', ');
  const secondaryLabel = [city, `${state} ${zipCode}`].join(', ');

  return Object.freeze({
    cartAddress: Object.freeze({
      city,
      country,
      lat: coordinates.latitude,
      lng: coordinates.longitude,
      state,
      street: line1,
      zipCode,
    }),
    customerAddressInput: Object.freeze({
      fullAddress,
      lat: coordinates.latitude,
      line1,
      ...(line2 ? { line2 } : {}),
      lng: coordinates.longitude,
    }),
    id,
    primaryLabel: line1,
    secondaryLabel,
  });
}

export function toLocationPermissionPresentation(
  status: 'denied' | 'granted' | 'undetermined',
  canAskAgain: boolean,
): LocationPermissionPresentation {
  if (status === 'granted') return 'granted';
  return status === 'undetermined' || canAskAgain ? 'prompt' : 'denied';
}

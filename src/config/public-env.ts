import { normalizeMerchantSlug } from '../domain/storefront/merchant-scope.ts';

export type PublicEnvironmentInput = Readonly<{
  EXPO_PUBLIC_CRAVEUP_API_URL?: string;
  EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN?: string;
  EXPO_PUBLIC_CRAVEUP_LOCATION_ID?: string;
  EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG?: string;
  EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?: string;
  EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?: string;
}>;

export type PublicEnvironmentField = keyof PublicEnvironmentInput;

export type PublicStorefrontScopeInput = Pick<
  PublicEnvironmentInput,
  | 'EXPO_PUBLIC_CRAVEUP_API_URL'
  | 'EXPO_PUBLIC_CRAVEUP_LOCATION_ID'
  | 'EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG'
>;

export type PublicStorefrontScope = Readonly<{
  apiOrigin: string;
  environmentNamespace: string;
  locationId: string;
  merchantSlug: string;
}>;

export type PublicEnvironmentConfig = Readonly<{
  apiOrigin: string;
  checkoutOrigin: string;
  environmentNamespace: string;
  locationId: string;
  maps: Readonly<{
    androidApiKey?: string;
    iosApiKey?: string;
  }>;
  merchantSlug: string;
}>;

export class PublicEnvironmentConfigError extends Error {
  readonly field: PublicEnvironmentField;

  constructor(field: PublicEnvironmentField, reason: string) {
    super(`Invalid public configuration for ${field}: ${reason}`);
    this.name = 'PublicEnvironmentConfigError';
    this.field = field;
  }
}

function invalid(
  field: PublicEnvironmentField,
  reason: string,
): PublicEnvironmentConfigError {
  return new PublicEnvironmentConfigError(field, reason);
}

function requiredValue(
  input: PublicEnvironmentInput,
  field: PublicEnvironmentField,
): string {
  const value = input[field]?.trim();

  if (!value) {
    throw invalid(field, 'a non-empty value is required');
  }

  return value;
}

function optionalToken(
  input: PublicEnvironmentInput,
  field:
    | 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY'
    | 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY',
): string | undefined {
  const value = input[field]?.trim();

  if (!value) return undefined;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalid(field, 'must be a restricted native public key');
  }

  return value;
}

const DNS_LABEL_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeOriginHostname(hostname: string): string | undefined {
  const normalized = hostname.toLowerCase();

  if (normalized.length < 1 || normalized.length > 253) return undefined;

  const labels = normalized.split('.');

  if (labels.every((label) => /^\d+$/.test(label))) {
    if (labels.length !== 4) return undefined;

    const octets = labels.map(Number);

    if (octets.some((octet) => octet < 0 || octet > 255)) return undefined;

    return octets.join('.');
  }

  if (!labels.every((label) => DNS_LABEL_PATTERN.test(label))) {
    return undefined;
  }

  return normalized;
}

function canonicalizeHttpsOriginValue(
  value: string,
  field: PublicEnvironmentField,
): string {
  const match = /^https:\/\/([^/?#]+)\/?$/i.exec(value);

  if (!match) {
    throw invalid(field, 'must be an absolute HTTPS origin');
  }

  const authority = match[1]!;
  const separator = authority.lastIndexOf(':');
  const hasPort = separator >= 0;
  const hostnameInput = hasPort ? authority.slice(0, separator) : authority;
  const portInput = hasPort ? authority.slice(separator + 1) : '';
  const hostname = normalizeOriginHostname(hostnameInput);

  if (!hostname || hostnameInput.includes(':') || hostnameInput.includes('@')) {
    throw invalid(field, 'must be an absolute HTTPS origin without credentials or a path');
  }

  let port = '';

  if (hasPort) {
    if (!/^\d{1,5}$/.test(portInput)) {
      throw invalid(field, 'must contain a valid HTTPS port');
    }

    const portNumber = Number(portInput);

    if (portNumber < 1 || portNumber > 65_535) {
      throw invalid(field, 'must contain a valid HTTPS port');
    }

    if (portNumber !== 443) port = `:${portNumber}`;
  }

  return `https://${hostname}${port}`;
}

function canonicalizeApiOrigin(input: PublicEnvironmentInput): string {
  const field = 'EXPO_PUBLIC_CRAVEUP_API_URL';

  return canonicalizeHttpsOriginValue(requiredValue(input, field), field);
}

function parseCheckoutOrigin(input: PublicEnvironmentInput): string {
  const field = 'EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN';
  const suppliedValue = input[field];

  if (!suppliedValue?.trim()) {
    throw invalid(field, 'a non-empty value is required');
  }
  if (suppliedValue !== suppliedValue.trim()) {
    throw invalid(field, 'must not contain leading or trailing whitespace');
  }

  const canonicalOrigin = canonicalizeHttpsOriginValue(suppliedValue, field);

  if (canonicalOrigin !== suppliedValue) {
    throw invalid(field, 'must be supplied as its exact canonical HTTPS origin');
  }

  return canonicalOrigin;
}

function deriveEnvironmentNamespace(apiOrigin: string): string {
  let hash = 0xcbf29ce484222325n;

  for (let index = 0; index < apiOrigin.length; index += 1) {
    hash ^= BigInt(apiOrigin.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return `env-${hash.toString(16).padStart(16, '0')}`;
}

function parseMerchantSlug(input: PublicEnvironmentInput): string {
  const field = 'EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG';
  const result = normalizeMerchantSlug(requiredValue(input, field));

  if (!result.ok) {
    throw invalid(field, 'must match the published merchant-slug contract');
  }

  return result.value;
}

function parseLocationId(input: PublicEnvironmentInput): string {
  const field = 'EXPO_PUBLIC_CRAVEUP_LOCATION_ID';
  const value = requiredValue(input, field);

  if (!/^[a-f0-9]{24}$/.test(value)) {
    throw invalid(field, 'must be the published 24-character hexadecimal location ID');
  }

  return value;
}

function parseMapsConfig(
  input: PublicEnvironmentInput,
): PublicEnvironmentConfig['maps'] {
  const androidApiKey = optionalToken(
    input,
    'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
  );
  const iosApiKey = optionalToken(input, 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY');

  if (androidApiKey && iosApiKey && androidApiKey === iosApiKey) {
    throw invalid(
      'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
      'must be different from the iOS application-restricted key',
    );
  }

  return Object.freeze({
    ...(androidApiKey ? { androidApiKey } : {}),
    ...(iosApiKey ? { iosApiKey } : {}),
  });
}

export function parsePublicEnvironment(
  input: PublicEnvironmentInput,
): PublicEnvironmentConfig {
  const scope = parsePublicStorefrontScope(input);

  return Object.freeze({
    ...scope,
    checkoutOrigin: parseCheckoutOrigin(input),
    maps: parseMapsConfig(input),
  });
}

export function parsePublicStorefrontScope(
  input: PublicStorefrontScopeInput,
): PublicStorefrontScope {
  const apiOrigin = canonicalizeApiOrigin(input);

  return Object.freeze({
    apiOrigin,
    environmentNamespace: deriveEnvironmentNamespace(apiOrigin),
    locationId: parseLocationId(input),
    merchantSlug: parseMerchantSlug(input),
  });
}

export function readPublicEnvironment(): PublicEnvironmentConfig {
  return parsePublicEnvironment({
    EXPO_PUBLIC_CRAVEUP_API_URL: process.env.EXPO_PUBLIC_CRAVEUP_API_URL,
    EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN:
      process.env.EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN,
    EXPO_PUBLIC_CRAVEUP_LOCATION_ID: process.env.EXPO_PUBLIC_CRAVEUP_LOCATION_ID,
    EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: process.env.EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG,
    EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
    EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY,
  });
}

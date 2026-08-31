import { normalizeMerchantSlug } from '../domain/storefront/merchant-scope.ts';

export type StorefrontSessionScope = Readonly<{
  environmentNamespace: string;
  locationId: string;
  merchantSlug: string;
}>;

export type StorefrontSessionContractField =
  | 'accessToken'
  | 'addressId'
  | 'cartId'
  | 'environmentNamespace'
  | 'idempotencyKey'
  | 'itemId'
  | 'locationId'
  | 'merchantSlug'
  | 'orderId'
  | 'productId'
  | 'paymentId'
  | 'receiptId'
  | 'rewardId'
  | 'receiptToken'
  | 'revision'
  | 'token';

export class StorefrontSessionContractError extends Error {
  readonly field: StorefrontSessionContractField;

  constructor(field: StorefrontSessionContractField, reason: string) {
    super(`Invalid Storefront session ${field}: ${reason}`);
    this.name = 'StorefrontSessionContractError';
    this.field = field;
  }
}

const ENVIRONMENT_NAMESPACE_PATTERN = /^env-[a-f0-9]{16}$/;
const LOCATION_ID_PATTERN = /^[a-f0-9]{24}$/;
const SAFE_RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function invalid(
  field: StorefrontSessionContractField,
  reason: string,
): StorefrontSessionContractError {
  return new StorefrontSessionContractError(field, reason);
}

export function createStorefrontSessionScope(
  input: StorefrontSessionScope,
): StorefrontSessionScope {
  if (!ENVIRONMENT_NAMESPACE_PATTERN.test(input.environmentNamespace)) {
    throw invalid(
      'environmentNamespace',
      'must be the canonical public-environment namespace',
    );
  }

  const merchant = normalizeMerchantSlug(input.merchantSlug);

  if (!merchant.ok || merchant.value !== input.merchantSlug) {
    throw invalid('merchantSlug', 'must be a canonical merchant slug');
  }

  if (!LOCATION_ID_PATTERN.test(input.locationId)) {
    throw invalid('locationId', 'must be a canonical location identifier');
  }

  return Object.freeze({
    environmentNamespace: input.environmentNamespace,
    locationId: input.locationId,
    merchantSlug: merchant.value,
  });
}

export function assertSafeStorefrontResourceId(
  value: string,
  field:
    | 'addressId'
    | 'cartId'
    | 'itemId'
    | 'orderId'
    | 'paymentId'
    | 'productId'
    | 'receiptId'
    | 'rewardId',
): string {
  if (!SAFE_RESOURCE_ID_PATTERN.test(value)) {
    throw invalid(field, 'must be a SecureStore-safe opaque identifier');
  }

  return value;
}

export function assertSafeIdempotencyKey(value: string): string {
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw invalid(
      'idempotencyKey',
      'must be a bounded caller-stable opaque identifier',
    );
  }

  return value;
}

export function assertStorefrontSecret(
  value: string,
  field: 'accessToken' | 'receiptToken' | 'token',
  maximumLength = 8_192,
): string {
  if (
    value.length < 1 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw invalid(field, 'must be a bounded opaque value');
  }

  return value;
}

export function assertCartRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw invalid('revision', 'must be a non-negative safe integer');
  }

  return revision;
}

export function cartSessionKey(scope: StorefrontSessionScope): string {
  return `storefront.cart.v1.${scope.environmentNamespace}.${scope.merchantSlug}.${scope.locationId}`;
}

export function customerSessionKey(scope: StorefrontSessionScope): string {
  return `storefront.customer.v1.${scope.environmentNamespace}.${scope.merchantSlug}`;
}

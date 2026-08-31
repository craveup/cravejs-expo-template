import type {
  CursorPage,
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressUpdate,
  SavedPaymentMethod,
} from '@craveup/storefront-sdk';

import type { CustomerSessionStore } from '../../lib/customer-session.ts';
import {
  mapCustomerRequestFailure,
  type CustomerAuthenticationFailureHandler,
} from '../../lib/customer-request-failure.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import {
  isValidStorefrontCursor,
  isValidStorefrontPageLimit,
} from '../../lib/storefront-pagination.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import {
  assertCartRevision,
  assertSafeIdempotencyKey,
  assertSafeStorefrontResourceId,
} from '../../lib/storefront-session-scope.ts';

export type CustomerAccountClient = Readonly<{
  addresses: Pick<
    StorefrontClient['customer']['addresses'],
    'create' | 'delete' | 'list' | 'update'
  >;
  savedPayments: Pick<
    StorefrontClient['customer']['savedPayments'],
    'delete' | 'list'
  >;
}>;

export type CustomerAccountResult<T> =
  | Readonly<{ data: T; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export interface CustomerAccountService {
  createAddress(
    input: CustomerAddressInput,
    idempotencyKey: string,
  ): Promise<CustomerAccountResult<CustomerAddress>>;
  deleteAddress(
    addressId: string,
    idempotencyKey: string,
  ): Promise<CustomerAccountResult<{ addressId: string; success: true }>>;
  deleteSavedPayment(
    paymentId: string,
  ): Promise<CustomerAccountResult<{ success: true }>>;
  listAddresses(params?: Readonly<{
    cursor?: string;
    limit?: number;
  }>): Promise<CustomerAccountResult<CursorPage<CustomerAddress>>>;
  listSavedPayments(): Promise<CustomerAccountResult<SavedPaymentMethod[]>>;
  updateAddress(
    addressId: string,
    input: CustomerAddressUpdate,
    revision: number,
    idempotencyKey: string,
  ): Promise<CustomerAccountResult<CustomerAddress>>;
}

const INVALID_INPUT_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CLIENT_VALIDATION_ERROR',
  kind: 'invalid_request',
  retryable: false,
});

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

function isBoundedText(value: unknown, required: boolean): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 500 &&
    value === value.trim() &&
    (!required || value.length >= 1)
  );
}

function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isAddressInput(value: unknown, partial: boolean): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const allowed = new Set(['fullAddress', 'lat', 'line1', 'line2', 'line3', 'lng']);
  const keys = Object.keys(record);

  if (keys.length < 1 || keys.some((key) => !allowed.has(key))) return false;
  if (!partial && !['fullAddress', 'lat', 'line1', 'lng'].every((key) => key in record)) {
    return false;
  }
  if ('fullAddress' in record && !isBoundedText(record.fullAddress, true)) return false;
  if ('line1' in record && !isBoundedText(record.line1, true)) return false;
  if ('line2' in record && !isBoundedText(record.line2, false)) return false;
  if ('line3' in record && !isBoundedText(record.line3, false)) return false;
  if ('lat' in record && !isLatitude(record.lat)) return false;
  if ('lng' in record && !isLongitude(record.lng)) return false;

  return true;
}

function projectAddress(value: unknown): CustomerAddress | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const input = {
    fullAddress: Reflect.get(value, 'fullAddress'),
    lat: Reflect.get(value, 'lat'),
    line1: Reflect.get(value, 'line1'),
    line2: Reflect.get(value, 'line2'),
    line3: Reflect.get(value, 'line3'),
    lng: Reflect.get(value, 'lng'),
  };
  const addressId = Reflect.get(value, 'addressId');
  const revision = Reflect.get(value, 'revision');

  try {
    if (
      !isAddressInput(input, false) ||
      typeof input.fullAddress !== 'string' ||
      typeof input.line1 !== 'string' ||
      typeof input.line2 !== 'string' ||
      typeof input.line3 !== 'string' ||
      typeof input.lat !== 'number' ||
      typeof input.lng !== 'number' ||
      typeof addressId !== 'string' ||
      typeof revision !== 'number'
    ) {
      return undefined;
    }
    const createdAt = Reflect.get(value, 'createdAt');
    if (!isBoundedText(createdAt, true)) return undefined;

    return Object.freeze({
      addressId: assertSafeStorefrontResourceId(addressId, 'addressId'),
      createdAt,
      fullAddress: input.fullAddress,
      lat: input.lat,
      line1: input.line1,
      line2: input.line2,
      line3: input.line3,
      lng: input.lng,
      revision: assertCartRevision(revision),
    });
  } catch {
    return undefined;
  }
}

function projectAddressPage(
  value: unknown,
): CursorPage<CustomerAddress> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const items = Reflect.get(value, 'items');
  const nextCursor = Reflect.get(value, 'nextCursor');
  if (
    !Array.isArray(items) ||
    items.length > 100 ||
    (nextCursor !== null && !isValidStorefrontCursor(nextCursor))
  ) {
    return undefined;
  }
  const projected = items.map(projectAddress);
  if (projected.some((item) => item === undefined)) return undefined;

  return Object.freeze({
    items: projected as CustomerAddress[],
    nextCursor,
  });
}

function projectSavedPayment(value: unknown): SavedPaymentMethod | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const id = Reflect.get(value, 'id');
  const brand = Reflect.get(value, 'brand');
  const displayBrand = Reflect.get(value, 'displayBrand');
  const last4 = Reflect.get(value, 'last4');
  const expMonth = Reflect.get(value, 'expMonth');
  const expYear = Reflect.get(value, 'expYear');

  try {
    if (
      typeof id !== 'string' ||
      !isBoundedText(brand, true) ||
      !isBoundedText(displayBrand, true) ||
      typeof last4 !== 'string' ||
      !/^\d{4}$/.test(last4) ||
      !Number.isInteger(expMonth) ||
      typeof expMonth !== 'number' ||
      expMonth < 1 ||
      expMonth > 12 ||
      !Number.isInteger(expYear) ||
      typeof expYear !== 'number' ||
      expYear < 2000 ||
      expYear > 9999
    ) {
      return undefined;
    }

    return Object.freeze({
      brand,
      displayBrand,
      expMonth,
      expYear,
      id: assertSafeStorefrontResourceId(id, 'paymentId'),
      last4,
    });
  } catch {
    return undefined;
  }
}

export function createCustomerAccountService(
  client: CustomerAccountClient,
  sessions: CustomerSessionStore,
  onAuthenticationFailure?: CustomerAuthenticationFailureHandler,
): CustomerAccountService {
  return Object.freeze({
    async createAddress(
      input: CustomerAddressInput,
      idempotencyKeyInput: string,
    ): Promise<CustomerAccountResult<CustomerAddress>> {
      let idempotencyKey: string;

      try {
        idempotencyKey = assertSafeIdempotencyKey(idempotencyKeyInput);
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }
      if (!isAddressInput(input, false)) {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const address = projectAddress(
          await client.addresses.create(input, { idempotencyKey }),
        );
        return address
          ? Object.freeze({ data: address, kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            sessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
    async deleteAddress(
      addressIdInput: string,
      idempotencyKeyInput: string,
    ): Promise<CustomerAccountResult<{ addressId: string; success: true }>> {
      let addressId: string;
      let idempotencyKey: string;

      try {
        addressId = assertSafeStorefrontResourceId(addressIdInput, 'addressId');
        idempotencyKey = assertSafeIdempotencyKey(idempotencyKeyInput);
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const response = await client.addresses.delete(addressId, { idempotencyKey });
        return response.success === true && response.addressId === addressId
          ? Object.freeze({
              data: Object.freeze({ addressId, success: true as const }),
              kind: 'ready',
            })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            sessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
    async deleteSavedPayment(
      paymentIdInput: string,
    ): Promise<CustomerAccountResult<{ success: true }>> {
      let paymentId: string;

      try {
        paymentId = assertSafeStorefrontResourceId(paymentIdInput, 'paymentId');
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const response = await client.savedPayments.delete(paymentId);
        return response.success === true
          ? Object.freeze({
              data: Object.freeze({ success: true as const }),
              kind: 'ready',
            })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            sessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
    async listAddresses(
      params: Readonly<{ cursor?: string; limit?: number }> = {},
    ): Promise<CustomerAccountResult<CursorPage<CustomerAddress>>> {
      if (
        (params.cursor !== undefined &&
          !isValidStorefrontCursor(params.cursor)) ||
        (params.limit !== undefined &&
          !isValidStorefrontPageLimit(params.limit))
      ) {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const page = projectAddressPage(await client.addresses.list(params));
        return page
          ? Object.freeze({ data: page, kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            sessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
    async listSavedPayments(): Promise<CustomerAccountResult<SavedPaymentMethod[]>> {
      try {
        const response = await client.savedPayments.list();
        const payments = Array.isArray(response)
          ? response.map(projectSavedPayment)
          : [];
        return Array.isArray(response) &&
          response.length <= 100 &&
          payments.every((payment) => payment !== undefined)
          ? Object.freeze({ data: payments as SavedPaymentMethod[], kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            sessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
    async updateAddress(
      addressIdInput: string,
      input: CustomerAddressUpdate,
      revisionInput: number,
      idempotencyKeyInput: string,
    ): Promise<CustomerAccountResult<CustomerAddress>> {
      let addressId: string;
      let idempotencyKey: string;
      let revision: number;

      try {
        addressId = assertSafeStorefrontResourceId(addressIdInput, 'addressId');
        idempotencyKey = assertSafeIdempotencyKey(idempotencyKeyInput);
        revision = assertCartRevision(revisionInput);
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }
      if (!isAddressInput(input, true)) {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const address = projectAddress(
          await client.addresses.update(addressId, input, {
            idempotencyKey,
            revision,
          }),
        );
        return address && address.addressId === addressId
          ? Object.freeze({ data: address, kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            sessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
  });
}

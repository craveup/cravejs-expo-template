import type {
  CursorPage,
  OrderResult,
  PublicOrderDetail,
  PublicOrderSummary,
} from '@craveup/storefront-sdk';

import type { StorefrontCartSessionStore } from '../../lib/cart-session.ts';
import type { CustomerSessionStore } from '../../lib/customer-session.ts';
import {
  mapCustomerRequestFailure,
  SECURE_STORAGE_FAILURE,
  type CustomerAuthenticationFailureHandler,
} from '../../lib/customer-request-failure.ts';
import type { ReceiptSessionStore } from '../../lib/receipt-session.ts';
import {
  isSafeStorefrontCode,
  mapStorefrontError,
  type StorefrontFailure,
} from '../../lib/storefront-errors.ts';
import {
  isValidStorefrontCursor,
  isValidStorefrontPageLimit,
} from '../../lib/storefront-pagination.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import { assertSafeStorefrontResourceId } from '../../lib/storefront-session-scope.ts';

export type OrderAccessClient = Readonly<{
  checkout: Pick<StorefrontClient['checkout'], 'getOrderResult'>;
  customer: Readonly<{
    orders: Pick<StorefrontClient['customer']['orders'], 'get' | 'list'>;
  }>;
  receipts: Pick<StorefrontClient['receipts'], 'get'>;
}>;

export type OrderAccessResult<T> =
  | Readonly<{
      cleanupFailure?: StorefrontFailure;
      data: T;
      kind: 'ready';
    }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export interface OrderAccessService {
  captureReceiptCapability(receiptId: string, receiptToken: string): boolean;
  getActiveResult(cartId: string): Promise<OrderAccessResult<OrderResult>>;
  getOrder(orderId: string): Promise<OrderAccessResult<PublicOrderDetail>>;
  getReceipt(receiptId: string): Promise<OrderAccessResult<PublicOrderDetail>>;
  listOrders(params?: Readonly<{
    cursor?: string;
    limit?: number;
  }>): Promise<OrderAccessResult<CursorPage<PublicOrderSummary>>>;
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

const MAX_ORDER_PAGE_ITEMS = 100;
const MAX_ORDER_ITEMS = 500;
const MAX_ORDER_MODIFIERS = 500;
const MAX_FULFILLMENT_DETAIL_LENGTH = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maximum &&
    (allowEmpty || value.trim().length > 0) &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isSafeResourceId(
  value: unknown,
  field: Parameters<typeof assertSafeStorefrontResourceId>[1],
): value is string {
  if (typeof value !== 'string') return false;
  try {
    assertSafeStorefrontResourceId(value, field);
    return true;
  } catch {
    return false;
  }
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function projectOrderModifier(
  value: unknown,
): PublicOrderDetail['items'][number]['modifiers'][number] | undefined {
  if (
    !isObject(value) ||
    !isBoundedString(value.groupName, 500) ||
    !isBoundedString(value.name, 500) ||
    !isBoundedInteger(value.quantity, 1, 1_000) ||
    !isBoundedString(value.price, 100)
  ) {
    return undefined;
  }

  return Object.freeze({
    groupName: value.groupName,
    name: value.name,
    price: value.price,
    quantity: value.quantity,
  });
}

function projectOrderItem(
  value: unknown,
): PublicOrderDetail['items'][number] | undefined {
  if (
    !isObject(value) ||
    !isBoundedString(value.id, 128) ||
    !isBoundedString(value.name, 500) ||
    !isBoundedInteger(value.quantity, 1, 1_000) ||
    !isBoundedString(value.price, 100) ||
    !isBoundedString(value.total, 100) ||
    !isBoundedString(value.discount, 100) ||
    !isBoundedString(value.specialInstructions, 5_000, true) ||
    !Array.isArray(value.modifiers) ||
    value.modifiers.length > MAX_ORDER_MODIFIERS
  ) {
    return undefined;
  }

  const modifiers = value.modifiers.map(projectOrderModifier);
  if (modifiers.some((modifier) => modifier === undefined)) return undefined;

  return Object.freeze({
    discount: value.discount,
    id: value.id,
    modifiers: Object.freeze(modifiers) as PublicOrderDetail['items'][number]['modifiers'],
    name: value.name,
    price: value.price,
    quantity: value.quantity,
    specialInstructions: value.specialInstructions,
    total: value.total,
  });
}

function hasBoundedStringFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => isBoundedString(value[field], 100));
}

function hasOptionalBoundedString(
  value: Record<string, unknown>,
  field: string,
): boolean {
  return (
    !Object.hasOwn(value, field) ||
    isBoundedString(value[field], MAX_FULFILLMENT_DETAIL_LENGTH, true)
  );
}

function projectDeliveryInfo(
  value: unknown,
): PublicOrderDetail['deliveryInfo'] | undefined {
  if (value === null) return null;
  if (!isObject(value) || !hasOptionalBoundedString(value, 'deliveryAddress')) {
    return undefined;
  }
  return Object.freeze({
    ...(Object.hasOwn(value, 'deliveryAddress')
      ? { deliveryAddress: value.deliveryAddress as string }
      : {}),
  });
}

function projectRoomServiceInfo(
  value: unknown,
): PublicOrderDetail['roomServiceInfo'] | undefined {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !hasOptionalBoundedString(value, 'lastName') ||
    !hasOptionalBoundedString(value, 'roomNumber')
  ) {
    return undefined;
  }
  return Object.freeze({
    ...(Object.hasOwn(value, 'lastName')
      ? { lastName: value.lastName as string }
      : {}),
    ...(Object.hasOwn(value, 'roomNumber')
      ? { roomNumber: value.roomNumber as string }
      : {}),
  });
}

function projectTableServiceInfo(
  value: unknown,
): PublicOrderDetail['tableServiceInfo'] | undefined {
  if (value === null) return null;
  if (!isObject(value) || !hasOptionalBoundedString(value, 'tableNumber')) {
    return undefined;
  }
  return Object.freeze({
    ...(Object.hasOwn(value, 'tableNumber')
      ? { tableNumber: value.tableNumber as string }
      : {}),
  });
}

function isNullablePaymentString(value: unknown): boolean {
  return value === null || isBoundedString(value, 100);
}

function projectOrderPayment(
  value: unknown,
): PublicOrderDetail['payment'] | undefined {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !Object.hasOwn(value, 'cardLast4') ||
    !isNullablePaymentString(value.cardLast4) ||
    !Object.hasOwn(value, 'walletType') ||
    !isNullablePaymentString(value.walletType) ||
    !Object.hasOwn(value, 'cardBrand') ||
    !isNullablePaymentString(value.cardBrand)
  ) {
    return undefined;
  }
  return Object.freeze({
    cardBrand: value.cardBrand as string | null,
    cardLast4: value.cardLast4 as string | null,
    walletType: value.walletType as string | null,
  });
}

function projectOrderPricing(
  value: unknown,
): PublicOrderDetail['pricing'] | undefined {
  const fields = [
    'subtotal',
    'discount',
    'tax',
    'tip',
    'serviceFee',
    'fulfillmentFee',
    'enterpriseFee',
    'total',
    'refunded',
    'netPaid',
  ] as const;

  if (!isObject(value) || !hasBoundedStringFields(value, fields)) {
    return undefined;
  }

  return Object.freeze({
    discount: value.discount as string,
    enterpriseFee: value.enterpriseFee as string,
    fulfillmentFee: value.fulfillmentFee as string,
    netPaid: value.netPaid as string,
    refunded: value.refunded as string,
    serviceFee: value.serviceFee as string,
    subtotal: value.subtotal as string,
    tax: value.tax as string,
    tip: value.tip as string,
    total: value.total as string,
  });
}

function projectOrderSummary(value: unknown): PublicOrderSummary | undefined {
  if (
    !isObject(value) ||
    !isSafeResourceId(value.id, 'orderId') ||
    !isBoundedString(value.shortId, 128) ||
    !isBoundedString(value.restaurantDisplayName, 500) ||
    !isBoundedString(value.fulfillmentMethod, 100) ||
    !isBoundedString(value.fulfillmentIdentifier, 500, true) ||
    !isBoundedString(value.pickupType, 100) ||
    !isBoundedString(value.orderTime, 256) ||
    !isBoundedString(value.orderDate, 256) ||
    !isBoundedInteger(value.totalQuantity, 0, 10_000) ||
    typeof value.currency !== 'string' ||
    !/^[A-Za-z]{3}$/.test(value.currency) ||
    !isBoundedString(value.orderTotal, 100) ||
    !isBoundedString(value.status, 100) ||
    !isBoundedString(value.createdAt, 100)
  ) {
    return undefined;
  }

  return Object.freeze({
    createdAt: value.createdAt,
    currency: value.currency,
    fulfillmentIdentifier: value.fulfillmentIdentifier,
    fulfillmentMethod: value.fulfillmentMethod,
    id: value.id,
    orderDate: value.orderDate,
    orderTime: value.orderTime,
    orderTotal: value.orderTotal,
    pickupType: value.pickupType,
    restaurantDisplayName: value.restaurantDisplayName,
    shortId: value.shortId,
    status: value.status,
    totalQuantity: value.totalQuantity,
  });
}

function projectOrderDetail(value: unknown): PublicOrderDetail | undefined {
  const summary = projectOrderSummary(value);
  if (
    !summary ||
    !isObject(value) ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_ORDER_ITEMS
  ) {
    return undefined;
  }

  const items = value.items.map(projectOrderItem);
  const pricing = projectOrderPricing(value.pricing);
  const deliveryInfo = projectDeliveryInfo(value.deliveryInfo);
  const roomServiceInfo = projectRoomServiceInfo(value.roomServiceInfo);
  const tableServiceInfo = projectTableServiceInfo(value.tableServiceInfo);
  const payment = projectOrderPayment(value.payment);

  if (
    typeof value.partiallyRefunded !== 'boolean' ||
    items.some((item) => item === undefined) ||
    !pricing ||
    deliveryInfo === undefined ||
    roomServiceInfo === undefined ||
    tableServiceInfo === undefined ||
    payment === undefined ||
    (value.updatedAt !== null && !isBoundedString(value.updatedAt, 100))
  ) {
    return undefined;
  }

  return Object.freeze({
    ...summary,
    deliveryInfo,
    items: Object.freeze(items) as PublicOrderDetail['items'],
    partiallyRefunded: value.partiallyRefunded,
    payment,
    pricing,
    roomServiceInfo,
    tableServiceInfo,
    updatedAt: value.updatedAt,
  });
}

function projectOrderPage(
  value: unknown,
): CursorPage<PublicOrderSummary> | undefined {
  if (
    !isObject(value) ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_ORDER_PAGE_ITEMS
  ) {
    return undefined;
  }
  const items = value.items.map(projectOrderSummary);
  const nextCursor = value.nextCursor;

  if (
    items.some((item) => item === undefined) ||
    (nextCursor !== null && !isValidStorefrontCursor(nextCursor))
  ) {
    return undefined;
  }

  return Object.freeze({
    items: Object.freeze(items) as PublicOrderSummary[],
    nextCursor,
  });
}

function projectOrderResult(value: unknown): OrderResult | undefined {
  if (!isObject(value)) return undefined;
  const state = value.state;

  if (state === 'payment_pending' || state === 'order_pending') {
    return Object.freeze({ state });
  }
  if (state === 'completed') {
    const order = projectOrderDetail(value.order);
    return order ? Object.freeze({ order, state }) : undefined;
  }
  return state === 'failed' && isSafeStorefrontCode(value.code)
    ? Object.freeze({ code: value.code, state })
    : undefined;
}

export function createOrderAccessService(
  client: OrderAccessClient,
  cartSessions: StorefrontCartSessionStore,
  customerSessions: CustomerSessionStore,
  receiptSessions: ReceiptSessionStore,
  locationId: string,
  onAuthenticationFailure?: CustomerAuthenticationFailureHandler,
): OrderAccessService {
  return Object.freeze({
    captureReceiptCapability(receiptId: string, receiptToken: string): boolean {
      try {
        receiptSessions.capture(receiptId, receiptToken);
        return true;
      } catch {
        return false;
      }
    },
    async getActiveResult(cartIdInput: string): Promise<OrderAccessResult<OrderResult>> {
      let cartId: string;
      let usedGuestCapability: boolean;

      try {
        cartId = assertSafeStorefrontResourceId(cartIdInput, 'cartId');
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const session = await cartSessions.get(locationId);
        usedGuestCapability = Boolean(
          session?.cartId === cartId && session.accessToken,
        );
      } catch {
        return Object.freeze({ failure: SECURE_STORAGE_FAILURE, kind: 'failed' });
      }

      try {
        const result = projectOrderResult(
          await client.checkout.getOrderResult(locationId, cartId),
        );

        if (!result) {
          return Object.freeze({
            failure: INVALID_RESPONSE_FAILURE,
            kind: 'failed',
          });
        }

        if (result.state === 'completed') {
          try {
            await cartSessions.clearMatching(locationId, cartId);
          } catch {
            return Object.freeze({
              cleanupFailure: SECURE_STORAGE_FAILURE,
              data: result,
              kind: 'ready',
            });
          }
        }
        return Object.freeze({ data: result, kind: 'ready' });
      } catch (error) {
        const mappedFailure = mapStorefrontError(error);
        const failure =
          mappedFailure.kind === 'authentication_required' &&
          !usedGuestCapability
            ? await mapCustomerRequestFailure(
                error,
                customerSessions,
                onAuthenticationFailure,
              )
            : mappedFailure;

        if (
          mappedFailure.kind === 'authentication_required' ||
          mappedFailure.kind === 'forbidden'
        ) {
          try {
            await cartSessions.clearMatching(locationId, cartId);
          } catch {
            return Object.freeze({
              failure: SECURE_STORAGE_FAILURE,
              kind: 'failed',
            });
          }
        }

        return Object.freeze({ failure, kind: 'failed' });
      }
    },
    async getOrder(orderIdInput: string): Promise<OrderAccessResult<PublicOrderDetail>> {
      let orderId: string;

      try {
        orderId = assertSafeStorefrontResourceId(orderIdInput, 'orderId');
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const detail = projectOrderDetail(
          await client.customer.orders.get(orderId),
        );
        return detail
          ? Object.freeze({ data: detail, kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            customerSessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
    async getReceipt(receiptIdInput: string): Promise<OrderAccessResult<PublicOrderDetail>> {
      let receiptId: string;

      try {
        receiptId = assertSafeStorefrontResourceId(receiptIdInput, 'receiptId');
      } catch {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      const config = receiptSessions.getRequestConfig(receiptId);

      try {
        const detail = projectOrderDetail(
          await client.receipts.get(receiptId, config),
        );

        if (!detail) {
          return Object.freeze({
            failure: INVALID_RESPONSE_FAILURE,
            kind: 'failed',
          });
        }

        if (config) receiptSessions.clear(receiptId);
        return Object.freeze({ data: detail, kind: 'ready' });
      } catch (error) {
        const failure = config
          ? mapStorefrontError(error)
          : await mapCustomerRequestFailure(
              error,
              customerSessions,
              onAuthenticationFailure,
            );

        if (
          config &&
          (failure.kind === 'authentication_required' ||
            failure.kind === 'forbidden' ||
            failure.kind === 'invalid_request')
        ) {
          receiptSessions.clear(receiptId);
        }

        return Object.freeze({ failure, kind: 'failed' });
      }
    },
    async listOrders(
      params: Readonly<{ cursor?: string; limit?: number }> = {},
    ): Promise<OrderAccessResult<CursorPage<PublicOrderSummary>>> {
      if (
        (params.cursor !== undefined &&
          !isValidStorefrontCursor(params.cursor)) ||
        (params.limit !== undefined &&
          !isValidStorefrontPageLimit(params.limit))
      ) {
        return Object.freeze({ failure: INVALID_INPUT_FAILURE, kind: 'failed' });
      }

      try {
        const page = projectOrderPage(
          await client.customer.orders.list(params),
        );
        return page
          ? Object.freeze({ data: page, kind: 'ready' })
          : Object.freeze({ failure: INVALID_RESPONSE_FAILURE, kind: 'failed' });
      } catch (error) {
        return Object.freeze({
          failure: await mapCustomerRequestFailure(
            error,
            customerSessions,
            onAuthenticationFailure,
          ),
          kind: 'failed',
        });
      }
    },
  });
}

import type { Product, StorefrontCart } from '@craveup/storefront-sdk';

import {
  assertCartRevision,
  assertSafeStorefrontResourceId,
} from './storefront-session-scope.ts';

const CART_STATUSES = new Set(['COMPLETED', 'EXPIRED', 'LOCKED', 'OPEN']);
const CURRENCIES = new Set(['aed', 'aud', 'gbp', 'usd']);
const FULFILLMENT_METHODS = new Set([
  'delivery',
  'room_service',
  'table_side',
  'takeout',
]);
const ITEM_UNAVAILABLE_ACTIONS = new Set([
  'cancel_entire_order',
  'remove_item',
]);
const PICKUP_TYPES = new Set(['ASAP', 'LATER']);
const SUPPORTED_COUNTRIES = new Set([
  'Australia',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
]);
const SAFE_PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PUBLIC_COLLECTION = 100;
const MAX_PUBLIC_TEXT = 500;
const MAX_PUBLIC_DESCRIPTION = 4_000;
const MAX_PUBLIC_URL = 2_048;
const MAX_MODIFIER_DEPTH = 8;

const CART_STRING_FIELDS = [
  'applicationFeeTotal',
  'applicationFeeTotalFormatted',
  'discountTotal',
  'discountTotalFormatted',
  'enterpriseFeeTotal',
  'enterpriseFeeTotalFormatted',
  'expiresAt',
  'fulfillmentIdentifier',
  'fulfillmentMethodFeeTotal',
  'fulfillmentMethodFeeTotalFormatted',
  'merchantId',
  'netSalesTotal',
  'netSalesTotalFormatted',
  'orderDate',
  'orderTime',
  'orderTotal',
  'orderTotalFormatted',
  'orderTotalWithServiceFee',
  'orderTotalWithServiceFeeFormatted',
  'paymentProcessingFeeTotal',
  'paymentProcessingFeeTotalFormatted',
  'restaurantDisplayName',
  'serviceFeeTotal',
  'serviceFeeTotalFormatted',
  'statementDescriptor',
  'subTotal',
  'subTotalFormatted',
  'subTotalWithoutDiscount',
  'subTotalWithoutDiscountFormatted',
  'taxAndFeeTotal',
  'taxAndFeeTotalFormatted',
  'taxTotal',
  'taxTotalFormatted',
  'waiterTipTotal',
  'waiterTipTotalFormatted',
] as const;

const CART_FEE_FIELDS = [
  'enterpriseFeeFix',
  'enterpriseFeeRate',
  'fulfillmentMethodFeeFix',
  'fulfillmentMethodFeeRate',
  'paymentProcessingFeeFix',
  'paymentProcessingFeeRate',
  'serviceFeeFix',
  'serviceFeeRate',
  'taxRate',
  'tipRate',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => typeof value[field] === 'string');
}

function isSafeResourceId(
  value: unknown,
  field: 'cartId' | 'itemId' | 'productId',
): value is string {
  try {
    return (
      typeof value === 'string' &&
      assertSafeStorefrontResourceId(value, field) === value
    );
  } catch {
    return false;
  }
}

function isSafePublicId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_PUBLIC_ID_PATTERN.test(value);
}

function isSafeDisplayText(
  value: unknown,
  options: Readonly<{ allowEmpty?: boolean; maximum?: number }> = {},
): value is string {
  if (typeof value !== 'string') return false;
  const maximum = options.maximum ?? MAX_PUBLIC_TEXT;
  const trimmed = value.trim();
  return (
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    value === trimmed &&
    (options.allowEmpty || value.length > 0)
  );
}

function isSafeMoney(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 100 &&
    /^\d+(?:\.\d+)?$/.test(value)
  );
}

function isSafeImageReference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_PUBLIC_URL &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isSafeStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PUBLIC_COLLECTION &&
    value.every((entry) => isSafeDisplayText(entry)) &&
    new Set(value).size === value.length
  );
}

function isProductNutrition(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  const calorieCount = value.calorieCount;
  return (
    (calorieCount === undefined ||
      calorieCount === null ||
      (Number.isSafeInteger(calorieCount) &&
        (calorieCount as number) >= 0 &&
        (calorieCount as number) <= 100_000)) &&
    (value.dietaryPreferences === undefined ||
      isSafeStringList(value.dietaryPreferences)) &&
    (value.ingredients === undefined || isSafeStringList(value.ingredients))
  );
}

function isModifierRule(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    Number.isSafeInteger(value.min) &&
    (value.min as number) >= 0 &&
    (value.min as number) <= MAX_PUBLIC_COLLECTION &&
    Number.isSafeInteger(value.max) &&
    (value.max as number) >= (value.min as number) &&
    (value.max as number) <= MAX_PUBLIC_COLLECTION
  );
}

function isModifierRuleOverride(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  const validBounds =
    (value.min === undefined ||
      (Number.isSafeInteger(value.min) &&
        (value.min as number) >= 0 &&
        (value.min as number) <= MAX_PUBLIC_COLLECTION)) &&
    (value.max === undefined ||
      (Number.isSafeInteger(value.max) &&
        (value.max as number) >= 0 &&
        (value.max as number) <= MAX_PUBLIC_COLLECTION));
  return (
    validBounds &&
    (value.min === undefined ||
      value.max === undefined ||
      (value.min as number) <= (value.max as number))
  );
}

function isModifierGroup(value: unknown, depth: number): boolean {
  if (depth > MAX_MODIFIER_DEPTH || !isObject(value)) return false;
  if (
    !isSafePublicId(value.id) ||
    !isSafeDisplayText(value.name) ||
    (value.description !== undefined &&
      value.description !== null &&
      !isSafeDisplayText(value.description, {
        allowEmpty: true,
        maximum: MAX_PUBLIC_DESCRIPTION,
      })) ||
    (value.imageUrl !== undefined && !isSafeImageReference(value.imageUrl)) ||
    !isModifierRule(value.rule) ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_PUBLIC_COLLECTION
  ) {
    return false;
  }

  return value.items.every((item) => isModifierOption(item, depth));
}

function isModifierOption(value: unknown, depth: number): boolean {
  if (!isObject(value)) return false;
  if (
    !isSafePublicId(value.id) ||
    !isSafeDisplayText(value.name) ||
    !isSafeMoney(value.price) ||
    !Number.isSafeInteger(value.maxQuantity) ||
    (value.maxQuantity as number) < 1 ||
    (value.maxQuantity as number) > MAX_PUBLIC_COLLECTION
  ) {
    return false;
  }
  if (value.childGroups === undefined) return true;
  if (
    !Array.isArray(value.childGroups) ||
    value.childGroups.length > MAX_PUBLIC_COLLECTION
  ) {
    return false;
  }
  return value.childGroups.every((link) => {
    if (!isObject(link) || !isSafePublicId(link.groupId)) return false;
    return (
      isModifierRuleOverride(link.overrides) &&
      (link.applyPerParentQuantity === undefined ||
        typeof link.applyPerParentQuantity === 'boolean') &&
      link.circular !== true &&
      isObject(link.group) &&
      link.group.id === link.groupId &&
      isModifierGroup(link.group, depth + 1)
    );
  });
}

export function isScopedStorefrontProduct(
  value: unknown,
  locationId: string,
  expectedProductId: string,
): value is Product {
  if (!isObject(value)) return false;

  return (
    isSafeResourceId(value.id, 'productId') &&
    value.id === expectedProductId &&
    value.locationId === locationId &&
    isSafeDisplayText(value.name) &&
    isSafeDisplayText(value.description, {
      allowEmpty: true,
      maximum: MAX_PUBLIC_DESCRIPTION,
    }) &&
    isSafeDisplayText(value.availability) &&
    isSafeMoney(value.price) &&
    isSafeDisplayText(value.displayPrice) &&
    CURRENCIES.has(value.currency as string) &&
    Array.isArray(value.images) &&
    value.images.length <= MAX_PUBLIC_COLLECTION &&
    value.images.every(isSafeImageReference) &&
    Array.isArray(value.modifierIds) &&
    value.modifierIds.length <= MAX_PUBLIC_COLLECTION &&
    value.modifierIds.every(isSafePublicId) &&
    new Set(value.modifierIds).size === value.modifierIds.length &&
    Array.isArray(value.modifiers) &&
    value.modifiers.length <= MAX_PUBLIC_COLLECTION &&
    value.modifiers.every((modifier) => isModifierGroup(modifier, 0)) &&
    isProductNutrition(value.nutrition)
  );
}

function isDeliveryAddress(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    typeof value.street === 'string' &&
    (value.streetOptional === undefined ||
      typeof value.streetOptional === 'string') &&
    typeof value.city === 'string' &&
    typeof value.state === 'string' &&
    typeof value.zipCode === 'string' &&
    SUPPORTED_COUNTRIES.has(value.country as string) &&
    typeof value.lat === 'number' &&
    Number.isFinite(value.lat) &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lng)
  );
}

function isCartModifierItem(value: unknown, depth: number): boolean {
  if (
    !isObject(value) ||
    !isSafeResourceId(value.id, 'itemId')
  ) {
    return false;
  }

  if (
    typeof value.name !== 'string' ||
    typeof value.price !== 'string' ||
    typeof value.priceFormatted !== 'string' ||
    !Number.isSafeInteger(value.quantity) ||
    (value.quantity as number) < 0
  ) {
    return false;
  }

  return (
    value.children === undefined ||
    (depth < 8 &&
      Array.isArray(value.children) &&
      value.children.length <= 100 &&
      value.children.every((child) => isCartModifierGroup(child, depth + 1)))
  );
}

function isCartModifierGroup(value: unknown, depth: number): boolean {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isObject(value.rule) ||
    !Number.isSafeInteger(value.rule.min) ||
    (value.rule.min as number) < 0 ||
    !Number.isSafeInteger(value.rule.max) ||
    (value.rule.max as number) < (value.rule.min as number) ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  ) {
    return false;
  }

  return value.items.every((item) => isCartModifierItem(item, depth));
}

function isCartItem(value: unknown): boolean {
  if (
    !isObject(value) ||
    !isSafeResourceId(value.id, 'itemId') ||
    !isSafeResourceId(value.productId, 'productId') ||
    !hasStringFields(value, [
      'description',
      'discount',
      'discountFormatted',
      'imageUrl',
      'name',
      'price',
      'priceFormatted',
      'total',
      'totalFormatted',
    ]) ||
    !Number.isSafeInteger(value.quantity) ||
    (value.quantity as number) <= 0 ||
    (value.categoryId !== null && typeof value.categoryId !== 'string') ||
    (value.specialInstructions !== undefined &&
      typeof value.specialInstructions !== 'string') ||
    !ITEM_UNAVAILABLE_ACTIONS.has(value.itemUnavailableAction as string) ||
    !Array.isArray(value.selections) ||
    value.selections.length > 100 ||
    !value.selections.every((selection) => isCartModifierGroup(selection, 0))
  ) {
    return false;
  }

  if (value.product === undefined) return true;
  return (
    isObject(value.product) &&
    isSafeResourceId(value.product.id, 'productId') &&
    (value.product.name === undefined || typeof value.product.name === 'string') &&
    (value.product.price === undefined || typeof value.product.price === 'string')
  );
}

function hasValidOptionalServiceInfo(value: Record<string, unknown>): boolean {
  const deliveryInfo = value.deliveryInfo;
  if (
    deliveryInfo !== undefined &&
    deliveryInfo !== null &&
    (!isObject(deliveryInfo) ||
      typeof deliveryInfo.addressString !== 'string' ||
      !isDeliveryAddress(deliveryInfo.addressData))
  ) {
    return false;
  }

  const tableServiceInfo = value.tableServiceInfo;
  if (
    tableServiceInfo !== undefined &&
    tableServiceInfo !== null &&
    (!isObject(tableServiceInfo) ||
      (tableServiceInfo.tableNumber !== undefined &&
        typeof tableServiceInfo.tableNumber !== 'string'))
  ) {
    return false;
  }

  const roomServiceInfo = value.roomServiceInfo;
  return !(
    roomServiceInfo !== undefined &&
    roomServiceInfo !== null &&
    (!isObject(roomServiceInfo) ||
      (roomServiceInfo.lastName !== undefined &&
        typeof roomServiceInfo.lastName !== 'string') ||
      (roomServiceInfo.roomNumber !== undefined &&
        typeof roomServiceInfo.roomNumber !== 'string'))
  );
}

export function isScopedStorefrontCart(
  value: unknown,
  locationId: string,
  expectedCartId?: string,
): value is StorefrontCart {
  if (!isObject(value)) return false;

  const cartId = value.id;
  const cartLocationId = value.locationId;
  const revision = value.revision;

  if (!isSafeResourceId(cartId, 'cartId') || typeof revision !== 'number') {
    return false;
  }

  try {
    assertCartRevision(revision);
  } catch {
    return false;
  }

  return (
    cartLocationId === locationId &&
    (expectedCartId === undefined || cartId === expectedCartId) &&
    CART_STATUSES.has(value.status as string) &&
    CURRENCIES.has(value.currency as string) &&
    FULFILLMENT_METHODS.has(value.fulfilmentMethod as string) &&
    PICKUP_TYPES.has(value.pickupType as string) &&
    hasStringFields(value, CART_STRING_FIELDS) &&
    (value.lockedAt === undefined ||
      value.lockedAt === null ||
      typeof value.lockedAt === 'string') &&
    (value.metadata === undefined || isObject(value.metadata)) &&
    (value.discountCode === undefined || typeof value.discountCode === 'string') &&
    typeof value.orderTotalWithServiceFeeAmount === 'number' &&
    Number.isFinite(value.orderTotalWithServiceFeeAmount) &&
    Number.isSafeInteger(value.totalQuantity) &&
    (value.totalQuantity as number) >= 0 &&
    Array.isArray(value.items) &&
    value.items.length <= 500 &&
    value.items.every(isCartItem) &&
    isObject(value.fees) &&
    hasStringFields(value.fees, CART_FEE_FIELDS) &&
    hasValidOptionalServiceInfo(value)
  );
}

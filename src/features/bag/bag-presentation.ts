import type { CartItem, StorefrontCart } from '@craveup/storefront-sdk';

import { createTranslator, type AppLocale } from '../../i18n/localization.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';

export type BagItemPresentation = Readonly<{
  description?: string;
  id: string;
  imageUrl?: string;
  name: string;
  priceLabel: string;
  quantity: number;
}>;

export type BagTotalsPresentation = Readonly<{
  adjustments: readonly Readonly<{ label: string; value: string }>[];
  subtotalLabel: string;
  taxLabel: string;
  totalLabel: string;
}>;

export type BagReadyPresentation = Readonly<{
  cartId: string;
  fulfillmentLabel: string;
  items: readonly BagItemPresentation[];
  locationLabel: string;
  merchantLogoUrl?: string;
  merchantName: string;
  pointsToEarn?: number;
  revision: number;
  status: 'ready';
  totalQuantity: number;
  totals: BagTotalsPresentation;
}>;

export type BagPresentationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{
      fulfillmentLabel?: string;
      locationLabel: string;
      merchantLogoUrl?: string;
      merchantName: string;
      status: 'empty';
    }>
  | BagReadyPresentation
  | Readonly<{
      previous?: BagReadyPresentation;
      status: 'updating';
    }>
  | Readonly<{
      previous?: BagReadyPresentation;
      retry: 'new_intent' | 'same_intent';
      status: 'error';
    }>
  | Readonly<{ status: 'unavailable' }>;

export type BagConfirmationState =
  | Readonly<{ status: 'loading' | 'unavailable' }>
  | Readonly<{
      actionStatus: 'idle' | 'pending' | 'retryable_error' | 'terminal_error';
      fulfillmentLabel: string;
      items: readonly BagItemPresentation[];
      locationLabel: string;
      merchantLogoUrl?: string;
      merchantName: string;
      status: 'ready';
      totalQuantity: number;
    }>;

const MAX_ITEM_TEXT = 500;
const MAX_SELECTION_LABELS = 100;

function nonEmptyText(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ITEM_TEXT &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function optionalHttpsUrl(value: string): string | undefined | false {
  if (value === '') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : false;
  } catch {
    return false;
  }
}

function modifierLabels(groups: CartItem['selections']): string[] | undefined {
  const labels: string[] = [];
  const visit = (nestedGroups: CartItem['selections'], depth: number): boolean => {
    if (depth > 8 || !Array.isArray(nestedGroups)) return false;
    for (const group of nestedGroups) {
      for (const item of group.items) {
        if (
          !nonEmptyText(item.name) ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 0
        ) {
          return false;
        }
        if (item.quantity > 0) {
          labels.push(item.quantity === 1 ? item.name : `${item.quantity} × ${item.name}`);
          if (labels.length > MAX_SELECTION_LABELS) return false;
        }
        if (item.children && !visit(item.children, depth + 1)) return false;
      }
    }
    return true;
  };
  return visit(groups, 0) ? labels : undefined;
}

function projectItem(item: CartItem): BagItemPresentation | undefined {
  if (
    !nonEmptyText(item.id) ||
    !nonEmptyText(item.name) ||
    !nonEmptyText(item.totalFormatted) ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1
  ) {
    return undefined;
  }

  const imageUrl = optionalHttpsUrl(item.imageUrl);
  const selectionLabels = modifierLabels(item.selections);
  if (imageUrl === false || !selectionLabels) return undefined;

  const specialInstructions = item.specialInstructions?.trim();
  if (
    (specialInstructions && !nonEmptyText(specialInstructions)) ||
    (item.description.trim() && !nonEmptyText(item.description.trim()))
  ) {
    return undefined;
  }
  const descriptionParts = [
    ...selectionLabels,
    ...(specialInstructions ? [specialInstructions] : []),
  ];

  return Object.freeze({
    ...(descriptionParts.length > 0
      ? { description: descriptionParts.join(' · ') }
      : item.description.trim()
        ? { description: item.description.trim() }
        : {}),
    id: item.id,
    ...(imageUrl ? { imageUrl } : {}),
    name: item.name,
    priceLabel: item.totalFormatted,
    quantity: item.quantity,
  });
}

function monetaryAmount(value: string): boolean {
  return value.length <= 100 && /^-?\d+(?:\.\d+)?$/.test(value);
}

function adjustmentRows(
  cart: StorefrontCart,
  locale: AppLocale,
): BagTotalsPresentation['adjustments'] | undefined {
  const t = createTranslator(locale);
  const rows = [
    {
      amount: cart.discountTotal,
      label: t('bag.discount'),
      value: cart.discountTotalFormatted,
    },
    {
      amount: cart.serviceFeeTotal,
      label: t('bag.serviceFee'),
      value: cart.serviceFeeTotalFormatted,
    },
    {
      amount: cart.fulfillmentMethodFeeTotal,
      label: t('bag.fulfillmentFee'),
      value: cart.fulfillmentMethodFeeTotalFormatted,
    },
    {
      amount: cart.waiterTipTotal,
      label: t('bag.tip'),
      value: cart.waiterTipTotalFormatted,
    },
  ];
  if (rows.some(({ amount, value }) => !monetaryAmount(amount) || !nonEmptyText(value))) {
    return undefined;
  }
  return Object.freeze(
    rows
      .filter(({ amount }) => !/^0(?:\.0+)?$/.test(amount))
      .map(({ label, value }) => Object.freeze({ label, value })),
  );
}

export type BagProjectionOptions = Readonly<{
  locationAddress?: string;
  locale?: AppLocale;
  pointsToEarn?: number;
  merchantLogoUrl?: string;
  merchantName?: string;
}>;

export function projectBagCart(
  cart: StorefrontCart,
  options: BagProjectionOptions = {},
): BagReadyPresentation | undefined {
  const t = createTranslator(options.locale ?? 'en');
  if (
    cart.status !== 'OPEN' ||
    !nonEmptyText(cart.id) ||
    !Number.isSafeInteger(cart.revision) ||
    cart.revision < 0 ||
    !Number.isSafeInteger(cart.totalQuantity) ||
    cart.totalQuantity < 1 ||
    cart.items.length < 1 ||
    cart.items.length > MAX_SELECTION_LABELS ||
    !nonEmptyText(cart.subTotalFormatted) ||
    !nonEmptyText(cart.taxTotalFormatted) ||
    !nonEmptyText(cart.orderTotalFormatted)
  ) {
    return undefined;
  }

  const items = cart.items.map(projectItem);
  if (items.some((item) => !item)) return undefined;
  const itemIds = items.map((item) => item!.id);
  if (new Set(itemIds).size !== itemIds.length) return undefined;
  const summedQuantity = items.reduce((sum, item) => sum + item!.quantity, 0);
  if (summedQuantity !== cart.totalQuantity) return undefined;
  if (
    options.pointsToEarn !== undefined &&
    (!Number.isSafeInteger(options.pointsToEarn) || options.pointsToEarn < 0)
  ) {
    return undefined;
  }

  const fulfillmentLabel =
    cart.fulfilmentMethod === 'delivery'
      ? t('bag.fulfillment.delivery')
      : cart.fulfilmentMethod === 'takeout'
        ? t('bag.fulfillment.pickup')
        : cart.fulfilmentMethod === 'table_side'
          ? t('bag.fulfillment.tableService')
          : t('bag.fulfillment.roomService');
  const locationLabel =
    options.locationAddress?.trim() ||
    cart.deliveryInfo?.addressString.trim() ||
    cart.restaurantDisplayName.trim();
  if (!nonEmptyText(locationLabel)) return undefined;

  const merchantName =
    options.merchantName?.trim() || cart.restaurantDisplayName.trim();
  const merchantLogoUrl = options.merchantLogoUrl
    ? optionalHttpsUrl(options.merchantLogoUrl)
    : undefined;
  if (!nonEmptyText(merchantName) || merchantLogoUrl === false) return undefined;
  const adjustments = adjustmentRows(cart, options.locale ?? 'en');
  if (!adjustments) return undefined;
  return Object.freeze({
    cartId: cart.id,
    fulfillmentLabel,
    items: Object.freeze(items as BagItemPresentation[]),
    locationLabel,
    ...(options.pointsToEarn === undefined ? {} : { pointsToEarn: options.pointsToEarn }),
    revision: cart.revision,
    ...(merchantLogoUrl ? { merchantLogoUrl } : {}),
    merchantName,
    status: 'ready',
    totalQuantity: cart.totalQuantity,
    totals: Object.freeze({
      adjustments,
      subtotalLabel: cart.subTotalFormatted,
      taxLabel: cart.taxTotalFormatted,
      totalLabel: cart.orderTotalFormatted,
    }),
  });
}

export function bagFailureState(
  failure: StorefrontFailure,
  previous?: BagReadyPresentation,
  sameIntentEligible = false,
): BagPresentationState {
  if (
    failure.kind === 'authentication_required' ||
    failure.kind === 'forbidden' ||
    failure.kind === 'not_found' ||
    (!failure.retryable && failure.kind !== 'timeout')
  ) {
    return Object.freeze({ status: 'unavailable' });
  }
  const sameIntent =
    sameIntentEligible &&
    (failure.kind === 'timeout' ||
      (failure.kind === 'unavailable' && failure.status === undefined));
  return Object.freeze({
    ...(previous ? { previous } : {}),
    retry: sameIntent ? 'same_intent' : 'new_intent',
    status: 'error',
  });
}

export function createBagIntentKey(
  action: 'clear' | 'load' | 'quantity' | 'remove',
  now: number,
  sequence: number,
): string {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error('Cannot create bag intent key.');
  }
  return `bag_${action}_${now.toString(36)}_${sequence.toString(36)}`;
}

export function itemFromBag(
  bag: BagReadyPresentation,
  itemId: string,
): BagItemPresentation | undefined {
  return bag.items.find((item) => item.id === itemId);
}

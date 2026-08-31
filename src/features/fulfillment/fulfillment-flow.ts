import type { CartModifierGroup, StorefrontCart } from '@craveup/storefront-sdk';

import type { StorefrontCartSessionStore } from '../../lib/cart-session.ts';
import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import {
  isScheduleSelectionValid,
  type PickupScheduleSelection,
} from '../schedule/pickup-schedule.ts';
import {
  hasScheduledPickupOption,
  type OrderTimesPresentationResult,
} from '../schedule/storefront-order-times.ts';
import type {
  FulfillmentAvailabilityResult,
  FulfillmentAvailabilityService,
  FulfillmentAvailabilitySnapshot,
} from './fulfillment-availability-service.ts';
import type {
  FulfillmentPresentationChoice,
  PickupLocationPresentation,
} from './fulfillment-choice.ts';

export type FulfillmentFlowReady = Readonly<{
  availability: FulfillmentAvailabilitySnapshot;
  cart: StorefrontCart;
  deliveryEntryEnabled: false;
  pickupLocation: PickupLocationPresentation;
  selectedChoice: FulfillmentPresentationChoice;
}>;

export type FulfillmentFlowClosed = Readonly<{
  cart: StorefrontCart;
  locationName: string;
  nextOrderingSlotLabel?: string;
  schedule: OrderTimesPresentationResult;
}>;

export type FulfillmentFlowLoadResult =
  | Readonly<{ data: FulfillmentFlowReady; kind: 'ready' }>
  | Readonly<{ data: FulfillmentFlowClosed; kind: 'closed' }>
  | Readonly<{ kind: 'missing-cart' }>
  | Readonly<{ kind: 'unavailable' }>;

export type PickupScheduleFlowReady = Readonly<{
  cart: StorefrontCart;
  locationName: string;
  schedule: Extract<OrderTimesPresentationResult, { kind: 'options' }>;
}>;

export type PickupScheduleFlowLoadResult =
  | Readonly<{ data: PickupScheduleFlowReady; kind: 'ready' }>
  | Readonly<{ kind: 'missing-cart' }>
  | Readonly<{ kind: 'pickup-required' }>
  | Readonly<{ kind: 'unavailable' }>;

export type FulfillmentMutationResult =
  | Readonly<{
      cart: StorefrontCart;
      kind: 'completed';
      schedule?: OrderTimesPresentationResult;
    }>
  | Readonly<{ cart: StorefrontCart; data: FulfillmentFlowClosed; kind: 'closed' }>
  | Readonly<{ cart: StorefrontCart; kind: 'refresh-required' }>
  | Readonly<{ kind: 'retryable'; retry: 'new-intent' | 'same-intent' }>
  | Readonly<{ kind: 'selection-invalid' }>
  | Readonly<{ kind: 'unavailable' }>;

type FulfillmentCart = Pick<
  CartService,
  'dismissError' | 'getState' | 'load' | 'retry' | 'setFulfillment' | 'setOrderTime'
>;

type FulfillmentLoadDependencies = Readonly<{
  availability: FulfillmentAvailabilityService;
  cart: FulfillmentCart;
  cartSessions: Pick<StorefrontCartSessionStore, 'get'>;
  locationId: string;
}>;

type FulfillmentMutationDependencies = Readonly<{
  availability: FulfillmentAvailabilityService;
  cart: FulfillmentCart;
  locationId: string;
}>;

type ScheduleMutationDependencies = Readonly<{
  cart: FulfillmentCart;
  locationId: string;
}>;

function selectedChoice(cart: StorefrontCart): FulfillmentPresentationChoice | undefined {
  return cart.fulfilmentMethod === 'takeout'
    ? 'pickup'
    : cart.fulfilmentMethod === 'delivery'
      ? 'delivery'
      : undefined;
}

function validOpenCart(
  cart: StorefrontCart,
  locationId: string,
  cartId?: string,
): boolean {
  return (
    cart.status === 'OPEN' &&
    cart.locationId === locationId &&
    (cartId === undefined || cart.id === cartId) &&
    selectedChoice(cart) !== undefined
  );
}

function modifierConfiguration(group: CartModifierGroup): unknown {
  return {
    id: group.id,
    items: group.items.map((item) => ({
      ...(item.children
        ? { children: item.children.map(modifierConfiguration) }
        : {}),
      id: item.id,
      quantity: item.quantity,
    })),
  };
}

function itemConfiguration(item: StorefrontCart['items'][number]): string {
  return JSON.stringify({
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    selections: item.selections.map(modifierConfiguration),
    specialInstructions: item.specialInstructions,
  });
}

function preservesCartItems(before: StorefrontCart, after: StorefrontCart): boolean {
  if (
    before.id !== after.id ||
    before.locationId !== after.locationId ||
    before.totalQuantity !== after.totalQuantity ||
    before.items.length !== after.items.length
  ) {
    return false;
  }

  const afterById = new Map(after.items.map((item) => [item.id, item]));
  return before.items.every((item) => {
    const candidate = afterById.get(item.id);
    return candidate !== undefined &&
      itemConfiguration(candidate) === itemConfiguration(item);
  });
}

function closedData(
  availability: FulfillmentAvailabilitySnapshot,
  cart: StorefrontCart,
): FulfillmentFlowClosed {
  return Object.freeze({
    cart,
    locationName: availability.locationName,
    ...(availability.nextOrderingSlotLabel
      ? { nextOrderingSlotLabel: availability.nextOrderingSlotLabel }
      : {}),
    schedule: availability.schedule,
  });
}

function retryResult(
  cart: FulfillmentCart,
): Extract<FulfillmentMutationResult, { kind: 'retryable' }> {
  const state = cart.getState();
  return Object.freeze({
    kind: 'retryable',
    retry:
      state.status === 'error' && state.retry === 'same_intent'
        ? 'same-intent'
        : 'new-intent',
  });
}

function prepareNewIntent(cart: FulfillmentCart): boolean {
  return cart.getState().status !== 'error' || cart.dismissError();
}

function reconciled(
  result: CartServiceResult,
  locationId: string,
): FulfillmentMutationResult | undefined {
  if (result.kind !== 'reconciliation_required') return undefined;
  return result.cart && validOpenCart(result.cart, locationId)
    ? Object.freeze({ cart: result.cart, kind: 'refresh-required' as const })
    : Object.freeze({ kind: 'unavailable' as const });
}

export function createFulfillmentIntentKey(
  action: 'load' | 'pickup' | 'schedule',
  now: number,
  sequence: number,
): string {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error('Cannot create fulfillment intent key.');
  }
  return `fulfillment_${action}_${now.toString(36)}_${sequence.toString(36)}`;
}

export async function loadFulfillmentFlow(
  dependencies: FulfillmentLoadDependencies,
  intentId: string,
): Promise<FulfillmentFlowLoadResult> {
  let session;
  try {
    session = await dependencies.cartSessions.get(dependencies.locationId);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (!session) return Object.freeze({ kind: 'missing-cart' });

  let availability: FulfillmentAvailabilityResult;
  let cartResult: CartServiceResult;
  try {
    [availability, cartResult] = await Promise.all([
      dependencies.availability.load(dependencies.locationId),
      dependencies.cart.load({ id: intentId }),
    ]);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (
    availability.kind !== 'ready' ||
    cartResult.kind !== 'ready' ||
    !validOpenCart(cartResult.cart, dependencies.locationId, session.cartId) ||
    !availability.data.pickupSupported
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (!availability.data.pickupAvailable) {
    return Object.freeze({
      data: closedData(availability.data, cartResult.cart),
      kind: 'closed',
    });
  }

  return Object.freeze({
    data: Object.freeze({
      availability: availability.data,
      cart: cartResult.cart,
      deliveryEntryEnabled: false,
      pickupLocation: Object.freeze({
        address: availability.data.locationAddress,
        locationName: availability.data.locationName,
      }),
      selectedChoice: selectedChoice(cartResult.cart)!,
    }),
    kind: 'ready',
  });
}

export async function loadPickupScheduleFlow(
  dependencies: FulfillmentLoadDependencies,
  intentId: string,
): Promise<PickupScheduleFlowLoadResult> {
  const result = await loadFulfillmentFlow(dependencies, intentId);
  if (result.kind === 'missing-cart' || result.kind === 'unavailable') {
    return result;
  }

  const cart = result.data.cart;
  if (cart.fulfilmentMethod !== 'takeout') {
    return Object.freeze({ kind: 'pickup-required' });
  }

  const sourceSchedule =
    result.kind === 'closed'
      ? result.data.schedule
      : result.data.availability.schedule;
  if (!hasScheduledPickupOption(sourceSchedule)) {
    return Object.freeze({ kind: 'unavailable' });
  }
  const schedule =
    result.kind === 'closed' && sourceSchedule.allowAsap
      ? Object.freeze({ ...sourceSchedule, allowAsap: false })
      : sourceSchedule;

  return Object.freeze({
    data: Object.freeze({
      cart,
      locationName:
        result.kind === 'closed'
          ? result.data.locationName
          : result.data.pickupLocation.locationName,
      schedule,
    }),
    kind: 'ready',
  });
}

export async function applyPickupFulfillment(
  dependencies: FulfillmentMutationDependencies,
  currentCart: StorefrontCart,
  intentId: string,
  retry: boolean,
): Promise<FulfillmentMutationResult> {
  if (!validOpenCart(currentCart, dependencies.locationId)) {
    return Object.freeze({ kind: 'unavailable' });
  }

  let nextCart = currentCart;
  if (currentCart.fulfilmentMethod !== 'takeout' || retry) {
    if (!retry && !prepareNewIntent(dependencies.cart)) {
      return Object.freeze({ kind: 'unavailable' });
    }
    let result: CartServiceResult;
    try {
      result = retry
        ? await dependencies.cart.retry()
        : await dependencies.cart.setFulfillment({
            id: intentId,
            payload: { fulfillmentMethod: 'takeout' },
          });
    } catch {
      return Object.freeze({ kind: 'retryable', retry: 'new-intent' });
    }
    const conflict = reconciled(result, dependencies.locationId);
    if (conflict) return conflict;
    if (result.kind === 'failed') return retryResult(dependencies.cart);
    if (
      result.kind !== 'ready' ||
      !validOpenCart(result.cart, dependencies.locationId, currentCart.id) ||
      result.cart.fulfilmentMethod !== 'takeout' ||
      !preservesCartItems(currentCart, result.cart)
    ) {
      return Object.freeze({ kind: 'unavailable' });
    }
    nextCart = result.cart;
  }

  let availability: FulfillmentAvailabilityResult;
  try {
    availability = await dependencies.availability.load(dependencies.locationId);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (
    availability.kind !== 'ready' ||
    !availability.data.pickupSupported
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (!availability.data.pickupAvailable) {
    const data = closedData(availability.data, nextCart);
    return Object.freeze({ cart: nextCart, data, kind: 'closed' });
  }
  if (
    availability.data.schedule.kind === 'options' &&
    !availability.data.schedule.allowAsap &&
    !hasScheduledPickupOption(availability.data.schedule)
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }
  return Object.freeze({
    cart: nextCart,
    kind: 'completed',
    schedule: availability.data.schedule,
  });
}

export async function applyPickupSchedule(
  dependencies: ScheduleMutationDependencies,
  currentCart: StorefrontCart,
  schedule: OrderTimesPresentationResult,
  selection: PickupScheduleSelection,
  intentId: string,
  retry: boolean,
): Promise<FulfillmentMutationResult> {
  if (
    schedule.kind !== 'options' ||
    !isScheduleSelectionValid(schedule.days, selection, schedule.allowAsap)
  ) {
    return Object.freeze({ kind: 'selection-invalid' });
  }
  if (
    !validOpenCart(currentCart, dependencies.locationId) ||
    currentCart.fulfilmentMethod !== 'takeout'
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }

  let result: CartServiceResult;
  if (!retry && !prepareNewIntent(dependencies.cart)) {
    return Object.freeze({ kind: 'unavailable' });
  }
  try {
    result = retry
      ? await dependencies.cart.retry()
      : await dependencies.cart.setOrderTime({
          id: intentId,
          payload:
            selection.pickupType === 'ASAP'
              ? { pickupType: 'ASAP' }
              : {
                  orderDate: selection.dayValue,
                  orderTime: selection.intervalValue,
                  pickupType: 'LATER',
                },
        });
  } catch {
    return Object.freeze({ kind: 'retryable', retry: 'new-intent' });
  }
  const conflict = reconciled(result, dependencies.locationId);
  if (conflict) return conflict;
  if (result.kind === 'failed') return retryResult(dependencies.cart);
  if (
    result.kind !== 'ready' ||
    !validOpenCart(result.cart, dependencies.locationId, currentCart.id) ||
    result.cart.fulfilmentMethod !== 'takeout' ||
    result.cart.pickupType !== selection.pickupType ||
    (selection.pickupType === 'LATER' &&
      (result.cart.orderDate !== selection.dayValue ||
        result.cart.orderTime !== selection.intervalValue)) ||
    !preservesCartItems(currentCart, result.cart)
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }
  return Object.freeze({ cart: result.cart, kind: 'completed' });
}

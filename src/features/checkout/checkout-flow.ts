import type {
  StorefrontCart,
  UpdateGratuityPayload,
  WaiterTipConfigResponse,
} from '@craveup/storefront-sdk';

import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import type { StorefrontCartSessionStore } from '../../lib/cart-session.ts';
import { isScopedStorefrontCart } from '../../lib/storefront-response-contracts.ts';
import { assertSafeIdempotencyKey } from '../../lib/storefront-session-scope.ts';
import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import type { CustomerAuthService } from '../auth/customer-auth-service.ts';
import type { CustomerAuthState } from '../auth/customer-auth-state.ts';
import {
  loadBag,
  resolveBagMutation,
  type BagLoaderDependencies,
} from '../bag/bag-loader.ts';
import type { BagReadyPresentation } from '../bag/bag-presentation.ts';
import type { LoyaltyService } from '../rewards/loyalty-service.ts';
import { createTranslator, type AppLocale } from '../../i18n/index.ts';

export type GratuityOption = Readonly<{
  label: string;
  value: 'none' | string;
}>;

export type CheckoutReviewPresentation = Readonly<{
  bag: BagReadyPresentation;
  cartId: string;
  customerLabel: string;
  gratuityDescription?: string;
  gratuityOptions: readonly GratuityOption[];
  orderTimeLabel: string;
  revision: number;
  selectedGratuity?: string;
}>;

export type CheckoutFlowReady = Readonly<{
  auth: Extract<CustomerAuthState, { status: 'authenticated' | 'signed_out' }>;
  cart: StorefrontCart;
  gratuity?: WaiterTipConfigResponse;
  review: CheckoutReviewPresentation;
}>;

export type CheckoutFlowEmpty = Readonly<{
  auth: Extract<CustomerAuthState, { status: 'authenticated' | 'signed_out' }>;
  cart: StorefrontCart;
  totalLabel: string;
}>;

export type CheckoutFlowLoadResult =
  | Readonly<{ data: CheckoutFlowReady; kind: 'ready' }>
  | Readonly<{ data: CheckoutFlowEmpty; kind: 'empty_cart' }>
  | Readonly<{ kind: 'missing_cart' }>
  | Readonly<{ kind: 'unavailable' }>;

export type CheckoutGratuityResult =
  | Readonly<{ data: CheckoutFlowReady; kind: 'completed' }>
  | Readonly<{ data: CheckoutFlowReady; kind: 'refresh_required' }>
  | Readonly<{
      kind: 'retryable';
      retry: 'new_intent' | 'same_intent';
    }>
  | Readonly<{ kind: 'unavailable' }>;

export type CheckoutGratuityClient = Readonly<{
  getGratuity(locationId: string): Promise<WaiterTipConfigResponse>;
}>;

export type CheckoutLoadDependencies = Readonly<{
  auth: Pick<CustomerAuthService, 'getState' | 'restore' | 'retryProfile'>;
  bootstrap: Pick<StorefrontBootstrapService, 'load'>;
  cart: Pick<CartService, 'getState' | 'load'>;
  cartSessions: Pick<StorefrontCartSessionStore, 'get'>;
  gratuity: CheckoutGratuityClient;
  locationId: string;
  loyalty?: Pick<LoyaltyService, 'getQuote'>;
}>;

export type CheckoutGratuityDependencies = Readonly<{
  cart: Pick<CartService, 'dismissError' | 'getState' | 'retry' | 'setGratuity'>;
  locationId: string;
  loyalty?: Pick<LoyaltyService, 'getQuote'>;
}>;

const TIP_PERCENTAGE = /^(?:[1-9]\d?)(?:\.\d{1,2})?$|^100$/;
const ZERO_AMOUNT = /^0(?:\.0+)?$/;

export function createCheckoutIntentKey(
  kind: 'handoff' | 'load' | 'tip',
  timestamp: number,
  sequence: number,
): string {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new TypeError('Invalid checkout intent sequence');
  }
  return assertSafeIdempotencyKey(`checkout_${kind}_${timestamp}_${sequence}`);
}

function safeText(value: unknown, maximum = 500): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validPercentage(value: unknown): value is string {
  return typeof value === 'string' && TIP_PERCENTAGE.test(value);
}

export function projectGratuityOptions(
  config: WaiterTipConfigResponse,
  locale: AppLocale = 'en',
): readonly GratuityOption[] | undefined {
  if (
    typeof config.enabled !== 'boolean' ||
    typeof config.shouldAllowCustomTip !== 'boolean' ||
    (config.description !== undefined &&
      config.description !== null &&
      !safeText(config.description))
  ) {
    return undefined;
  }
  if (!config.enabled) return Object.freeze([]);
  if (
    !Array.isArray(config.tipPercentage) ||
    config.tipPercentage.length > 10 ||
    !config.tipPercentage.every(validPercentage) ||
    new Set(config.tipPercentage).size !== config.tipPercentage.length ||
    (!validPercentage(config.defaultTipPercentage) &&
      !ZERO_AMOUNT.test(config.defaultTipPercentage))
  ) {
    return undefined;
  }
  if (
    !ZERO_AMOUNT.test(config.defaultTipPercentage) &&
    !config.tipPercentage.includes(config.defaultTipPercentage)
  ) {
    return undefined;
  }
  const t = createTranslator(locale);
  return Object.freeze([
    Object.freeze({ label: t('checkout.gratuity.none'), value: 'none' as const }),
    ...config.tipPercentage.map((value) =>
      Object.freeze({ label: `${value}%`, value }),
    ),
  ]);
}

export function getGratuitySelectionPayload(
  value: string,
): UpdateGratuityPayload | undefined {
  if (value === 'none') return Object.freeze({ amount: '0' });
  return validPercentage(value)
    ? Object.freeze({ percentage: value })
    : undefined;
}

function customerLabel(
  auth: CustomerAuthState,
  locale: AppLocale,
): string | undefined {
  const t = createTranslator(locale);
  if (auth.status === 'signed_out') return t('checkout.guest');
  if (auth.status !== 'authenticated') return undefined;
  const name = [auth.profile.customerName, auth.profile.lastName]
    .filter((value) => safeText(value))
    .join(' ');
  const contact = auth.profile.customerEmail ?? auth.profile.phoneNumber;
  if (name && contact && safeText(contact)) return `${name} · ${contact}`;
  if (name) return name;
  return contact && safeText(contact) ? contact : t('checkout.signedIn');
}

export function projectCheckoutReview(
  cart: StorefrontCart,
  bag: BagReadyPresentation,
  auth: CustomerAuthState,
  gratuity?: WaiterTipConfigResponse,
  locale: AppLocale = 'en',
): CheckoutReviewPresentation | undefined {
  const t = createTranslator(locale);
  const customer = customerLabel(auth, locale);
  const gratuityOptions = gratuity
    ? projectGratuityOptions(gratuity, locale)
    : [];
  if (
    !customer ||
    gratuityOptions === undefined ||
    !isScopedStorefrontCart(cart, cart.locationId, cart.id) ||
    cart.status !== 'OPEN' ||
    cart.fulfilmentMethod !== 'takeout' ||
    cart.items.length < 1 ||
    cart.totalQuantity < 1 ||
    cart.id !== bag.cartId ||
    cart.revision !== bag.revision ||
    (cart.pickupType === 'LATER' &&
      (!safeText(cart.orderDate) || !safeText(cart.orderTime)))
  ) {
    return undefined;
  }
  const selectedPercentage = gratuityOptions.find(
    (option) => option.value === cart.fees.tipRate,
  )?.value;
  const selectedGratuity =
    selectedPercentage ??
    (ZERO_AMOUNT.test(cart.waiterTipTotal) ? 'none' : undefined);
  const gratuityDescription =
    gratuity?.description && safeText(gratuity.description)
      ? gratuity.description
      : undefined;

  return Object.freeze({
    bag,
    cartId: cart.id,
    customerLabel: customer,
    ...(gratuityDescription ? { gratuityDescription } : {}),
    gratuityOptions,
    orderTimeLabel:
      cart.pickupType === 'ASAP'
        ? t('checkout.asap')
        : `${cart.orderDate} · ${cart.orderTime}`,
    revision: cart.revision,
    ...(selectedGratuity ? { selectedGratuity } : {}),
  });
}

async function restoreCheckoutAuth(
  auth: CheckoutLoadDependencies['auth'],
): Promise<CustomerAuthState> {
  const state = auth.getState();
  if (state.status === 'signed_out') return (await auth.restore()).state;
  if (state.status === 'profile_unavailable') {
    return (await auth.retryProfile()).state;
  }
  return state;
}

export async function loadCheckoutFlow(
  dependencies: CheckoutLoadDependencies,
  intentId: string,
): Promise<CheckoutFlowLoadResult> {
  let auth: CustomerAuthState;
  try {
    auth = await restoreCheckoutAuth(dependencies.auth);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (auth.status !== 'authenticated' && auth.status !== 'signed_out') {
    return Object.freeze({ kind: 'unavailable' });
  }

  const bagDependencies: BagLoaderDependencies = {
    bootstrap: dependencies.bootstrap,
    cart: dependencies.cart,
    cartSessions: dependencies.cartSessions,
    locationId: dependencies.locationId,
    ...(dependencies.loyalty ? { loyalty: dependencies.loyalty } : {}),
  };
  let bagState;
  let gratuity: WaiterTipConfigResponse | undefined;
  try {
    [bagState, gratuity] = await Promise.all([
      loadBag(bagDependencies, intentId),
      dependencies.gratuity
        .getGratuity(dependencies.locationId)
        .catch(() => undefined),
    ]);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (bagState.status === 'empty') {
    const cartState = dependencies.cart.getState();
    if (
      cartState.status === 'ready' &&
      cartState.cart.status === 'OPEN' &&
      cartState.cart.locationId === dependencies.locationId &&
      cartState.cart.items.length === 0 &&
      cartState.cart.totalQuantity === 0 &&
      safeText(cartState.cart.orderTotalFormatted, 100)
    ) {
      return Object.freeze({
        data: Object.freeze({
          auth,
          cart: cartState.cart,
          totalLabel: cartState.cart.orderTotalFormatted,
        }),
        kind: 'empty_cart' as const,
      });
    }
    return Object.freeze({ kind: 'missing_cart' });
  }
  if (bagState.status !== 'ready') return Object.freeze({ kind: 'unavailable' });

  const cartState = dependencies.cart.getState();
  if (cartState.status !== 'ready') return Object.freeze({ kind: 'unavailable' });
  const cart = cartState.cart;
  if (cart.locationId !== dependencies.locationId) {
    return Object.freeze({ kind: 'unavailable' });
  }
  const review = projectCheckoutReview(cart, bagState, auth, gratuity);
  if (!review) return Object.freeze({ kind: 'unavailable' });

  return Object.freeze({
    data: Object.freeze({
      auth,
      cart,
      ...(gratuity ? { gratuity } : {}),
      review,
    }),
    kind: 'ready',
  });
}

function retryForCart(cart: CheckoutGratuityDependencies['cart']): 'new_intent' | 'same_intent' {
  const state = cart.getState();
  return state.status === 'error' && state.retry === 'same_intent'
    ? 'same_intent'
    : 'new_intent';
}

async function readyFromMutation(
  dependencies: CheckoutGratuityDependencies,
  current: CheckoutFlowReady,
  cart: StorefrontCart,
): Promise<CheckoutFlowReady | undefined> {
  const bag = await resolveBagMutation(
    dependencies.loyalty ? { loyalty: dependencies.loyalty } : {},
    { cart, kind: 'ready' },
    current.review.bag,
  );
  if (bag.status !== 'ready') return undefined;
  const review = projectCheckoutReview(cart, bag, current.auth, current.gratuity);
  return review
    ? Object.freeze({ ...current, cart, review })
    : undefined;
}

export async function applyCheckoutGratuity(
  dependencies: CheckoutGratuityDependencies,
  current: CheckoutFlowReady,
  selection: string,
  intentId: string,
  retry = false,
): Promise<CheckoutGratuityResult> {
  const payload = getGratuitySelectionPayload(selection);
  if (
    !payload ||
    !current.review.gratuityOptions.some((option) => option.value === selection) ||
    current.cart.locationId !== dependencies.locationId
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }
  const state = dependencies.cart.getState();
  if (
    !retry &&
    state.status === 'error' &&
    !dependencies.cart.dismissError()
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }

  let result: CartServiceResult;
  try {
    result = retry
      ? await dependencies.cart.retry()
      : await dependencies.cart.setGratuity({ id: intentId, payload });
  } catch {
    return Object.freeze({ kind: 'retryable', retry: 'new_intent' });
  }
  if (result.kind === 'ready') {
    const data = await readyFromMutation(dependencies, current, result.cart);
    return data
      ? Object.freeze({ data, kind: 'completed' })
      : Object.freeze({ kind: 'unavailable' });
  }
  if (result.kind === 'reconciliation_required' && result.cart) {
    const data = await readyFromMutation(dependencies, current, result.cart);
    return data
      ? Object.freeze({ data, kind: 'refresh_required' })
      : Object.freeze({ kind: 'unavailable' });
  }
  if (result.kind === 'failed') {
    return Object.freeze({
      kind: 'retryable',
      retry: retryForCart(dependencies.cart),
    });
  }
  return Object.freeze({ kind: 'unavailable' });
}

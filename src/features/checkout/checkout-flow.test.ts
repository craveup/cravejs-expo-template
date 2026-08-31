import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { StorefrontCart, WaiterTipConfigResponse } from '@craveup/storefront-sdk';

import { createStorefrontCartFixture } from '../../fixtures/storefront-cart-fixture.ts';
import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import type { CartService } from '../../lib/cart.ts';
import type { CustomerAuthState } from '../auth/customer-auth-state.ts';
import type { BagReadyPresentation } from '../bag/bag-presentation.ts';
import {
  applyCheckoutGratuity,
  getGratuitySelectionPayload,
  loadCheckoutFlow,
  projectCheckoutReview,
  projectGratuityOptions,
  type CheckoutFlowReady,
  type CheckoutLoadDependencies,
} from './checkout-flow.ts';

const bag: BagReadyPresentation = Object.freeze({
  cartId: 'cart_fixture',
  fulfillmentLabel: 'Pickup',
  items: Object.freeze([
    Object.freeze({
      description: 'Oat milk',
      id: 'item_1',
      imageUrl: '',
      name: 'Matcha',
      priceLabel: '$6.75',
      quantity: 1,
    }),
  ]),
  locationLabel: '1260 3rd St Promenade',
  merchantName: 'Example Tea',
  revision: 4,
  status: 'ready',
  totalQuantity: 1,
  totals: Object.freeze({
    adjustments: Object.freeze([{ label: 'Tip', value: '$1.00' }]),
    subtotalLabel: '$6.75',
    taxLabel: '$0.64',
    totalLabel: '$8.39',
  }),
});

function cart(overrides: Partial<StorefrontCart> = {}): StorefrontCart {
  return createStorefrontCartFixture({
    fees: {
      ...createStorefrontCartFixture().fees,
      tipRate: '15',
    },
    items: [
      {
        categoryId: null,
        description: 'Oat milk',
        discount: '0.00',
        discountFormatted: '$0.00',
        id: 'item_1',
        imageUrl: '',
        itemUnavailableAction: 'remove_item',
        name: 'Matcha',
        price: '6.75',
        priceFormatted: '$6.75',
        productId: 'product_1',
        quantity: 1,
        selections: [],
        specialInstructions: '',
        total: '6.75',
        totalFormatted: '$6.75',
      },
    ],
    orderDate: '2099-01-01',
    orderTime: '10:30 AM - 10:45 AM',
    pickupType: 'LATER',
    revision: 4,
    totalQuantity: 1,
    waiterTipTotal: '1.00',
    waiterTipTotalFormatted: '$1.00',
    ...overrides,
  });
}

const authenticated: CustomerAuthState = Object.freeze({
  profile: Object.freeze({
    customerEmail: 'member@example.test',
    customerName: 'Avery',
    id: 'customer_1',
    lastName: 'Tea',
    phoneNumber: null,
    profilePicture: '',
  }),
  status: 'authenticated',
});

const gratuity: WaiterTipConfigResponse = Object.freeze({
  defaultTipPercentage: '18',
  description: 'Every cup is shaken by hand',
  enabled: true,
  shouldAllowCustomTip: true,
  tipPercentage: Object.freeze(['15', '18', '22']) as string[],
});

test('checkout review projects only authoritative cart, identity, fulfillment, and order-time fields', () => {
  assert.deepEqual(projectCheckoutReview(cart(), bag, authenticated, gratuity), {
    bag,
    cartId: 'cart_fixture',
    customerLabel: 'Avery Tea · member@example.test',
    gratuityDescription: 'Every cup is shaken by hand',
    gratuityOptions: [
      { label: 'None', value: 'none' },
      { label: '15%', value: '15' },
      { label: '18%', value: '18' },
      { label: '22%', value: '22' },
    ],
    orderTimeLabel: '2099-01-01 · 10:30 AM - 10:45 AM',
    revision: 4,
    selectedGratuity: '15',
  });

  const guest = projectCheckoutReview(
    cart({ pickupType: 'ASAP' }),
    bag,
    { status: 'signed_out' },
    undefined,
  );
  assert.equal(guest?.customerLabel, 'Guest checkout');
  assert.equal(guest?.orderTimeLabel, 'As soon as possible');
  assert.deepEqual(guest?.gratuityOptions, []);

  const pseudoLocalized = projectCheckoutReview(
    cart({ pickupType: 'ASAP' }),
    bag,
    { status: 'signed_out' },
    gratuity,
    'en-XA',
  );
  assert.equal(
    pseudoLocalized?.customerLabel,
    '[!! Guest checkout Guest checkout !!]',
  );
  assert.equal(
    pseudoLocalized?.orderTimeLabel,
    '[!! As soon as possible As soon as possible !!]',
  );
  assert.equal(
    pseudoLocalized?.gratuityOptions[0]?.label,
    '[!! None None !!]',
  );
});

test('checkout review rejects stale, empty, immutable, delivery, or unresolved identity state', () => {
  for (const invalid of [
    cart({ revision: 5 }),
    cart({ items: [], totalQuantity: 0 }),
    cart({ status: 'LOCKED' }),
    cart({ fulfilmentMethod: 'delivery' }),
    cart({ orderDate: '', orderTime: '', pickupType: 'LATER' }),
  ]) {
    assert.equal(projectCheckoutReview(invalid, bag, authenticated, gratuity), undefined);
  }
  assert.equal(
    projectCheckoutReview(
      cart(),
      bag,
      {
        failure: { kind: 'unavailable', retryable: true },
        status: 'profile_unavailable',
      },
      gratuity,
    ),
    undefined,
  );
});

test('gratuity choices preserve server percentages and never calculate money', () => {
  assert.deepEqual(projectGratuityOptions(gratuity), [
    { label: 'None', value: 'none' },
    { label: '15%', value: '15' },
    { label: '18%', value: '18' },
    { label: '22%', value: '22' },
  ]);
  assert.deepEqual(getGratuitySelectionPayload('none'), { amount: '0' });
  assert.deepEqual(getGratuitySelectionPayload('18'), { percentage: '18' });
  assert.equal(getGratuitySelectionPayload('018'), undefined);
  assert.equal(
    projectGratuityOptions({ ...gratuity, tipPercentage: ['15', '15'] }),
    undefined,
  );
  assert.deepEqual(
    projectGratuityOptions({ ...gratuity, defaultTipPercentage: '0' }),
    [
      { label: 'None', value: 'none' },
      { label: '15%', value: '15' },
      { label: '18%', value: '18' },
      { label: '22%', value: '22' },
    ],
  );
  assert.deepEqual(
    projectGratuityOptions({
      defaultTipPercentage: '',
      enabled: false,
      shouldAllowCustomTip: false,
      tipPercentage: [],
    }),
    [],
  );

  assert.equal(
    projectCheckoutReview(
      cart({ waiterTipTotal: '0.00', fees: { ...cart().fees, tipRate: '18' } }),
      bag,
      authenticated,
      gratuity,
    )?.selectedGratuity,
    '18',
  );
});

test('checkout load restores identity before loading one authoritative scoped cart', async () => {
  const fixture = createCanonicalStorefrontFixture();
  const currentCart = cart({ locationId: fixture.scope.locationId });
  const calls: string[] = [];
  const dependencies: CheckoutLoadDependencies = {
    auth: {
      getState: () => ({ status: 'signed_out' }),
      async restore() {
        calls.push('auth');
        return { ok: true, state: { status: 'signed_out' } };
      },
      async retryProfile() {
        throw new Error('not expected');
      },
    },
    bootstrap: {
      async load() {
        return {
          data: {
            location: fixture.location,
            menus: { menus: fixture.menus, popularProducts: [] },
            merchant: fixture.merchant,
            readiness: {
              fulfillmentMethod: 'takeout' as const,
              orderDate: '2099-01-01',
              orderTime: '10:30 AM - 10:45 AM',
              pickupType: 'ASAP' as const,
              ready: true as const,
            },
          },
          kind: 'ready' as const,
        };
      },
    },
    cart: {
      getState: () => ({ cart: currentCart, revision: 4, status: 'ready' }),
      async load() {
        calls.push('cart');
        assert.deepEqual(calls, ['auth', 'cart']);
        return { cart: currentCart, kind: 'ready' };
      },
    },
    cartSessions: {
      get: async () => ({
        cartId: currentCart.id,
        locationId: currentCart.locationId,
        revision: currentCart.revision,
      }),
    },
    gratuity: {
      async getGratuity(receivedLocationId) {
        assert.equal(receivedLocationId, fixture.scope.locationId);
        return gratuity;
      },
    },
    locationId: fixture.scope.locationId,
  };

  const result = await loadCheckoutFlow(dependencies, 'checkout_load_1');
  assert.equal(result.kind, 'ready');
  assert.equal(result.kind === 'ready' ? result.data.cart : undefined, currentCart);
  assert.equal(
    result.kind === 'ready' ? result.data.review.customerLabel : undefined,
    'Guest checkout',
  );
});

test('checkout load preserves authoritative open empty-cart truth for pre-handoff recovery', async () => {
  const fixture = createCanonicalStorefrontFixture();
  const emptyCart = cart({
    items: [],
    locationId: fixture.scope.locationId,
    orderTotal: '0.00',
    orderTotalFormatted: '$0.00',
    revision: 5,
    subTotal: '0.00',
    subTotalFormatted: '$0.00',
    taxTotal: '0.00',
    taxTotalFormatted: '$0.00',
    totalQuantity: 0,
  });
  const dependencies: CheckoutLoadDependencies = {
    auth: {
      getState: () => ({ status: 'signed_out' }),
      async restore() {
        return { ok: true, state: { status: 'signed_out' } };
      },
      async retryProfile() {
        throw new Error('not expected');
      },
    },
    bootstrap: {
      async load() {
        return {
          data: {
            location: fixture.location,
            menus: { menus: fixture.menus, popularProducts: [] },
            merchant: fixture.merchant,
            readiness: {
              fulfillmentMethod: 'takeout' as const,
              orderDate: '2099-01-01',
              orderTime: '10:30 AM - 10:45 AM',
              pickupType: 'ASAP' as const,
              ready: true as const,
            },
          },
          kind: 'ready' as const,
        };
      },
    },
    cart: {
      getState: () => ({ cart: emptyCart, revision: 5, status: 'ready' }),
      async load() {
        return { cart: emptyCart, kind: 'ready' };
      },
    },
    cartSessions: {
      get: async () => ({
        cartId: emptyCart.id,
        locationId: emptyCart.locationId,
        revision: emptyCart.revision,
      }),
    },
    gratuity: {
      async getGratuity() {
        return gratuity;
      },
    },
    locationId: fixture.scope.locationId,
  };

  const result = await loadCheckoutFlow(dependencies, 'checkout_load_empty');

  assert.equal(result.kind, 'empty_cart');
  assert.equal(result.kind === 'empty_cart' ? result.data.cart : undefined, emptyCart);
});

test('tip mutation sends only the selected public value and republishes server totals', async () => {
  const currentCart = cart();
  const currentReview = projectCheckoutReview(
    currentCart,
    bag,
    authenticated,
    gratuity,
  );
  assert.ok(currentReview);
  const current: CheckoutFlowReady = {
    auth: authenticated,
    cart: currentCart,
    gratuity,
    review: currentReview,
  };
  const updatedCart = cart({
    fees: { ...currentCart.fees, tipRate: '18' },
    orderTotal: '8.96',
    orderTotalFormatted: '$8.96',
    orderTotalWithServiceFee: '8.96',
    orderTotalWithServiceFeeAmount: 8.96,
    orderTotalWithServiceFeeFormatted: '$8.96',
    revision: 5,
    waiterTipTotal: '1.57',
    waiterTipTotalFormatted: '$1.57',
  });
  const calls: unknown[] = [];
  const cartService: Pick<
    CartService,
    'dismissError' | 'getState' | 'retry' | 'setGratuity'
  > = {
    dismissError: () => true,
    getState: () => ({ cart: currentCart, revision: 4, status: 'ready' }),
    retry: async () => ({ kind: 'transition_rejected', reason: 'invalid_transition' }),
    async setGratuity(intent) {
      calls.push(intent);
      return { cart: updatedCart, kind: 'ready' };
    },
  };

  const result = await applyCheckoutGratuity(
    { cart: cartService, locationId: currentCart.locationId },
    current,
    '18',
    'checkout_tip_1',
  );
  assert.deepEqual(calls, [
    { id: 'checkout_tip_1', payload: { percentage: '18' } },
  ]);
  assert.equal(result.kind, 'completed');
  assert.equal(
    result.kind === 'completed' ? result.data.review.bag.totals.totalLabel : undefined,
    '$8.96',
  );
  assert.equal(
    result.kind === 'completed' ? result.data.review.selectedGratuity : undefined,
    '18',
  );

  assert.equal(
    (
      await applyCheckoutGratuity(
        { cart: cartService, locationId: currentCart.locationId },
        current,
        '99',
        'checkout_tip_2',
      )
    ).kind,
    'unavailable',
  );
  assert.equal(calls.length, 1);
});

test('checkout presentation and route retain the reduced hosted-handoff boundary', () => {
  const presentation = readFileSync(
    new URL('./CheckoutReviewScreen.tsx', import.meta.url),
    'utf8',
  );
  const route = readFileSync(new URL('../../app/checkout.tsx', import.meta.url), 'utf8');
  const localization = readFileSync(
    new URL('../../i18n/localization.ts', import.meta.url),
    'utf8',
  );

  assert.match(presentation, /checkout\.action\.continue/);
  assert.match(presentation, /checkout\.action\.status/);
  assert.match(localization, /Continue to secure checkout/);
  assert.match(localization, /Check order status/);
  assert.match(presentation, /accessibilityRole="radiogroup"/);
  assert.doesNotMatch(
    presentation,
    /Apple Pay|Google Pay|Visa|Gift Card|card number|ready in|about \d+ minutes|Place order/i,
  );
  assert.doesNotMatch(route, /\bfetch\s*\(|createPaymentIntent|\.exchange\s*\(|checkoutUrl|clientSecret|SecureStore|AsyncStorage/);
  assert.match(route, /createHostedCheckoutService/);
  assert.match(route, /runtime\.services\.cart/);
  assert.match(route, /runtime\.services\.customerAuth/);
  assert.match(route, /BackHandler\.addEventListener/);
  assert.match(route, /gestureEnabled: !navigationLocked/);
  assert.match(route, /setRecoveryPending\(true\)/);
  assert.match(route, /recoveryPending \|\| terminalHandoff/);
  assert.match(route, /runtime\.services\.checkoutRecovery\.get/);
  assert.match(
    route,
    /recoveryPromise[\s\S]{0,1600}\.catch\(\(\) => \{[\s\S]{0,400}router\.replace\('\/order\/status'\)/,
  );
  assert.match(route, /checkout\.resume\(currentLoad\.data\.cart\)/);
  assert.match(route, /tipRetry\.current/);
  assert.match(route, /cartState\.cart\.id !== currentLoad\.data\.cart\.id/);
  assert.match(route, /cartState\.cart\.revision !== currentLoad\.data\.cart\.revision/);
  assert.match(route, /router\.replace\('\/order\/status'\)/);
});

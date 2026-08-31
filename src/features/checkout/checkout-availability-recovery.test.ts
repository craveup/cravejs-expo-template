import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { StorefrontCart } from '@craveup/storefront-sdk';

import type { CheckoutHandoffState } from '../../domain/checkout/index.ts';
import { createStorefrontCartFixture } from '../../fixtures/storefront-cart-fixture.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { CustomerAuthState } from '../auth/customer-auth-state.ts';
import type { BagItemPresentation, BagReadyPresentation } from '../bag/index.ts';
import type { CheckoutFlowReady } from './checkout-flow.ts';
import {
  createCheckoutAvailabilityRecoveryPresentation,
  projectCheckoutAvailabilityRecovery,
} from './checkout-availability-recovery.ts';

const authenticated = Object.freeze({
  profile: Object.freeze({
    customerEmail: 'member@example.test',
    customerName: 'Avery',
    id: 'customer_1',
    lastName: 'Tea',
    phoneNumber: null,
    profilePicture: '',
  }),
  status: 'authenticated',
} satisfies Extract<CustomerAuthState, { status: 'authenticated' }>);

const removedItem: BagItemPresentation = Object.freeze({
  id: 'item_removed',
  name: 'Golden Buddha Silk Boba',
  priceLabel: '$7.50',
  quantity: 1,
});

const remainingItem: BagItemPresentation = Object.freeze({
  id: 'item_remaining',
  name: 'Signature Icy Peak Boba',
  priceLabel: '$9.45',
  quantity: 1,
});

function cart(
  revision: number,
  items: readonly BagItemPresentation[],
): StorefrontCart {
  return createStorefrontCartFixture({
    id: 'cart_fixture',
    items: items.map((item) => ({
      categoryId: null,
      description: '',
      discount: '0.00',
      discountFormatted: '$0.00',
      id: item.id,
      imageUrl: '',
      itemUnavailableAction: 'remove_item',
      name: item.name,
      price: item.priceLabel.slice(1),
      priceFormatted: item.priceLabel,
      productId: `product_${item.id}`,
      quantity: item.quantity,
      selections: [],
      specialInstructions: '',
      total: item.priceLabel.slice(1),
      totalFormatted: item.priceLabel,
    })),
    locationId: 'location_fixture',
    revision,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
  });
}

function bag(
  revision: number,
  items: readonly BagItemPresentation[],
  totalLabel: string,
): BagReadyPresentation {
  return Object.freeze({
    cartId: 'cart_fixture',
    fulfillmentLabel: 'Pickup',
    items: Object.freeze([...items]),
    locationLabel: '1260 3rd St Promenade',
    merchantName: 'Example Tea',
    revision,
    status: 'ready',
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    totals: Object.freeze({
      adjustments: Object.freeze([]),
      subtotalLabel: totalLabel,
      taxLabel: '$0.80',
      totalLabel,
    }),
  });
}

function ready(
  revision: number,
  items: readonly BagItemPresentation[],
  totalLabel: string,
): CheckoutFlowReady {
  const projectedBag = bag(revision, items, totalLabel);
  return Object.freeze({
    auth: authenticated,
    cart: cart(revision, items),
    review: Object.freeze({
      bag: projectedBag,
      cartId: projectedBag.cartId,
      customerLabel: 'Avery Tea · member@example.test',
      gratuityOptions: Object.freeze([]),
      orderTimeLabel: 'As soon as possible',
      revision,
    }),
  });
}

const previous = ready(4, [removedItem, remainingItem], '$17.75');
const refreshed = ready(5, [remainingItem], '$10.25');
const refreshedEmpty = Object.freeze({
  auth: authenticated,
  cart: cart(5, []),
  totalLabel: '$0.00',
});
const serverValidationFailure: StorefrontFailure = Object.freeze({
  code: 'CART_VALIDATION_ERROR',
  kind: 'invalid_request',
  requestId: 'request-fixture',
  retryable: false,
  status: 422,
});
const preHandoffFailure: CheckoutHandoffState = Object.freeze({
  attemptId: 'checkout_handoff_1',
  failure: 'pre_handoff',
  stage: 'prepare',
  status: 'failed',
});

test('projects 5J only from a server validation failure and an authoritative removed item', () => {
  assert.deepEqual(
    projectCheckoutAvailabilityRecovery(
      previous,
      refreshed,
      serverValidationFailure,
      preHandoffFailure,
    ),
    {
      current: {
        checkout: refreshed,
        kind: 'ready',
      },
      removedItems: [
        {
          id: removedItem.id,
          name: removedItem.name,
          quantity: removedItem.quantity,
        },
      ],
      requestId: 'request-fixture',
    },
  );
});

test('projects 5J when the authoritative refresh removes the only bag item', () => {
  const onlyItemPrevious = ready(4, [removedItem], '$7.50');
  const recovery = projectCheckoutAvailabilityRecovery(
    onlyItemPrevious,
    refreshedEmpty,
    serverValidationFailure,
    preHandoffFailure,
  );

  assert.ok(recovery);
  assert.deepEqual(recovery.current, {
    kind: 'empty',
    totalLabel: '$0.00',
  });
  assert.deepEqual(recovery.removedItems, [
    {
      id: removedItem.id,
      name: removedItem.name,
      quantity: removedItem.quantity,
    },
  ]);
  assert.deepEqual(createCheckoutAvailabilityRecoveryPresentation(recovery), {
    backActionLabel: 'Back to bag',
    body: 'We refreshed your bag because its contents changed. Review the latest total before continuing.',
    currentEmptyLabel: 'Your bag is now empty.',
    currentItems: [],
    currentLabel: 'YOUR BAG NOW',
    menuActionLabel: 'Pick something else instead',
    removedItems: [
      {
        id: 'item_removed',
        label: '1 × Golden Buddha Silk Boba',
        statusLabel: 'Removed',
      },
    ],
    removedLabel: 'REMOVED',
    requestLabel: 'Reference: request-fixture',
    reviewActionLabel: 'Review updated bag',
    title: 'YOUR BAG JUST CHANGED',
    totalLabel: '$0.00',
    totalTitle: 'New total',
  });
});

test('projects a same-line quantity reduction as removed units', () => {
  const twoCups = Object.freeze({ ...removedItem, quantity: 2 });
  const oneCup = Object.freeze({ ...removedItem, quantity: 1 });
  const quantityPrevious = ready(4, [twoCups], '$15.00');
  const quantityRefreshed = ready(5, [oneCup], '$7.50');

  const recovery = projectCheckoutAvailabilityRecovery(
    quantityPrevious,
    quantityRefreshed,
    serverValidationFailure,
    preHandoffFailure,
  );

  assert.ok(recovery);
  assert.deepEqual(recovery.removedItems, [
    {
      id: removedItem.id,
      name: removedItem.name,
      quantity: 1,
    },
  ]);
  assert.deepEqual(
    createCheckoutAvailabilityRecoveryPresentation(recovery).removedItems,
    [
      {
        id: removedItem.id,
        label: `1 × ${removedItem.name}`,
        statusLabel: 'Removed',
      },
    ],
  );
});

test('uses cause-neutral copy when a public availability code set is not released', () => {
  const recovery = projectCheckoutAvailabilityRecovery(
    previous,
    refreshed,
    {
      code: 'INVALID_GRATUITY',
      kind: 'invalid_request',
      retryable: false,
      status: 422,
    },
    preHandoffFailure,
  );

  assert.ok(recovery);
  const presentation = createCheckoutAvailabilityRecoveryPresentation(recovery);
  assert.equal(presentation.title, 'YOUR BAG JUST CHANGED');
  assert.equal(presentation.removedItems[0]?.statusLabel, 'Removed');
  assert.doesNotMatch(JSON.stringify(presentation), /sold out|unavailable/iu);
});

test('denies 5J for local, offline, authentication, and unstructured failures', () => {
  for (const failure of [
    { code: 'CLIENT_VALIDATION_ERROR', kind: 'invalid_request', retryable: false },
    { code: 'NETWORK_OFFLINE', kind: 'unavailable', retryable: true },
    { code: 'CUSTOMER_AUTH_REQUIRED', kind: 'authentication_required', retryable: false, status: 401 },
    { kind: 'invalid_request', retryable: false, status: 422 },
    { code: 'UPSTREAM_FAILURE', kind: 'unavailable', retryable: true, status: 503 },
  ] satisfies StorefrontFailure[]) {
    assert.equal(
      projectCheckoutAvailabilityRecovery(
        previous,
        refreshed,
        failure,
        preHandoffFailure,
      ),
      undefined,
    );
  }
});

test('denies 5J after preparation succeeds, browser opening begins, or the outcome is unknown', () => {
  const states: CheckoutHandoffState[] = [
    {
      attemptId: 'checkout_handoff_1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'handoff_ready',
    },
    {
      attemptId: 'checkout_handoff_1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'opening_hosted_checkout',
    },
    {
      attemptId: 'checkout_handoff_1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'handed_off',
    },
    {
      attemptId: 'checkout_handoff_1',
      cause: 'prepare_unknown',
      status: 'outcome_unknown',
    },
  ];

  for (const state of states) {
    assert.equal(
      projectCheckoutAvailabilityRecovery(
        previous,
        refreshed,
        serverValidationFailure,
        state,
      ),
      undefined,
    );
  }
});

test('denies 5J when refreshed cart truth is stale, cross-scoped, or removed nothing', () => {
  const noRemoval = ready(5, [removedItem, remainingItem], '$17.75');
  const stale = ready(3, [remainingItem], '$10.25');
  const otherCart = Object.freeze({
    ...refreshed,
    cart: Object.freeze({ ...refreshed.cart, id: 'cart_other' }),
  });
  const otherLocation = Object.freeze({
    ...refreshed,
    cart: Object.freeze({ ...refreshed.cart, locationId: 'location_other' }),
  });
  const untrustedEmptyTotal = Object.freeze({
    ...refreshedEmpty,
    totalLabel: '$99.00',
  });

  for (const candidate of [
    noRemoval,
    stale,
    otherCart,
    otherLocation,
    untrustedEmptyTotal,
  ]) {
    assert.equal(
      projectCheckoutAvailabilityRecovery(
        previous,
        candidate,
        serverValidationFailure,
        preHandoffFailure,
      ),
      undefined,
    );
  }
});

test('keeps a plain revision conflict on generic cart reconciliation', () => {
  const conflict: StorefrontFailure = Object.freeze({
    code: 'CART_CONFLICT',
    kind: 'conflict',
    retryable: false,
    status: 409,
  });

  assert.equal(
    projectCheckoutAvailabilityRecovery(
      previous,
      refreshed,
      conflict,
      preHandoffFailure,
    ),
    undefined,
  );
});

test('5J presentation keeps removed and current server truth without a charge or order claim', () => {
  const recovery = projectCheckoutAvailabilityRecovery(
    previous,
    refreshed,
    serverValidationFailure,
    preHandoffFailure,
  );
  assert.ok(recovery);

  const presentation = createCheckoutAvailabilityRecoveryPresentation(recovery);
  assert.deepEqual(presentation, {
    backActionLabel: 'Back to bag',
    body: 'We refreshed your bag because its contents changed. Review the latest total before continuing.',
    currentItems: [
      {
        id: 'item_remaining',
        label: '1 × Signature Icy Peak Boba',
        priceLabel: '$9.45',
      },
    ],
    currentLabel: 'STILL IN YOUR BAG',
    menuActionLabel: 'Pick something else instead',
    removedItems: [
      {
        id: 'item_removed',
        label: '1 × Golden Buddha Silk Boba',
        statusLabel: 'Removed',
      },
    ],
    removedLabel: 'REMOVED',
    requestLabel: 'Reference: request-fixture',
    reviewActionLabel: 'Review updated checkout',
    title: 'YOUR BAG JUST CHANGED',
    totalLabel: '$10.25',
    totalTitle: 'New total',
  });

  assert.doesNotMatch(
    JSON.stringify(presentation),
    /nothing (?:is )?charged|not been charged|order (?:number|placed)|place order|−\$/iu,
  );
});

test('5J presentation supports multiple removed items and omits an absent request reference', () => {
  const secondRemoved = Object.freeze({
    id: 'item_removed_2',
    name: 'ABC Chai',
    priceLabel: '$7.25',
    quantity: 2,
  });
  const multiPrevious = ready(
    4,
    [removedItem, secondRemoved, remainingItem],
    '$32.25',
  );
  const recovery = projectCheckoutAvailabilityRecovery(
    multiPrevious,
    refreshed,
    { ...serverValidationFailure, requestId: undefined },
    preHandoffFailure,
  );
  assert.ok(recovery);

  const presentation = createCheckoutAvailabilityRecoveryPresentation(recovery);
  assert.equal(presentation.title, 'YOUR BAG JUST CHANGED');
  assert.deepEqual(presentation.removedItems, [
    {
      id: 'item_removed',
      label: '1 × Golden Buddha Silk Boba',
      statusLabel: 'Removed',
    },
    {
      id: 'item_removed_2',
      label: '2 × ABC Chai',
      statusLabel: 'Removed',
    },
  ]);
  assert.equal(presentation.requestLabel, undefined);
});

test('5J omits an unsafe request reference even when a typed boundary is bypassed', () => {
  const recovery = projectCheckoutAvailabilityRecovery(
    previous,
    refreshed,
    {
      ...serverValidationFailure,
      requestId: 'request\nnot-safe',
    },
    preHandoffFailure,
  );

  assert.ok(recovery);
  assert.equal(recovery.requestId, undefined);
  assert.equal(
    createCheckoutAvailabilityRecoveryPresentation(recovery).requestLabel,
    undefined,
  );
});

test('5J screen renders the safe recovery model without transport, money math, or provider claims', () => {
  const source = readFileSync(
    new URL('./CheckoutAvailabilityRecoveryScreen.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /createCheckoutAvailabilityRecoveryPresentation/);
  assert.match(source, /accessibilityLiveRegion="assertive"/);
  assert.match(source, /onBack/);
  assert.match(source, /onReviewUpdatedCheckout/);
  assert.match(source, /onBrowseMenu/);
  assert.match(source, /presentation\.removedItems\.map/);
  assert.match(source, /presentation\.currentItems\.map/);
  assert.match(source, /presentation\.totalLabel/);
  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|Storefront|checkout\.prepare|createPaymentIntent|PaymentSheet|Stripe|nothing (?:is )?charged|not been charged|order number|place order|parseFloat|Number\s*\(|\.reduce\s*\(/iu,
  );
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/iu);
});

test('checkout route refreshes once, shows 5J, and requires review before another handoff', () => {
  const route = readFileSync(
    new URL('../../app/checkout.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /CheckoutAvailabilityRecoveryScreen/);
  assert.match(route, /projectCheckoutAvailabilityRecovery/);
  assert.match(route, /pendingAvailabilityRecovery/);
  assert.match(route, /targetAttempt/);
  assert.match(route, /setAvailabilityRecovery\(availability\)/);
  assert.match(route, /result\.kind === 'empty_cart'/);
  assert.match(route, /availabilityRecovery \?/);
  assert.match(
    route,
    /availabilityRecovery\.current\.kind === 'empty'/,
  );
  assert.match(route, /onBrowseMenu=\{\(\) => router\.replace\('\/menu'/);
  assert.match(route, /onBack=\{\(\) => router\.replace\('\/bag'/);
  assert.doesNotMatch(
    route,
    /onReviewUpdatedCheckout=\{[^}]*checkout\.(?:start|retry|resume)/,
  );
});

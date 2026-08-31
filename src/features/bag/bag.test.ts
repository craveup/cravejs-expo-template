import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type {
  CartItem,
  StorefrontCart,
} from '@craveup/storefront-sdk';

import { createCanonicalStorefrontFixture } from '../../fixtures/storefront-fixtures.ts';
import { createStorefrontCartFixture } from '../../fixtures/storefront-cart-fixture.ts';
import type { StorefrontBootstrapSnapshot } from '../../lib/storefront-bootstrap-service.ts';
import {
  bagFailureState,
  createBagIntentKey,
  projectBagCart,
} from './bag-presentation.ts';
import {
  loadBag,
  resolveBagMutation,
  retryBagLoad,
} from './bag-loader.ts';

function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    categoryId: 'category_fixture',
    description: 'Fixture drink',
    discount: '0.00',
    discountFormatted: '$0.00',
    id: 'item_fixture',
    imageUrl: 'https://cdn.example.test/drink.png',
    itemUnavailableAction: 'remove_item',
    name: 'Fixture drink',
    price: '5.00',
    priceFormatted: '$5.00',
    productId: 'product_fixture',
    quantity: 2,
    selections: [
      {
        id: 'modifier_group_fixture',
        items: [
          {
            children: [],
            id: 'modifier_item_fixture',
            name: 'Oat milk',
            price: '0.75',
            priceFormatted: '$0.75',
            quantity: 1,
          },
        ],
        name: 'Milk',
        rule: { max: 1, min: 1 },
      },
    ],
    total: '10.00',
    totalFormatted: '$10.00',
    ...overrides,
  };
}

function readyCart(overrides: Partial<StorefrontCart> = {}): StorefrontCart {
  return createStorefrontCartFixture({
    discountTotal: '1.00',
    discountTotalFormatted: '-$1.00',
    fulfillmentMethodFeeTotal: '0.50',
    fulfillmentMethodFeeTotalFormatted: '$0.50',
    items: [cartItem()],
    orderTotal: '10.27',
    orderTotalFormatted: '$10.27',
    restaurantDisplayName: 'Fixture Merchant',
    serviceFeeTotal: '0.25',
    serviceFeeTotalFormatted: '$0.25',
    subTotal: '10.00',
    subTotalFormatted: '$10.00',
    taxTotal: '0.52',
    taxTotalFormatted: '$0.52',
    totalQuantity: 2,
    ...overrides,
  });
}

function bootstrapSnapshot(): StorefrontBootstrapSnapshot {
  const fixture = createCanonicalStorefrontFixture();
  return {
    location: fixture.location,
    menus: { menus: fixture.menus, popularProducts: [] },
    merchant: {
      ...fixture.merchant,
      logo: 'https://cdn.example.test/logo.png',
    },
    readiness: {
      fulfillmentMethod: 'takeout',
      orderDate: '2099-01-01',
      orderTime: '10:30 AM - 10:45 AM',
      pickupType: 'ASAP',
      ready: true,
    },
  };
}

test('bag projection uses only authoritative cart item and total labels', () => {
  const input = readyCart();
  const before = JSON.stringify(input);
  const result = projectBagCart(input, {
    locationAddress: '100 Example Avenue',
    merchantName: 'Fixture Merchant',
    pointsToEarn: 23,
  });

  assert.ok(result);
  assert.equal(result.items[0]?.priceLabel, '$10.00');
  assert.equal(result.items[0]?.description, 'Oat milk');
  assert.equal(result.totals.subtotalLabel, '$10.00');
  assert.equal(result.totals.taxLabel, '$0.52');
  assert.equal(result.totals.totalLabel, '$10.27');
  assert.deepEqual(
    result.totals.adjustments.map(({ value }) => value),
    ['-$1.00', '$0.25', '$0.50'],
  );
  assert.equal(result.pointsToEarn, 23);
  assert.equal(JSON.stringify(input), before);
});

test('bag projection fails closed on malformed or inconsistent cart records', () => {
  assert.equal(
    projectBagCart(readyCart({ totalQuantity: 1 })),
    undefined,
  );
  assert.equal(
    projectBagCart(
      readyCart({
        items: [
          cartItem(),
          cartItem({ productId: 'another_product' }),
        ],
        totalQuantity: 4,
      }),
    ),
    undefined,
  );
  assert.equal(
    projectBagCart(
      readyCart({
        items: [cartItem({ imageUrl: 'http://cdn.example.test/drink.png' })],
      }),
    ),
    undefined,
  );
  assert.equal(
    projectBagCart(readyCart(), { pointsToEarn: -1 }),
    undefined,
  );
  assert.equal(
    projectBagCart(readyCart({ revision: -1 })),
    undefined,
  );
  assert.equal(
    projectBagCart(readyCart({ orderTotalFormatted: 'bad\nvalue' })),
    undefined,
  );
  assert.equal(
    projectBagCart(readyCart({ serviceFeeTotalFormatted: 'bad\nvalue' })),
    undefined,
  );
  assert.equal(
    projectBagCart(
      readyCart({
        items: [cartItem({ specialInstructions: 'x'.repeat(501) })],
      }),
    ),
    undefined,
  );
});

test('bag loader fails closed when a dependency rejects or shell copy is unsafe', async () => {
  const fixture = createCanonicalStorefrontFixture();
  const dependencyFailure = await loadBag(
    {
      bootstrap: {
        load: async () => {
          throw new Error('transport escaped its adapter');
        },
      },
      cart: { load: async () => ({ cart: readyCart(), kind: 'ready' }) },
      cartSessions: { get: async () => null },
      locationId: fixture.scope.locationId,
    },
    'bag_load_fixture',
  );
  assert.deepEqual(dependencyFailure, {
    retry: 'new_intent',
    status: 'error',
  });

  const unsafeSnapshot = bootstrapSnapshot();
  const unsafeShell = await loadBag(
    {
      bootstrap: {
        load: async () => ({
          data: {
            ...unsafeSnapshot,
            location: {
              ...unsafeSnapshot.location,
              addressString: 'unsafe\naddress',
            },
          },
          kind: 'ready',
        }),
      },
      cart: { load: async () => ({ cart: readyCart(), kind: 'ready' }) },
      cartSessions: { get: async () => null },
      locationId: fixture.scope.locationId,
    },
    'bag_load_fixture',
  );
  assert.deepEqual(unsafeShell, { status: 'unavailable' });
});

test('bag loader renders an empty state without calling cart when no session exists', async () => {
  let cartLoads = 0;
  const fixture = createCanonicalStorefrontFixture();
  const state = await loadBag(
    {
      bootstrap: {
        load: async () => ({ data: bootstrapSnapshot(), kind: 'ready' }),
      },
      cart: {
        load: async () => {
          cartLoads += 1;
          return { cart: readyCart(), kind: 'ready' };
        },
      },
      cartSessions: { get: async () => null },
      locationId: fixture.scope.locationId,
    },
    'bag_load_fixture',
  );

  assert.equal(state.status, 'empty');
  assert.equal(cartLoads, 0);
  if (state.status === 'empty') {
    assert.equal(state.fulfillmentLabel, 'Pickup');
    assert.equal(state.locationLabel, fixture.location.addressString);
    assert.equal(state.merchantName, fixture.merchant.name);
  }
});

test('bag loader adds a published loyalty quote without making it cart truth', async () => {
  const fixture = createCanonicalStorefrontFixture();
  const cart = readyCart();
  const state = await loadBag(
    {
      bootstrap: {
        load: async () => ({ data: bootstrapSnapshot(), kind: 'ready' }),
      },
      cart: { load: async () => ({ cart, kind: 'ready' }) },
      cartSessions: {
        get: async () => ({
          cartId: cart.id,
          locationId: fixture.scope.locationId,
          revision: cart.revision,
        }),
      },
      locationId: fixture.scope.locationId,
      loyalty: {
        getQuote: async () => ({
          data: { available: true, enabled: true, pointsToEarn: 19 },
          kind: 'ready',
        }),
      },
    },
    'bag_load_fixture',
  );

  assert.equal(state.status, 'ready');
  if (state.status === 'ready') {
    assert.equal(state.pointsToEarn, 19);
    assert.equal(state.totals.totalLabel, '$10.27');
  }
});

test('optional loyalty failure does not hide an authoritative ready cart', async () => {
  const fixture = createCanonicalStorefrontFixture();
  const cart = readyCart();
  const state = await loadBag(
    {
      bootstrap: {
        load: async () => ({ data: bootstrapSnapshot(), kind: 'ready' }),
      },
      cart: { load: async () => ({ cart, kind: 'ready' }) },
      cartSessions: {
        get: async () => ({
          cartId: cart.id,
          locationId: fixture.scope.locationId,
          revision: cart.revision,
        }),
      },
      locationId: fixture.scope.locationId,
      loyalty: {
        getQuote: async () => {
          throw new Error('optional quote unavailable');
        },
      },
    },
    'bag_load_fixture',
  );

  assert.equal(state.status, 'ready');
  if (state.status === 'ready') assert.equal(state.pointsToEarn, undefined);
});

test('conflict reconciliation shows the refreshed cart and requires a new intent', async () => {
  const previous = projectBagCart(readyCart());
  const refreshed = readyCart({
    items: [cartItem({ quantity: 1, total: '5.00', totalFormatted: '$5.00' })],
    orderTotal: '5.52',
    orderTotalFormatted: '$5.52',
    revision: 2,
    subTotal: '5.00',
    subTotalFormatted: '$5.00',
    totalQuantity: 1,
  });
  assert.ok(previous);

  const state = await resolveBagMutation(
    {},
    {
      cart: refreshed,
      failure: {
        code: 'CART_CONFLICT',
        kind: 'conflict',
        retryable: false,
      },
      kind: 'reconciliation_required',
    },
    previous,
  );

  assert.equal(state.status, 'error');
  if (state.status === 'error') {
    assert.equal(state.retry, 'new_intent');
    assert.equal(state.previous?.revision, 2);
    assert.equal(state.previous?.totalQuantity, 1);
  }
});

test('same-intent retry is reserved for an attempted cart command', () => {
  const timeoutFailure = {
    code: 'NETWORK_TIMEOUT',
    kind: 'timeout',
    retryable: true,
  } as const;

  assert.deepEqual(bagFailureState(timeoutFailure), {
    retry: 'new_intent',
    status: 'error',
  });
  assert.deepEqual(bagFailureState(timeoutFailure, undefined, true), {
    retry: 'same_intent',
    status: 'error',
  });
});

test('repeated same-intent failure retains the last confirmed bag', async () => {
  const previous = projectBagCart(readyCart());
  const fixture = createCanonicalStorefrontFixture();
  assert.ok(previous);

  const state = await retryBagLoad(
    {
      bootstrap: {
        load: async () => ({ data: bootstrapSnapshot(), kind: 'ready' }),
      },
      cart: { load: async () => ({ cart: readyCart(), kind: 'ready' }) },
      cartSessions: { get: async () => null },
      locationId: fixture.scope.locationId,
    },
    {
      retry: async () => ({
        failure: {
          code: 'NETWORK_TIMEOUT',
          kind: 'timeout',
          retryable: true,
        },
        kind: 'failed',
      }),
    },
    previous,
  );

  assert.equal(state.status, 'error');
  if (state.status === 'error') {
    assert.equal(state.retry, 'same_intent');
    assert.equal(state.previous, previous);
  }
});

test('an unexpected exact-retry rejection preserves the confirmed bag and retry intent', async () => {
  const previous = projectBagCart(readyCart());
  const fixture = createCanonicalStorefrontFixture();
  assert.ok(previous);

  const state = await retryBagLoad(
    {
      bootstrap: {
        load: async () => ({ data: bootstrapSnapshot(), kind: 'ready' }),
      },
      cart: { load: async () => ({ cart: readyCart(), kind: 'ready' }) },
      cartSessions: { get: async () => null },
      locationId: fixture.scope.locationId,
    },
    {
      retry: async () => {
        throw new Error('transport escaped its adapter');
      },
    },
    previous,
  );

  assert.deepEqual(state, {
    previous,
    retry: 'same_intent',
    status: 'error',
  });
});

test('bag intent keys are unique, scoped by action, and reject unsafe inputs', () => {
  assert.equal(createBagIntentKey('remove', 100, 1), 'bag_remove_2s_1');
  assert.notEqual(
    createBagIntentKey('remove', 100, 1),
    createBagIntentKey('quantity', 100, 1),
  );
  assert.throws(() => createBagIntentKey('clear', -1, 1));
  assert.throws(() => createBagIntentKey('load', 1, 0));
});

test('bag routes keep capabilities out of URLs and never own transport or checkout results', () => {
  const presentation = readFileSync(
    new URL('./BagPresentation.tsx', import.meta.url),
    'utf8',
  );
  const provider = readFileSync(
    new URL('./BagProvider.tsx', import.meta.url),
    'utf8',
  );
  const bagRoute = readFileSync(
    new URL('../../app/(tabs)/(bag)/bag.tsx', import.meta.url),
    'utf8',
  );
  const removeRoute = readFileSync(
    new URL('../../app/(tabs)/(bag)/bag-remove-item.tsx', import.meta.url),
    'utf8',
  );
  const bagStack = readFileSync(
    new URL('../../app/(tabs)/(bag)/_layout.tsx', import.meta.url),
    'utf8',
  );
  const rootStack = readFileSync(
    new URL('../../app/_layout.tsx', import.meta.url),
    'utf8',
  );
  const confirmation = readFileSync(
    new URL('./BagConfirmationPresentation.tsx', import.meta.url),
    'utf8',
  );
  const localization = readFileSync(
    new URL('../../i18n/localization.ts', import.meta.url),
    'utf8',
  );
  const combined = [presentation, provider, bagRoute, removeRoute].join('\n');

  assert.doesNotMatch(combined, /\bfetch\s*\(/);
  assert.doesNotMatch(combined, /createPaymentIntent|PaymentSheet|handoffToken/);
  assert.doesNotMatch(removeRoute, /useLocalSearchParams|cartId=|capability=/);
  assert.match(presentation, /checkoutEnabled = false/);
  assert.match(provider, /configured\.cart\.retry\(\)/);
  assert.match(
    provider,
    /previousActive !== active[\s\S]{0,160}setCheckoutLocked\(true\)/,
  );
  assert.match(provider, /configured\.checkoutRecovery\?\.isLocked\(\)/);
  assert.match(bagStack, /name="bag-clear"[\s\S]{0,80}presentation: 'modal'/);
  assert.match(bagStack, /name="bag-remove-item"[\s\S]{0,100}presentation: 'modal'/);
  assert.doesNotMatch(rootStack, /<Stack\.Screen name="bag-(?:clear|remove-item)"/);
  assert.match(confirmation, /BagMerchantHeader/);
  assert.match(confirmation, /item\.quantity} × /);
  assert.match(localization, /'bag\.tax': 'Tax'/);
  assert.doesNotMatch(localization, /Estimated tax|points stay put/i);
});

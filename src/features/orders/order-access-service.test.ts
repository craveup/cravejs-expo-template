import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStorefrontOrderFixture } from '../../fixtures/storefront-order-fixture.ts';
import { createCartSessionStore } from '../../lib/cart-session.ts';
import { createCustomerSessionStore } from '../../lib/customer-session.ts';
import { createReceiptSessionStore } from '../../lib/receipt-session.ts';
import { createInMemoryStorefrontSecretStore } from '../../lib/storefront-secret-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import {
  createOrderAccessService,
  type OrderAccessClient,
} from './order-access-service.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

function client(overrides: {
  active?: OrderAccessClient['checkout']['getOrderResult'];
  getOrder?: OrderAccessClient['customer']['orders']['get'];
  getReceipt?: OrderAccessClient['receipts']['get'];
  listOrders?: OrderAccessClient['customer']['orders']['list'];
} = {}): OrderAccessClient {
  return {
    checkout: {
      getOrderResult:
        overrides.active ?? (async () => ({ state: 'payment_pending' })),
    },
    customer: {
      orders: {
        get: overrides.getOrder ?? (async () => createStorefrontOrderFixture()),
        list:
          overrides.listOrders ??
          (async () => ({ items: [createStorefrontOrderFixture()], nextCursor: null })),
      },
    },
    receipts: {
      get: overrides.getReceipt ?? (async () => createStorefrontOrderFixture()),
    },
  };
}

function setup(clientValue: OrderAccessClient) {
  const storage = createInMemoryStorefrontSecretStore();
  const carts = createCartSessionStore(scope, storage);
  const customers = createCustomerSessionStore(scope, storage);
  const receipts = createReceiptSessionStore(scope);
  const service = createOrderAccessService(
    clientValue,
    carts,
    customers,
    receipts,
    scope.locationId,
  );

  return { carts, customers, receipts, service };
}

test('order history passes bounded cursor pagination and preserves server totals', async () => {
  const calls: unknown[] = [];
  const detail = createStorefrontOrderFixture({ orderTotal: '12.34' });
  const { service } = setup(
    client({
      async listOrders(params) {
        calls.push(params);
        return { items: [detail], nextCursor: 'cursor_fixture_2' };
      },
    }),
  );

  const result = await service.listOrders({ cursor: 'cursor_fixture_1', limit: 20 });

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [{ cursor: 'cursor_fixture_1', limit: 20 }]);
  assert.equal(result.kind === 'ready' ? result.data.items[0]?.orderTotal : undefined, '12.34');
});

test('invalid pagination and order IDs fail before any SDK request', async () => {
  let calls = 0;
  const { service } = setup(
    client({
      async getOrder() {
        calls += 1;
        return createStorefrontOrderFixture();
      },
      async listOrders() {
        calls += 1;
        return { items: [], nextCursor: null };
      },
    }),
  );

  assert.equal((await service.listOrders({ limit: 101 })).kind, 'failed');
  assert.equal((await service.listOrders({ cursor: ' bad ' })).kind, 'failed');
  assert.equal((await service.getOrder('../order')).kind, 'failed');
  assert.equal(calls, 0);
});

test('malformed order summaries and details fail closed at the SDK boundary', async () => {
  const malformedSummary = {
    ...createStorefrontOrderFixture(),
    currency: 123,
  } as unknown as ReturnType<typeof createStorefrontOrderFixture>;
  const malformedDetail = {
    ...createStorefrontOrderFixture(),
    items: [
      {
        discount: '0.00',
        id: 'item_fixture',
        modifiers: [],
        name: null,
        price: '1.00',
        quantity: 1,
        specialInstructions: '',
        total: '1.00',
      },
    ],
  } as unknown as ReturnType<typeof createStorefrontOrderFixture>;
  const { service } = setup(
    client({
      async getOrder() {
        return malformedDetail;
      },
      async listOrders() {
        return { items: [malformedSummary], nextCursor: null };
      },
    }),
  );

  assert.equal((await service.listOrders()).kind, 'failed');
  assert.equal((await service.getOrder('order_fixture')).kind, 'failed');
});

test('oversized order collections are rejected before their entries are inspected', async () => {
  const oversizedPageItems = new Array(101);
  const oversizedOrderItems = new Array(501);
  Object.defineProperty(oversizedPageItems, 0, {
    get() {
      throw new Error('oversized page entries must not be inspected');
    },
  });
  Object.defineProperty(oversizedOrderItems, 0, {
    get() {
      throw new Error('oversized order entries must not be inspected');
    },
  });

  const { service } = setup(
    client({
      async getOrder() {
        return {
          ...createStorefrontOrderFixture(),
          items: oversizedOrderItems,
        };
      },
      async listOrders() {
        return { items: oversizedPageItems, nextCursor: null };
      },
    }),
  );

  for (const result of [await service.listOrders(), await service.getOrder('order_fixture')]) {
    assert.equal(result.kind, 'failed');
    assert.equal(
      result.kind === 'failed' ? result.failure.code : undefined,
      'INVALID_STOREFRONT_RESPONSE',
    );
  }
});

test('malformed nested order detail fields fail closed at the SDK boundary', async () => {
  const malformedDetails = [
    createStorefrontOrderFixture({
      deliveryInfo: { deliveryAddress: null },
    } as unknown as Parameters<typeof createStorefrontOrderFixture>[0]),
    createStorefrontOrderFixture({
      payment: {},
    } as unknown as Parameters<typeof createStorefrontOrderFixture>[0]),
    createStorefrontOrderFixture({
      payment: {
        cardBrand: 'visa',
        cardLast4: 4242,
        walletType: null,
      },
    } as unknown as Parameters<typeof createStorefrontOrderFixture>[0]),
    createStorefrontOrderFixture({
      roomServiceInfo: { lastName: 42 },
    } as unknown as Parameters<typeof createStorefrontOrderFixture>[0]),
    createStorefrontOrderFixture({
      tableServiceInfo: { tableNumber: 'x'.repeat(501) },
    }),
  ];

  for (const malformedDetail of malformedDetails) {
    const { service } = setup(
      client({
        async getOrder() {
          return malformedDetail;
        },
      }),
    );

    const result = await service.getOrder('order_fixture');

    assert.equal(result.kind, 'failed');
    assert.equal(
      result.kind === 'failed' ? result.failure.code : undefined,
      'INVALID_STOREFRONT_RESPONSE',
    );
  }
});

test('published nested order detail fields remain available', async () => {
  const detail = createStorefrontOrderFixture({
    deliveryInfo: { deliveryAddress: '123 Tea Street' },
    payment: {
      cardBrand: 'visa',
      cardLast4: '42',
      walletType: null,
    },
    roomServiceInfo: { lastName: 'Tea', roomNumber: '204' },
    tableServiceInfo: { tableNumber: '12' },
  });
  const { service } = setup(
    client({
      async getOrder() {
        return detail;
      },
    }),
  );

  const result = await service.getOrder('order_fixture');

  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.kind === 'ready' ? result.data : undefined, detail);
});

test('order access projects only the exact published response fields', async () => {
  const detail = {
    ...createStorefrontOrderFixture({
      deliveryInfo: { deliveryAddress: '123 Tea Street' },
    }),
    internalOrderReference: 'private-order',
    items: [
      {
        discount: '0.00',
        id: 'item_fixture',
        modifiers: [
          {
            groupName: 'Size',
            internalModifierCode: 'private-modifier',
            name: 'Large',
            price: '1.00',
            quantity: 1,
          },
        ],
        name: 'Tea',
        price: '5.00',
        providerItemId: 'private-item',
        quantity: 1,
        specialInstructions: '',
        total: '6.00',
      },
    ],
    payment: {
      cardBrand: 'visa',
      cardLast4: '4242',
      providerPaymentId: 'private-payment',
      walletType: null,
    },
  } as unknown as ReturnType<typeof createStorefrontOrderFixture>;

  const { service } = setup(
    client({
      async active() {
        return {
          internalState: 'private-result',
          order: detail,
          state: 'completed',
        } as unknown as Awaited<ReturnType<OrderAccessClient['checkout']['getOrderResult']>>;
      },
      async getOrder() {
        return detail;
      },
      async listOrders() {
        return {
          internalCursor: 'private-page',
          items: [detail],
          nextCursor: null,
        } as unknown as Awaited<ReturnType<OrderAccessClient['customer']['orders']['list']>>;
      },
    }),
  );

  const page = await service.listOrders();
  const order = await service.getOrder('order_fixture');
  const active = await service.getActiveResult('cart_fixture');

  assert.equal(page.kind, 'ready');
  assert.deepEqual(
    page.kind === 'ready' ? Object.keys(page.data).sort() : [],
    ['items', 'nextCursor'],
  );
  assert.deepEqual(
    page.kind === 'ready' ? Object.keys(page.data.items[0] ?? {}).sort() : [],
    [
      'createdAt',
      'currency',
      'fulfillmentIdentifier',
      'fulfillmentMethod',
      'id',
      'orderDate',
      'orderTime',
      'orderTotal',
      'pickupType',
      'restaurantDisplayName',
      'shortId',
      'status',
      'totalQuantity',
    ],
  );

  assert.equal(order.kind, 'ready');
  assert.equal(
    order.kind === 'ready'
      ? Reflect.get(order.data, 'internalOrderReference')
      : undefined,
    undefined,
  );
  assert.equal(
    order.kind === 'ready'
      ? Reflect.get(order.data.items[0] ?? {}, 'providerItemId')
      : undefined,
    undefined,
  );
  assert.equal(
    order.kind === 'ready'
      ? Reflect.get(order.data.items[0]?.modifiers[0] ?? {}, 'internalModifierCode')
      : undefined,
    undefined,
  );
  assert.equal(
    order.kind === 'ready'
      ? Reflect.get(order.data.payment ?? {}, 'providerPaymentId')
      : undefined,
    undefined,
  );

  assert.equal(active.kind, 'ready');
  assert.deepEqual(
    active.kind === 'ready' ? Object.keys(active.data).sort() : [],
    ['order', 'state'],
  );
});

test('malformed terminal order-result codes fail closed', async () => {
  for (const code of ['', 'unsafe', ' UNSAFE ', 'UNSAFE\nCODE', `A${'A'.repeat(80)}`]) {
    const { service } = setup(
      client({
        async active() {
          return { code, state: 'failed' };
        },
      }),
    );

    const result = await service.getActiveResult('cart_fixture');

    assert.equal(result.kind, 'failed');
    assert.equal(
      result.kind === 'failed' ? result.failure.code : undefined,
      'INVALID_STOREFRONT_RESPONSE',
    );
  }
});

test('customer auth rejection clears only the customer session', async () => {
  const { customers, service } = setup(
    client({
      async listOrders() {
        throw { code: 'UNAUTHORIZED', requestId: 'request-fixture', status: 401 };
      },
    }),
  );
  await customers.setToken('customer.jwt.fixture');

  const result = await service.listOrders();

  assert.equal(result.kind, 'failed');
  assert.equal(
    result.kind === 'failed' ? result.failure.kind : undefined,
    'authentication_required',
  );
  assert.equal(await customers.getAuthToken(), null);
});

test('active-result authorization failure clears stale customer and cart access', async () => {
  const { carts, customers, service } = setup(
    client({
      async active() {
        throw { status: 401 };
      },
    }),
  );
  await customers.setToken('customer.jwt.fixture');
  await carts.set({
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  const result = await service.getActiveResult('cart_fixture');

  assert.equal(result.kind, 'failed');
  assert.equal(await customers.getAuthToken(), null);
  assert.equal(await carts.get(scope.locationId), null);
});

test('guest active-result rejection preserves the customer session', async () => {
  const { carts, customers, service } = setup(
    client({
      async active() {
        throw { status: 401 };
      },
    }),
  );
  await customers.setToken('customer.jwt.fixture');
  await carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  const result = await service.getActiveResult('cart_fixture');

  assert.equal(result.kind, 'failed');
  assert.equal(await customers.getAuthToken(), 'customer.jwt.fixture');
  assert.equal(await carts.get(scope.locationId), null);
});

test('completed active result clears the cart only after server completion', async () => {
  const pendingSetup = setup(client());
  await pendingSetup.carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  assert.equal((await pendingSetup.service.getActiveResult('cart_fixture')).kind, 'ready');
  assert.ok(await pendingSetup.carts.get(scope.locationId));

  const completedSetup = setup(
    client({
      async active() {
        return { order: createStorefrontOrderFixture(), state: 'completed' };
      },
    }),
  );
  await completedSetup.carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  const completed = await completedSetup.service.getActiveResult('cart_fixture');

  assert.equal(completed.kind, 'ready');
  assert.equal(await completedSetup.carts.get(scope.locationId), null);
});

test('completed result for an older cart preserves the current cart', async () => {
  const configured = setup(
    client({
      async active() {
        return { order: createStorefrontOrderFixture(), state: 'completed' };
      },
    }),
  );
  await configured.carts.set({
    accessToken: 'current-capability-fixture',
    cartId: 'cart_current',
    locationId: scope.locationId,
    revision: 2,
  });

  const result = await configured.service.getActiveResult('cart_previous');

  assert.equal(result.kind, 'ready');
  assert.equal(
    (await configured.carts.get(scope.locationId))?.cartId,
    'cart_current',
  );
});

test('completed order truth survives a local cart-cleanup failure', async () => {
  const storage = createInMemoryStorefrontSecretStore();
  const carts = createCartSessionStore(scope, storage);
  const customers = createCustomerSessionStore(scope, storage);
  const receipts = createReceiptSessionStore(scope);
  const service = createOrderAccessService(
    client({
      async active() {
        return { order: createStorefrontOrderFixture(), state: 'completed' };
      },
    }),
    {
      ...carts,
      async clearMatching() {
        throw new Error('secure storage unavailable');
      },
    },
    customers,
    receipts,
    scope.locationId,
  );
  await carts.set({
    accessToken: 'guest-capability-fixture',
    cartId: 'cart_fixture',
    locationId: scope.locationId,
    revision: 2,
  });

  const result = await service.getActiveResult('cart_fixture');

  assert.equal(result.kind, 'ready');
  assert.equal(
    result.kind === 'ready' ? result.data.state : undefined,
    'completed',
  );
  assert.equal(
    result.kind === 'ready' ? result.cleanupFailure?.code : undefined,
    'SECURE_STORAGE_UNAVAILABLE',
  );
});

test('receipt capability is sent only through SDK config and removed after success', async () => {
  const calls: unknown[] = [];
  const { receipts, service } = setup(
    client({
      async getReceipt(receiptId, config) {
        calls.push({ config, receiptId });
        return createStorefrontOrderFixture();
      },
    }),
  );

  assert.equal(
    service.captureReceiptCapability('receipt_fixture', 'receipt-capability-fixture'),
    true,
  );
  const result = await service.getReceipt('receipt_fixture');

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [
    {
      config: { receiptToken: 'receipt-capability-fixture' },
      receiptId: 'receipt_fixture',
    },
  ]);
  assert.equal(receipts.getRequestConfig('receipt_fixture'), undefined);
  assert.doesNotMatch(JSON.stringify(result), /receipt-capability/);
});

test('retryable receipt failures retain the in-memory capability', async () => {
  const { receipts, service } = setup(
    client({
      async getReceipt() {
        throw { name: 'StorefrontTimeoutError' };
      },
    }),
  );
  service.captureReceiptCapability('receipt_fixture', 'receipt-capability-fixture');

  const result = await service.getReceipt('receipt_fixture');

  assert.equal(result.kind, 'failed');
  assert.ok(receipts.getRequestConfig('receipt_fixture'));
});

test('order access service has no direct transport, money math, or secret logging', () => {
  const source = readFileSync(new URL('./order-access-service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|console\.|process\.env|parseFloat|parseInt|Number\([^)]*(?:total|price)/i,
  );
  assert.match(source, /import type \{ StorefrontClient \}/);
});

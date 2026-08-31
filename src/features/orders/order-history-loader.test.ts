import assert from 'node:assert/strict';
import test from 'node:test';

import { createStorefrontOrderFixture } from '../../fixtures/storefront-order-fixture.ts';
import type { OrderAccessService } from './order-access-service.ts';
import {
  getNextOrderHistoryCursor,
  isOrderHistoryOffline,
  loadOrderHistoryPage,
} from './order-history-loader.ts';

type OrderHistoryService = Pick<OrderAccessService, 'getOrder' | 'listOrders'>;

test('2H hydrates customer-owned details with bounded concurrency', async () => {
  const summaries = Array.from({ length: 9 }, (_, index) =>
    createStorefrontOrderFixture({
      id: `order_fixture_${index}`,
      shortId: `FIXTURE-${index}`,
    }),
  );
  let active = 0;
  let maximumActive = 0;

  const service: OrderHistoryService = {
    async getOrder(orderId) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return {
        data: createStorefrontOrderFixture({ id: orderId }),
        kind: 'ready',
      };
    },
    async listOrders(params) {
      assert.deepEqual(params, { cursor: 'cursor_page_1', limit: 20 });
      return {
        data: { items: summaries, nextCursor: 'cursor_page_2' },
        kind: 'ready',
      };
    },
  };

  const result = await loadOrderHistoryPage(service, {
    cursor: 'cursor_page_1',
    limit: 20,
  });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') throw new Error('Expected order history.');
  assert.equal(result.data.summaries.length, 9);
  assert.equal(result.data.details.length, 9);
  assert.equal(result.data.nextCursor, 'cursor_page_2');
  assert.ok(maximumActive <= 4);
});

test('2H keeps detail not found nonfatal and rejects expired identity', async () => {
  const first = createStorefrontOrderFixture({ id: 'order_first' });
  const second = createStorefrontOrderFixture({ id: 'order_second' });
  const base: Pick<OrderHistoryService, 'listOrders'> = {
    async listOrders() {
      return { data: { items: [first, second], nextCursor: null }, kind: 'ready' };
    },
  };

  const partial = await loadOrderHistoryPage({
    ...base,
    async getOrder(orderId) {
      return orderId === first.id
        ? {
            failure: { kind: 'not_found', retryable: false },
            kind: 'failed',
          }
        : { data: second, kind: 'ready' };
    },
  });
  assert.equal(partial.kind, 'ready');
  assert.deepEqual(
    partial.kind === 'ready'
      ? partial.data.details.map(({ id }) => id)
      : [],
    ['order_second'],
  );

  const expired = await loadOrderHistoryPage({
    ...base,
    async getOrder() {
      return {
        failure: { kind: 'authentication_required', retryable: false },
        kind: 'failed',
      };
    },
  });
  assert.deepEqual(expired, {
    failure: { kind: 'authentication_required', retryable: false },
    kind: 'failed',
  });
});

test('2H network state fails closed only on explicit offline evidence', () => {
  assert.equal(isOrderHistoryOffline({ isConnected: false }), true);
  assert.equal(isOrderHistoryOffline({ isInternetReachable: false }), true);
  assert.equal(
    isOrderHistoryOffline({
      isConnected: true,
      isInternetReachable: true,
    }),
    false,
  );
  assert.equal(isOrderHistoryOffline({}), false);
  assert.equal(
    getNextOrderHistoryCursor('cursor_page_2', new Set(['cursor_page_1'])),
    'cursor_page_2',
  );
  assert.equal(
    getNextOrderHistoryCursor(
      'cursor_page_1',
      new Set(['cursor_page_1', 'cursor_page_2']),
    ),
    undefined,
  );
});

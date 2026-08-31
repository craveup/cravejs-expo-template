import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStorefrontOrderFixture } from '../../fixtures/storefront-order-fixture.ts';
import {
  toOrderHistoryFailureStatus,
  toOrderHistoryPresentationRows,
} from './order-history-presentation.ts';

test('order summaries preserve server truth and hydrate item names only from owned detail', () => {
  const summary = createStorefrontOrderFixture({
    currency: 'usd',
    orderTotal: '12.34',
  });
  const detail = createStorefrontOrderFixture({
    ...summary,
    items: [
      {
        discount: '0.00',
        id: 'item_main',
        modifiers: [],
        name: 'Sample Item',
        price: '5.00',
        quantity: 1,
        specialInstructions: '',
        total: '5.00',
      },
      {
        discount: '0.00',
        id: 'item_addon',
        modifiers: [],
        name: 'Add-on',
        price: '3.67',
        quantity: 2,
        specialInstructions: '',
        total: '7.34',
      },
    ],
  });

  assert.deepEqual(
    toOrderHistoryPresentationRows([summary], 'en', {
      activeOrderIds: [summary.id],
      details: [detail],
    }),
    [
      {
        headerLabel:
          'Jan 1, 2099 · 10:30 AM - 10:45 AM · Fixture Merchant',
        id: 'order_fixture',
        inProgress: true,
        itemSummary: 'Sample Item, Add-on ×2',
        orderLabel: 'Order FIXTURE',
        priceLabel: '$12.34',
      },
    ],
  );
});

test('summary-only rows omit item claims and malformed money while retaining a safe label', () => {
  const summary = createStorefrontOrderFixture({
    currency: 'not-currency',
    orderDate: '2099-02-30',
    orderTime: ' ',
    orderTotal: '12.345',
    restaurantDisplayName: ' ',
  });

  assert.deepEqual(toOrderHistoryPresentationRows([summary, summary]), [
    {
      headerLabel: 'Order FIXTURE',
      id: 'order_fixture',
      inProgress: false,
      orderLabel: 'Order FIXTURE',
    },
  ]);
});

test('mismatched and malformed details cannot create historical item summaries', () => {
  const summary = createStorefrontOrderFixture();
  const wrongOrder = createStorefrontOrderFixture({
    id: 'order_another',
    items: [
      {
        discount: '0.00',
        id: 'item_private',
        modifiers: [],
        name: 'Another customer item',
        price: '1.00',
        quantity: 1,
        specialInstructions: '',
        total: '1.00',
      },
    ],
  });
  const malformedItem = createStorefrontOrderFixture({
    items: [
      {
        discount: '0.00',
        id: 'item_invalid',
        modifiers: [],
        name: 'Invalid quantity',
        price: '1.00',
        quantity: 0,
        specialInstructions: '',
        total: '1.00',
      },
    ],
  });

  assert.equal(
    toOrderHistoryPresentationRows([summary], 'en', {
      details: [wrongOrder],
    })[0]?.itemSummary,
    undefined,
  );
  assert.equal(
    toOrderHistoryPresentationRows([summary], 'en', {
      details: [malformedItem],
    })[0]?.itemSummary,
    undefined,
  );
});

test('completed rows omit the active-order time label', () => {
  const summary = createStorefrontOrderFixture();

  assert.equal(
    toOrderHistoryPresentationRows([summary])[0]?.headerLabel,
    'Jan 1, 2099 · Fixture Merchant',
  );
});

test('failure mapping distinguishes expired identity from retryable and terminal failures', () => {
  assert.equal(
    toOrderHistoryFailureStatus({
      code: 'CUSTOMER_AUTH_REQUIRED',
      kind: 'authentication_required',
      retryable: false,
    }),
    'signed_out',
  );
  assert.equal(
    toOrderHistoryFailureStatus({
      code: 'STOREFRONT_TIMEOUT',
      kind: 'timeout',
      retryable: true,
    }),
    'error',
  );
  assert.equal(
    toOrderHistoryFailureStatus({
      code: 'ORDER_ACCESS_DENIED',
      kind: 'forbidden',
      retryable: false,
    }),
    'unavailable',
  );
  assert.equal(
    toOrderHistoryFailureStatus({
      code: 'CLIENT_VALIDATION_ERROR',
      kind: 'invalid_request',
      retryable: false,
    }),
    'unavailable',
  );
});

test('2H body remains responsive, route-free, localized, and omits unsafe Reorder', () => {
  const presentation = readFileSync(
    new URL('./OrderHistoryPresentation.tsx', import.meta.url),
    'utf8',
  );
  const mapper = readFileSync(
    new URL('./order-history-presentation.ts', import.meta.url),
    'utf8',
  );

  assert.match(presentation, /getResponsiveLayout\(width, fontScale\)/);
  assert.match(presentation, /background="contentCanvas"/);
  assert.match(presentation, /state\.status === 'offline'/);
  assert.match(presentation, /RefreshControl/);
  assert.match(presentation, /state\.loadMoreFailed/);
  assert.doesNotMatch(presentation, /onReorder|reorderHitSlop|action\.reorder/i);
  assert.match(
    /badgeLabel:\s*\{([\s\S]*?)\n\s*\},/.exec(presentation)?.[1] ?? '',
    /lineHeight:\s*13/,
  );
  assert.doesNotMatch(
    presentation,
    /Signature Icy Peak|ABC Chai|Hokkaido|SCAN|Reorder|expo-router|\bfetch\s*\(|SecureStore|\.cart\.|#[0-9A-Fa-f]{3,8}/,
  );
  assert.doesNotMatch(mapper, /summary\.status|parseFloat|parseInt|\+\s*(?:item\.)?(?:price|total)/);
});

test('2H item summaries stay on the single line defined by the Figma card', () => {
  const presentation = readFileSync(
    new URL('./OrderHistoryPresentation.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    presentation,
    /<AppText\s+color="textMuted"\s+numberOfLines=\{1\}\s+style=\{styles\.itemSummary\}/,
  );
});

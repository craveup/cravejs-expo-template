import assert from 'node:assert/strict';
import test from 'node:test';

import { mapStorefrontError } from './storefront-errors.ts';

test('maps supported SDK error signals into controlled failure states', () => {
  assert.deepEqual(
    mapStorefrontError({
      code: 'CART_CONFLICT',
      requestId: 'request-id-123',
      status: 409,
    }),
    {
      code: 'CART_CONFLICT',
      kind: 'conflict',
      requestId: 'request-id-123',
      retryable: false,
      status: 409,
    },
  );
  assert.equal(
    mapStorefrontError({ name: 'StorefrontTimeoutError' }).kind,
    'timeout',
  );
  assert.deepEqual(mapStorefrontError({ retryAfterMs: 30_000, status: 429 }), {
    kind: 'rate_limited',
    retryAfterMs: 30_000,
    retryable: true,
    status: 429,
  });
  assert.deepEqual(mapStorefrontError({ status: 503 }), {
    kind: 'unavailable',
    retryable: true,
    status: 503,
  });
  assert.deepEqual(mapStorefrontError({ code: 'NOT_FOUND', status: 404 }), {
    code: 'NOT_FOUND',
    kind: 'not_found',
    retryable: false,
    status: 404,
  });
  assert.deepEqual(mapStorefrontError({ name: 'StorefrontProtocolError' }), {
    kind: 'unavailable',
    retryable: true,
  });
  assert.deepEqual(mapStorefrontError(new TypeError('network detail')), {
    kind: 'unavailable',
    retryable: true,
  });
  assert.deepEqual(mapStorefrontError({ code: 'ENETUNREACH' }), {
    code: 'ENETUNREACH',
    kind: 'unavailable',
    retryable: true,
  });
  assert.equal(
    mapStorefrontError({ code: 'REVISION_REQUIRED', name: 'StorefrontClientStateError' }).kind,
    'conflict',
  );
});

test('safe error mapping never emits messages, URLs, headers, bodies, or details', () => {
  const mapped = mapStorefrontError({
    body: { token: 'body-secret' },
    code: 'INVALID-CODE-WITH-SECRET',
    details: { capability: 'details-secret' },
    headers: { Authorization: 'header-secret' },
    message: 'message-secret https://api.example.test/cart#receipt-secret',
    requestId: 'unsafe/request/id',
    retryAfterMs: Number.MAX_SAFE_INTEGER,
    status: 500,
    url: 'https://api.example.test/cart#url-secret',
  });
  const serialized = JSON.stringify(mapped);

  assert.deepEqual(mapped, {
    kind: 'unavailable',
    retryable: true,
    status: 500,
  });
  assert.doesNotMatch(
    serialized,
    /secret|https:|Authorization|capability|token/i,
  );
});

test('unknown and malformed values fail closed without becoming retryable', () => {
  assert.deepEqual(mapStorefrontError(new Error('raw failure')), {
    kind: 'unknown',
    retryable: false,
  });
  assert.deepEqual(mapStorefrontError(null), {
    kind: 'unknown',
    retryable: false,
  });
});

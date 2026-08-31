import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCanonicalStorefrontFixture } from '../fixtures/storefront-fixtures.ts';
import {
  createStorefrontBootstrapService,
  type StorefrontBootstrapClient,
} from './storefront-bootstrap-service.ts';

const fixture = createCanonicalStorefrontFixture();

function client(overrides: Partial<{
  getById: StorefrontBootstrapClient['locations']['getById'];
  getBySlug: StorefrontBootstrapClient['merchant']['getBySlug'];
  getOrderTimes: StorefrontBootstrapClient['locations']['getOrderTimes'];
  getOrderingReadiness: StorefrontBootstrapClient['locations']['getOrderingReadiness'];
  list: StorefrontBootstrapClient['menus']['list'];
}> = {}): StorefrontBootstrapClient {
  return {
    locations: {
      getById: overrides.getById ?? (async () => fixture.location),
      getOrderTimes: overrides.getOrderTimes ?? (async () => fixture.orderTimes),
      getOrderingReadiness:
        overrides.getOrderingReadiness ??
        (async () => ({
          estimatedReadyTime: '10:45 AM',
          fulfillmentMethod: 'takeout',
          orderDate: '2099-01-01',
          orderTime: '10:30 AM - 10:45 AM',
          pickupType: 'ASAP',
          ready: true,
        })),
    },
    menus: {
      list:
        overrides.list ??
        (async () => ({ menus: fixture.menus, popularProducts: [] })),
    },
    merchant: {
      getBySlug: overrides.getBySlug ?? (async () => fixture.merchant),
    },
  };
}

test('bootstrap loads only the configured tenant through anonymous SDK reads', async () => {
  const calls: unknown[] = [];
  const service = createStorefrontBootstrapService(
    client({
      async getById(locationId) {
        calls.push(['location', locationId]);
        return fixture.location;
      },
      async getBySlug(merchantSlug) {
        calls.push(['merchant', merchantSlug]);
        return fixture.merchant;
      },
      async getOrderingReadiness(locationId, fulfillmentMethod) {
        calls.push(['readiness', locationId, fulfillmentMethod]);
        return {
          fulfillmentMethod: 'takeout',
          orderDate: '2099-01-01',
          orderTime: '10:30 AM - 10:45 AM',
          pickupType: 'ASAP',
          ready: true,
        };
      },
      async list(locationId, params) {
        calls.push(['menus', locationId, params]);
        return { menus: fixture.menus, popularProducts: [] };
      },
    }),
    fixture.scope.merchantSlug,
    fixture.scope.locationId,
  );

  const result = await service.load();

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [
    ['merchant', fixture.scope.merchantSlug],
    ['location', fixture.scope.locationId],
    ['menus', fixture.scope.locationId, { menuOnly: true }],
    ['readiness', fixture.scope.locationId, 'takeout'],
  ]);
  assert.equal(
    result.kind === 'ready' ? result.data.location.id : undefined,
    fixture.scope.locationId,
  );
});

test('member chrome loads and caches only validated merchant and location truth', async () => {
  const calls: string[] = [];
  const service = createStorefrontBootstrapService(
    client({
      async getById() {
        calls.push('location');
        return fixture.location;
      },
      async getBySlug() {
        calls.push('merchant');
        return fixture.merchant;
      },
      async getOrderingReadiness() {
        calls.push('readiness');
        return {
          fulfillmentMethod: 'takeout',
          orderDate: '2099-01-01',
          orderTime: '10:30 AM - 10:45 AM',
          pickupType: 'ASAP',
          ready: true,
        };
      },
      async list() {
        calls.push('menus');
        return { menus: fixture.menus, popularProducts: [] };
      },
    }),
    fixture.scope.merchantSlug,
    fixture.scope.locationId,
  );

  const first = await service.loadShell();
  const second = await service.loadShell();

  assert.deepEqual(first, second);
  assert.equal(first.kind, 'ready');
  assert.deepEqual(calls, ['merchant', 'location']);

  const full = await service.load();
  assert.equal(full.kind, 'ready');
  assert.deepEqual(calls, ['merchant', 'location', 'menus', 'readiness']);
});

test('bootstrap fails closed when merchant, location, or readiness crosses scope', async () => {
  for (const clientValue of [
    client({
      async getBySlug() {
        return { ...fixture.merchant, locations: [] };
      },
    }),
    client({
      async getById() {
        return { ...fixture.location, id: 'fedcba9876543210fedcba98' };
      },
    }),
    client({
      async getOrderingReadiness() {
        return {
          fulfillmentMethod: 'delivery',
          reason: 'fixture',
          ready: false,
        };
      },
    }),
  ]) {
    const result = await createStorefrontBootstrapService(
      clientValue,
      fixture.scope.merchantSlug,
      fixture.scope.locationId,
    ).load();

    assert.equal(result.kind, 'failed');
    assert.equal(
      result.kind === 'failed' ? result.failure.code : undefined,
      'INVALID_STOREFRONT_RESPONSE',
    );
  }
});

test('order-time reads preserve the released server labels', async () => {
  const result = await createStorefrontBootstrapService(
    client(),
    fixture.scope.merchantSlug,
    fixture.scope.locationId,
  ).getOrderTimes();

  assert.deepEqual(result, { data: fixture.orderTimes, kind: 'ready' });
});

test('bootstrap maps request failures without exposing raw response data', async () => {
  const result = await createStorefrontBootstrapService(
    client({
      async getBySlug() {
        throw {
          body: { private: 'must-not-leak' },
          requestId: 'request-fixture',
          status: 503,
        };
      },
    }),
    fixture.scope.merchantSlug,
    fixture.scope.locationId,
  ).load();

  assert.equal(result.kind, 'failed');
  assert.doesNotMatch(JSON.stringify(result), /private|must-not-leak/);
});

test('bootstrap service has no direct request, token, or native storage access', () => {
  const source = readFileSync(new URL('./storefront-bootstrap-service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|expo-secure-store|AsyncStorage|getAuthToken|receiptToken|accessToken|console\.|process\.env/,
  );
  assert.match(source, /import type \{ StorefrontClient \}/);
});

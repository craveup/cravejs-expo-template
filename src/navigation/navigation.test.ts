import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import appConfig from '../../app.config.ts';
import { brandConfig } from '../config/brand.config.ts';
import type { BrandConfig } from '../config/brand.types.ts';
import { getAvailableRoutes, ROUTE_INVENTORY } from './routes.ts';
import { parseSafeLink } from './safe-links.ts';

const universalLinkHost = brandConfig.links.universalLinkHosts[0]!;
const customLink = (path: string) => `${brandConfig.scheme}://${path}`;
const universalLink = (path: string) => `https://${universalLinkHost}/${path}`;

test('generated link hosts are installed in the native app configuration', () => {
  assert.deepEqual(
    appConfig.ios?.associatedDomains,
    brandConfig.links.universalLinkHosts.map((host) => `applinks:${host}`),
  );
  assert.deepEqual(
    appConfig.android?.intentFilters,
    brandConfig.links.androidAppLinkHosts.map((host) => ({
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: [{ host, scheme: 'https' }],
    })),
  );
});

test('route inventory has unique IDs and paths and contains no cut SCAN destination', () => {
  assert.equal(new Set(ROUTE_INVENTORY.map(({ id }) => id)).size, ROUTE_INVENTORY.length);
  assert.equal(new Set(ROUTE_INVENTORY.map(({ path }) => path)).size, ROUTE_INVENTORY.length);
  assert.equal(ROUTE_INVENTORY.some(({ id, path }) => /scan/i.test(`${id} ${path}`)), false);
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'signInVerify')?.deepLink,
    false,
  );
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'onboarding')?.deepLink,
    false,
  );
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'rewardRedeem')?.deepLink,
    false,
  );
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'rewardsHistory')?.deepLink,
    false,
  );
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'orderStatus')?.deepLink,
    false,
  );
  assert.deepEqual(
    ROUTE_INVENTORY.find(({ id }) => id === 'deliveryStatus'),
    {
      allowedQueryKeys: [],
      deepLink: false,
      id: 'deliveryStatus',
      path: '/delivery/status',
      surface: 'stack',
    },
  );
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'orderHistory')?.deepLink,
    false,
  );
  for (const id of ['offline', 'error']) {
    const route = ROUTE_INVENTORY.find((candidate) => candidate.id === id);
    assert.equal(route?.deepLink, false, id);
    assert.equal(route?.surface, 'system', id);
  }
  assert.equal(
    ROUTE_INVENTORY.some(({ path }) => String(path) === '/update-required'),
    false,
  );
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'bagClear')?.deepLink,
    false,
  );
  assert.equal(
    ROUTE_INVENTORY.find(({ id }) => id === 'bagRemoveItem')?.deepLink,
    false,
  );
});

test('typed route inventory matches the approved four-tab shell', () => {
  const tabRoutes = ROUTE_INVENTORY
    .filter(({ surface }) => surface === 'tab')
    .map(({ id }) => id);

  assert.deepEqual(tabRoutes, ['home', 'menu', 'bag', 'rewards']);
});

test('only enabled capabilities expose their routes', () => {
  const routes = getAvailableRoutes(brandConfig);
  const routeIds = new Set(routes.map(({ id }) => id));

  for (const route of ROUTE_INVENTORY) {
    if (!('capability' in route)) continue;
    assert.equal(
      routeIds.has(route.id),
      brandConfig.capabilities[route.capability] === 'enabled',
      route.id,
    );
  }
});

test('safe links accept only configured schemes and hosts with typed parameters', () => {
  const customUrl = customLink('item/product_123');
  const custom = parseSafeLink(customUrl, brandConfig);
  assert.deepEqual(custom, {
    ok: true,
    intent: { params: { productId: 'product_123' }, query: {}, routeId: 'item' },
    sanitizedUrl: customUrl,
  });

  const nutritionUrl = customLink('item/product_123/nutrition');
  assert.deepEqual(parseSafeLink(nutritionUrl, brandConfig), {
    ok: true,
    intent: {
      params: { productId: 'product_123' },
      query: {},
      routeId: 'nutrition',
    },
    sanitizedUrl: nutritionUrl,
  });

  const universal = parseSafeLink(universalLink('search?q=oolong'), brandConfig);
  assert.equal(universal.ok, true);
  if (universal.ok) assert.deepEqual(universal.intent.query, { q: 'oolong' });

  const locationUrl = customLink('locations/location_123');
  assert.deepEqual(parseSafeLink(locationUrl, brandConfig), {
    ok: true,
    intent: {
      params: { locationId: 'location_123' },
      query: {},
      routeId: 'locationDetail',
    },
    sanitizedUrl: locationUrl,
  });

  assert.deepEqual(parseSafeLink(`http://${universalLinkHost}/menu`, brandConfig), {
    ok: false,
    reason: 'foreign_origin',
  });
  assert.deepEqual(parseSafeLink('https://example.com/menu', brandConfig), {
    ok: false,
    reason: 'foreign_origin',
  });
  assert.deepEqual(parseSafeLink(`https://user@${universalLinkHost}/menu`, brandConfig), {
    ok: false,
    reason: 'foreign_origin',
  });
  assert.deepEqual(parseSafeLink(`https://${universalLinkHost}:8443/menu`, brandConfig), {
    ok: false,
    reason: 'foreign_origin',
  });
});

test('safe links reject unknown routes, malformed IDs, duplicate or unexpected query keys', () => {
  assert.deepEqual(parseSafeLink(customLink('scan'), brandConfig), {
    ok: false,
    reason: 'route_not_found',
  });
  assert.deepEqual(parseSafeLink(customLink('item/not%20safe'), brandConfig), {
    ok: false,
    reason: 'invalid_parameter',
  });
  assert.deepEqual(parseSafeLink(customLink('search?q=item-one&q=item-two'), brandConfig), {
    ok: false,
    reason: 'unexpected_query',
  });
  assert.deepEqual(parseSafeLink(customLink('menu?admin=true'), brandConfig), {
    ok: false,
    reason: 'unexpected_query',
  });
});

test('gated links fail closed and receipt fragments are stripped before navigation', () => {
  const gatedConfig: BrandConfig = {
    ...brandConfig,
    capabilities: { ...brandConfig.capabilities, loyalty: 'gated' },
  };

  assert.deepEqual(parseSafeLink(customLink('rewards'), gatedConfig), {
    ok: false,
    reason: 'capability_unavailable',
  });

  const receiptUrl = customLink('receipt/receipt_1#opaque-capability');
  const receipt = parseSafeLink(receiptUrl, brandConfig);
  assert.deepEqual(receipt, {
    ok: true,
    intent: { params: { receiptId: 'receipt_1' }, query: {}, routeId: 'receipt' },
    sanitizedUrl: customLink('receipt/receipt_1'),
    sensitive: { kind: 'receipt-capability-fragment', value: 'opaque-capability' },
  });
  assert.deepEqual(parseSafeLink(customLink('menu#not-allowed'), brandConfig), {
    ok: false,
    reason: 'unexpected_fragment',
  });
});

test('address-candidate search stays available without enabling delivery ordering', () => {
  const originalDeliveryState = brandConfig.capabilities.delivery;
  const config: BrandConfig = {
    ...brandConfig,
    capabilities: { ...brandConfig.capabilities, delivery: 'disabled' },
  };
  assert.equal(getAvailableRoutes(config).some(({ id }) => id === 'deliveryAddress'), true);
  assert.equal(brandConfig.capabilities.delivery, originalDeliveryState);
});

test('navigation contracts remain route-free and platform independent', () => {
  const source = ['./routes.ts', './safe-links.ts']
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /expo-router|SecureStore|@craveup\/storefront-sdk|\bfetch\s*\(/);
});

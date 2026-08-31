import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('2H route composes shared auth and order services without a reorder path', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/orders.tsx', import.meta.url),
    'utf8',
  );
  const accountUrl = new URL(
    '../../app/(tabs)/(home)/account.tsx',
    import.meta.url,
  );
  assert.equal(existsSync(accountUrl), true);
  const account = readFileSync(accountUrl, 'utf8');
  const presentation = readFileSync(
    new URL('./OrderHistoryPresentation.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /runtime\.services\.orders/);
  assert.match(route, /runtime\.services\.customerAuth/);
  assert.match(route, /useFocusEffect/);
  assert.match(route, /useNetworkState/);
  assert.match(route, /loadOrderHistoryPage\(orders/);
  assert.match(route, /focusGeneration\.current !== generation/);
  assert.match(route, /load\.session === authState/);
  assert.match(route, /refreshing: true/);
  assert.match(route, /loadMoreFailed: true/);
  assert.doesNotMatch(route, /onReorder=|createOrdering|addItem|\.cart\.|reorder/i);
  assert.match(account, /onOrderHistory=\{\(\) => router\.push\('\/orders'/);
  assert.match(presentation, /RefreshControl/);
  assert.doesNotMatch(
    route,
    /\bfetch\s*\(|SecureStore|process\.env|console\.|SCAN|#[0-9A-Fa-f]{3,8}/,
  );
});

test('2H route keeps expired-session, detail-not-found, pagination, and stale work explicit', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/orders.tsx', import.meta.url),
    'utf8',
  );
  const loader = readFileSync(
    new URL('./order-history-loader.ts', import.meta.url),
    'utf8',
  );

  assert.match(route, /toOrderHistoryFailureStatus/);
  assert.match(route, /pendingCursor\.current/);
  assert.match(route, /consumedCursors\.current/);
  assert.match(route, /focusGeneration\.current \+= 1/);
  assert.match(loader, /detailResult\.failure\.kind === 'authentication_required'/);
  assert.match(loader, /detail \? \[detail\] : \[\]/);
  assert.match(loader, /DETAIL_CONCURRENCY = 4/);
});

test('2H route discards hydrated order data when no customer is authenticated', () => {
  const route = readFileSync(
    new URL('../../app/(tabs)/(home)/orders.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    route,
    /if \(authState\.status !== 'authenticated'\) \{\s*setLoad\(undefined\);/,
  );
});

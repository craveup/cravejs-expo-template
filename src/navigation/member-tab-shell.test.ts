import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

test('member routes retain the approved four-tab shell at their public URLs', () => {
  const tabs = read('src/app/(tabs)/_layout.tsx');
  const bagStack = read('src/app/(tabs)/(bag)/_layout.tsx');
  const homeStack = read('src/app/(tabs)/(home)/_layout.tsx');
  const rewardsStack = read('src/app/(tabs)/(rewards)/_layout.tsx');
  const routes = read('src/navigation/routes.ts');

  assert.match(tabs, /name="\(home\)"/);
  assert.match(tabs, /name="\(menu\)"/);
  assert.match(tabs, /name="\(bag\)"/);
  assert.match(tabs, /name="\(rewards\)"/);
  assert.match(homeStack, /<Stack/);
  assert.match(rewardsStack, /<Stack/);
  assert.match(bagStack, /name="bag-clear"[\s\S]{0,80}presentation: 'modal'/);
  assert.match(bagStack, /name="bag-remove-item"[\s\S]{0,100}presentation: 'modal'/);

  for (const [path, publicRoute] of [
    ['src/app/(tabs)/(home)/orders.tsx', '/orders'],
    ['src/app/(tabs)/(home)/order/status.tsx', '/order/status'],
    ['src/app/(tabs)/(home)/delivery/status.tsx', '/delivery/status'],
    ['src/app/(tabs)/(home)/locations/index.tsx', '/locations'],
    [
      'src/app/(tabs)/(home)/locations/[locationId].tsx',
      '/locations/:locationId',
    ],
    ['src/app/(tabs)/(rewards)/rewards.tsx', '/rewards'],
    ['src/app/(tabs)/(rewards)/rewards/history.tsx', '/rewards/history'],
    [
      'src/app/(tabs)/(rewards)/rewards/redeem/[rewardId].tsx',
      '/rewards/redeem/:rewardId',
    ],
    ['src/app/(tabs)/(rewards)/favourites.tsx', '/favourites'],
    ['src/app/(tabs)/(bag)/bag.tsx', '/bag'],
    ['src/app/(tabs)/(bag)/bag-clear.tsx', '/bag-clear'],
    ['src/app/(tabs)/(bag)/bag-remove-item.tsx', '/bag-remove-item'],
  ] as const) {
    assert.equal(existsSync(resolve(root, path)), true, path);
    assert.match(routes, new RegExp(publicRoute.replace(/[/:]/g, '\\$&')));
  }

  for (const path of [
    'src/app/orders.tsx',
    'src/app/order/status.tsx',
    'src/app/delivery/status.tsx',
    'src/app/locations.tsx',
    'src/app/locations/[locationId].tsx',
    'src/app/rewards/history.tsx',
    'src/app/rewards/redeem/[rewardId].tsx',
    'src/app/favourites.tsx',
    'src/app/(tabs)/bag.tsx',
    'src/app/bag-clear.tsx',
    'src/app/bag-remove-item.tsx',
  ]) {
    assert.equal(existsSync(resolve(root, path)), false, path);
  }

  assert.doesNotMatch(tabs, /SCAN|name="scan"/i);
});

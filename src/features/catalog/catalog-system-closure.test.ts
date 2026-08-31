import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('search, item, and builder states stay inside the Menu tab stack', () => {
  const menuLayout = source('../../app/(tabs)/(menu)/_layout.tsx');
  const rootLayout = source('../../app/_layout.tsx');

  for (const path of [
    '../../app/(tabs)/(menu)/search.tsx',
    '../../app/(tabs)/(menu)/item/[productId].tsx',
    '../../app/(tabs)/(menu)/build/[productId].tsx',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), true, path);
  }

  for (const path of [
    '../../app/search.tsx',
    '../../app/item/[productId].tsx',
    '../../app/build/[productId].tsx',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, path);
  }

  assert.match(menuLayout, /name="search"[\s\S]*presentation:\s*'modal'/);
  assert.match(menuLayout, /name="item\/\[productId\]"/);
  assert.match(menuLayout, /name="build\/\[productId\]"/);
  assert.doesNotMatch(rootLayout, /name="(?:search|item|build)/);
});

test('Home menu actions use the public Menu destination', () => {
  const homeRoute = source('../../app/(tabs)/(home)/index.tsx');
  const homePresentation = source('./HomeCatalogPresentation.tsx');

  assert.match(homeRoute, /onOpenMenu=\{\(\) => router\.push\('\/menu'\)\}/);
  assert.match(homeRoute, /onStartOrder=\{\(\) => router\.push\('\/menu'\)\}/);
  assert.doesNotMatch(homeRoute, /router\.push\('\.\/menu'\)/);
  assert.doesNotMatch(homeRoute, /onSearch|router\.push\('\/search'/);
  assert.doesNotMatch(homePresentation, /onSearch/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('search stays local and consumes the shared catalog projection', () => {
  const searchSource = [
    './catalog-search.ts',
    './SearchPresentation.tsx',
    '../../app/(tabs)/(menu)/search.tsx',
  ]
    .map(source)
    .join('\n');

  assert.doesNotMatch(
    searchSource,
    /\bfetch\s*\(|SecureStore|createStorefrontClient|@craveup\/storefront-sdk|process\.env/,
  );
  assert.match(searchSource, /useCatalogBrowse/);
  assert.match(searchSource, /projectCatalogSearchState/);
  assert.match(
    source('../../app/(tabs)/(menu)/search.tsx'),
    /onSelectProduct={[\s\S]{0,100}router\.push\([\s\S]{0,100}\/item\/\[productId\]/,
  );
});

test('root provider shares one scoped catalog instance with Home, Menu, and Search', () => {
  const root = source('../../app/_layout.tsx');
  const tabs = source('../../app/(tabs)/_layout.tsx');
  const state = source('../catalog/catalog-browse-state.ts');

  assert.equal(root.match(/<CatalogBrowseProvider/g)?.length, 1);
  assert.match(root, /environmentNamespace/);
  assert.match(root, /merchantSlug/);
  assert.match(root, /locationId/);
  assert.match(root, /key=\{getCatalogScopeKey\(\)\}/);
  assert.match(root, /segments\[0\]\s*===\s*'\(tabs\)'/);
  assert.doesNotMatch(tabs, /CatalogBrowseProvider|createBootstrapService/);
  assert.match(state, /pathname\s*===\s*'\/search'/);
});

test('search route and Menu affordance expose only real destinations', () => {
  const route = source('../../app/(tabs)/(menu)/search.tsx');
  const homeRoute = source('../../app/(tabs)/(home)/index.tsx');
  const menuRoute = source('../../app/(tabs)/(menu)/menu.tsx');
  const menuLayout = source('../../app/(tabs)/(menu)/_layout.tsx');
  const presentation = source('./SearchPresentation.tsx');

  assert.match(route, /useLocalSearchParams/);
  assert.match(route, /parseInitialSearchQuery/);
  assert.match(route, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(route, /router\.canGoBack\(\)/);
  assert.match(route, /router\.back\(\)/);
  assert.match(route, /router\.replace\('\/menu'/);
  assert.match(route, /onClose=\{closeSearch\}/);
  assert.doesNotMatch(homeRoute, /onSearch|router\.push\('\/search'/);
  assert.match(menuRoute, /onSearch/);
  assert.match(menuRoute, /router\.push\('\/search'/);
  assert.match(menuLayout, /name="search"[\s\S]*presentation:\s*'modal'/);
  assert.match(presentation, /onClose:\s*\(\)\s*=>\s*void/);
  assert.match(presentation, /accessibilityLabel=\{t\('search\.close'\)\}/);
  assert.doesNotMatch(presentation, /SCAN|Bag|Rewards/);
  assert.match(
    route,
    /onSelectProduct={[\s\S]{0,100}router\.push\([\s\S]{0,100}\/item\/\[productId\]/,
  );
});

test('search presentation keeps compact, scalable, accessible geometry', () => {
  const presentation = source('./SearchPresentation.tsx');

  assert.match(presentation, /allowFontScaling/);
  assert.match(presentation, /accessibilityRole="tablist"/);
  assert.match(presentation, /accessibilityLiveRegion="polite"/);
  assert.match(presentation, /productImageFrame:[\s\S]*height:\s*56[\s\S]*width:\s*56/);
  assert.match(presentation, /emptyMark:[\s\S]*height:\s*80[\s\S]*width:\s*80/);
  assert.match(presentation, /SEARCH_CHIP_VISUAL_HEIGHT\s*=\s*27/);
  assert.match(presentation, /hitSlop=\{searchChipHitSlop\}/);
  assert.match(presentation, /height:\s*SEARCH_CHIP_VISUAL_HEIGHT/);
  assert.match(presentation, /maxLength=\{CATALOG_SEARCH_QUERY_MAX_LENGTH\}/);
  assert.doesNotMatch(presentation, /(?:option|category)\.title\.toUpperCase\(\)/);
  assert.match(presentation, /getLocaleDirection/);
  assert.match(presentation, /keyboardOpen/);
  assert.doesNotMatch(presentation, /transition=/);
});

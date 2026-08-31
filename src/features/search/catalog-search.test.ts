import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CatalogBrowseSnapshot,
  CatalogProductPresentation,
} from '../catalog/catalog-browse.ts';
import {
  CATALOG_SEARCH_QUERY_MAX_LENGTH,
  normalizeCatalogSearchQuery,
  parseInitialSearchQuery,
  projectCatalogSearchState,
  searchCatalogSnapshot,
} from './catalog-search.ts';

function product(
  id: string,
  name: string,
  description?: string,
): CatalogProductPresentation {
  return Object.freeze({
    availability: id === 'sold-out' ? 'unavailable' : 'available',
    calorieCount: id === 'boba' ? 360 : 120,
    ...(description ? { description } : {}),
    id,
    imageUrl: `https://cdn.example.test/${id}.png`,
    name,
    priceLabel: id === 'boba' ? '$7.25' : '$4.00',
  });
}

function snapshot(): CatalogBrowseSnapshot {
  const boba = product('boba', 'Crème Brûlée Boba', 'Silky milk tea');
  const chai = product('chai', 'ABC Chai', 'Spiced black tea');
  const soldOut = product('sold-out', 'Bóba Cloud', 'Fruit and milk foam');

  return Object.freeze({
    canStartOrder: true,
    hero: Object.freeze({ merchantName: 'Reference Merchant' }),
    location: Object.freeze({ address: '1260 3rd St', name: 'Santa Monica' }),
    popularProducts: Object.freeze([boba]),
    sections: Object.freeze([
      Object.freeze({
        id: 'milk-tea',
        products: Object.freeze([boba, chai]),
        title: 'Milk Tea',
      }),
      Object.freeze({
        id: 'specialties',
        products: Object.freeze([boba, soldOut]),
        title: 'Specialties',
      }),
    ]),
  });
}

test('normalizes case, accents, punctuation, and repeated whitespace', () => {
  assert.equal(
    normalizeCatalogSearchQuery('  CRÈME—Brûlée   BÓBA!  '),
    'creme brulee boba',
  );
});

test('accepts only a bounded scalar deep-link query', () => {
  assert.equal(parseInitialSearchQuery('oolong'), 'oolong');
  assert.equal(parseInitialSearchQuery(['oolong']), '');
  assert.equal(parseInitialSearchQuery(undefined), '');
  assert.equal(
    parseInitialSearchQuery('x'.repeat(CATALOG_SEARCH_QUERY_MAX_LENGTH + 1)),
    '',
  );
});

test('matches every normalized term across product name and description', () => {
  const result = searchCatalogSnapshot(snapshot(), 'silky BÓBA');

  assert.equal(result.status, 'results');
  assert.deepEqual(result.products.map(({ id }) => id), ['boba']);
});

test('preserves catalog order and keeps the first repeated product occurrence', () => {
  const result = searchCatalogSnapshot(snapshot(), 'boba');

  assert.equal(result.status, 'results');
  assert.deepEqual(result.products.map(({ id }) => id), ['boba', 'sold-out']);
});

test('filters within a known category and fails closed for an unknown category', () => {
  assert.deepEqual(
    searchCatalogSnapshot(snapshot(), 'tea', 'milk-tea').products.map(({ id }) => id),
    ['boba', 'chai'],
  );
  assert.equal(searchCatalogSnapshot(snapshot(), 'tea', 'missing').status, 'no-results');
});

test('distinguishes an empty query from no results', () => {
  assert.equal(searchCatalogSnapshot(snapshot(), '  !!!  ').status, 'idle');
  assert.equal(searchCatalogSnapshot(snapshot(), 'matcha').status, 'no-results');
});

test('returns original server presentation fields without mutating the snapshot', () => {
  const input = snapshot();
  const before = JSON.stringify(input);
  const result = searchCatalogSnapshot(input, 'boba');
  const first = result.products[0];

  assert.equal(first, input.sections[0]?.products[0]);
  assert.equal(first?.priceLabel, '$7.25');
  assert.equal(first?.calorieCount, 360);
  assert.equal(result.products[1]?.availability, 'unavailable');
  assert.equal(JSON.stringify(input), before);
});

test('projects catalog loading, failure, query, and category data safely', () => {
  assert.deepEqual(projectCatalogSearchState({ status: 'idle' }, 'boba'), {
    status: 'loading',
  });
  assert.deepEqual(
    projectCatalogSearchState(
      { requestId: 'safe-request', retryable: true, status: 'unavailable' },
      'boba',
    ),
    { requestId: 'safe-request', retryable: true, status: 'unavailable' },
  );

  const ready = projectCatalogSearchState(
    { data: snapshot(), status: 'ready' },
    'boba',
    'specialties',
  );
  assert.equal(ready.status, 'results');
  if (ready.status !== 'results') return;
  assert.deepEqual(ready.data.categories, [
    { id: 'milk-tea', title: 'Milk Tea' },
    { id: 'specialties', title: 'Specialties' },
  ]);
  assert.deepEqual(ready.data.products.map(({ id }) => id), ['boba', 'sold-out']);
});

import type {
  CatalogBrowseSnapshot,
  CatalogBrowseState,
  CatalogProductPresentation,
  CatalogSectionPresentation,
} from '../catalog/catalog-browse.ts';

export type CatalogSearchCategory = Readonly<{
  id: string;
  title: string;
}>;

export type CatalogSearchResult =
  | Readonly<{
      normalizedQuery: '';
      products: readonly [];
      status: 'idle';
    }>
  | Readonly<{
      normalizedQuery: string;
      products: readonly CatalogProductPresentation[];
      status: 'results';
    }>
  | Readonly<{
      normalizedQuery: string;
      products: readonly [];
      status: 'no-results';
    }>;

export type CatalogSearchReadyData = Readonly<{
  categories: readonly CatalogSearchCategory[];
  location: CatalogBrowseSnapshot['location'];
  merchant: CatalogBrowseSnapshot['hero'];
  normalizedQuery: string;
  products: readonly CatalogProductPresentation[];
}>;

export type CatalogSearchState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'empty' | 'offline' | 'unpublished' }>
  | Readonly<{
      requestId?: string;
      retryable: boolean;
      status: 'error' | 'not-found' | 'unavailable';
    }>
  | Readonly<{ data: CatalogSearchReadyData; status: 'idle' | 'no-results' | 'results' }>;

const EMPTY_PRODUCTS = Object.freeze([]) as readonly [];
export const CATALOG_SEARCH_QUERY_MAX_LENGTH = 120;

export function parseInitialSearchQuery(
  value: string | readonly string[] | undefined,
): string {
  return typeof value === 'string' && value.length <= CATALOG_SEARCH_QUERY_MAX_LENGTH
    ? value
    : '';
}

export function normalizeCatalogSearchQuery(query: string): string {
  return query
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchingSections(
  snapshot: CatalogBrowseSnapshot,
  categoryId?: string,
): readonly CatalogSectionPresentation[] {
  if (!categoryId) return snapshot.sections;
  const category = snapshot.sections.find((section) => section.id === categoryId);
  return category ? Object.freeze([category]) : Object.freeze([]);
}

export function searchCatalogSnapshot(
  snapshot: CatalogBrowseSnapshot,
  query: string,
  categoryId?: string,
): CatalogSearchResult {
  const normalizedQuery = normalizeCatalogSearchQuery(query);
  if (!normalizedQuery) {
    return Object.freeze({
      normalizedQuery: '',
      products: EMPTY_PRODUCTS,
      status: 'idle',
    });
  }

  const terms = normalizedQuery.split(' ');
  const productIds = new Set<string>();
  const products: CatalogProductPresentation[] = [];

  for (const section of matchingSections(snapshot, categoryId)) {
    for (const product of section.products) {
      if (productIds.has(product.id)) continue;
      productIds.add(product.id);

      const searchableText = normalizeCatalogSearchQuery(
        `${product.name} ${product.description ?? ''}`,
      );
      if (terms.every((term) => searchableText.includes(term))) {
        products.push(product);
      }
    }
  }

  if (products.length === 0) {
    return Object.freeze({
      normalizedQuery,
      products: EMPTY_PRODUCTS,
      status: 'no-results',
    });
  }

  return Object.freeze({
    normalizedQuery,
    products: Object.freeze(products),
    status: 'results',
  });
}

export function projectCatalogSearchState(
  catalogState: CatalogBrowseState,
  query: string,
  categoryId?: string,
): CatalogSearchState {
  if (catalogState.status === 'idle' || catalogState.status === 'loading') {
    return Object.freeze({ status: 'loading' });
  }
  if (catalogState.status !== 'ready') return catalogState;

  const result = searchCatalogSnapshot(catalogState.data, query, categoryId);
  return Object.freeze({
    data: Object.freeze({
      categories: Object.freeze(
        catalogState.data.sections.map(({ id, title }) => Object.freeze({ id, title })),
      ),
      location: catalogState.data.location,
      merchant: catalogState.data.hero,
      normalizedQuery: result.normalizedQuery,
      products: result.products,
    }),
    status: result.status,
  });
}

import type { TranslationKey } from '../../i18n/localization.ts';

export type PresentationFeature = 'build' | 'catalog' | 'item' | 'search';
export type PresentationFailureStatus = 'empty' | 'error' | 'loading' | 'unavailable' | 'unknown';

export type RouteFreeState<T> =
  | { status: PresentationFailureStatus }
  | { data: T; status: 'ready' };

export type ProductAccessibilityPresentation = {
  availabilityLabel?: string;
  badgeLabel?: string;
  calorieLabel?: string;
  description?: string;
  name: string;
  priceLabel?: string;
};

const MESSAGE_KEYS = {
  build: {
    empty: 'build.empty',
    error: 'build.error',
    loading: 'build.loading',
    unavailable: 'build.unavailable',
    unknown: 'common.unknown',
  },
  catalog: {
    empty: 'catalog.empty',
    error: 'catalog.error',
    loading: 'catalog.loading',
    unavailable: 'catalog.unavailable',
    unknown: 'common.unknown',
  },
  item: {
    empty: 'item.unavailable',
    error: 'item.error',
    loading: 'item.loading',
    unavailable: 'item.unavailable',
    unknown: 'common.unknown',
  },
  search: {
    empty: 'search.empty',
    error: 'search.error',
    loading: 'search.loading',
    unavailable: 'catalog.unavailable',
    unknown: 'common.unknown',
  },
} as const satisfies Record<
  PresentationFeature,
  Record<PresentationFailureStatus, TranslationKey>
>;

export function getPresentationMessageKey(
  feature: PresentationFeature,
  status: PresentationFailureStatus,
): TranslationKey {
  return MESSAGE_KEYS[feature][status];
}

export function getProductAccessibilityLabel(
  product: ProductAccessibilityPresentation,
): string {
  return [
    product.name,
    product.priceLabel,
    product.calorieLabel,
    product.description,
    product.badgeLabel,
    product.availabilityLabel,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(', ');
}

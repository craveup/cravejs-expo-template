import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { getTouchTargetInsets, type SupportedPlatform } from '@/accessibility';
import { AppText, Button, IconButton, Surface } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, radii, sizes, spacing, textStyles } from '@/theme';

import {
  getProductAccessibilityLabel,
} from '../_shared/presentation-state.ts';
import { PresentationIcon } from '../_shared/PresentationIcon.tsx';
import { PresentationLayout } from '../_shared/PresentationLayout.tsx';
import type { CatalogProductPresentation } from '../catalog/catalog-browse.ts';
import {
  CATALOG_SEARCH_QUERY_MAX_LENGTH,
  type CatalogSearchCategory,
  type CatalogSearchState,
} from './catalog-search.ts';

export type SearchPresentationProps = Readonly<{
  keyboardOpen?: boolean;
  locale?: AppLocale;
  onBrowseCategory?: (categoryId: string) => void;
  onClearQuery: () => void;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onRetry?: () => void;
  onSelectCategory: (categoryId?: string) => void;
  onSelectProduct?: (productId: string) => void;
  query: string;
  selectedCategoryId?: string;
  state: CatalogSearchState;
}>;

const SEARCH_CHIP_VISUAL_HEIGHT = 27;
const searchChipPlatform: SupportedPlatform =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
const searchChipHitSlop = getTouchTargetInsets(
  SEARCH_CHIP_VISUAL_HEIGHT,
  searchChipPlatform,
);

const SEARCH_READY_STATUSES = new Set<CatalogSearchState['status']>([
  'idle',
  'no-results',
  'results',
]);

function isSearchReady(
  state: CatalogSearchState,
): state is Extract<CatalogSearchState, { data: unknown }> {
  return SEARCH_READY_STATUSES.has(state.status);
}

function SearchCategoryChips({
  categories,
  locale,
  onSelectCategory,
  selectedCategoryId,
}: Readonly<{
  categories: readonly CatalogSearchCategory[];
  locale: AppLocale;
  onSelectCategory: (categoryId?: string) => void;
  selectedCategoryId?: string;
}>) {
  const t = createTranslator(locale);
  const options = [{ id: undefined, title: t('search.categoryAll') }, ...categories];

  return (
    <ScrollView
      accessibilityRole="tablist"
      contentContainerStyle={styles.categoryChips}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {options.map((option) => {
        const selected = option.id === selectedCategoryId;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            hitSlop={searchChipHitSlop}
            key={option.id ?? 'all'}
            onPress={() => onSelectCategory(option.id)}
            style={({ pressed }) => [
              styles.categoryChip,
              selected ? styles.categoryChipSelected : styles.categoryChipIdle,
              pressed && styles.pressed,
            ]}
          >
            <AppText color={selected ? 'surface' : 'textMuted'} variant="label">
              {option.title}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SearchProductRow({
  locale,
  onSelect,
  product,
}: Readonly<{
  locale: AppLocale;
  onSelect?: () => void;
  product: CatalogProductPresentation;
}>) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';
  const calorieLabel =
    product.calorieCount === undefined ? undefined : `${product.calorieCount} cal`;
  const unavailableLabel =
    product.availability === 'unavailable'
      ? t('catalog.unavailableProduct')
      : undefined;
  const accessibilityLabel = getProductAccessibilityLabel({
    ...(unavailableLabel ? { availabilityLabel: unavailableLabel } : {}),
    ...(calorieLabel ? { calorieLabel } : {}),
    ...(product.description ? { description: product.description } : {}),
    name: product.name,
    priceLabel: product.priceLabel,
  });
  const content = (
    <Surface
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onSelect ? undefined : 'text'}
      accessible={!onSelect}
      padding="compact"
      radius="sm"
      style={[
        styles.resultRow,
        { flexDirection: direction },
        product.availability === 'unavailable' && styles.unavailable,
      ]}
    >
      <View style={styles.productImageFrame}>
        {product.imageUrl ? (
          <Image
            accessibilityLabel=""
            contentFit="cover"
            source={product.imageUrl}
            style={styles.productImage}
          />
        ) : (
          <PresentationIcon color={colors.textSubtle} name="store" size={22} />
        )}
      </View>
      <View style={styles.productCopy}>
        <AppText numberOfLines={2} variant="bodyStrong">
          {product.name}
        </AppText>
        {product.description ? (
          <AppText color="textMuted" numberOfLines={1} variant="caption">
            {product.description}
          </AppText>
        ) : null}
        <View style={[styles.productMeta, { flexDirection: direction }]}>
          <AppText variant="caption">{product.priceLabel}</AppText>
          {calorieLabel ? (
            <AppText color="textSubtle" variant="micro">
              {calorieLabel}
            </AppText>
          ) : null}
          {unavailableLabel ? (
            <AppText color="textMuted" variant="micro">
              {unavailableLabel}
            </AppText>
          ) : null}
        </View>
      </View>
    </Surface>
  );

  if (!onSelect) return content;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onSelect}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

function SearchFailure({
  locale,
  onRetry,
  state,
}: Readonly<{
  locale: AppLocale;
  onRetry?: () => void;
  state: Exclude<CatalogSearchState, { data: unknown }>;
}>) {
  const t = createTranslator(locale);
  const loading = state.status === 'loading';
  const message =
    state.status === 'loading'
      ? t('search.loading')
      : state.status === 'error'
        ? t('search.error')
        : state.status === 'empty'
          ? t('catalog.empty')
          : state.status === 'offline'
            ? t('catalog.offline')
            : state.status === 'not-found'
              ? t('catalog.notFound')
              : state.status === 'unpublished'
                ? t('catalog.unpublished')
                : t('catalog.unavailable');
  const retryable =
    state.status === 'offline' ||
    ((state.status === 'error' || state.status === 'unavailable') && state.retryable);
  const requestId =
    state.status === 'error' ||
    state.status === 'not-found' ||
    state.status === 'unavailable'
      ? state.requestId
      : undefined;

  return (
    <View accessibilityLiveRegion="polite" style={styles.failure}>
      {loading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
      <AppText accessibilityRole="header" align="center" color="textMuted" variant="heading">
        {message}
      </AppText>
      {requestId ? (
        <AppText align="center" color="textSubtle" variant="caption">
          {t('catalog.requestId', { requestId })}
        </AppText>
      ) : null}
      {retryable && onRetry ? (
        <Button label={t('action.retry')} onPress={onRetry} variant="secondary" />
      ) : null}
    </View>
  );
}

export function SearchPresentation({
  keyboardOpen = false,
  locale = 'en',
  onBrowseCategory,
  onClearQuery,
  onClose,
  onQueryChange,
  onRetry,
  onSelectCategory,
  onSelectProduct,
  query,
  selectedCategoryId,
  state,
}: SearchPresentationProps) {
  const t = createTranslator(locale);
  const ready = isSearchReady(state);
  const failureState = ready ? undefined : state;
  const direction = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';
  const resultCount = state.status === 'results' ? state.data.products.length : 0;

  return (
    <PresentationLayout
      accessibilityLabel={t('search.title')}
      keyboardOpen={keyboardOpen}
      locale={locale}
    >
      <View style={styles.header}>
        <View style={[styles.headerTop, { flexDirection: direction }]}>
          <AppText
            accessibilityRole="header"
            numberOfLines={2}
            style={styles.headerTitle}
            variant="subheading"
          >
            {ready ? state.data.merchant.merchantName : t('search.title')}
          </AppText>
          <IconButton
            accessibilityLabel={t('search.close')}
            compact
            onPress={onClose}
            variant="ghost"
          >
            <PresentationIcon color={colors.ink} name="close" size={17} />
          </IconButton>
        </View>
        {ready ? (
          <AppText color="accent" numberOfLines={1} variant="label">
            {t('catalog.locationLabel').toUpperCase()} ·{' '}
            {state.data.location.name.toUpperCase()}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.searchField, { flexDirection: direction }]}>
        <PresentationIcon color={colors.ink} name="search" size={19} />
        <TextInput
          accessibilityLabel={t('search.placeholder')}
          allowFontScaling
          autoCapitalize="none"
          autoCorrect={false}
          editable={ready}
          maxLength={CATALOG_SEARCH_QUERY_MAX_LENGTH}
          onChangeText={onQueryChange}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.iconMuted}
          returnKeyType="search"
          style={[styles.searchInput, { textAlign: locale === 'ar-XB' ? 'right' : 'left' }]}
          value={query}
        />
        {query ? (
          <IconButton
            accessibilityLabel={t('search.clear')}
            compact
            disabled={!ready}
            onPress={onClearQuery}
            variant="ghost"
          >
            <PresentationIcon color={colors.ink} name="close" size={17} />
          </IconButton>
        ) : null}
      </View>

      {ready && state.status !== 'no-results' ? (
        <SearchCategoryChips
          categories={state.data.categories}
          locale={locale}
          onSelectCategory={onSelectCategory}
          selectedCategoryId={selectedCategoryId}
        />
      ) : null}

      {state.status === 'results' ? (
        <View style={styles.resultsSection}>
          <AppText accessibilityLiveRegion="polite" variant="bodyStrong">
            {t(
              resultCount === 1 ? 'search.resultCountOne' : 'search.resultCountOther',
              { count: resultCount, query: query.trim() },
            )}
          </AppText>
          <View accessibilityRole="list" style={styles.results}>
            {state.data.products.map((product) => (
              <SearchProductRow
                key={product.id}
                locale={locale}
                onSelect={
                  onSelectProduct ? () => onSelectProduct(product.id) : undefined
                }
                product={product}
              />
            ))}
          </View>
        </View>
      ) : state.status === 'no-results' ? (
        <View accessibilityLiveRegion="polite" style={styles.noResults}>
          <View style={styles.emptyMark}>
            <PresentationIcon color={colors.accent} name="search" size={28} />
          </View>
          <AppText accessibilityRole="header" align="center" variant="heading">
            {t('search.noResultsTitle', { query: query.trim() })}
          </AppText>
          <AppText align="center" color="textMuted">
            {t('search.noResultsBody')}
          </AppText>
          {onBrowseCategory ? (
            <View style={styles.suggestions}>
              {state.data.categories.map((category) => (
                <Pressable
                  accessibilityRole="link"
                  hitSlop={searchChipHitSlop}
                  key={category.id}
                  onPress={() => onBrowseCategory(category.id)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                >
                  <AppText variant="label">{category.title}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : state.status === 'idle' ? null : failureState ? (
        <SearchFailure locale={locale} onRetry={onRetry} state={failureState} />
      ) : null}
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  categoryChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    justifyContent: 'center',
    height: SEARCH_CHIP_VISUAL_HEIGHT,
    paddingHorizontal: spacing['3xl'],
  },
  categoryChipIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  categoryChips: {
    gap: spacing.md,
    paddingEnd: spacing['5xl'],
  },
  categoryChipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  emptyMark: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  failure: {
    alignItems: 'center',
    gap: spacing['3xl'],
    justifyContent: 'center',
    minHeight: 260,
  },
  header: {
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
  },
  headerTop: {
    alignItems: 'center',
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
  noResults: {
    alignItems: 'center',
    gap: spacing['3xl'],
    minHeight: 280,
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['5xl'],
  },
  pressed: {
    opacity: 0.72,
  },
  productCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.imageSurface,
    borderRadius: radii.sm,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  productMeta: {
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  resultRow: {
    alignItems: 'center',
    gap: spacing['3xl'],
    minHeight: 80,
  },
  results: {
    gap: spacing.lg,
  },
  resultsSection: {
    gap: spacing['3xl'],
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radii.control,
    borderWidth: 2,
    minHeight: sizes.standardControl,
    paddingHorizontal: spacing['3xl'],
  },
  searchInput: {
    ...textStyles.bodyMedium,
    color: colors.ink,
    flex: 1,
    minHeight: sizes.standardControl,
    minWidth: 0,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  suggestion: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    justifyContent: 'center',
    height: SEARCH_CHIP_VISUAL_HEIGHT,
    paddingHorizontal: spacing['3xl'],
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
  },
  unavailable: {
    opacity: 0.68,
  },
});

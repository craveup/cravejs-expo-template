import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, IconButton } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import { PresentationLayout } from '../_shared/PresentationLayout.tsx';
import { PresentationIcon } from '../_shared/PresentationIcon.tsx';
import type { CatalogBrowseState } from './catalog-browse.ts';
import { CatalogProductCard } from './CatalogProductCard.tsx';
import { CatalogStatePresentation } from './CatalogStatePresentation.tsx';

export type MenuCatalogPresentationProps = Readonly<{
  locale?: AppLocale;
  onSearch?: () => void;
  onRetry?: () => void;
  onSelectProduct?: (productId: string) => void;
  onSelectCategory: (categoryId: string) => void;
  selectedCategoryId?: string;
  state: CatalogBrowseState;
}>;

export function MenuCatalogPresentation({
  locale = 'en',
  onSearch,
  onRetry,
  onSelectProduct,
  onSelectCategory,
  selectedCategoryId,
  state,
}: MenuCatalogPresentationProps) {
  const t = createTranslator(locale);
  const rowDirection = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

  if (state.status !== 'ready') {
    return (
      <PresentationLayout accessibilityLabel={t('catalog.title')} locale={locale}>
        <CatalogStatePresentation locale={locale} onRetry={onRetry} state={state} />
      </PresentationLayout>
    );
  }

  const selectedSection =
    state.data.sections.find((section) => section.id === selectedCategoryId) ??
    state.data.sections[0];

  return (
    <PresentationLayout accessibilityLabel={t('catalog.title')} locale={locale}>
      <View style={styles.chrome}>
        <View style={[styles.header, { flexDirection: rowDirection }]}>
          <View style={styles.headerCopy}>
            <AppText accessibilityRole="header" variant="title">
              {t('catalog.title').toUpperCase()}
            </AppText>
            <AppText color="accent" variant="label">
              {t('catalog.locationLabel').toUpperCase()} ·{' '}
              {state.data.location.name.toUpperCase()}
            </AppText>
          </View>
          {onSearch ? (
            <IconButton
              accessibilityLabel={t('search.title')}
              compact
              onPress={onSearch}
            >
              <PresentationIcon color={colors.ink} name="search" size={19} />
            </IconButton>
          ) : null}
        </View>

        <ScrollView
          accessibilityRole="tablist"
          contentContainerStyle={styles.categoryTabs}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroller}
        >
          {state.data.sections.map((section) => {
            const selected = section.id === selectedSection?.id;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                key={section.id}
                onPress={() => onSelectCategory(section.id)}
                style={({ pressed }) => [
                  styles.categoryTab,
                  selected ? styles.categoryTabSelected : styles.categoryTabIdle,
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  color={selected ? 'surface' : 'textMuted'}
                  variant="label"
                >
                  {section.title.toUpperCase()}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {selectedSection ? (
        <View style={styles.section}>
          <View style={[styles.sectionHeading, { flexDirection: rowDirection }]}>
            <AppText accessibilityRole="header" variant="subheading">
              {selectedSection.title.toUpperCase()}
            </AppText>
            <AppText color="textSubtle" variant="caption">
              {t('catalog.menuCount', {
                count: selectedSection.products.length,
              })}
            </AppText>
          </View>
          <View accessibilityRole="list" style={styles.products}>
            {selectedSection.products.map((product) => (
              <CatalogProductCard
                key={product.id}
                locale={locale}
                onPress={
                  onSelectProduct ? () => onSelectProduct(product.id) : undefined
                }
                product={product}
              />
            ))}
          </View>
        </View>
      ) : null}
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  categoryTab: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    justifyContent: 'center',
    minHeight: sizes.standardControl,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing.xl,
  },
  categoryTabIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  categoryTabSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  categoryTabs: {
    gap: spacing.md,
    paddingHorizontal: spacing['5xl'],
  },
  categoryScroller: {
    marginHorizontal: -spacing['5xl'],
  },
  chrome: {
    backgroundColor: colors.surface,
    gap: spacing.xl,
    marginHorizontal: -spacing['5xl'],
    marginTop: -spacing['5xl'],
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['5xl'],
  },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.72,
  },
  products: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing['3xl'],
  },
  sectionHeading: {
    alignItems: 'baseline',
    gap: spacing['3xl'],
    justifyContent: 'space-between',
  },
});

import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Surface } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, radii, spacing } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon.tsx';
import { PresentationLayout } from '../_shared/PresentationLayout.tsx';
import type { CatalogBrowseState } from './catalog-browse.ts';
import { CatalogProductCard } from './CatalogProductCard.tsx';
import { CatalogStatePresentation } from './CatalogStatePresentation.tsx';

export type HomeCatalogPresentationProps = Readonly<{
  locale?: AppLocale;
  onOpenMenu?: () => void;
  onRetry?: () => void;
  onSelectProduct?: (productId: string) => void;
  onStartOrder: () => void;
  state: CatalogBrowseState;
}>;

export function HomeCatalogPresentation({
  locale = 'en',
  onOpenMenu,
  onRetry,
  onSelectProduct,
  onStartOrder,
  state,
}: HomeCatalogPresentationProps) {
  const t = createTranslator(locale);
  const rowDirection = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

  return (
    <PresentationLayout accessibilityLabel={t('catalog.heroTitle')} locale={locale}>
      {state.status !== 'ready' ? (
        <CatalogStatePresentation locale={locale} onRetry={onRetry} state={state} />
      ) : (
        <>
          <View style={styles.header}>
            <View style={[styles.brandRow, { flexDirection: rowDirection }]}>
              {state.data.hero.logoImageUrl ? (
                <Image
                  accessibilityLabel={state.data.hero.merchantName}
                  contentFit="contain"
                  source={state.data.hero.logoImageUrl}
                  style={styles.logo}
                />
              ) : (
                <AppText
                  numberOfLines={2}
                  style={styles.brandTitle}
                  variant="subheading"
                >
                  {state.data.hero.merchantName}
                </AppText>
              )}
            </View>
            <View style={[styles.location, { flexDirection: rowDirection }]}>
              <PresentationIcon color={colors.accent} name="location" size={14} />
              <AppText
                color="accent"
                numberOfLines={1}
                style={styles.locationText}
                variant="label"
              >
                {t('catalog.locationLabel')} · {state.data.location.name},{' '}
                {state.data.location.address}
              </AppText>
            </View>
          </View>

          <View style={styles.hero}>
            {state.data.hero.coverImageUrl ? (
              <Image
                accessibilityLabel=""
                contentFit="cover"
                source={state.data.hero.coverImageUrl}
                style={StyleSheet.absoluteFill}
                transition={180}
              />
            ) : null}
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <View style={styles.heroCopy}>
                <AppText color="accentSoft" variant="editorial">
                  {t('catalog.heroEyebrow')}
                </AppText>
                <AppText color="surface" variant="display">
                  {t('catalog.heroTitle')}
                </AppText>
              </View>
              <View style={styles.heroAction}>
                <Button
                  disabled={!state.data.canStartOrder}
                  icon={
                    <PresentationIcon
                      color={colors.surface}
                      name="arrowForward"
                      size={16}
                    />
                  }
                  label={t('catalog.startOrder')}
                  onPress={onStartOrder}
                  radius="pill"
                />
                {!state.data.canStartOrder ? (
                  <AppText color="heroSupporting" variant="caption">
                    {t('catalog.orderingUnavailable')}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={[styles.sectionHeading, { flexDirection: rowDirection }]}>
              <AppText accessibilityRole="header" variant="subheading">
                {state.data.sections.length === 6
                  ? t('catalog.categoriesTitle')
                  : t('catalog.title')}
              </AppText>
              {onOpenMenu ? (
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={onOpenMenu}
                  style={({ pressed }) => [
                    styles.menuLink,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText color="accent" variant="caption">
                    {t('catalog.fullMenu')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.categoryGrid}>
              {state.data.sections.map((section) => (
                <Surface key={section.id} padding="none" style={styles.categoryCard}>
                  <View style={styles.categoryImage}>
                    {section.imageUrl ? (
                      <Image
                        accessibilityLabel=""
                        contentFit="cover"
                        source={section.imageUrl}
                        style={styles.fill}
                      />
                    ) : (
                      <PresentationIcon
                        color={colors.textSubtle}
                        name="store"
                        size={28}
                      />
                    )}
                  </View>
                  <AppText
                    numberOfLines={2}
                    style={styles.categoryTitle}
                    variant="bodyStrong"
                  >
                    {section.title.toUpperCase()}
                  </AppText>
                </Surface>
              ))}
            </View>
          </View>

          {state.data.popularProducts.length > 0 ? (
            <View style={styles.section}>
              <AppText accessibilityRole="header" variant="subheading">
                {t('catalog.popular')}
              </AppText>
              <ScrollView
                contentContainerStyle={styles.horizontalContent}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {state.data.popularProducts.map((product) => (
                  <CatalogProductCard
                    key={product.id}
                    layout="compact"
                    locale={locale}
                    onPress={
                      onSelectProduct ? () => onSelectProduct(product.id) : undefined
                    }
                    product={product}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={[styles.footer, { flexDirection: rowDirection }]}>
            <PresentationIcon color={colors.accentSoft} name="store" size={28} />
            <View style={styles.footerCopy}>
              <AppText color="accentSoft" variant="editorial">
                {t('catalog.footerTitle')}
              </AppText>
              <AppText color="textOnDarkMuted" variant="caption">
                {state.data.hero.merchantBio || t('catalog.footerBody')}
              </AppText>
            </View>
          </View>
        </>
      )}
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    alignItems: 'center',
    gap: spacing.xl,
    justifyContent: 'space-between',
    minHeight: 28,
  },
  brandTitle: {
    flex: 1,
  },
  categoryCard: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: spacing.md,
    minHeight: 142,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  categoryGrid: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xl,
  },
  categoryImage: {
    alignItems: 'center',
    backgroundColor: colors.imageSurface,
    borderRadius: radii.md,
    height: 82,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  categoryTitle: {
    fontSize: 12,
    lineHeight: 14,
  },
  fill: {
    height: '100%',
    width: '100%',
  },
  footer: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.card,
    gap: spacing['2xl'],
    padding: spacing['4xl'],
  },
  footerCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  header: {
    gap: spacing.sm,
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radii.hero,
    minHeight: 250,
    overflow: 'hidden',
  },
  heroAction: {
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroContent: {
    flex: 1,
    gap: spacing['7xl'],
    justifyContent: 'space-between',
    minHeight: 250,
    padding: spacing['5xl'],
  },
  heroCopy: {
    gap: spacing.md,
  },
  heroOverlay: {
    backgroundColor: colors.ink,
    bottom: 0,
    left: 0,
    opacity: 0.68,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  horizontalContent: {
    gap: spacing.xl,
    paddingEnd: spacing['5xl'],
  },
  location: {
    alignItems: 'center',
    gap: spacing.inlineGap,
  },
  locationText: {
    flex: 1,
    textTransform: 'uppercase',
  },
  logo: {
    height: 28,
    maxWidth: 170,
    width: '48%',
  },
  section: {
    gap: spacing['3xl'],
  },
  sectionHeading: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pressed: {
    opacity: 0.72,
  },
});

import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { sizes, spacing } from '@/theme';

import { PresentationLayout } from '../_shared/PresentationLayout';
import { PresentationState } from '../_shared/PresentationState';
import {
  getProductAccessibilityLabel,
  type RouteFreeState,
} from '../_shared/presentation-state';
import type { CatalogSectionPresentation } from './catalog-browse.ts';

export type CatalogPresentationProps = {
  locale?: AppLocale;
  onRetry?: () => void;
  onSelectProduct: (productId: string) => void;
  state: RouteFreeState<readonly CatalogSectionPresentation[]>;
};

export function CatalogPresentation({
  locale = 'en',
  onRetry,
  onSelectProduct,
  state,
}: CatalogPresentationProps) {
  const t = createTranslator(locale);
  const rowDirection = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

  return (
    <PresentationLayout accessibilityLabel={t('catalog.title')} locale={locale}>
      <AppText accessibilityRole="header" variant="heading">
        {t('catalog.title')}
      </AppText>
      {state.status === 'ready' ? (
        <View style={styles.sections}>
          {state.data.map((section) => (
            <View accessibilityRole="list" key={section.id} style={styles.section}>
              <AppText accessibilityRole="header" variant="subheading">
                {section.title}
              </AppText>
              <View style={styles.products}>
                {section.products.map((product) => (
                  <Pressable
                    accessibilityLabel={getProductAccessibilityLabel(product)}
                    accessibilityRole="button"
                    key={product.id}
                    onPress={() => onSelectProduct(product.id)}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Surface style={styles.product}>
                      <View style={[styles.productHeading, { flexDirection: rowDirection }]}>
                        <AppText style={styles.productName} variant="bodyStrong">
                          {product.name}
                        </AppText>
                        {product.priceLabel ? (
                          <AppText color="textMuted" variant="bodyStrong">
                            {product.priceLabel}
                          </AppText>
                        ) : null}
                      </View>
                      {product.description ? (
                        <AppText color="textMuted" variant="caption">
                          {product.description}
                        </AppText>
                      ) : null}
                      {product.badgeLabel ? (
                        <AppText color="accent" variant="label">
                          {product.badgeLabel}
                        </AppText>
                      ) : null}
                    </Surface>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <PresentationState feature="catalog" locale={locale} onRetry={onRetry} status={state.status} />
      )}
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.78,
  },
  product: {
    gap: spacing.md,
    minHeight: sizes.standardControl * 2,
  },
  productHeading: {
    alignItems: 'flex-start',
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
  productName: {
    flex: 1,
  },
  products: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing['2xl'],
  },
  sections: {
    gap: spacing['6xl'],
  },
});

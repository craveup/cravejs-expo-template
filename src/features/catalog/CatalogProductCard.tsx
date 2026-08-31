import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Surface } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, radii, spacing } from '@/theme';

import {
  getProductAccessibilityLabel,
} from '../_shared/presentation-state.ts';
import { PresentationIcon } from '../_shared/PresentationIcon.tsx';
import type { CatalogProductPresentation } from './catalog-browse.ts';

export type CatalogProductCardProps = Readonly<{
  layout?: 'compact' | 'row';
  locale?: AppLocale;
  onPress?: () => void;
  product: CatalogProductPresentation;
}>;

export function CatalogProductCard({
  layout = 'row',
  locale = 'en',
  onPress,
  product,
}: CatalogProductCardProps) {
  const t = createTranslator(locale);
  const calorieLabel =
    product.calorieCount === undefined ? undefined : `${product.calorieCount} cal`;
  const unavailableLabel =
    product.availability === 'unavailable'
      ? t('catalog.unavailableProduct')
      : undefined;
  const direction = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';
  const accessibilityLabel = getProductAccessibilityLabel({
    ...(unavailableLabel ? { availabilityLabel: unavailableLabel } : {}),
    ...(calorieLabel ? { calorieLabel } : {}),
    ...(product.description ? { description: product.description } : {}),
    name: product.name,
    priceLabel: product.priceLabel,
  });

  const card = (
    <Surface
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? undefined : 'text'}
      accessible={!onPress}
      padding={layout === 'compact' ? 'compact' : 'default'}
      radius="md"
      style={[
        styles.card,
        layout === 'compact'
          ? styles.compactCard
          : [styles.rowCard, { flexDirection: direction }],
        product.availability === 'unavailable' && styles.unavailable,
      ]}
    >
      <View
        style={[
          styles.imageFrame,
          layout === 'compact' ? styles.compactImage : styles.rowImage,
        ]}
      >
        {product.imageUrl ? (
          <Image
            accessibilityLabel=""
            contentFit="cover"
            source={product.imageUrl}
            style={styles.image}
            transition={150}
          />
        ) : (
          <PresentationIcon color={colors.textSubtle} name="store" size={28} />
        )}
      </View>
      <View style={styles.details}>
        {unavailableLabel ? (
          <View style={styles.badgeRow}>
            <Badge tone="neutral">{unavailableLabel}</Badge>
          </View>
        ) : null}
        <AppText
          numberOfLines={2}
          style={layout === 'row' ? styles.rowProductName : undefined}
          variant="bodyStrong"
        >
          {product.name}
        </AppText>
        {product.description ? (
          <AppText
            color="textMuted"
            numberOfLines={2}
            style={layout === 'row' ? styles.rowDescription : undefined}
            variant="caption"
          >
            {product.description}
          </AppText>
        ) : null}
        <View style={[styles.meta, { flexDirection: direction }]}>
          <AppText variant="bodyStrong">{product.priceLabel}</AppText>
          {calorieLabel ? (
            <AppText color="textSubtle" variant="micro">
              {calorieLabel}
            </AppText>
          ) : null}
        </View>
      </View>
    </Surface>
  );

  if (!onPress) return card;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    alignItems: 'flex-start',
  },
  card: {
    gap: spacing['3xl'],
  },
  compactCard: {
    minHeight: 251,
    paddingHorizontal: 11,
    paddingVertical: 11,
    width: 158,
  },
  compactImage: {
    height: 132,
    width: '100%',
  },
  details: {
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFrame: {
    alignItems: 'center',
    backgroundColor: colors.imageSurface,
    borderRadius: radii.sm,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  meta: {
    alignItems: 'baseline',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginTop: spacing['2xl'],
  },
  pressed: {
    opacity: 0.72,
  },
  rowImage: {
    height: 168,
    width: 112,
  },
  rowCard: {
    paddingHorizontal: spacing.actionVertical,
    paddingVertical: spacing.actionVertical,
  },
  rowDescription: {
    lineHeight: 17,
  },
  rowProductName: {
    fontSize: 15,
    lineHeight: 18,
  },
  unavailable: {
    opacity: 0.68,
  },
});

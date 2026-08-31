import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { PresentationIcon } from '@/features/_shared';
import { getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, spacing } from '@/theme';

export type BagMerchantHeaderProps = Readonly<{
  fulfillmentLabel?: string;
  locale: AppLocale;
  locationLabel: string;
  merchantLogoUrl?: string;
  merchantName: string;
  onChangeFulfillment?: () => void;
}>;

export function BagMerchantHeader({
  fulfillmentLabel,
  locale,
  locationLabel,
  merchantLogoUrl,
  merchantName,
  onChangeFulfillment,
}: BagMerchantHeaderProps) {
  const rowDirection =
    getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

  return (
    <View style={styles.merchantHeader}>
      {merchantLogoUrl ? (
        <Image
          accessibilityLabel={merchantName}
          contentFit="contain"
          source={merchantLogoUrl}
          style={styles.logo}
        />
      ) : (
        <AppText numberOfLines={2} variant="subheading">
          {merchantName}
        </AppText>
      )}
      <Pressable
        accessibilityLabel={
          onChangeFulfillment
            ? `Change ${fulfillmentLabel ?? ''} fulfillment at ${locationLabel}`.trim()
            : undefined
        }
        accessibilityRole={onChangeFulfillment ? 'button' : undefined}
        disabled={!onChangeFulfillment}
        onPress={onChangeFulfillment}
        style={({ pressed }) => [
          styles.locationRow,
          { flexDirection: rowDirection },
          pressed && styles.pressed,
        ]}
      >
        <PresentationIcon color={colors.accent} name="location" size={14} />
        <AppText
          color="accent"
          numberOfLines={2}
          style={styles.locationText}
          variant="label"
        >
          {fulfillmentLabel ? `${fulfillmentLabel} \u00b7 ` : ''}
          {locationLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  locationRow: {
    alignItems: 'center',
    gap: spacing.inlineGap,
  },
  locationText: {
    flex: 1,
    textTransform: 'uppercase',
  },
  logo: {
    height: 30,
    maxWidth: 180,
    width: '52%',
  },
  merchantHeader: {
    gap: spacing.md,
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
});

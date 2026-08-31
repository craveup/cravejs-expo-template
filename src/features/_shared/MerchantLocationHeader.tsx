import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText, IconButton } from '@/components/ui';
import { brandConfig } from '@/config/brand.config';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, spacing } from '@/theme';

import type { MerchantLocationHeaderState } from './merchant-location-header.ts';
import { PresentationIcon } from './PresentationIcon.tsx';

export type MerchantLocationHeaderProps = Readonly<{
  locale?: AppLocale;
  onOpenAccount?: () => void;
  state: MerchantLocationHeaderState;
}>;

export function MerchantLocationHeader({
  locale = 'en',
  onOpenAccount,
  state,
}: MerchantLocationHeaderProps) {
  const t = createTranslator(locale);
  const rowDirection = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';
  const merchantName =
    state.status === 'ready' ? state.merchantName : brandConfig.displayName;

  return (
    <View accessibilityLabel={merchantName} style={styles.header}>
      <View style={[styles.brandRow, { flexDirection: rowDirection }]}>
        {state.status === 'ready' && state.merchantLogoUrl ? (
          <Image
            accessibilityLabel={merchantName}
            contentFit="contain"
            source={state.merchantLogoUrl}
            style={styles.logo}
          />
        ) : (
          <AppText numberOfLines={2} style={styles.brandName} variant="subheading">
            {merchantName}
          </AppText>
        )}
        {onOpenAccount ? (
          <IconButton
            accessibilityLabel={t('storefront.header.account')}
            compact
            onPress={onOpenAccount}
            variant="solid"
          >
            <PresentationIcon color={colors.surface} name="person" size={17} />
          </IconButton>
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.accountMark}
          >
            <PresentationIcon color={colors.surface} name="person" size={17} />
          </View>
        )}
      </View>
      <View style={[styles.locationRow, { flexDirection: rowDirection }]}>
        <PresentationIcon color={colors.accent} name="location" size={14} />
        <AppText
          color="accent"
          numberOfLines={2}
          style={styles.locationLabel}
          variant="label"
        >
          {state.status === 'ready'
            ? `${t('catalog.locationLabel')} · ${state.locationName}, ${state.locationAddress}`
            : state.status === 'loading'
              ? t('storefront.header.locationLoading')
              : t('storefront.header.locationUnavailable')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accountMark: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  brandName: {
    flex: 1,
    maxWidth: 190,
  },
  brandRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    gap: spacing.md,
  },
  locationLabel: {
    flex: 1,
    textTransform: 'uppercase',
  },
  locationRow: {
    alignItems: 'center',
    gap: spacing.inlineGap,
  },
  logo: {
    height: 28,
    maxWidth: 190,
    width: '54%',
  },
});

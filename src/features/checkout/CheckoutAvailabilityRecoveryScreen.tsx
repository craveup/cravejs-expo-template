import { StyleSheet, View } from 'react-native';

import { AppText, Button, IconButton, Surface } from '@/components/ui';
import { PresentationIcon, PresentationLayout } from '@/features/_shared';
import type { AppLocale } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import {
  createCheckoutAvailabilityRecoveryPresentation,
  type CheckoutAvailabilityRecovery,
} from './checkout-availability-recovery.ts';

export type CheckoutAvailabilityRecoveryScreenProps = Readonly<{
  locale?: AppLocale;
  onBack: () => void;
  onBrowseMenu: () => void;
  onReviewUpdatedCheckout: () => void;
  recovery: CheckoutAvailabilityRecovery;
}>;

export function CheckoutAvailabilityRecoveryScreen({
  locale = 'en',
  onBack,
  onBrowseMenu,
  onReviewUpdatedCheckout,
  recovery,
}: CheckoutAvailabilityRecoveryScreenProps) {
  const presentation = createCheckoutAvailabilityRecoveryPresentation(
    recovery,
    locale,
  );

  return (
    <PresentationLayout
      accessibilityLabel={presentation.title}
      background="contentCanvas"
      contentStyle={styles.content}
      locale={locale}
    >
      <IconButton
        accessibilityLabel={presentation.backActionLabel}
        compact
        onPress={onBack}
        variant="ghost"
      >
        <PresentationIcon name="arrowBack" />
      </IconButton>

      <Surface
        accessibilityLiveRegion="assertive"
        background="surfaceMuted"
        bordered={false}
        padding="compact"
        radius="tight"
        style={styles.warning}
      >
        <AppText color="danger" variant="label">
          {presentation.title}
        </AppText>
        <AppText color="textMuted" variant="caption">
          {presentation.body}
        </AppText>
        {presentation.requestLabel ? (
          <AppText color="textSubtle" variant="caption">
            {presentation.requestLabel}
          </AppText>
        ) : null}
      </Surface>

      <View style={styles.section}>
        <AppText color="textSubtle" variant="label">
          {presentation.removedLabel}
        </AppText>
        {presentation.removedItems.map((item) => (
          <Surface
            accessibilityLabel={`${item.label}, ${item.statusLabel}`}
            key={item.id}
            padding="compact"
            radius="tight"
            style={styles.removedItem}
          >
            <View style={styles.itemImage}>
              <PresentationIcon
                color={colors.textSubtle}
                name="store"
                size={25}
              />
            </View>
            <View style={styles.itemCopy}>
              <AppText color="textMuted" numberOfLines={2} variant="bodyStrong">
                {item.label}
              </AppText>
              <AppText color="danger" variant="caption">
                {item.statusLabel}
              </AppText>
            </View>
          </Surface>
        ))}
      </View>

      <View style={styles.section}>
        <AppText color="textSubtle" variant="label">
          {presentation.currentLabel}
        </AppText>
        <View style={styles.currentItems}>
          {presentation.currentEmptyLabel ? (
            <Surface padding="compact" radius="tight">
              <AppText color="textMuted" variant="body">
                {presentation.currentEmptyLabel}
              </AppText>
            </Surface>
          ) : null}
          {presentation.currentItems.map((item) => (
            <Surface
              accessibilityLabel={`${item.label}, ${item.priceLabel}`}
              key={item.id}
              padding="compact"
              radius="tight"
              style={styles.currentItem}
            >
              <AppText style={styles.currentItemLabel} variant="body">
                {item.label}
              </AppText>
              <AppText variant="bodyStrong">{item.priceLabel}</AppText>
            </Surface>
          ))}
        </View>
      </View>

      <View style={styles.totalRow}>
        <AppText variant="subheading">{presentation.totalTitle}</AppText>
        <AppText variant="subheading">{presentation.totalLabel}</AppText>
      </View>

      <View style={styles.actions}>
        <Button
          label={presentation.reviewActionLabel}
          onPress={onReviewUpdatedCheckout}
          radius="pill"
        />
        <Button
          label={presentation.menuActionLabel}
          onPress={onBrowseMenu}
          radius="pill"
          variant="secondary"
        />
      </View>
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.xl,
  },
  content: {
    gap: spacing['3xl'],
  },
  currentItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
    justifyContent: 'space-between',
    minHeight: sizes.compactControl,
  },
  currentItemLabel: {
    flex: 1,
  },
  currentItems: {
    gap: spacing.md,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  itemImage: {
    alignItems: 'center',
    backgroundColor: colors.imageSurface,
    borderRadius: radii.xs,
    height: sizes.minimumTouchTarget,
    justifyContent: 'center',
    width: sizes.minimumTouchTarget,
  },
  removedItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
  },
  section: {
    gap: spacing['2xl'],
  },
  totalRow: {
    alignItems: 'center',
    borderTopColor: colors.divider,
    borderTopWidth: sizes.hairline,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing['3xl'],
  },
  warning: {
    gap: spacing.xs,
  },
});

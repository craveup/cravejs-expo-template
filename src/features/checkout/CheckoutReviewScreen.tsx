import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Surface } from '@/components/ui';
import { PresentationLayout } from '@/features/_shared';
import { createTranslator, type AppLocale } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import type { CheckoutReviewPresentation } from './checkout-flow.ts';

export type CheckoutReviewScreenProps = Readonly<{
  errorMessage?: string;
  handoffStatus?: 'handed_off' | 'idle' | 'outcome_unknown' | 'preparing';
  locale?: AppLocale;
  onCheckStatus: () => void;
  onContinue: () => void;
  onGratuityChange?: (value: string) => void;
  pending?: boolean;
  reviewLocked?: boolean;
  retrySameIntent?: boolean;
  review: CheckoutReviewPresentation;
}>;

export function CheckoutReviewScreen({
  errorMessage,
  handoffStatus = 'idle',
  locale = 'en',
  onCheckStatus,
  onContinue,
  onGratuityChange,
  pending = false,
  reviewLocked = false,
  retrySameIntent = false,
  review,
}: CheckoutReviewScreenProps) {
  const t = createTranslator(locale);
  const terminal =
    handoffStatus === 'handed_off' || handoffStatus === 'outcome_unknown';

  return (
    <PresentationLayout accessibilityLabel={t('checkout.title')} locale={locale}>
      <AppText accessibilityRole="header" variant="title">
        {t('checkout.title')}
      </AppText>

      <Surface style={styles.section}>
        <AppText color="textMuted" variant="label">
          {t('checkout.fulfillment')}
        </AppText>
        <AppText variant="subheading">
          {review.bag.fulfillmentLabel} · {review.bag.locationLabel}
        </AppText>
        <View style={styles.detailRow}>
          <AppText color="textMuted">{t('checkout.orderTime')}</AppText>
          <AppText align="right" style={styles.detailValue} variant="bodyStrong">
            {review.orderTimeLabel}
          </AppText>
        </View>
        <View style={styles.detailRow}>
          <AppText color="textMuted">{t('checkout.customer')}</AppText>
          <AppText align="right" style={styles.detailValue} variant="bodyStrong">
            {review.customerLabel}
          </AppText>
        </View>
      </Surface>

      <View style={styles.section}>
        <AppText color="textMuted" variant="label">
          {t('checkout.items')}
        </AppText>
        {review.bag.items.map((item) => (
          <View
            accessibilityLabel={`${item.quantity} ${item.name}, ${item.priceLabel}`}
            key={item.id}
            style={styles.itemRow}
          >
            <View style={styles.itemCopy}>
              <AppText variant="bodyStrong">
                {item.quantity} × {item.name}
              </AppText>
              {item.description ? (
                <AppText color="textMuted" numberOfLines={2} variant="caption">
                  {item.description}
                </AppText>
              ) : null}
            </View>
            <AppText variant="bodyStrong">{item.priceLabel}</AppText>
          </View>
        ))}
      </View>

      {review.gratuityOptions.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <AppText color="textMuted" variant="label">
              {t('checkout.gratuity')}
            </AppText>
            {review.gratuityDescription ? (
              <AppText color="textMuted" variant="caption">
                {review.gratuityDescription}
              </AppText>
            ) : null}
          </View>
          <View accessibilityRole="radiogroup" style={styles.tipGrid}>
            {review.gratuityOptions.map((option) => {
              const selected = review.selectedGratuity === option.value;
              const optionDisabled =
                pending || reviewLocked || terminal || !onGratuityChange;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: optionDisabled }}
                  aria-checked={selected}
                  aria-disabled={optionDisabled}
                  disabled={optionDisabled}
                  key={option.value}
                  onPress={() => {
                    if (!selected) onGratuityChange?.(option.value);
                  }}
                  style={({ pressed }) => [
                    styles.tipOption,
                    selected && styles.tipOptionSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText align="center" variant="bodyStrong">
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Surface bordered={false} style={styles.section}>
        <View style={styles.totalRow}>
          <AppText color="textMuted">{t('bag.subtotal')}</AppText>
          <AppText>{review.bag.totals.subtotalLabel}</AppText>
        </View>
        {review.bag.totals.adjustments.map((adjustment) => (
          <View key={adjustment.label} style={styles.totalRow}>
            <AppText color="textMuted">{adjustment.label}</AppText>
            <AppText>{adjustment.value}</AppText>
          </View>
        ))}
        <View style={styles.totalRow}>
          <AppText color="textMuted">{t('bag.tax')}</AppText>
          <AppText>{review.bag.totals.taxLabel}</AppText>
        </View>
        <View style={[styles.totalRow, styles.grandTotal]}>
          <AppText variant="subheading">{t('bag.total')}</AppText>
          <AppText variant="subheading">{review.bag.totals.totalLabel}</AppText>
        </View>
      </Surface>

      {errorMessage ? (
        <Surface accessibilityLiveRegion="polite" background="surfaceMuted">
          <AppText color="danger">{errorMessage}</AppText>
        </Surface>
      ) : null}
      {handoffStatus === 'handed_off' ? (
        <Surface accessibilityLiveRegion="polite" background="surfaceMuted">
          <AppText>{t('checkout.handedOff')}</AppText>
        </Surface>
      ) : null}
      {handoffStatus === 'outcome_unknown' ? (
        <Surface accessibilityLiveRegion="assertive" background="surfaceMuted">
          <AppText>{t('checkout.outcomeUnknown')}</AppText>
        </Surface>
      ) : null}

      {terminal ? (
        <Button
          label={t('checkout.action.status')}
          onPress={onCheckStatus}
          radius="pill"
          variant="dark"
        />
      ) : (
        <Button
          label={
            retrySameIntent
              ? t('checkout.retrySafe')
              : t('checkout.action.continue')
          }
          loading={pending || handoffStatus === 'preparing'}
          onPress={onContinue}
          radius="pill"
        />
      )}
    </PresentationLayout>
  );
}

export function CheckoutRouteStateScreen({
  loading,
  onRetry,
}: Readonly<{ loading: boolean; onRetry?: () => void }>) {
  const t = createTranslator('en');
  return (
    <PresentationLayout accessibilityLabel={t('checkout.title')} centered>
      <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
        <AppText align="center" variant="subheading">
          {loading ? t('checkout.loading') : t('checkout.unavailable')}
        </AppText>
        {!loading && onRetry ? (
          <Button label={t('action.retry')} onPress={onRetry} variant="secondary" />
        ) : null}
      </Surface>
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  detailRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
  detailValue: {
    flex: 1,
  },
  grandTotal: {
    borderTopColor: colors.divider,
    borderTopWidth: sizes.hairline,
    marginTop: spacing.sm,
    paddingTop: spacing['3xl'],
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  itemRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.divider,
    borderBottomWidth: sizes.hairline,
    flexDirection: 'row',
    gap: spacing.xl,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  pressed: {
    opacity: 0.78,
  },
  section: {
    gap: spacing.xl,
  },
  sectionHeading: {
    gap: spacing.sm,
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing['3xl'],
  },
  tipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tipOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    minWidth: sizes.bottomNavigation,
    paddingHorizontal: spacing.xl,
  },
  tipOptionSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  totalRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
});

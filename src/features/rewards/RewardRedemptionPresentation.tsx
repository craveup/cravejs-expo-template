import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  PresentationIcon,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, radii, spacing } from '@/theme';

import type { RewardRedemptionPresentationState } from './reward-redemption.ts';

export type RewardRedemptionPresentationProps = Readonly<{
  locale?: AppLocale;
  merchantHeaderState: MerchantLocationHeaderState;
  onDismiss?: () => void;
  onOpenAccount?: () => void;
  onRetry?: () => void;
  onSignIn?: () => void;
  onSubmit?: () => void;
  state: RewardRedemptionPresentationState;
}>;

export function RewardRedemptionPresentation({
  locale = 'en',
  merchantHeaderState,
  onDismiss,
  onOpenAccount,
  onRetry,
  onSignIn,
  onSubmit,
  state,
}: RewardRedemptionPresentationProps) {
  const t = createTranslator(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const direction = getLocaleDirection(locale);
  const message =
    state.status === 'loading'
      ? t('rewards.redemption.loading')
      : state.status === 'signed_out'
        ? t('rewards.redemption.signedOut')
        : state.status === 'requires_order'
          ? t('rewards.redemption.requiresOrder')
          : state.status === 'not_found'
            ? t('rewards.redemption.notFound')
            : state.status === 'error'
              ? t('rewards.redemption.error')
              : state.status === 'unavailable'
                ? t('rewards.redemption.unavailable')
                : undefined;

  return (
    <Screen
      accessibilityLabel={
        state.status === 'ready' ? state.title : t('rewards.redemption.screenTitle')
      }
      background="contentCanvas"
      contentContainerStyle={[
        styles.screenContent,
        {
          direction,
          maxWidth: layout.contentMaxWidth,
          paddingHorizontal: layout.horizontalPadding,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      padded={false}
      scrollable
    >
      <MerchantLocationHeader
        locale={locale}
        onOpenAccount={onOpenAccount}
        state={merchantHeaderState}
      />
      {state.status === 'ready' ? (
        <View style={styles.readyContent}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.rewardMark}
          >
            <PresentationIcon color={colors.surface} name="starFilled" size={34} />
          </View>

          <View style={styles.copy}>
            <AppText accessibilityRole="header" align="center" variant="heading">
              {state.title}
            </AppText>
            <AppText align="center" color="textMuted" style={styles.rewardName}>
              {state.rewardName}
            </AppText>
          </View>

          <Surface bordered={false} padding="none" radius="md" style={styles.summary}>
            {state.balanceLabel ? (
              <View style={styles.summaryRow}>
                <AppText color="textMuted" variant="caption">
                  {t('rewards.redemption.balanceNow')}
                </AppText>
                <AppText variant="caption">{state.balanceLabel}</AppText>
              </View>
            ) : null}
            <View style={styles.summaryRow}>
              <AppText color="textMuted" variant="caption">
                {t('rewards.redemption.rewardCost')}
              </AppText>
              <AppText variant="caption">{state.rewardCostLabel}</AppText>
            </View>
          </Surface>

          {state.actionStatus === 'retryable_error' ? (
            <AppText
              accessibilityLiveRegion="polite"
              align="center"
              color="danger"
              variant="caption"
            >
              {t('rewards.redemption.retryableError')}
            </AppText>
          ) : state.actionStatus === 'terminal_error' ? (
            <AppText
              accessibilityLiveRegion="polite"
              align="center"
              color="danger"
              variant="caption"
            >
              {t('rewards.redemption.terminalError')}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            <Button
              disabled={state.actionStatus === 'terminal_error'}
              label={
                state.actionStatus === 'retryable_error'
                  ? t('action.retry')
                  : state.primaryLabel
              }
              loading={state.actionStatus === 'pending'}
              onPress={onSubmit}
              style={styles.action}
            />
            <Button
              disabled={state.actionStatus === 'pending'}
              label={state.secondaryLabel}
              onPress={onDismiss}
              style={styles.action}
              variant="secondary"
            />
          </View>
        </View>
      ) : (
        <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
          {state.status === 'loading' ? (
            <ActivityIndicator color={colors.accent} />
          ) : null}
          <AppText color="textMuted">{message}</AppText>
          {state.status === 'error' && onRetry ? (
            <Button label={t('action.retry')} onPress={onRetry} />
          ) : null}
          {state.status === 'signed_out' && onSignIn ? (
            <Button label={t('action.signIn')} onPress={onSignIn} />
          ) : null}
          {state.status !== 'loading' && onDismiss ? (
            <Button
              label={t('rewards.redemption.action.back')}
              onPress={onDismiss}
              variant="secondary"
            />
          ) : null}
        </Surface>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    width: '100%',
  },
  actions: {
    gap: spacing['2xl'],
    width: '100%',
  },
  copy: {
    alignItems: 'center',
    gap: spacing.xl,
  },
  readyContent: {
    alignItems: 'center',
    gap: spacing['2xl'],
    width: '100%',
  },
  rewardMark: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  rewardName: {
    maxWidth: 280,
  },
  screenContent: {
    alignSelf: 'center',
    flexGrow: 1,
    paddingBottom: spacing['7xl'],
    gap: spacing['4xl'],
    paddingTop: spacing['4xl'],
    width: '100%',
  },
  stateCard: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
  summary: {
    gap: spacing.sm,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['2xl'],
    width: '100%',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

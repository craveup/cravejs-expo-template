import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Surface } from '@/components/ui';
import { PresentationIcon } from '@/features/_shared';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, radii, sizes, spacing } from '@/theme';

import type {
  RewardsAccountPresentationState,
  RewardsAccountReward,
} from './rewards-account-presentation.ts';

export type RewardsAccountPresentationProps = Readonly<{
  locale?: AppLocale;
  onHistory?: () => void;
  onRedeem?: (rewardId: string) => void;
  onRetry?: () => void;
  onSignIn?: () => void;
  state: RewardsAccountPresentationState;
}>;

function RewardCard({
  locale,
  onRedeem,
  reward,
}: Readonly<{
  locale: AppLocale;
  onRedeem?: (rewardId: string) => void;
  reward: RewardsAccountReward;
}>) {
  const t = createTranslator(locale);
  const unavailable = !reward.redeemable && !reward.applied;

  return (
    <Surface
      padding="default"
      radius="sm"
      style={styles.rewardCard}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.rewardIcon}
      >
        <PresentationIcon color={colors.accent} name="star" size={22} />
      </View>
      <View style={styles.rewardCopy}>
        <AppText numberOfLines={3} variant="bodyStrong">
          {reward.name}
        </AppText>
        <AppText color="accent" style={styles.pointsCost} variant="label">
          {reward.pointsLabel}
        </AppText>
      </View>

      {reward.applied && onRedeem ? (
        <Button
          label={t('rewards.redemption.action.cancel')}
          onPress={() => onRedeem(reward.id)}
          radius="pill"
          style={styles.redeemButton}
          variant="dark"
        />
      ) : reward.applied ? (
        <View style={styles.statusPill}>
          <AppText color="textMuted" variant="caption">
            {t('rewards.account.rewardApplied')}
          </AppText>
        </View>
      ) : unavailable ? (
        <View style={styles.statusPill}>
          <AppText color="textMuted" variant="caption">
            {t('rewards.account.rewardUnavailable')}
          </AppText>
        </View>
      ) : onRedeem ? (
        <Button
          label={t('rewards.account.action.redeem')}
          onPress={() => onRedeem(reward.id)}
          radius="pill"
          style={styles.redeemButton}
          variant="dark"
        />
      ) : null}
    </Surface>
  );
}

export function RewardsAccountPresentation({
  locale = 'en',
  onHistory,
  onRedeem,
  onRetry,
  onSignIn,
  state,
}: RewardsAccountPresentationProps) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const message =
    state.status === 'loading'
      ? t('rewards.account.loading')
      : state.status === 'signed_out'
        ? t('rewards.account.signedOut')
        : state.status === 'error'
          ? t('rewards.account.error')
          : state.status === 'unavailable'
            ? t('rewards.account.unavailable')
            : undefined;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.hero}>
          <View
            style={[
              styles.heroContent,
              {
                direction,
                maxWidth: layout.contentMaxWidth,
                paddingHorizontal: layout.horizontalPadding,
              },
            ]}
          >
            <View style={styles.heroHeader}>
              <AppText
                accessibilityRole="header"
                style={styles.title}
                variant="heading"
              >
                {t('rewards.account.title')}
              </AppText>
            </View>

            {state.status === 'ready' ? (
              <View
                accessibilityLabel={t('rewards.account.balanceAccessibility', {
                  points: state.balanceLabel,
                })}
                accessible
                style={styles.balanceRing}
              >
                <AppText style={styles.balanceValue} variant="display">
                  {state.balanceLabel}
                </AppText>
                <AppText style={styles.balanceUnit} variant="label">
                  {t('rewards.account.pointsUnit')}
                </AppText>
              </View>
            ) : null}

            {onHistory ? (
              <View style={styles.heroActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={onHistory}
                  style={({ pressed }) => [
                    styles.historyAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText style={styles.historyLabel} variant="bodyStrong">
                    {t('rewards.account.action.history')}
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.body,
            {
              direction,
              maxWidth: layout.contentMaxWidth,
              paddingHorizontal: layout.horizontalPadding,
            },
          ]}
        >
          {state.status === 'ready' ? (
            <>
              <View style={styles.sectionHeader}>
                <AppText style={styles.sectionTitle} variant="subheading">
                  {t('rewards.account.redeemTitle')}
                </AppText>
                {state.rewardsStatus === 'ready' ? (
                  <AppText color="textSubtle" variant="caption">
                    {t('rewards.account.rewardCount', {
                      count: state.rewards.length,
                    })}
                  </AppText>
                ) : null}
              </View>

              {state.rewardsStatus === 'ready' ? (
                <View accessibilityRole="list" style={styles.rewardsList}>
                  {state.rewards.map((reward) => (
                    <RewardCard
                      key={reward.id}
                      locale={locale}
                      onRedeem={onRedeem}
                      reward={reward}
                    />
                  ))}
                </View>
              ) : (
                <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
                  <AppText color="textMuted">
                    {state.rewardsStatus === 'requires_order'
                      ? t('rewards.account.requiresOrder')
                      : state.rewardsStatus === 'unavailable'
                        ? t('rewards.account.rewardsUnavailable')
                        : t('rewards.account.empty')}
                  </AppText>
                  {state.rewardsStatus === 'unavailable' && onRetry ? (
                    <Button
                      label={t('action.retry')}
                      onPress={onRetry}
                      variant="secondary"
                    />
                  ) : null}
                </Surface>
              )}
            </>
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
            </Surface>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  balanceRing: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: spacing.lg,
    height: 132,
    justifyContent: 'center',
    width: 132,
  },
  balanceUnit: {
    color: colors.iconMuted,
    letterSpacing: 1.3,
    marginTop: spacing.xs,
  },
  balanceValue: {
    color: colors.surface,
    fontSize: 34,
    lineHeight: 34,
  },
  body: {
    alignSelf: 'center',
    gap: spacing.xl,
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['5xl'],
    width: '100%',
  },
  hero: {
    backgroundColor: colors.ink,
  },
  heroContent: {
    alignSelf: 'center',
    gap: spacing['5xl'],
    paddingBottom: spacing['7xl'],
    paddingTop: spacing.lg,
    width: '100%',
  },
  heroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  historyAction: {
    alignItems: 'center',
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing['4xl'],
  },
  historyLabel: {
    color: colors.surface,
  },
  pointsCost: {
    letterSpacing: 1.1,
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  redeemButton: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  rewardCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing['2xl'],
    minHeight: 84,
  },
  rewardCopy: {
    flex: 1,
    minWidth: 0,
  },
  rewardIcon: {
    alignItems: 'center',
    backgroundColor: colors.contentCanvas,
    borderRadius: radii.sm,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  rewardsList: {
    gap: spacing.xl,
  },
  safeArea: {
    backgroundColor: colors.ink,
    flex: 1,
  },
  scroll: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 17,
  },
  stateCard: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
  statusPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.xl,
  },
  title: {
    color: colors.surface,
    fontSize: 20,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
});

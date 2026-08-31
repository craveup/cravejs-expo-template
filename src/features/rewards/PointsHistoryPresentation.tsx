import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, fontFamilies, spacing } from '@/theme';

import type {
  PointsHistoryPresentationState,
  PointsHistoryRow,
} from './points-history.ts';

export type PointsHistoryPresentationProps = Readonly<{
  locale?: AppLocale;
  merchantHeaderState: MerchantLocationHeaderState;
  onLoadMore?: () => void;
  onOpenAccount?: () => void;
  onRetry?: () => void;
  onSignIn?: () => void;
  state: PointsHistoryPresentationState;
}>;

function HistoryRow({ row }: Readonly<{ row: PointsHistoryRow }>) {
  return (
    <Surface
      accessibilityLabel={row.accessibilityLabel}
      accessibilityRole="text"
      bordered={false}
      padding="none"
      radius="md"
      style={styles.row}
    >
      <View style={styles.rowCopy}>
        <AppText numberOfLines={2} style={styles.rowTitle} variant="caption">
          {row.title}
        </AppText>
        <AppText color="textSubtle" variant="micro">
          {row.dateLabel}
        </AppText>
      </View>
      <AppText
        color={row.tone === 'earned' ? 'accent' : 'iconMuted'}
        style={styles.amount}
      >
        {row.amountLabel}
      </AppText>
    </Surface>
  );
}

export function PointsHistoryPresentation({
  locale = 'en',
  merchantHeaderState,
  onLoadMore,
  onOpenAccount,
  onRetry,
  onSignIn,
  state,
}: PointsHistoryPresentationProps) {
  const t = createTranslator(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const direction = getLocaleDirection(locale);
  const stateMessage =
    state.status === 'loading'
      ? t('rewards.history.loading')
      : state.status === 'error'
        ? t('rewards.history.error')
        : state.status === 'signed_out'
          ? t('rewards.history.signedOut')
          : state.status === 'unavailable'
            ? t('rewards.history.unavailable')
            : undefined;

  return (
    <Screen
      accessibilityLabel={t('rewards.history.title')}
      background="contentCanvas"
      contentContainerStyle={[
        styles.content,
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
      <AppText accessibilityRole="header" variant="heading">
        {t('rewards.history.title')}
      </AppText>

      {state.status === 'ready' ? (
        <>
          <Surface
            accessibilityLabel={t('rewards.history.balanceAccessibility', {
              points: state.balanceLabel,
            })}
            accessible
            background="accent"
            bordered={false}
            padding="none"
            radius="md"
            style={styles.balance}
          >
            <AppText color="surface" variant="caption">
              {t('rewards.history.currentBalance')}
            </AppText>
            <AppText color="surface" style={styles.balanceValue}>
              {state.balanceLabel}
            </AppText>
          </Surface>

          {state.data.length > 0 ? (
            <View accessibilityRole="list" style={styles.list}>
              {state.data.map((row, index) => (
                <HistoryRow
                  key={`${row.dateLabel}-${row.amountLabel}-${row.title}-${index}`}
                  row={row}
                />
              ))}
            </View>
          ) : (
            <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
              <AppText color="textMuted">
                {t('rewards.history.empty')}
              </AppText>
            </Surface>
          )}

          {state.loadMoreStatus === 'error' ? (
            <AppText
              accessibilityLiveRegion="polite"
              align="center"
              color="danger"
              variant="caption"
            >
              {t('rewards.history.loadMoreError')}
            </AppText>
          ) : null}

          {state.nextCursor && onLoadMore ? (
            <Button
              label={
                state.loadMoreStatus === 'error'
                  ? t('action.retry')
                  : t('rewards.history.action.loadMore')
              }
              loading={state.loadMoreStatus === 'pending'}
              onPress={onLoadMore}
              variant="dark"
            />
          ) : null}
        </>
      ) : (
        <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
          {state.status === 'loading' ? (
            <ActivityIndicator color={colors.accent} />
          ) : null}
          <AppText color="textMuted">{stateMessage}</AppText>
          {state.status === 'error' && onRetry ? (
            <Button label={t('action.retry')} onPress={onRetry} />
          ) : null}
          {state.status === 'signed_out' && onSignIn ? (
            <Button label={t('action.signIn')} onPress={onSignIn} />
          ) : null}
        </Surface>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontFamily: fontFamilies.headingBold,
    fontSize: 14,
    lineHeight: 17,
  },
  balance: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['2xl'],
  },
  balanceValue: {
    fontFamily: fontFamilies.headingExtraBold,
    fontSize: 18,
    lineHeight: 23,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['4xl'],
    width: '100%',
  },
  list: {
    gap: spacing.xl,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.xl,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fontFamilies.bodyMedium,
  },
  stateCard: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
});

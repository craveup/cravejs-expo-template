import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, fontFamilies, spacing } from '@/theme';

import type {
  OrderHistoryPresentationRow,
  OrderHistoryPresentationState,
} from './order-history-presentation.ts';

export type OrderHistoryPresentationProps = Readonly<{
  locale?: AppLocale;
  merchantHeaderState: MerchantLocationHeaderState;
  onLoadMore?: () => void;
  onOpenAccount?: () => void;
  onRefresh?: () => void;
  onRetry?: () => void;
  onSignIn?: () => void;
  state: OrderHistoryPresentationState;
}>;

function OrderHistoryCard({
  locale,
  row,
}: Readonly<{
  locale: AppLocale;
  row: OrderHistoryPresentationRow;
}>) {
  const t = createTranslator(locale);
  const rowDirection = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

  return (
    <Surface
      bordered={false}
      padding="none"
      radius="action"
      style={styles.card}
    >
      <View style={[styles.cardHeader, { flexDirection: rowDirection }]}>
        <AppText numberOfLines={2} style={styles.headerLabel} variant="bodyStrong">
          {row.headerLabel}
        </AppText>
        {row.priceLabel ? (
          <AppText style={styles.priceLabel} variant="bodyStrong">
            {row.priceLabel}
          </AppText>
        ) : null}
      </View>
      {row.itemSummary ? (
        <AppText
          color="textMuted"
          numberOfLines={1}
          style={styles.itemSummary}
          variant="caption"
        >
          {row.itemSummary}
        </AppText>
      ) : null}
      {row.inProgress ? (
        <View style={[styles.actions, { flexDirection: rowDirection }]}>
          <View style={styles.badge}>
            <AppText color="accent" style={styles.badgeLabel} variant="label">
              {t('orders.history.status.inProgress')}
            </AppText>
          </View>
        </View>
      ) : null}
    </Surface>
  );
}

export function OrderHistoryPresentation({
  locale = 'en',
  merchantHeaderState,
  onLoadMore,
  onOpenAccount,
  onRefresh,
  onRetry,
  onSignIn,
  state,
}: OrderHistoryPresentationProps) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const stateMessage =
    state.status === 'loading'
      ? t('orders.history.loading')
      : state.status === 'error'
        ? t('orders.history.error')
        : state.status === 'offline'
          ? t('orders.history.offline')
          : state.status === 'signed_out'
            ? t('orders.history.signedOut')
            : state.status === 'unavailable'
              ? t('orders.history.unavailable')
              : undefined;

  return (
    <Screen
      accessibilityLabel={t('orders.history.title')}
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
      refreshControl={
        onRefresh ? (
          <RefreshControl
            colors={[colors.accent]}
            onRefresh={onRefresh}
            refreshing={state.status === 'ready' && Boolean(state.refreshing)}
            tintColor={colors.accent}
          />
        ) : undefined
      }
      scrollable
      showsVerticalScrollIndicator={false}
    >
      <MerchantLocationHeader
        locale={locale}
        onOpenAccount={onOpenAccount}
        state={merchantHeaderState}
      />
      <AppText accessibilityRole="header" variant="heading">
        {t('orders.history.title')}
      </AppText>

      {state.status === 'ready' ? (
        state.data.length > 0 ? (
          <View accessibilityRole="list" style={styles.list}>
            {state.data.map((row) => (
              <OrderHistoryCard key={row.id} locale={locale} row={row} />
            ))}
          </View>
        ) : (
          <AppText color="textMuted" variant="body">
            {t('orders.history.empty')}
          </AppText>
        )
      ) : (
        <View accessibilityLiveRegion="polite" style={styles.state}>
          {state.status === 'loading' ? (
            <ActivityIndicator color={colors.accent} />
          ) : null}
          <AppText color="textMuted" variant="body">
            {stateMessage}
          </AppText>
          {(state.status === 'error' || state.status === 'offline') && onRetry ? (
            <Button label={t('action.retry')} onPress={onRetry} />
          ) : null}
          {state.status === 'signed_out' && onSignIn ? (
            <Button label={t('action.signIn')} onPress={onSignIn} />
          ) : null}
        </View>
      )}

      {state.status === 'ready' && state.loadMoreFailed ? (
        <AppText
          accessibilityLiveRegion="polite"
          align="center"
          color="danger"
          variant="caption"
        >
          {t('orders.history.loadMoreError')}
        </AppText>
      ) : null}

      {state.status === 'ready' && state.hasMore && onLoadMore ? (
        <Button
          label={
            state.loadMoreFailed
              ? t('action.retry')
              : t('orders.history.action.loadMore')
          }
          loading={state.loadingMore}
          onPress={onLoadMore}
          variant="dark"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  badge: {
    backgroundColor: colors.contentCanvas,
    borderRadius: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0,
  },
  card: {
    gap: spacing.xs,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['2xl'],
  },
  cardHeader: {
    alignItems: 'flex-start',
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['4xl'],
    width: '100%',
  },
  headerLabel: {
    flex: 1,
    fontSize: 11,
    lineHeight: 13,
  },
  itemSummary: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 11,
    lineHeight: 13,
  },
  list: {
    gap: spacing.xl,
  },
  priceLabel: {
    fontFamily: fontFamilies.headingBold,
    fontSize: 13,
    lineHeight: 16,
  },
  state: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
});

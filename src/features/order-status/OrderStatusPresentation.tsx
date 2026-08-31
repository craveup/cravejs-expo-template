import {
  ActivityIndicator,
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
import { colors, spacing } from '@/theme';

import type { OrderStatusPresentationState } from './order-status-presentation.ts';

export type OrderStatusPresentationProps = Readonly<{
  locale?: AppLocale;
  merchantHeaderState: MerchantLocationHeaderState;
  onOpenAccount?: () => void;
  onRetry?: () => void;
  state: OrderStatusPresentationState;
}>;

function StatusCopy({
  locale,
  state,
}: Readonly<{
  locale: AppLocale;
  state: Exclude<OrderStatusPresentationState, { status: 'completed' }>;
}>) {
  const t = createTranslator(locale);
  const pending =
    state.status === 'payment_pending' || state.status === 'order_pending';
  const title =
    state.status === 'payment_pending'
      ? t('orders.status.paymentPending.title')
      : state.status === 'order_pending'
        ? t('orders.status.orderPending.title')
        : state.status === 'order_failed'
          ? t('orders.status.failed.title')
          : state.status === 'no_active_order'
            ? t('orders.status.empty.title')
            : state.status === 'session_expired'
              ? t('orders.status.sessionExpired.title')
              : state.status === 'offline'
                ? t('orders.status.offline.title')
                : state.status === 'unavailable'
                  ? t('orders.status.unavailable.title')
                  : state.status === 'error'
                    ? t('orders.status.error.title')
                    : t('orders.status.loading');
  const supporting = pending
    ? t('orders.status.pending.supporting')
    : state.status === 'order_failed'
      ? t('orders.status.failed.supporting')
      : state.status === 'no_active_order'
        ? t('orders.status.empty.supporting')
        : state.status === 'session_expired'
          ? t('orders.status.sessionExpired.supporting')
          : state.status === 'offline'
            ? t('orders.status.offline.supporting')
            : state.status === 'unavailable'
              ? t('orders.status.unavailable.supporting')
              : state.status === 'error'
                ? t('orders.status.error.supporting')
                : undefined;

  return (
    <View style={styles.statusCopy}>
      {state.status === 'loading' || pending ? (
        <ActivityIndicator color={colors.ink} />
      ) : null}
      <AppText accessibilityRole="header" variant="title">
        {title}
      </AppText>
      {supporting ? (
        <AppText variant="body">
          {supporting}
        </AppText>
      ) : null}
    </View>
  );
}

export function OrderStatusPresentation({
  locale = 'en',
  merchantHeaderState,
  onOpenAccount,
  onRetry,
  state,
}: OrderStatusPresentationProps) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const canRetry = state.status === 'error' || state.status === 'offline';

  return (
    <Screen
      accessibilityLabel={t('orders.status.title')}
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
      showsVerticalScrollIndicator={false}
    >
      <MerchantLocationHeader
        locale={locale}
        onOpenAccount={onOpenAccount}
        state={merchantHeaderState}
      />
      <AppText variant="heading">
        {t('orders.status.title')}
      </AppText>

      <Surface
        accessibilityLiveRegion="polite"
        background="accent"
        bordered={false}
        padding="roomy"
        radius="hero"
        style={styles.statusCard}
      >
        {state.status === 'completed' ? (
          <View style={styles.statusCopy}>
            <AppText variant="bodyStrong">{state.order.orderLabel}</AppText>
            <AppText accessibilityRole="header" variant="title">
              {t('orders.status.completed.title')}
            </AppText>
            <AppText variant="body">
              {t('orders.status.completed.supporting')}
            </AppText>
          </View>
        ) : (
          <StatusCopy locale={locale} state={state} />
        )}
      </Surface>

      {state.status === 'completed' ? (
        <Surface bordered={false} padding="roomy" radius="cardLarge">
          <View style={styles.orderCard}>
            <AppText variant="subheading">{state.order.merchantLabel}</AppText>
            {state.order.detailLabel ? (
              <AppText color="textMuted" variant="body">
                {state.order.detailLabel}
              </AppText>
            ) : null}
            <View style={styles.summaryRow}>
              {state.order.itemCountLabel ? (
                <AppText color="textMuted" variant="bodyStrong">
                  {state.order.itemCountLabel}
                </AppText>
              ) : null}
              <View style={styles.spacer} />
              {state.order.totalLabel ? (
                <AppText variant="subheading">{state.order.totalLabel}</AppText>
              ) : null}
            </View>
          </View>
        </Surface>
      ) : null}

      {canRetry && onRetry ? (
        <Button label={t('action.retry')} onPress={onRetry} variant="dark" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing['4xl'],
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['4xl'],
    width: '100%',
  },
  orderCard: {
    gap: spacing.xl,
  },
  spacer: {
    flex: 1,
  },
  statusCard: {
    gap: spacing['4xl'],
  },
  statusCopy: {
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
  },
});

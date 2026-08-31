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

import type { DeliveryStatusPresentationState } from './delivery-status.ts';

export type DeliveryStatusPresentationProps = Readonly<{
  locale?: AppLocale;
  merchantHeaderState: MerchantLocationHeaderState;
  onOpenAccount?: () => void;
  onRetry?: () => void;
  state: DeliveryStatusPresentationState;
}>;

type DeliveryStatusUnavailableState = Exclude<
  DeliveryStatusPresentationState,
  { status: 'ready' }
>;

function StatusCopy({
  locale,
  state,
}: Readonly<{
  locale: AppLocale;
  state: DeliveryStatusUnavailableState;
}>) {
  const t = createTranslator(locale);
  const pending =
    state.status === 'payment_pending' || state.status === 'order_pending';
  const title =
    state.status === 'payment_pending'
      ? t('delivery.status.paymentPending.title')
      : state.status === 'order_pending'
        ? t('delivery.status.orderPending.title')
        : state.status === 'order_failed'
          ? t('delivery.status.failed.title')
          : state.status === 'no_active_order'
            ? t('delivery.status.noActive.title')
            : state.status === 'session_expired'
              ? t('delivery.status.sessionExpired.title')
              : state.status === 'offline'
                ? t('delivery.status.offline.title')
                : state.status === 'unavailable'
                  ? t('delivery.status.unavailable.title')
                  : state.status === 'error'
                    ? t('delivery.status.error.title')
                    : t('delivery.status.loading');
  const supporting =
    state.status === 'payment_pending'
      ? t('delivery.status.paymentPending.supporting')
      : state.status === 'order_pending'
        ? t('delivery.status.orderPending.supporting')
        : state.status === 'order_failed'
          ? t('delivery.status.failed.supporting')
          : state.status === 'no_active_order'
            ? t('delivery.status.noActive.supporting')
            : state.status === 'session_expired'
              ? t('delivery.status.sessionExpired.supporting')
              : state.status === 'offline'
                ? t('delivery.status.offline.supporting')
                : state.status === 'unavailable'
                  ? t('delivery.status.unavailable.supporting')
                  : state.status === 'error'
                    ? t('delivery.status.error.supporting')
                    : undefined;

  return (
    <View style={styles.statusCopy}>
      {state.status === 'loading' || pending ? (
        <ActivityIndicator color={colors.ink} />
      ) : null}
      <AppText accessibilityRole="header" variant="title">
        {title}
      </AppText>
      {supporting ? <AppText variant="body">{supporting}</AppText> : null}
    </View>
  );
}

export function DeliveryStatusPresentation({
  locale = 'en',
  merchantHeaderState,
  onOpenAccount,
  onRetry,
  state,
}: DeliveryStatusPresentationProps) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale);
  const rowDirection = direction === 'rtl' ? 'row-reverse' : 'row';
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const canRetry =
    state.status === 'error' ||
    state.status === 'offline' ||
    merchantHeaderState.status === 'unavailable';

  return (
    <Screen
      accessibilityLabel={t('delivery.status.title')}
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

      <Surface
        accessibilityLiveRegion="polite"
        background="accent"
        bordered={false}
        padding="roomy"
        radius="hero"
      >
        {state.status === 'ready' ? (
          <View style={styles.statusCopy}>
            <AppText style={styles.uppercase} variant="bodyStrong">
              {state.data.orderLabel}
            </AppText>
            <AppText style={styles.uppercase} variant="label">
              {t('delivery.status.status')}
            </AppText>
            <AppText accessibilityRole="header" variant="title">
              {state.data.statusLabel}
            </AppText>
          </View>
        ) : (
          <StatusCopy locale={locale} state={state} />
        )}
      </Surface>

      {state.status === 'ready' ? (
        <>
          <Surface bordered={false} padding="roomy" radius="cardLarge">
            <View style={[styles.timestampRow, { flexDirection: rowDirection }]}>
              <View style={styles.timestampColumn}>
                <AppText color="textMuted" style={styles.uppercase} variant="label">
                  {t('delivery.status.created')}
                </AppText>
                <AppText variant="bodyStrong">{state.data.createdAtLabel}</AppText>
              </View>
              {state.data.updatedAtLabel ? (
                <View style={styles.timestampColumn}>
                  <AppText color="textMuted" style={styles.uppercase} variant="label">
                    {t('delivery.status.updated')}
                  </AppText>
                  <AppText variant="bodyStrong">{state.data.updatedAtLabel}</AppText>
                </View>
              ) : null}
            </View>
          </Surface>

          {state.data.addressLabel ? (
            <Surface bordered={false} padding="roomy" radius="cardLarge">
              <View style={styles.addressCard}>
                <AppText color="textMuted" style={styles.uppercase} variant="label">
                  {t('delivery.status.address')}
                </AppText>
                <AppText variant="subheading">{state.data.addressLabel}</AppText>
              </View>
            </Surface>
          ) : null}
        </>
      ) : null}

      {canRetry && onRetry ? (
        <Button
          label={t('delivery.status.action.retry')}
          onPress={onRetry}
          variant="dark"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addressCard: {
    gap: spacing.xl,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing['4xl'],
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['4xl'],
    width: '100%',
  },
  statusCopy: {
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  timestampColumn: {
    flex: 1,
    gap: spacing.md,
    minWidth: 132,
  },
  timestampRow: {
    flexWrap: 'wrap',
    gap: spacing['4xl'],
  },
  uppercase: {
    textTransform: 'uppercase',
  },
});

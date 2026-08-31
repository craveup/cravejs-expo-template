import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, radii, spacing } from '@/theme';

import type { BagConfirmationState } from './bag-presentation.ts';
import { BagMerchantHeader } from './BagMerchantHeader.tsx';

export type BagConfirmationKind = 'clear' | 'remove';

export type BagConfirmationPresentationProps = Readonly<{
  kind: BagConfirmationKind;
  locale?: AppLocale;
  onDismiss: () => void;
  onSubmit?: () => void;
  state: BagConfirmationState;
}>;

export function BagConfirmationPresentation({
  kind,
  locale = 'en',
  onDismiss,
  onSubmit,
  state,
}: BagConfirmationPresentationProps) {
  const t = createTranslator(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const title =
    kind === 'clear' ? t('bag.clear.title') : t('bag.remove.title');
  const ready = state.status === 'ready';
  const primaryLabel =
    state.status === 'ready' && state.actionStatus === 'retryable_error'
      ? t('action.retry')
      : kind === 'clear'
        ? t('bag.action.clearConfirm')
        : t('bag.action.remove');
  const secondaryLabel =
    kind === 'clear' ? t('bag.action.keepBag') : t('bag.action.keepItem');

  return (
    <Screen
      accessibilityLabel={title}
      background="contentCanvas"
      contentContainerStyle={[
        styles.screenContent,
        {
          direction: getLocaleDirection(locale),
          maxWidth: layout.contentMaxWidth,
          paddingHorizontal: layout.horizontalPadding,
        },
      ]}
      padded={false}
      scrollable
    >
      {ready ? (
        <View style={styles.readyContent}>
          <BagMerchantHeader
            fulfillmentLabel={state.fulfillmentLabel}
            locale={locale}
            locationLabel={state.locationLabel}
            merchantLogoUrl={state.merchantLogoUrl}
            merchantName={state.merchantName}
          />
          <View style={styles.copy}>
            <AppText accessibilityRole="header" align="center" variant="heading">
              {title}
            </AppText>
            {kind === 'clear' ? (
              <AppText align="center" color="textMuted">
                {t(
                  state.totalQuantity === 1
                    ? 'bag.clear.body.one'
                    : 'bag.clear.body.other',
                  { count: state.totalQuantity },
                )}
              </AppText>
            ) : null}
          </View>

          <Surface style={styles.summary}>
            {state.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                {item.imageUrl ? (
                  <Image
                    accessibilityLabel=""
                    contentFit="cover"
                    source={item.imageUrl}
                    style={styles.itemImage}
                  />
                ) : null}
                <View style={styles.itemCopy}>
                  <AppText numberOfLines={2} variant="bodyStrong">
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
          </Surface>

          {state.actionStatus === 'retryable_error' ? (
            <AppText
              accessibilityLiveRegion="polite"
              align="center"
              color="danger"
              variant="caption"
            >
              {t('bag.error')}
            </AppText>
          ) : state.actionStatus === 'terminal_error' ? (
            <AppText
              accessibilityLiveRegion="polite"
              align="center"
              color="danger"
              variant="caption"
            >
              {t('bag.unavailable')}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            <Button
              disabled={state.actionStatus === 'terminal_error' || !onSubmit}
              label={primaryLabel}
              loading={state.actionStatus === 'pending'}
              onPress={onSubmit}
              style={styles.action}
              variant="danger"
            />
            <Button
              disabled={state.actionStatus === 'pending'}
              label={secondaryLabel}
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
          <AppText color="textMuted">
            {state.status === 'loading' ? t('bag.loading') : t('bag.unavailable')}
          </AppText>
          <Button
            label={secondaryLabel}
            onPress={onDismiss}
            variant="secondary"
          />
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
    marginTop: spacing['7xl'] * 2,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  itemImage: {
    backgroundColor: colors.imageSurface,
    borderRadius: radii.sm,
    height: 52,
    width: 46,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
  },
  readyContent: {
    alignItems: 'center',
    gap: spacing['5xl'],
    width: '100%',
  },
  screenContent: {
    alignSelf: 'center',
    flexGrow: 1,
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['7xl'],
    width: '100%',
  },
  stateCard: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
  summary: {
    gap: spacing['3xl'],
    width: '100%',
  },
});

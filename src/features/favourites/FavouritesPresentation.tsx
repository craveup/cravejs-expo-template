import {
  ActivityIndicator,
  Image,
  Pressable,
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
import { colors, fontFamilies, sizes, spacing } from '@/theme';

import type {
  FavouritePresentationRow,
  FavouritesPresentationState,
} from './favourites-presentation.ts';

export type FavouritesPresentationProps = Readonly<{
  actionState?: FavouriteAddActionState;
  locale?: AppLocale;
  merchantHeaderState: MerchantLocationHeaderState;
  onAdd?: (productId: string) => void;
  onOpenAccount?: () => void;
  onRetry?: () => void;
  orderingAvailable?: boolean;
  state: FavouritesPresentationState;
}>;

export type FavouriteAddActionState = Readonly<{
  productId: string;
  status:
    | 'added'
    | 'pending'
    | 'refresh_required'
    | 'retryable'
    | 'unavailable';
}>;

function FavouriteCard({
  actionState,
  locale,
  onAdd,
  row,
}: Readonly<{
  actionState?: FavouriteAddActionState;
  locale: AppLocale;
  onAdd?: (productId: string) => void;
  row: FavouritePresentationRow;
}>) {
  const t = createTranslator(locale);
  const isReady = row.kind === 'ready';
  const name = row.name ?? t('favourites.itemUnavailable');
  const detail =
    row.kind === 'repair_required'
      ? t('favourites.repairRequired')
      : row.kind === 'missing_product'
        ? t('favourites.missingProduct')
        : row.selectionLabel;
  const rowDirection = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';
  const isCurrentAction = actionState?.productId === row.id;
  const actionPending = actionState?.status === 'pending';
  const actionCompleted = isCurrentAction && actionState.status === 'added';
  const actionLabel =
    isCurrentAction && actionState.status === 'pending'
      ? t('favourites.action.adding')
      : actionCompleted
        ? t('favourites.action.added')
        : isCurrentAction &&
            (actionState.status === 'retryable' ||
              actionState.status === 'refresh_required' ||
              actionState.status === 'unavailable')
          ? t('favourites.action.tryAgain')
          : t('favourites.action.add');
  const actionDisabled = actionPending || actionCompleted;

  return (
    <Surface
      bordered={false}
      padding="compact"
      radius="action"
      style={[styles.card, { flexDirection: rowDirection }]}
    >
      <View style={styles.thumbnail}>
        {row.imageUri ? (
          <Image
            accessible={false}
            resizeMode="cover"
            source={{ uri: row.imageUri }}
            style={styles.thumbnailImage}
          />
        ) : null}
      </View>
      <View style={styles.cardCopy}>
        <AppText numberOfLines={2} style={styles.productName} variant="bodyStrong">
          {name}
        </AppText>
        {detail ? (
          <AppText color="textMuted" style={styles.configuration} variant="micro">
            {detail}
          </AppText>
        ) : null}
        {row.priceLabel ? (
          <AppText style={styles.price} variant="bodyMedium">
            {row.priceLabel}
          </AppText>
        ) : null}
      </View>
      {isReady && onAdd ? (
        <Pressable
          accessibilityLabel={t('favourites.action.addAccessibility', { name })}
          accessibilityRole="button"
          accessibilityState={{
            busy: isCurrentAction && actionPending,
            disabled: actionDisabled,
          }}
          disabled={actionDisabled}
          onPress={() => onAdd(row.id)}
          style={({ pressed }) => [
            styles.actionTarget,
            actionDisabled && styles.actionDisabled,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.actionVisual}>
            <AppText style={styles.actionLabel}>{actionLabel}</AppText>
          </View>
        </Pressable>
      ) : null}
    </Surface>
  );
}

export function FavouritesPresentation({
  actionState,
  locale = 'en',
  merchantHeaderState,
  onAdd,
  onOpenAccount,
  onRetry,
  orderingAvailable = true,
  state,
}: FavouritesPresentationProps) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const stateMessage =
    state.status === 'loading'
      ? t('favourites.loading')
      : state.status === 'error'
        ? t('favourites.error')
        : state.status === 'offline'
          ? t('favourites.offline')
        : state.status === 'unavailable'
          ? t('favourites.unavailable')
          : undefined;
  const actionMessage =
    actionState?.status === 'added'
      ? t('favourites.action.addedMessage')
      : actionState?.status === 'refresh_required'
        ? t('favourites.action.refreshRequired')
        : actionState?.status === 'retryable' ||
            actionState?.status === 'unavailable'
          ? t('favourites.action.failed')
          : undefined;

  return (
    <Screen
      accessibilityLabel={t('favourites.title')}
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
      style={[styles.root, { direction }]}
    >
        <MerchantLocationHeader
          locale={locale}
          onOpenAccount={onOpenAccount}
          state={merchantHeaderState}
        />
        <AppText accessibilityRole="header" variant="heading">
          {t('favourites.title')}
        </AppText>
        <AppText color="textMuted" style={styles.subtitle} variant="caption">
          {t('favourites.subtitle')}
        </AppText>

        {state.status === 'ready' ? (
          state.data.length > 0 ? (
            <View accessibilityRole="list" style={styles.list}>
              {state.data.map((row) => (
                <FavouriteCard
                  actionState={actionState}
                  key={row.id}
                  locale={locale}
                  onAdd={orderingAvailable ? onAdd : undefined}
                  row={row}
                />
              ))}
            </View>
          ) : (
            <AppText color="textMuted" variant="body">
              {t('favourites.empty')}
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
            {(state.status === 'error' ||
              state.status === 'offline' ||
              state.status === 'unavailable') &&
            onRetry ? (
              <Button label={t('action.retry')} onPress={onRetry} />
            ) : null}
          </View>
        )}

        {actionMessage ? (
          <AppText
            accessibilityLiveRegion="polite"
            color={actionState?.status === 'added' ? 'ink' : 'danger'}
            style={styles.actionMessage}
            variant="caption"
          >
            {actionMessage}
          </AppText>
        ) : null}

        {state.status === 'ready' &&
        state.data.length > 0 &&
        !orderingAvailable ? (
          <AppText
            accessibilityLiveRegion="polite"
            color="danger"
            style={styles.actionMessage}
            variant="caption"
          >
            {t('favourites.orderingUnavailable')}
          </AppText>
        ) : null}

        {state.status === 'ready' ? (
          <AppText color="textSubtle" style={styles.helper} variant="caption">
            {t('favourites.helper')}
          </AppText>
        ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionDisabled: {
    opacity: 0.62,
  },
  actionLabel: {
    color: colors.surface,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
  },
  actionMessage: {
    fontFamily: fontFamilies.bodyRegular,
  },
  actionTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    minWidth: sizes.minimumTouchTarget,
  },
  actionVisual: {
    backgroundColor: colors.accent,
    borderRadius: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  card: {
    alignItems: 'center',
    gap: spacing.xl,
    minHeight: 78,
  },
  cardCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  configuration: {
    fontFamily: fontFamilies.bodyRegular,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['4xl'],
    width: '100%',
  },
  helper: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 11,
    lineHeight: 14,
  },
  list: {
    gap: spacing.xl,
  },
  pressed: {
    opacity: 0.78,
  },
  price: {
    fontSize: 11,
    lineHeight: 14,
  },
  productName: {
    fontSize: 13,
    lineHeight: 16,
  },
  root: {
    backgroundColor: colors.contentCanvas,
    flex: 1,
  },
  state: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
  },
  thumbnail: {
    backgroundColor: colors.imageSurface,
    borderRadius: spacing.xl,
    height: 54,
    overflow: 'hidden',
    width: 54,
  },
  thumbnailImage: {
    height: '100%',
    width: '100%',
  },
});

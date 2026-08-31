import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { brandAssets } from '@/config/brand-assets';
import { AppText, Button, IconButton, Surface } from '@/components/ui';
import { PresentationIcon, PresentationLayout } from '@/features/_shared';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import type {
  BagItemPresentation,
  BagPresentationState,
  BagReadyPresentation,
} from './bag-presentation.ts';
import { BagMerchantHeader } from './BagMerchantHeader.tsx';

export type BagPresentationProps = Readonly<{
  checkoutEnabled?: boolean;
  checkoutLocked?: boolean;
  locale?: AppLocale;
  onBrowseMenu: () => void;
  onCheckout?: () => void;
  onChangeFulfillment?: () => void;
  onClear?: () => void;
  onRemoveItem?: (itemId: string) => void;
  onRetry?: () => void;
  onUpdateQuantity?: (itemId: string, quantity: number) => void;
  state: BagPresentationState;
}>;

function visibleBag(state: BagPresentationState): BagReadyPresentation | undefined {
  if (state.status === 'ready') return state;
  if (state.status === 'updating' || state.status === 'error') return state.previous;
  return undefined;
}

type QuantityControlProps = Readonly<{
  disabled: boolean;
  item: BagItemPresentation;
  locale: AppLocale;
  onChange?: (quantity: number) => void;
}>;

function QuantityControl({
  disabled,
  item,
  locale,
  onChange,
}: QuantityControlProps) {
  const t = createTranslator(locale);
  return (
    <View style={styles.quantityControl}>
      <IconButton
        accessibilityLabel={t('bag.quantity.decrease', { name: item.name })}
        compact
        disabled={disabled || item.quantity <= 1}
        onPress={() => onChange?.(item.quantity - 1)}
        variant="ghost"
      >
        <AppText align="center" variant="bodyStrong">
          {'\u2212'}
        </AppText>
      </IconButton>
      <AppText
        accessibilityLabel={String(item.quantity)}
        align="center"
        style={styles.quantityValue}
        variant="bodyStrong"
      >
        {item.quantity}
      </AppText>
      <IconButton
        accessibilityLabel={t('bag.quantity.increase', { name: item.name })}
        compact
        disabled={disabled || item.quantity === Number.MAX_SAFE_INTEGER}
        onPress={() => onChange?.(item.quantity + 1)}
        variant="ghost"
      >
        <AppText align="center" variant="bodyStrong">
          +
        </AppText>
      </IconButton>
    </View>
  );
}

type BagItemCardProps = Readonly<{
  disabled: boolean;
  item: BagItemPresentation;
  locale: AppLocale;
  onRemove?: () => void;
  onUpdateQuantity?: (quantity: number) => void;
}>;

function BagItemCard({
  disabled,
  item,
  locale,
  onRemove,
  onUpdateQuantity,
}: BagItemCardProps) {
  const t = createTranslator(locale);
  const rowDirection =
    getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

  return (
    <Surface
      accessibilityLabel={`${item.name}, ${item.priceLabel}`}
      padding="compact"
      style={[styles.itemCard, { flexDirection: rowDirection }]}
    >
      <View style={styles.itemImage}>
        {item.imageUrl ? (
          <Image
            accessibilityLabel=""
            contentFit="cover"
            source={item.imageUrl}
            style={styles.fill}
          />
        ) : (
          <PresentationIcon color={colors.textSubtle} name="store" size={25} />
        )}
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeading}>
          <View style={styles.itemCopy}>
            <AppText numberOfLines={2} variant="bodyStrong">
              {item.name}
            </AppText>
            {item.description ? (
              <AppText color="textMuted" numberOfLines={3} variant="caption">
                {item.description}
              </AppText>
            ) : null}
          </View>
          <AppText variant="bodyStrong">{item.priceLabel}</AppText>
        </View>
        <View style={styles.itemActions}>
          <QuantityControl
            disabled={disabled}
            item={item}
            locale={locale}
            onChange={onUpdateQuantity}
          />
          <Pressable
            accessibilityRole="button"
            disabled={disabled || !onRemove}
            onPress={onRemove}
            style={({ pressed }) => [
              styles.removeAction,
              pressed && styles.pressed,
              (disabled || !onRemove) && styles.disabled,
            ]}
          >
            <AppText color="danger" variant="caption">
              {t('bag.action.removeShort')}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}

type ReadyBagProps = Readonly<{
  bag: BagReadyPresentation;
  checkoutEnabled: boolean;
  disabled: boolean;
  locale: AppLocale;
  onCheckout?: () => void;
  onChangeFulfillment?: () => void;
  onClear?: () => void;
  onRemoveItem?: (itemId: string) => void;
  onUpdateQuantity?: (itemId: string, quantity: number) => void;
}>;

function ReadyBag({
  bag,
  checkoutEnabled,
  disabled,
  locale,
  onCheckout,
  onChangeFulfillment,
  onClear,
  onRemoveItem,
  onUpdateQuantity,
}: ReadyBagProps) {
  const t = createTranslator(locale);

  return (
    <>
      <BagMerchantHeader
        fulfillmentLabel={bag.fulfillmentLabel}
        locale={locale}
        locationLabel={bag.locationLabel}
        merchantLogoUrl={bag.merchantLogoUrl}
        merchantName={bag.merchantName}
        onChangeFulfillment={onChangeFulfillment}
      />
      <View style={styles.titleRow}>
        <AppText accessibilityRole="header" variant="title">
          {t('bag.title')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          disabled={disabled || !onClear}
          onPress={onClear}
          style={({ pressed }) => [
            styles.clearAction,
            pressed && styles.pressed,
            (disabled || !onClear) && styles.disabled,
          ]}
        >
          <AppText color="danger" variant="caption">
            {t('bag.action.clear')}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.itemList}>
        {bag.items.map((item) => (
          <BagItemCard
            disabled={disabled}
            item={item}
            key={item.id}
            locale={locale}
            onRemove={
              onRemoveItem ? () => onRemoveItem(item.id) : undefined
            }
            onUpdateQuantity={
              onUpdateQuantity
                ? (quantity) => onUpdateQuantity(item.id, quantity)
                : undefined
            }
          />
        ))}
      </View>

      {bag.pointsToEarn !== undefined ? (
        <Surface background="surfaceDark" bordered={false} style={styles.pointsCard}>
          <View style={styles.pointsCopy}>
            <AppText color="surface" variant="label">
              {t('bag.pointsClub')}
            </AppText>
            <AppText color="textOnDarkMuted" variant="caption">
              {t('bag.pointsToEarn', { points: bag.pointsToEarn })}
            </AppText>
          </View>
          <PresentationIcon color={colors.accentSoft} name="starFilled" size={25} />
        </Surface>
      ) : null}

      <Surface bordered={false} style={styles.totalsCard}>
        <View style={styles.totalRow}>
          <AppText color="textMuted">{t('bag.subtotal')}</AppText>
          <AppText>{bag.totals.subtotalLabel}</AppText>
        </View>
        {bag.totals.adjustments.map((adjustment) => (
          <View key={adjustment.label} style={styles.totalRow}>
            <AppText color="textMuted">{adjustment.label}</AppText>
            <AppText>{adjustment.value}</AppText>
          </View>
        ))}
        <View style={styles.totalRow}>
          <AppText color="textMuted">{t('bag.tax')}</AppText>
          <AppText>{bag.totals.taxLabel}</AppText>
        </View>
        <View style={[styles.totalRow, styles.grandTotalRow]}>
          <AppText variant="subheading">{t('bag.total')}</AppText>
          <AppText variant="subheading">{bag.totals.totalLabel}</AppText>
        </View>
      </Surface>

      <Button
        disabled={disabled || !checkoutEnabled || !onCheckout}
        label={t('bag.action.checkout', { total: bag.totals.totalLabel })}
        onPress={onCheckout}
        radius="pill"
        style={styles.checkoutAction}
      />
    </>
  );
}

export function BagPresentation({
  checkoutEnabled = false,
  checkoutLocked = false,
  locale = 'en',
  onBrowseMenu,
  onCheckout,
  onChangeFulfillment,
  onClear,
  onRemoveItem,
  onRetry,
  onUpdateQuantity,
  state,
}: BagPresentationProps) {
  const t = createTranslator(locale);
  const bag = visibleBag(state);
  const busy = state.status === 'updating';

  return (
    <PresentationLayout accessibilityLabel={t('bag.title')} locale={locale}>
      {state.status === 'error' && bag ? (
        <Surface
          accessibilityLiveRegion="polite"
          background="surfaceMuted"
          style={styles.errorBanner}
        >
          <AppText color="danger" variant="caption">
            {t('bag.error')}
          </AppText>
          {onRetry ? (
            <Button label={t('action.retry')} onPress={onRetry} variant="ghost" />
          ) : null}
        </Surface>
      ) : null}

      {checkoutLocked && bag ? (
        <Surface accessibilityLiveRegion="polite" background="surfaceMuted">
          <AppText>{t('bag.checkoutLocked')}</AppText>
        </Surface>
      ) : null}

      {bag ? (
        <ReadyBag
          bag={bag}
          checkoutEnabled={checkoutEnabled}
          disabled={busy || checkoutLocked}
          locale={locale}
          onCheckout={onCheckout}
          onChangeFulfillment={onChangeFulfillment}
          onClear={onClear}
          onRemoveItem={onRemoveItem}
          onUpdateQuantity={onUpdateQuantity}
        />
      ) : state.status === 'empty' ? (
        <>
          <BagMerchantHeader
            fulfillmentLabel={state.fulfillmentLabel}
            locale={locale}
            locationLabel={state.locationLabel}
            merchantLogoUrl={state.merchantLogoUrl}
            merchantName={state.merchantName}
          />
          <View style={styles.emptyContent}>
            <Image
              accessibilityLabel=""
              contentFit="contain"
              source={brandAssets.brandMark}
              style={styles.emptyMark}
            />
            <View style={styles.emptyCopy}>
              <AppText accessibilityRole="header" align="center" variant="heading">
                {t('bag.empty.title')}
              </AppText>
              <AppText align="center" color="textMuted">
                {t('bag.empty.body')}
              </AppText>
            </View>
            <Button
              label={t('bag.action.browse')}
              onPress={onBrowseMenu}
              radius="pill"
              style={styles.browseAction}
            />
          </View>
        </>
      ) : (
        <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
          {state.status === 'loading' || state.status === 'updating' ? (
            <ActivityIndicator color={colors.accent} />
          ) : null}
          <AppText color="textMuted">
            {state.status === 'loading' || state.status === 'updating'
              ? t('bag.loading')
              : t('bag.unavailable')}
          </AppText>
          {state.status === 'error' && onRetry ? (
            <Button label={t('action.retry')} onPress={onRetry} />
          ) : null}
          {state.status === 'unavailable' ? (
            <Button
              label={t('bag.action.browse')}
              onPress={onBrowseMenu}
              variant="secondary"
            />
          ) : null}
        </Surface>
      )}
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  browseAction: {
    minWidth: 220,
  },
  checkoutAction: {
    width: '100%',
  },
  clearAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    minWidth: sizes.minimumTouchTarget,
  },
  disabled: {
    opacity: 0.45,
  },
  emptyContent: {
    alignItems: 'center',
    flexGrow: 1,
    gap: spacing['6xl'],
    justifyContent: 'center',
    paddingVertical: spacing['7xl'],
  },
  emptyCopy: {
    alignItems: 'center',
    gap: spacing.xl,
    maxWidth: 300,
  },
  emptyMark: {
    height: 88,
    width: 88,
  },
  errorBanner: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  fill: {
    height: '100%',
    width: '100%',
  },
  grandTotalRow: {
    borderTopColor: colors.divider,
    borderTopWidth: sizes.hairline,
    marginTop: spacing.sm,
    paddingTop: spacing['3xl'],
  },
  itemActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemCard: {
    gap: spacing.xl,
  },
  itemContent: {
    flex: 1,
    gap: spacing.xl,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  itemHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  itemImage: {
    alignItems: 'center',
    backgroundColor: colors.imageSurface,
    borderRadius: radii.md,
    height: 92,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 82,
  },
  itemList: {
    gap: spacing.xl,
  },
  pointsCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pointsCopy: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  quantityControl: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    flexDirection: 'row',
  },
  quantityValue: {
    minWidth: 24,
  },
  removeAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing.md,
  },
  stateCard: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsCard: {
    gap: spacing.xl,
  },
});

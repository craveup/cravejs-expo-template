import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppText, Badge, Button, IconButton, Screen, Surface } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, radii, sizes, spacing } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon.tsx';
import {
  getItemOptionPressQuantity,
  type ItemDetailPresentationModel,
  type ItemModifierGroupPresentation,
  type ItemModifierPathEntry,
} from './item-detail.ts';

export type ItemAddActionStatus =
  | 'added'
  | 'pending'
  | 'refresh_required'
  | 'retryable'
  | 'selection_invalid'
  | 'unavailable';

export type ItemDetailPresentationState =
  | Readonly<{
      status: 'error' | 'loading' | 'not-found' | 'offline' | 'unavailable';
    }>
  | Readonly<{ data: ItemDetailPresentationModel; status: 'ready' }>;

export type ItemDetailPresentationProps = Readonly<{
  actionStatus?: ItemAddActionStatus;
  favourite?: boolean;
  favouritePending?: boolean;
  locale?: AppLocale;
  onAdd?: () => void;
  onBack: () => void;
  onChangeQuantity: (quantity: number) => void;
  onRetry?: () => void;
  onSelectAlternative: (productId: string) => void;
  onSetOptionQuantity: (
    path: readonly ItemModifierPathEntry[],
    optionId: string,
    quantity: number,
  ) => void;
  onToggleFavourite?: () => void;
  onViewNutrition?: () => void;
  orderingAvailable?: boolean;
  state: ItemDetailPresentationState;
}>;

export function ItemModifierGroup({
  group,
  interactionDisabled,
  locale,
  onSetOptionQuantity,
}: Readonly<{
  group: ItemModifierGroupPresentation;
  interactionDisabled: boolean;
  locale: AppLocale;
  onSetOptionQuantity: ItemDetailPresentationProps['onSetOptionQuantity'];
}>) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';
  const selectedCount = group.options.reduce(
    (sum, option) => sum + option.selectedQuantity,
    0,
  );

  return (
    <View
      accessibilityRole={group.maximum === 1 ? 'radiogroup' : undefined}
      style={styles.modifierGroup}
    >
      <View style={[styles.groupHeading, { flexDirection: direction }]}>
        <View style={styles.groupCopy}>
          <AppText accessibilityRole="header" variant="bodyStrong">
            {group.name.toUpperCase()}
          </AppText>
          {group.description ? (
            <AppText color="textSubtle" variant="caption">
              {group.description}
            </AppText>
          ) : group.maximum > 1 ? (
            <AppText color="textSubtle" variant="caption">
              {t('item.chooseUpTo', { count: group.maximum })}
            </AppText>
          ) : null}
        </View>
        {group.required ? <Badge tone="accent">{t('item.required')}</Badge> : null}
      </View>

      <View style={styles.options}>
        {group.options.map((option) => {
          const selected = option.selectedQuantity > 0;
          const canIncrease =
            option.selectedQuantity < option.maxQuantity &&
            selectedCount < group.maximum;
          const singleChoice = group.maximum === 1;
          const optionDisabled =
            interactionDisabled || (!selected && !singleChoice && !canIncrease);

          return (
            <View key={option.id} style={styles.optionBlock}>
              <Pressable
                accessibilityLabel={[
                  option.name,
                  option.priceLabel ?? t('item.included'),
                ].join(', ')}
                accessibilityRole={singleChoice ? 'radio' : 'checkbox'}
                accessibilityState={{ checked: selected, disabled: optionDisabled }}
                aria-checked={selected}
                aria-disabled={optionDisabled}
                disabled={optionDisabled}
                onPress={() =>
                  onSetOptionQuantity(
                    option.path,
                    option.id,
                    getItemOptionPressQuantity(group, option),
                  )
                }
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  { flexDirection: direction },
                  optionDisabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.optionLeading, { flexDirection: direction }]}>
                  <View style={[styles.selectionMark, selected && styles.selectionMarkSelected]}>
                    {selected ? <View style={styles.selectionDot} /> : null}
                  </View>
                  <AppText style={styles.optionName} variant="bodyStrong">
                    {option.name}
                  </AppText>
                </View>
                <AppText color="textMuted" variant="caption">
                  {option.priceLabel ?? t('item.included')}
                </AppText>
              </Pressable>

              {!singleChoice && option.maxQuantity > 1 && selected ? (
                <View
                  accessibilityLabel={t('item.optionQuantity', {
                    name: option.name,
                    quantity: option.selectedQuantity,
                  })}
                  style={[styles.optionStepper, { flexDirection: direction }]}
                >
                  <IconButton
                    accessibilityLabel={t('item.decreaseOption', { name: option.name })}
                    compact
                    disabled={interactionDisabled}
                    onPress={() =>
                      onSetOptionQuantity(
                        option.path,
                        option.id,
                        Math.max(0, option.selectedQuantity - 1),
                      )
                    }
                    variant="ghost"
                  >
                    <AppText variant="bodyStrong">−</AppText>
                  </IconButton>
                  <AppText variant="bodyStrong">{option.selectedQuantity}</AppText>
                  <IconButton
                    accessibilityLabel={t('item.increaseOption', { name: option.name })}
                    compact
                    disabled={interactionDisabled || !canIncrease}
                    onPress={() =>
                      onSetOptionQuantity(
                        option.path,
                        option.id,
                        option.selectedQuantity + 1,
                      )
                    }
                    variant="ghost"
                  >
                    <AppText variant="bodyStrong">+</AppText>
                  </IconButton>
                </View>
              ) : null}

              {option.childGroups.length > 0 ? (
                <View style={styles.childGroups}>
                  {option.childGroups.map((child) => (
                    <ItemModifierGroup
                      group={child}
                      interactionDisabled={interactionDisabled}
                      key={`${option.id}-${child.id}`}
                      locale={locale}
                      onSetOptionQuantity={onSetOptionQuantity}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FailureState({
  locale,
  onBack,
  onRetry,
  status,
}: Readonly<{
  locale: AppLocale;
  onBack: () => void;
  onRetry?: () => void;
  status: Exclude<ItemDetailPresentationState, { data: unknown }>['status'];
}>) {
  const t = createTranslator(locale);
  const message =
    status === 'loading'
      ? t('item.loading')
      : status === 'offline'
        ? t('item.offline')
        : status === 'not-found'
          ? t('item.notFound')
          : status === 'error'
            ? t('item.error')
            : t('item.unavailable');

  return (
    <Screen background="canvas" contentContainerStyle={styles.failureScreen}>
      <IconButton accessibilityLabel={t('item.back')} onPress={onBack}>
        <PresentationIcon color={colors.ink} name="arrowBack" size={18} />
      </IconButton>
      <View accessibilityLiveRegion="polite" style={styles.failureBody}>
        {status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        <AppText align="center" color="textMuted" variant="subheading">
          {message}
        </AppText>
        {status !== 'loading' && status !== 'not-found' && onRetry ? (
          <Button label={t('action.retry')} onPress={onRetry} variant="secondary" />
        ) : null}
      </View>
    </Screen>
  );
}

export function ItemDetailPresentation({
  actionStatus,
  favourite = false,
  favouritePending = false,
  locale = 'en',
  onAdd,
  onBack,
  onChangeQuantity,
  onRetry,
  onSelectAlternative,
  onSetOptionQuantity,
  onToggleFavourite,
  onViewNutrition,
  orderingAvailable = true,
  state,
}: ItemDetailPresentationProps) {
  const t = createTranslator(locale);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale, false);
  const direction = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

  if (state.status !== 'ready') {
    return (
      <FailureState locale={locale} onBack={onBack} onRetry={onRetry} status={state.status} />
    );
  }

  const model = state.data;
  const pending = actionStatus === 'pending';
  const modifierInteractionDisabled = pending || favouritePending;
  const actionMessage =
    actionStatus === 'added'
      ? t('item.added')
      : actionStatus === 'refresh_required'
        ? t('item.refreshRequired')
        : actionStatus === 'retryable'
          ? t('item.addFailed')
          : actionStatus === 'selection_invalid'
            ? t('item.selectionChanged')
            : actionStatus === 'unavailable'
              ? t('item.addUnavailable')
              : !orderingAvailable
                ? t('catalog.orderingUnavailable')
                : undefined;

  return (
    <Screen background="canvas" padded={false} scrollable={false}>
      <View style={[styles.page, { maxWidth: layout.contentMaxWidth }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            {model.imageUrl ? (
              <Image
                accessibilityLabel=""
                contentFit="cover"
                source={model.imageUrl}
                style={styles.heroImage}
                transition={160}
              />
            ) : (
              <PresentationIcon color={colors.textSubtle} name="store" size={42} />
            )}
            <View style={[styles.heroActions, { flexDirection: direction }]}>
              <IconButton accessibilityLabel={t('item.back')} onPress={onBack}>
                <PresentationIcon color={colors.ink} name="arrowBack" size={18} />
              </IconButton>
              {onToggleFavourite ? (
                <IconButton
                  accessibilityLabel={
                    favourite ? t('item.removeFavourite') : t('item.saveFavourite')
                  }
                  accessibilityState={{ selected: favourite }}
                  aria-pressed={favourite}
                  loading={favouritePending}
                  onPress={onToggleFavourite}
                >
                  <PresentationIcon
                    color={favourite ? colors.accent : colors.ink}
                    name={favourite ? 'heartFilled' : 'heart'}
                    size={18}
                  />
                </IconButton>
              ) : null}
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.titleBlock}>
              {model.availability === 'sold-out' ? (
                <View style={styles.badgeRow}>
                  <Badge tone="dark">{t('item.soldOutToday')}</Badge>
                </View>
              ) : null}
              <View style={[styles.titleRow, { flexDirection: direction }]}>
                <AppText accessibilityRole="header" style={styles.title} variant="heading">
                  {model.name}
                </AppText>
                <AppText variant="bodyStrong">{model.priceLabel}</AppText>
              </View>
              {model.description ? (
                <AppText color="textMuted" variant="caption">
                  {model.description}
                </AppText>
              ) : null}
            </View>

            {model.nutrition.calorieCount !== undefined ||
            (model.nutrition.dietaryPreferences?.length ?? 0) > 0 ? (
              <View accessibilityRole="list" style={styles.nutritionRow}>
                {model.nutrition.calorieCount !== undefined ? (
                  <Surface padding="compact" radius="sm" style={styles.nutritionChip}>
                    <AppText align="center" variant="bodyStrong">
                      {model.nutrition.calorieCount}
                    </AppText>
                    <AppText align="center" color="textSubtle" variant="micro">
                      {t('item.calories').toUpperCase()}
                    </AppText>
                  </Surface>
                ) : null}
                {model.nutrition.dietaryPreferences?.map((preference) => (
                  <Surface key={preference} padding="compact" radius="sm" style={styles.nutritionChip}>
                    <AppText align="center" variant="caption">
                      {preference}
                    </AppText>
                  </Surface>
                ))}
              </View>
            ) : null}

            {onViewNutrition ? (
              <Button
                label={t('nutrition.viewDetails')}
                onPress={onViewNutrition}
                variant="ghost"
              />
            ) : null}

            {model.availability === 'available' ? (
              <>
                {model.groups.map((group) => (
                  <ItemModifierGroup
                    group={group}
                    interactionDisabled={modifierInteractionDisabled}
                    key={group.id}
                    locale={locale}
                    onSetOptionQuantity={onSetOptionQuantity}
                  />
                ))}

                <View style={styles.quantitySection}>
                  <AppText accessibilityRole="header" variant="bodyStrong">
                    {t('item.howMany').toUpperCase()}
                  </AppText>
                  <Surface
                    accessibilityLabel={t('item.quantityValue', { quantity: model.quantity })}
                    padding="compact"
                    radius="md"
                    style={[styles.quantityRow, { flexDirection: direction }]}
                  >
                    <AppText variant="bodyStrong">{t('item.quantity')}</AppText>
                    <View style={[styles.quantityControls, { flexDirection: direction }]}>
                      <IconButton
                        accessibilityLabel={t('item.decreaseQuantity')}
                        compact
                        disabled={pending || model.quantity <= 1}
                        onPress={() => onChangeQuantity(model.quantity - 1)}
                        variant="ghost"
                      >
                        <AppText variant="bodyStrong">−</AppText>
                      </IconButton>
                      <AppText align="center" style={styles.quantityValue} variant="bodyStrong">
                        {model.quantity}
                      </AppText>
                      <IconButton
                        accessibilityLabel={t('item.increaseQuantity')}
                        compact
                        disabled={pending || model.quantity >= 99}
                        onPress={() => onChangeQuantity(model.quantity + 1)}
                        variant="ghost"
                      >
                        <AppText variant="bodyStrong">+</AppText>
                      </IconButton>
                    </View>
                  </Surface>
                </View>
              </>
            ) : model.alternatives.length > 0 ? (
              <View style={styles.alternatives}>
                <AppText accessibilityRole="header" variant="bodyStrong">
                  {t('item.alternatives')}
                </AppText>
                {model.alternatives.map((alternative) => (
                  <Pressable
                    accessibilityLabel={`${alternative.name}, ${alternative.priceLabel}`}
                    accessibilityRole="button"
                    key={alternative.id}
                    onPress={() => onSelectAlternative(alternative.id)}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Surface padding="compact" radius="md" style={[styles.alternativeRow, { flexDirection: direction }]}>
                      <AppText style={styles.alternativeName} variant="caption">
                        {alternative.name}
                      </AppText>
                      <AppText variant="caption">{alternative.priceLabel}</AppText>
                    </Surface>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {model.nutrition.ingredients?.length ? (
              <View style={styles.ingredients}>
                <AppText accessibilityRole="header" variant="bodyStrong">
                  {t('item.ingredients').toUpperCase()}
                </AppText>
                <AppText color="textMuted" variant="caption">
                  {model.nutrition.ingredients.join(' · ')}
                </AppText>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {actionMessage ? (
            <AppText
              accessibilityLiveRegion="polite"
              align="center"
              color={actionStatus === 'added' ? 'accent' : 'textMuted'}
              variant="caption"
            >
              {actionMessage}
            </AppText>
          ) : null}
          <Button
            disabled={
              model.availability !== 'available' ||
              !model.canAdd ||
              !orderingAvailable ||
              !onAdd
            }
            label={
              actionStatus === 'retryable'
                  ? t('action.retry')
                  : t('item.addCountFrom', {
                      price: model.priceLabel,
                      quantity: model.quantity,
                    })
            }
            loading={pending}
            onPress={onAdd}
            radius="action"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alternativeName: { flex: 1 },
  alternativeRow: {
    alignItems: 'center',
    gap: spacing['3xl'],
    justifyContent: 'space-between',
  },
  alternatives: { gap: spacing.lg },
  badgeRow: { alignItems: 'flex-start' },
  body: {
    backgroundColor: colors.canvas,
    gap: spacing['5xl'],
    marginTop: -spacing['3xl'],
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['5xl'],
  },
  childGroups: {
    borderStartColor: colors.border,
    borderStartWidth: sizes.hairline,
    gap: spacing['4xl'],
    marginStart: spacing['4xl'],
    paddingStart: spacing['4xl'],
    paddingTop: spacing.md,
  },
  disabled: { opacity: 0.5 },
  failureBody: {
    alignItems: 'center',
    flex: 1,
    gap: spacing['4xl'],
    justifyContent: 'center',
  },
  failureScreen: { gap: spacing['4xl'], padding: spacing['5xl'] },
  footer: {
    backgroundColor: colors.surface,
    borderTopColor: colors.divider,
    borderTopWidth: sizes.hairline,
    gap: spacing.md,
    paddingHorizontal: spacing['5xl'],
    paddingVertical: spacing['3xl'],
  },
  groupCopy: { flex: 1, gap: spacing.xs },
  groupHeading: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.imageSurface,
    height: 258,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroActions: {
    justifyContent: 'space-between',
    left: spacing['5xl'],
    position: 'absolute',
    right: spacing['5xl'],
    top: spacing.md,
  },
  heroImage: { height: '100%', width: '100%' },
  ingredients: { gap: spacing.md },
  modifierGroup: { gap: spacing['3xl'] },
  nutritionChip: { minWidth: 72 },
  nutritionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: sizes.hairline,
    gap: spacing['3xl'],
    justifyContent: 'space-between',
    minHeight: sizes.standardControl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  optionBlock: { gap: spacing.md },
  optionLeading: { alignItems: 'center', flex: 1, gap: spacing.xl },
  optionName: { flex: 1 },
  optionSelected: { borderColor: colors.accent },
  optionStepper: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing.sm,
  },
  options: { gap: spacing.md },
  page: { alignSelf: 'center', flex: 1, width: '100%' },
  pressed: { opacity: 0.72 },
  quantityControls: { alignItems: 'center', gap: spacing.sm },
  quantityRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantitySection: { gap: spacing['3xl'] },
  quantityValue: { minWidth: 24 },
  scrollContent: { backgroundColor: colors.canvas },
  selectionDot: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  selectionMark: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  selectionMarkSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  title: { flex: 1 },
  titleBlock: { gap: spacing.md },
  titleRow: { alignItems: 'flex-start', gap: spacing.xl, justifyContent: 'space-between' },
});

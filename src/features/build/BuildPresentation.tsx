import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, IconButton, Screen, Surface } from '@/components/ui';
import { createTranslator, type AppLocale } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon.tsx';
import {
  ItemModifierGroup,
  type ItemAddActionStatus,
} from '../item/ItemDetailPresentation.tsx';
import type { ItemModifierPathEntry } from '../item/item-detail.ts';
import type { BuildYourOrderPresentationModel } from './build-your-order.ts';

export type BuildPresentationState =
  | Readonly<{
      status: 'error' | 'loading' | 'not-found' | 'offline' | 'unavailable';
    }>
  | Readonly<{ data: BuildYourOrderPresentationModel; status: 'ready' }>;

export type BuildPresentationProps = Readonly<{
  actionStatus?: ItemAddActionStatus;
  locale?: AppLocale;
  onAdd?: () => void;
  onBack: () => void;
  onRetry?: () => void;
  onSetOptionQuantity: (
    path: readonly ItemModifierPathEntry[],
    optionId: string,
    quantity: number,
  ) => void;
  orderingAvailable?: boolean;
  state: BuildPresentationState;
}>;

function FailureState({
  locale,
  onBack,
  onRetry,
  status,
}: Readonly<{
  locale: AppLocale;
  onBack: () => void;
  onRetry?: () => void;
  status: Exclude<BuildPresentationState, { data: unknown }>['status'];
}>) {
  const t = createTranslator(locale);
  const message =
    status === 'loading'
      ? t('build.loading')
      : status === 'offline'
        ? t('build.offline')
        : status === 'not-found'
          ? t('build.notFound')
          : status === 'error'
            ? t('build.error')
            : t('build.unavailable');

  return (
    <Screen background="canvas" contentContainerStyle={styles.failureScreen}>
      <IconButton accessibilityLabel={t('build.back')} onPress={onBack}>
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

export function BuildPresentation({
  actionStatus,
  locale = 'en',
  onAdd,
  onBack,
  onRetry,
  onSetOptionQuantity,
  orderingAvailable = true,
  state,
}: BuildPresentationProps) {
  const t = createTranslator(locale);

  if (state.status !== 'ready') {
    return (
      <FailureState
        locale={locale}
        onBack={onBack}
        onRetry={onRetry}
        status={state.status}
      />
    );
  }

  const model = state.data;
  const pending = actionStatus === 'pending';
  const actionMessage =
    actionStatus === 'added'
      ? t('build.added')
      : actionStatus === 'refresh_required'
        ? t('build.refreshRequired')
        : actionStatus === 'retryable'
          ? t('build.addFailed')
          : actionStatus === 'selection_invalid'
            ? t('build.selectionChanged')
            : actionStatus === 'unavailable'
              ? t('build.unavailable')
              : !orderingAvailable
                ? t('catalog.orderingUnavailable')
                : undefined;

  return (
    <Screen background="canvas" padded={false} scrollable={false}>
      <View style={styles.page}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <AppText color="accent" variant="micro">
                {t('build.title').toUpperCase()}
              </AppText>
              {model.description ? (
                <AppText color="accentSoft" variant="editorial">
                  {model.description}
                </AppText>
              ) : null}
            </View>
            <View style={styles.backAction}>
              <IconButton accessibilityLabel={t('build.back')} onPress={onBack}>
                <PresentationIcon color={colors.ink} name="close" size={18} />
              </IconButton>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.titleBlock}>
              <AppText accessibilityRole="header" variant="display">
                {model.name}
              </AppText>
              <AppText color="textMuted" variant="bodyStrong">
                {t('build.basePrice', { price: model.basePriceLabel })}
              </AppText>
            </View>

            {model.showRequiredOptionError && model.missingRequiredGroupName ? (
              <Surface
                accessibilityLiveRegion="polite"
                padding="compact"
                radius="md"
                style={styles.validationBanner}
              >
                <AppText color="danger" variant="caption">
                  {t('build.requiredOption', {
                    group: model.missingRequiredGroupName,
                  })}
                </AppText>
              </Surface>
            ) : null}

            <View style={styles.steps}>
              {model.groups.map((group, index) => (
                <View key={group.id} style={styles.step}>
                  <AppText color="accent" variant="micro">
                    {t('build.step', { number: index + 1 }).toUpperCase()}
                  </AppText>
                  <ItemModifierGroup
                    group={group}
                    interactionDisabled={pending}
                    locale={locale}
                    onSetOptionQuantity={onSetOptionQuantity}
                  />
                </View>
              ))}
            </View>

            <Surface padding="roomy" radius="card" style={styles.summary}>
              <AppText variant="bodyStrong">{t('build.selectionSummary')}</AppText>
              <AppText color="textMuted" variant="caption">
                {model.selectionSummary.length > 0
                  ? model.selectionSummary.join(' · ')
                  : t('build.selectionEmpty')}
              </AppText>
            </Surface>
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
              !orderingAvailable || !onAdd || model.showRequiredOptionError
            }
            label={
              actionStatus === 'retryable'
                ? t('action.retry')
                : t('build.addToBagFrom', { price: model.basePriceLabel })
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
  backAction: {
    position: 'absolute',
    right: spacing['5xl'],
    top: spacing['3xl'],
  },
  body: {
    gap: spacing['5xl'],
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['5xl'],
  },
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
  hero: {
    backgroundColor: colors.ink,
    justifyContent: 'flex-end',
    minHeight: 138,
    overflow: 'hidden',
    padding: spacing['5xl'],
  },
  heroCopy: { gap: spacing.md, maxWidth: 280 },
  page: { alignSelf: 'center', flex: 1, maxWidth: 840, width: '100%' },
  scrollContent: { backgroundColor: colors.canvas },
  step: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: sizes.hairline,
    gap: spacing.lg,
    padding: spacing['4xl'],
  },
  steps: { gap: spacing['3xl'] },
  summary: { gap: spacing.md },
  titleBlock: { gap: spacing.md },
  validationBanner: { borderColor: colors.danger, borderWidth: sizes.hairline },
});

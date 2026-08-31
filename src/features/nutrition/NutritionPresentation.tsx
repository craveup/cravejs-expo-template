import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, IconButton, Surface } from '@/components/ui';
import { createTranslator, getLocaleDirection, type AppLocale } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import { PresentationIcon, PresentationLayout } from '../_shared/index.ts';
import type { NutritionPresentationState } from './nutrition.ts';

export type NutritionPresentationProps = Readonly<{
  locale?: AppLocale;
  onBack: () => void;
  onRetry?: () => void;
  state: NutritionPresentationState;
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
  status: Exclude<NutritionPresentationState, { data: unknown }>['status'];
}>) {
  const t = createTranslator(locale);
  const message =
    status === 'loading'
      ? t('nutrition.loading')
      : status === 'offline'
        ? t('nutrition.offline')
        : status === 'not-found'
          ? t('nutrition.notFound')
          : status === 'error'
            ? t('nutrition.error')
            : t('nutrition.unavailable');

  return (
    <PresentationLayout
      accessibilityLabel={t('nutrition.title')}
      contentStyle={styles.failureContent}
      locale={locale}
    >
      <View style={styles.failureHeader}>
        <IconButton accessibilityLabel={t('item.back')} onPress={onBack}>
          <PresentationIcon color={colors.ink} name="arrowBack" size={18} />
        </IconButton>
      </View>
      <View accessibilityLiveRegion="polite" style={styles.failureBody}>
        {status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        <AppText align="center" color="textMuted" variant="subheading">
          {message}
        </AppText>
        {status !== 'loading' && status !== 'not-found' && onRetry ? (
          <Button label={t('action.retry')} onPress={onRetry} variant="secondary" />
        ) : null}
      </View>
    </PresentationLayout>
  );
}

export function NutritionPresentation({
  locale = 'en',
  onBack,
  onRetry,
  state,
}: NutritionPresentationProps) {
  const t = createTranslator(locale);
  const rowDirection = getLocaleDirection(locale) === 'rtl' ? 'row-reverse' : 'row';

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

  return (
    <PresentationLayout accessibilityLabel={t('nutrition.title')} locale={locale}>
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <IconButton accessibilityLabel={t('item.back')} onPress={onBack}>
          <PresentationIcon color={colors.ink} name="arrowBack" size={18} />
        </IconButton>
        <View style={styles.headerCopy}>
          <AppText color="accent" variant="label">
            {t('nutrition.title').toUpperCase()}
          </AppText>
          <AppText accessibilityRole="header" variant="heading">
            {model.productName}
          </AppText>
        </View>
      </View>

      {!model.hasPublishedNutrition ? (
        <Surface padding="roomy" radius="cardLarge" style={styles.emptyCard}>
          <AppText accessibilityRole="header" variant="subheading">
            {t('nutrition.unavailableTitle')}
          </AppText>
          <AppText color="textMuted">{t('nutrition.unavailable')}</AppText>
        </Surface>
      ) : (
        <>
          {model.calorieCount !== undefined ? (
            <Surface padding="default" radius="md" style={styles.nutritionCard}>
              <AppText color="textSubtle" variant="label">
                {t('nutrition.published').toUpperCase()}
              </AppText>
              <View style={[styles.valueRow, { flexDirection: rowDirection }]}>
                <AppText color="textMuted">{t('nutrition.energy')}</AppText>
                <AppText variant="bodyStrong">
                  {t('nutrition.calorieValue', { count: model.calorieCount })}
                </AppText>
              </View>
            </Surface>
          ) : null}

          {model.dietaryPreferences.length > 0 ? (
            <View style={styles.section}>
              <AppText accessibilityRole="header" color="textSubtle" variant="label">
                {t('nutrition.preferences').toUpperCase()}
              </AppText>
              <View accessibilityRole="list" style={styles.chips}>
                {model.dietaryPreferences.map((preference) => (
                  <View key={preference} style={styles.chip}>
                    <AppText color="surface" variant="caption">
                      {preference}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {model.ingredients.length > 0 ? (
            <View style={styles.section}>
              <AppText accessibilityRole="header" color="textSubtle" variant="label">
                {t('nutrition.ingredients').toUpperCase()}
              </AppText>
              <Surface padding="default" radius="md">
                <AppText color="textMuted">
                  {model.ingredients.join(' · ')}
                </AppText>
              </Surface>
            </View>
          ) : null}
        </>
      )}

      <Surface background="surfaceMuted" bordered={false} padding="default" radius="md">
        <AppText color="textMuted" variant="caption">
          {t('nutrition.notice')}
        </AppText>
      </Surface>
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    minHeight: sizes.minimumTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  emptyCard: {
    gap: spacing.xl,
  },
  failureBody: {
    alignItems: 'center',
    flex: 1,
    gap: spacing['4xl'],
    justifyContent: 'center',
  },
  failureContent: {
    flexGrow: 1,
  },
  failureHeader: {
    alignItems: 'flex-start',
  },
  header: {
    alignItems: 'flex-start',
    gap: spacing['3xl'],
  },
  headerCopy: {
    flex: 1,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  nutritionCard: {
    gap: spacing['3xl'],
  },
  section: {
    gap: spacing.xl,
  },
  valueRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

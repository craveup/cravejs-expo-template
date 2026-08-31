import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { createTranslator, type AppLocale } from '@/i18n';
import { colors, radii, spacing } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon';
import { PresentationLayout } from '../_shared/PresentationLayout';
import type { UpdateRequiredViewState } from './update-required.ts';

export type UpdateRequiredPresentationProps = Readonly<{
  locale?: AppLocale;
  onUpdate: () => void;
  state: UpdateRequiredViewState;
}>;

export function UpdateRequiredPresentation({
  locale = 'en',
  onUpdate,
  state,
}: UpdateRequiredPresentationProps) {
  const t = createTranslator(locale);
  const title = t('system.updateRequired.title');

  return (
    <PresentationLayout
      accessibilityLabel={title}
      background="ink"
      contentStyle={styles.layout}
      locale={locale}
    >
      <View accessibilityLiveRegion="polite" style={styles.content}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.mark}
        >
          <PresentationIcon color={colors.surface} name="arrowUp" size={34} />
        </View>

        <AppText
          accessibilityRole="header"
          align="center"
          color="surface"
          style={styles.title}
          variant="heading"
        >
          {title}
        </AppText>
        <AppText
          align="center"
          color="heroSupporting"
          style={styles.supporting}
          variant="caption"
        >
          {t('system.updateRequired.supporting')}
        </AppText>

        <Button
          label={t('system.updateRequired.action')}
          loading={state.openingStore}
          onPress={onUpdate}
          style={styles.action}
        />

        {state.requiredVersionLabel ? (
          <AppText align="center" color="iconMuted" variant="micro">
            {t('system.updateRequired.version', {
              version: state.requiredVersionLabel,
            })}
          </AppText>
        ) : null}
      </View>
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  layout: {
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: spacing['2xl'],
    maxWidth: 342,
    paddingTop: spacing['7xl'] * 3,
    width: '100%',
  },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.device,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  title: {
    maxWidth: 290,
  },
  supporting: {
    maxWidth: 290,
  },
  action: {
    marginTop: spacing.md,
    width: '100%',
  },
});

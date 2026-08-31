import { StyleSheet, View } from 'react-native';

import { AppText, Button, Surface } from '@/components/ui';
import { createTranslator, type AppLocale } from '@/i18n';
import { colors, radii, spacing } from '@/theme';

import { PresentationLayout } from '../_shared/PresentationLayout';
import { PresentationIcon } from '../_shared/PresentationIcon';
import type { SystemStateViewState } from './system-state.ts';

export type SystemBackLabel = 'back' | 'home';

export type SystemStatePresentationProps = Readonly<{
  backLabel?: SystemBackLabel;
  locale?: AppLocale;
  onBack?: () => void;
  onRetry?: () => void;
  state: SystemStateViewState;
}>;

export function SystemStatePresentation({
  backLabel = 'back',
  locale = 'en',
  onBack,
  onRetry,
  state,
}: SystemStatePresentationProps) {
  const t = createTranslator(locale);
  const offline = state.status === 'offline';
  const title = t(offline ? 'system.offline.title' : 'system.error.title');
  const supporting = t(
    offline ? 'system.offline.supporting' : 'system.error.supporting',
  );
  const showsRetry =
    Boolean(onRetry) && (offline || (state.status === 'error' && state.retryable));

  return (
    <PresentationLayout
      accessibilityLabel={title}
      background="contentCanvas"
      centered
      locale={locale}
    >
      <View accessibilityLiveRegion="polite" style={styles.content}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.mark,
            { backgroundColor: offline ? colors.imageSurface : colors.danger },
          ]}
        >
          <PresentationIcon
            color={offline ? colors.ink : colors.surface}
            name={offline ? 'offline' : 'error'}
            size={34}
          />
        </View>
        <AppText
          accessibilityRole="header"
          align="center"
          style={styles.title}
          variant="heading"
        >
          {title}
        </AppText>
        <AppText align="center" color="textMuted" style={styles.supporting} variant="caption">
          {supporting}
        </AppText>

        {state.status === 'error' && state.requestId ? (
          <Surface
            accessibilityLabel={t('system.reference.accessibility', {
              requestId: state.requestId,
            })}
            bordered={false}
            padding="default"
            radius="md"
            style={styles.reference}
          >
            <AppText color="textSubtle" variant="label">
              {t('system.reference.label')}
            </AppText>
            <AppText variant="caption">{state.requestId}</AppText>
          </Surface>
        ) : null}

        <View style={styles.actions}>
          {showsRetry ? (
            <Button
              label={
                state.status === 'offline' && state.checking
                  ? t('system.offline.checking')
                  : t('action.retry')
              }
              loading={state.status === 'offline' && state.checking}
              onPress={onRetry}
              style={styles.action}
            />
          ) : null}
          {onBack ? (
            <Button
              label={t(
                backLabel === 'home' ? 'system.action.home' : 'system.action.back',
              )}
              onPress={onBack}
              style={styles.action}
              variant={showsRetry ? 'secondary' : 'primary'}
            />
          ) : null}
        </View>
      </View>
    </PresentationLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    alignSelf: 'center',
    flex: 1,
    gap: spacing['2xl'],
    justifyContent: 'center',
    maxWidth: 342,
    paddingVertical: spacing['7xl'],
    width: '100%',
  },
  mark: {
    alignItems: 'center',
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
  reference: {
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
    width: '100%',
  },
  action: {
    width: '100%',
  },
});

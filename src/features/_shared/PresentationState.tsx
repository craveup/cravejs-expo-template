import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { createTranslator, type AppLocale } from '@/i18n';
import { colors, sizes, spacing } from '@/theme';

import {
  getPresentationMessageKey,
  type PresentationFailureStatus,
  type PresentationFeature,
} from './presentation-state.ts';

export type PresentationStateProps = {
  feature: PresentationFeature;
  locale?: AppLocale;
  onRetry?: () => void;
  status: PresentationFailureStatus;
};

export function PresentationState({
  feature,
  locale = 'en',
  onRetry,
  status,
}: PresentationStateProps) {
  const t = createTranslator(locale);
  const retryable = status === 'error' || status === 'unknown';

  return (
    <View accessibilityLiveRegion="polite" style={styles.state}>
      {status === 'loading' ? <ActivityIndicator color={colors.accent} size="small" /> : null}
      <AppText align="center" color={status === 'error' ? 'danger' : 'textMuted'}>
        {t(getPresentationMessageKey(feature, status))}
      </AppText>
      {retryable && onRetry ? <Button label={t('action.retry')} onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    gap: spacing['3xl'],
    justifyContent: 'center',
    minHeight: sizes.standardControl * 3,
    paddingVertical: spacing['6xl'],
  },
});

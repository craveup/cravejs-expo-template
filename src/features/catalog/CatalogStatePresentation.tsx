import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { createTranslator, type AppLocale, type TranslationKey } from '@/i18n';
import { colors, spacing } from '@/theme';

import type { CatalogBrowseState } from './catalog-browse.ts';

export type CatalogStatePresentationProps = Readonly<{
  locale?: AppLocale;
  onRetry?: () => void;
  state: Exclude<CatalogBrowseState, { status: 'ready' }>;
}>;

const MESSAGE_KEYS = {
  empty: 'catalog.empty',
  error: 'catalog.error',
  idle: 'catalog.loading',
  loading: 'catalog.loading',
  'not-found': 'catalog.notFound',
  offline: 'catalog.offline',
  unavailable: 'catalog.unavailable',
  unpublished: 'catalog.unpublished',
} as const satisfies Record<
  Exclude<CatalogBrowseState['status'], 'ready'>,
  TranslationKey
>;

export function CatalogStatePresentation({
  locale = 'en',
  onRetry,
  state,
}: CatalogStatePresentationProps) {
  const t = createTranslator(locale);
  const message = t(MESSAGE_KEYS[state.status]);
  const loading = state.status === 'idle' || state.status === 'loading';
  const retryable =
    state.status === 'offline' ||
    ((state.status === 'error' || state.status === 'unavailable') &&
      state.retryable);
  const requestId =
    state.status === 'error' ||
    state.status === 'not-found' ||
    state.status === 'unavailable'
      ? state.requestId
      : undefined;

  return (
    <View accessibilityLiveRegion="polite" style={styles.content}>
      {loading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
      <AppText
        accessibilityRole="header"
        align="center"
        color={state.status === 'error' ? 'danger' : 'textMuted'}
        variant="heading"
      >
        {message}
      </AppText>
      {requestId ? (
        <AppText align="center" color="textSubtle" variant="caption">
          {t('catalog.requestId', { requestId })}
        </AppText>
      ) : null}
      {retryable && onRetry ? (
        <Button
          label={t('action.retry')}
          onPress={onRetry}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flex: 1,
    gap: spacing['3xl'],
    justifyContent: 'center',
    minHeight: 280,
    paddingVertical: spacing['7xl'],
  },
});

import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import { colors, spacing } from '@/theme';

export type StoreDetailRouteStateScreenProps = Readonly<{
  errorMessage?: string;
  loading?: boolean;
  onBack: () => void;
  onRetry?: () => void;
}>;

export function StoreDetailRouteStateScreen({
  errorMessage,
  loading = false,
  onBack,
  onRetry,
}: StoreDetailRouteStateScreenProps) {
  return (
    <Screen
      accessibilityLabel="Store details"
      contentContainerStyle={styles.content}
      padded={false}
      style={styles.screen}
    >
      <Surface accessibilityLiveRegion="polite" style={styles.card}>
        <AppText color={errorMessage ? 'danger' : 'textMuted'} variant="bodyStrong">
          {loading ? 'Loading store details…' : errorMessage}
        </AppText>
        <View style={styles.actions}>
          {errorMessage && onRetry ? (
            <Button label="Try again" onPress={onRetry} />
          ) : null}
          <Button label="Go back" onPress={onBack} variant="secondary" />
        </View>
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.xl,
  },
  card: {
    gap: spacing['3xl'],
  },
  content: {
    justifyContent: 'center',
    paddingHorizontal: spacing['5xl'],
  },
  screen: {
    backgroundColor: colors.canvas,
  },
});

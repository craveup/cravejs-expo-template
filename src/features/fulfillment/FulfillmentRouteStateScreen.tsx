import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';

export function FulfillmentRouteStateScreen({
  loading,
  onRetry,
}: Readonly<{
  loading: boolean;
  onRetry?: () => void;
}>) {
  return (
    <Screen background="canvas" contentContainerStyle={styles.content}>
      <View accessibilityLiveRegion="polite" style={styles.state}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        <AppText align="center" color="textMuted" variant="subheading">
          {loading
            ? 'Checking pickup availability'
            : 'Pickup options are unavailable right now.'}
        </AppText>
        {!loading && onRetry ? (
          <Button label="Try again" onPress={onRetry} variant="secondary" />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing['5xl'] },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: spacing['4xl'],
    justifyContent: 'center',
  },
});

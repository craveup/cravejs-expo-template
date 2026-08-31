import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Screen } from '@/components/ui';
import { getLocaleDirection, type AppLocale } from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, spacing, type ColorToken } from '@/theme';

export type PresentationLayoutProps = {
  accessibilityLabel: string;
  background?: ColorToken;
  centered?: boolean;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardOpen?: boolean;
  locale?: AppLocale;
};

export function PresentationLayout({
  accessibilityLabel,
  background = 'canvas',
  centered = false,
  children,
  contentStyle,
  keyboardOpen = false,
  locale = 'en',
}: PresentationLayoutProps) {
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale, keyboardOpen);

  return (
    <Screen
      accessibilityLabel={accessibilityLabel}
      background={background}
      contentContainerStyle={[
        styles.screenContent,
        {
          direction: getLocaleDirection(locale),
          backgroundColor: colors[background],
          maxWidth: layout.contentMaxWidth,
          paddingBottom: layout.keyboardOpen ? spacing['3xl'] : spacing['7xl'],
          paddingHorizontal: layout.horizontalPadding,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      padded={false}
      scrollable
    >
      <View style={[styles.content, centered && styles.centeredContent, contentStyle]}>
        {children}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    gap: spacing['5xl'],
    width: '100%',
  },
  screenContent: {
    alignSelf: 'center',
    flexGrow: 1,
    paddingTop: spacing['5xl'],
    width: '100%',
  },
});

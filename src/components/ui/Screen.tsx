import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, sizes, type ColorToken } from '@/theme';

type ScreenBaseProps = {
  background?: ColorToken;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

type StaticScreenProps = ScreenBaseProps &
  Omit<ViewProps, 'children' | 'style'> & {
    scrollable?: false;
  };

type ScrollableScreenProps = ScreenBaseProps &
  Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'style'> & {
    scrollable: true;
  };

export type ScreenProps = StaticScreenProps | ScrollableScreenProps;

export function Screen(props: ScreenProps) {
  if (props.scrollable) {
    const {
      background = 'canvas',
      children,
      contentContainerStyle,
      padded = true,
      scrollable: _scrollable,
      style,
      ...scrollViewProps
    } = props;
    const contentStyle = [padded && styles.padded, contentContainerStyle];

    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors[background] }]}>
        <ScrollView
          {...scrollViewProps}
          contentContainerStyle={contentStyle}
          style={[styles.fill, style]}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const {
    background = 'canvas',
    children,
    contentContainerStyle,
    padded = true,
    scrollable: _scrollable,
    style,
    ...viewProps
  } = props;
  const contentStyle = [padded && styles.padded, contentContainerStyle];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors[background] }]}>
      <View {...viewProps} style={[styles.fill, contentStyle, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: sizes.pageHorizontalPadding,
  },
});

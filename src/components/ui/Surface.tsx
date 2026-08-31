import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radii, sizes, spacing, type ColorToken } from '@/theme';

export type SurfacePadding = 'none' | 'compact' | 'default' | 'roomy';

export type SurfaceProps = Omit<ViewProps, 'children' | 'style'> & {
  background?: ColorToken;
  bordered?: boolean;
  children: ReactNode;
  padding?: SurfacePadding;
  radius?: keyof typeof radii;
  style?: StyleProp<ViewStyle>;
};

const paddingStyles = StyleSheet.create({
  none: { paddingHorizontal: spacing.none, paddingVertical: spacing.none },
  compact: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  default: { paddingHorizontal: spacing['4xl'], paddingVertical: spacing['4xl'] },
  roomy: { paddingHorizontal: spacing['5xl'], paddingVertical: spacing['5xl'] },
} satisfies Record<SurfacePadding, ViewStyle>);

export function Surface({
  background = 'surface',
  bordered = true,
  children,
  padding = 'default',
  radius = 'card',
  style,
  ...props
}: SurfaceProps) {
  return (
    <View
      {...props}
      style={[
        styles.base,
        {
          backgroundColor: colors[background],
          borderColor: bordered ? colors.border : colors.transparent,
          borderRadius: radii[radius],
          borderWidth: bordered ? sizes.hairline : 0,
        },
        paddingStyles[padding],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});

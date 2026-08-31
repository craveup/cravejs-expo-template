import { StyleSheet, View, type ViewProps } from 'react-native';

import { radii, spacing } from '@/theme';

import { AppText } from './AppText';
import { badgePalettes } from './control-palettes';

export type BadgeTone = 'accent' | 'neutral' | 'dark';

export type BadgeProps = Omit<ViewProps, 'children'> & {
  children: number | string;
  tone?: BadgeTone;
};

export function Badge({ children, style, tone = 'accent', ...props }: BadgeProps) {
  const palette = badgePalettes[tone];

  return (
    <View {...props} style={[styles.base, { backgroundColor: palette.background }, style]}>
      <AppText style={{ color: palette.foreground }} variant="micro">
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: spacing.sm,
  },
});

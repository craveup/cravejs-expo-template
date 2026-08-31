import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radii, sizes, spacing } from '@/theme';
import { getMinimumTouchTarget, type SupportedPlatform } from '@/accessibility';

import { AppText } from './AppText';
import { buttonPalettes } from './control-palettes';

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'danger' | 'ghost';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon?: ReactNode;
  label: string;
  loading?: boolean;
  radius?: keyof typeof radii;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
};

export function Button({
  accessibilityLabel,
  accessibilityState,
  disabled,
  icon,
  label,
  loading = false,
  radius = 'md',
  style,
  variant = 'primary',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = disabled ? buttonPalettes.disabled : buttonPalettes[variant];
  const platform: SupportedPlatform =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
  const minimumTouchTarget = getMinimumTouchTarget(platform);

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading,
        disabled: Boolean(isDisabled),
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.background,
          borderRadius: radii[radius],
          minHeight: Math.max(sizes.actionControl, minimumTouchTarget),
          minWidth: minimumTouchTarget,
        },
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.foreground} size="small" />
      ) : (
        <View style={styles.content}>
          <AppText style={{ color: palette.foreground }} variant="bodyStrong">
            {label}
          </AppText>
          {icon}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.actionControl,
    paddingHorizontal: spacing['4xl'],
    paddingVertical: spacing.actionVertical,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});

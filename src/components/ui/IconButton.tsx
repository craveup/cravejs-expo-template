import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, sizes } from '@/theme';
import { getMinimumTouchTarget, getTouchTargetInsets, type SupportedPlatform } from '@/accessibility';

export type IconButtonVariant = 'surface' | 'solid' | 'ghost';

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  accessibilityLabel: string;
  children: ReactNode;
  compact?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: IconButtonVariant;
};

const variantStyles: Record<IconButtonVariant, ViewStyle> = {
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  solid: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  ghost: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
  },
};

export function IconButton({
  accessibilityLabel,
  accessibilityState,
  children,
  compact = false,
  disabled,
  loading = false,
  style,
  variant = 'surface',
  ...props
}: IconButtonProps) {
  const platform: SupportedPlatform =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
  const minimumTouchTarget = getMinimumTouchTarget(platform);
  const dimension = compact ? sizes.compactControl : minimumTouchTarget;
  const isDisabled = disabled || loading;
  const indicatorColor = variant === 'solid' ? colors.surface : colors.ink;

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading,
        disabled: Boolean(isDisabled),
      }}
      disabled={isDisabled}
      hitSlop={compact ? getTouchTargetInsets(dimension, platform) : undefined}
      style={({ pressed }) => [
        styles.base,
        { borderRadius: dimension / 2, height: dimension, width: dimension },
        variantStyles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={indicatorColor} size="small" /> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderWidth: sizes.hairline,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
});

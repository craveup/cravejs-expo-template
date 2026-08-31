import type { ViewStyle } from 'react-native';

import { colors } from './brand-theme.ts';

export { colors };

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  navItemGap: 5,
  sm: 6,
  inlineGap: 7,
  md: 8,
  dense: 9,
  lg: 10,
  xl: 12,
  '2xl': 14,
  actionVertical: 15,
  '3xl': 16,
  '4xl': 18,
  '5xl': 20,
  '6xl': 24,
  '7xl': 32,
} as const;

export const radii = {
  hairline: 1,
  indicator: 3,
  xs: 4,
  tight: 7,
  sm: 8,
  md: 14,
  action: 16,
  control: 19,
  card: 20,
  cardLarge: 22,
  hero: 26,
  device: 44,
  pill: 999,
} as const;

export const sizes = {
  hairline: 1,
  compactControl: 38,
  minimumTouchTarget: 44,
  actionControl: 47,
  standardControl: 48,
  bottomNavigation: 72,
  pageHorizontalPadding: 20,
} as const;

export const shadows = {
  floating: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  } satisfies ViewStyle,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;

import { colors } from '../../theme/tokens.ts';

type ControlPalette = {
  background: string;
  foreground: string;
};

export const buttonPalettes = {
  primary: {
    background: colors.accent,
    foreground: colors.ink,
  },
  secondary: {
    background: colors.surface,
    foreground: colors.textMuted,
  },
  dark: {
    background: colors.ink,
    foreground: colors.surface,
  },
  danger: {
    background: colors.danger,
    foreground: colors.surface,
  },
  ghost: {
    background: colors.transparent,
    foreground: colors.ink,
  },
  disabled: {
    background: colors.imageSurface,
    foreground: colors.iconMuted,
  },
} satisfies Record<
  'primary' | 'secondary' | 'dark' | 'danger' | 'ghost' | 'disabled',
  ControlPalette
>;

export const badgePalettes = {
  accent: {
    background: colors.accent,
    foreground: colors.ink,
  },
  neutral: {
    background: colors.surfaceMuted,
    foreground: colors.ink,
  },
  dark: {
    background: colors.ink,
    foreground: colors.surface,
  },
} as const;

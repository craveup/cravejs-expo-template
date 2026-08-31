import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { badgePalettes, buttonPalettes } from './control-palettes.ts';
import { colors } from '../../theme/tokens.ts';

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255);

  assert.ok(channels, `${hex} must be a six-digit color`);

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('accent controls use readable foreground colors and the reviewed disabled palette', () => {
  for (const tone of ['primary', 'secondary', 'dark', 'danger', 'ghost'] as const) {
    const palette = buttonPalettes[tone];
    if (palette.background !== 'transparent') {
      assert.ok(
        contrastRatio(palette.foreground, palette.background) >= 4.5,
        `${tone} must meet WCAG AA contrast`,
      );
    }
  }
  assert.ok(contrastRatio(badgePalettes.accent.foreground, badgePalettes.accent.background) >= 4.5);
  assert.deepEqual(buttonPalettes.disabled, {
    background: colors.imageSurface,
    foreground: colors.iconMuted,
  });

  const source = readFileSync(new URL('./Button.tsx', import.meta.url), 'utf8');
  assert.match(source, /radius = 'md'/);
  assert.match(source, /minHeight: sizes\.actionControl/);
  assert.match(source, /paddingVertical: spacing\.actionVertical/);
  assert.doesNotMatch(source, /borderWidth:/);
  assert.match(source, /accessibilityState=\{\{\s*\.\.\.accessibilityState,/s);
});

test('IconButton preserves caller-provided accessibility state', () => {
  const source = readFileSync(new URL('./IconButton.tsx', import.meta.url), 'utf8');
  assert.match(source, /accessibilityState=\{\{\s*\.\.\.accessibilityState,/s);
});

test('Screen forwards native props to its non-scrollable View', () => {
  const source = readFileSync(new URL('./Screen.tsx', import.meta.url), 'utf8');
  assert.match(source, /<View\s+\{\.\.\.viewProps\}/);
  assert.match(source, /scrollable: true/);
  assert.match(source, /scrollable\?: false/);
});

test('Surface uses axis padding so caller longhands can win on web', () => {
  const source = readFileSync(new URL('./Surface.tsx', import.meta.url), 'utf8');
  assert.match(source, /const paddingStyles = StyleSheet\.create\(/);
  assert.match(source, /none: \{ paddingHorizontal: spacing\.none, paddingVertical: spacing\.none \}/);
  assert.doesNotMatch(source, /hasCallerPadding|property\.startsWith\('padding'\)/);
  assert.doesNotMatch(source, /none: \{ padding:/);
});

test('font loading uses per-weight entry points so unused font files are not bundled', () => {
  const source = readFileSync(new URL('../../theme/brand-fonts.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /from '@expo-google-fonts\/[^/'"]+';/,
  );
  assert.ok(
    [
      ...source.matchAll(
        /from '@expo-google-fonts\/[^']+\/(?:400Regular(?:_Italic)?|500Medium|600SemiBold|700Bold|800ExtraBold)\/index\.js'/g,
      ),
    ].length >= 6,
  );
});

test('app shell does not invent global motion absent from the reviewed Figma source', () => {
  const source = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SplashScreen\.setOptions/);
  assert.doesNotMatch(source, /animation:\s*'fade'/);
});

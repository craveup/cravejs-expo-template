import assert from 'node:assert/strict';
import test from 'node:test';

import { brandConfig } from '../config/brand.config.ts';
import { brandThemeProfile } from './brand-theme.ts';
import { colors, radii, sizes, spacing } from './tokens.ts';
import { fontFamilies, textStyles } from './typography.ts';

test('shared tokens use the generated brand profile and stable layout scales', () => {
  assert.deepEqual(brandThemeProfile, {
    colorTokenProfile: brandConfig.colorTokenProfile,
    fontTokenProfile: brandConfig.fontTokenProfile,
  });
  assert.deepEqual(Object.keys(colors), [
    'canvas',
    'contentCanvas',
    'surface',
    'surfaceDark',
    'ink',
    'accent',
    'accentSoft',
    'danger',
    'border',
    'divider',
    'progressTrack',
    'surfaceMuted',
    'imageSurface',
    'textMuted',
    'textSubtle',
    'iconMuted',
    'textOnDarkMuted',
    'heroSupporting',
    'onboardingInactiveDot',
    'transparent',
  ]);
  for (const [name, color] of Object.entries(colors)) {
    if (name === 'transparent') {
      assert.equal(color, 'transparent');
    } else {
      assert.match(color, /^#[0-9A-F]{6}$/u);
    }
  }

  assert.equal(spacing.navItemGap, 5);
  assert.equal(spacing.inlineGap, 7);
  assert.equal(spacing.dense, 9);
  assert.equal(spacing.actionVertical, 15);
  assert.equal(radii.indicator, 3);
  assert.equal(radii.tight, 7);
  assert.equal(radii.action, 16);
  assert.equal(radii.device, 44);
  assert.equal(sizes.actionControl, 47);
});

test('shared typography binds every style to the generated font profile', () => {
  assert.equal(Object.values(fontFamilies).length, 8);
  assert.ok(new Set(Object.values(fontFamilies)).size >= 4);
  for (const family of Object.values(fontFamilies)) {
    assert.match(family, /^[A-Za-z0-9_]+$/u);
  }

  assert.equal(textStyles.editorial.fontFamily, fontFamilies.editorialItalic);
  assert.equal(textStyles.display.fontFamily, fontFamilies.headingExtraBold);
  assert.equal(textStyles.title.fontFamily, fontFamilies.headingExtraBold);
  assert.equal(textStyles.heading.fontFamily, fontFamilies.headingExtraBold);
  assert.equal(textStyles.subheading.fontFamily, fontFamilies.headingExtraBold);
  assert.equal(textStyles.body.fontFamily, fontFamilies.bodyRegular);
  assert.equal(textStyles.bodyMedium.fontFamily, fontFamilies.bodyMedium);
  assert.equal(textStyles.bodyStrong.fontFamily, fontFamilies.bodySemiBold);
  assert.equal(textStyles.label.fontFamily, fontFamilies.headingBold);
  assert.equal(textStyles.caption.fontFamily, fontFamilies.bodyMedium);
  assert.equal(textStyles.micro.fontFamily, fontFamilies.bodyRegular);

  assert.deepEqual(
    {
      display: textStyles.display,
      editorial: textStyles.editorial,
      title: textStyles.title,
    },
    {
      display: {
        fontFamily: fontFamilies.headingExtraBold,
        fontSize: 40,
        lineHeight: 39.2,
        letterSpacing: -1,
      },
      editorial: {
        fontFamily: fontFamilies.editorialItalic,
        fontSize: 17,
        lineHeight: 19.55,
        letterSpacing: 0,
      },
      title: {
        fontFamily: fontFamilies.headingExtraBold,
        fontSize: 24,
        lineHeight: 24,
        letterSpacing: -0.48,
      },
    },
  );
});

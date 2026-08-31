import type { TextStyle } from 'react-native';

import { fontFamilies } from './brand-theme.ts';

export { fontFamilies };

export const textStyles = {
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
  heading: {
    fontFamily: fontFamilies.headingExtraBold,
    fontSize: 20,
    lineHeight: 25.2,
    letterSpacing: 0,
  },
  subheading: {
    fontFamily: fontFamilies.headingExtraBold,
    fontSize: 18,
    lineHeight: 22.68,
    letterSpacing: 0,
  },
  body: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
  },
  bodyMedium: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
    lineHeight: 16.8,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 14,
    lineHeight: 16.8,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamilies.headingBold,
    fontSize: 10,
    lineHeight: 10,
    letterSpacing: 0.6,
  },
  caption: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    lineHeight: 14.4,
    letterSpacing: 0,
  },
  micro: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0,
  },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textStyles;

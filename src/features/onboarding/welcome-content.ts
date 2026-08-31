import { brandConfig } from '../../config/brand.config.ts';
import { colors } from '../../theme/tokens.ts';

export const welcomeOnboardingCopy = {
  accountAction: 'I already have an account',
  body: brandConfig.copy.welcomeOnboardingBody,
  primaryAction: 'Get started',
  title: brandConfig.copy.welcomeOnboardingTitle,
} as const;

/** Feature-local value; promote it if another screen reuses it. */
export const welcomeOnboardingColors = {
  inactiveDot: colors.onboardingInactiveDot,
} as const;

/** Responsive geometry derived from the reviewed reference layout. */
export const welcomeOnboardingLayout = {
  accountActionHeight: 44,
  bodyStartAfterTopInset: 46,
  buttonMaxWidth: 342,
  contentMaxWidth: 290,
  dotContainerHeight: 20,
  dotGap: 8,
  dotSize: 8,
  markSize: 88,
  markTopFromBody: 120,
  sectionGap: 14,
  spacerBeforeAction: 48,
} as const;

export const welcomeOnboardingTypography = {
  body: {
    fontSize: 13,
    lineHeight: 16,
  },
  mark: {
    fontSize: 34,
    lineHeight: 34,
  },
  title: {
    fontSize: 26,
    lineHeight: 33,
  },
} as const;

export const CAPABILITY_NAMES = [
  'delivery',
  'loyalty',
  'favourites',
  'claims',
  'savedCards',
  'applePay',
  'googlePay',
  'pushNotifications',
] as const;

export const CAPABILITY_STATES = ['enabled', 'disabled', 'gated'] as const;

export type CapabilityName = (typeof CAPABILITY_NAMES)[number];
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export type BrandAssets = {
  adaptiveIconBackground: string;
  adaptiveIconForeground: string;
  adaptiveIconMonochrome: string;
  brandMark: string;
  favicon: string;
  icon: string;
  splash: string;
};

export type BrandCopy = {
  bagEmptyBody: string;
  bagEmptyTitle: string;
  catalogCategoriesTitle: string;
  catalogFooterBody: string;
  catalogFooterTitle: string;
  catalogHeroEyebrow: string;
  catalogHeroTitle: string;
  noNearbyStoresTitle: string;
  signInClubLabel: string;
  welcomeOnboardingBody: string;
  welcomeOnboardingTitle: string;
};

export type BrandLinks = {
  androidAppLinkHosts: readonly string[];
  privacy: string;
  support: string;
  terms: string;
  universalLinkHosts: readonly string[];
};

export type BrandConfig = {
  analyticsNamespace: string;
  androidPackage: string;
  assets: BrandAssets;
  capabilities: Readonly<Record<CapabilityName, CapabilityState>>;
  colorTokenProfile: string;
  copy: BrandCopy;
  displayName: string;
  fontTokenProfile: string;
  iosBundleIdentifier: string;
  legalName: string;
  links: BrandLinks;
  notificationNamespace: string;
  scheme: string;
  slug: string;
};

export type TemplateManifest = {
  brand: BrandConfig;
  generatedFiles: readonly [
    'src/config/brand.config.ts',
    'src/theme/brand-theme.ts',
    'src/theme/brand-fonts.ts',
  ];
  schemaVersion: 1;
  templateRelease: string;
};

export type ManifestValidationIssue = {
  code:
    | 'invalid_type'
    | 'invalid_value'
    | 'missing_field'
    | 'unknown_field'
    | 'reserved_identifier'
    | 'unsafe_path'
    | 'unsafe_url';
  message: string;
  path: string;
};

export type ManifestValidationResult =
  | { manifest: TemplateManifest; ok: true }
  | { issues: readonly ManifestValidationIssue[]; ok: false };

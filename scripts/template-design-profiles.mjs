export const COLOR_TOKEN_PROFILES = {
  'northstar-forest': {
    canvas: '#F3F6F0',
    contentCanvas: '#F8FAF6',
    surface: '#FFFFFF',
    surfaceDark: '#203A2D',
    ink: '#132A1F',
    accent: '#F2C14E',
    accentSoft: '#F8D982',
    danger: '#B42318',
    border: '#D5DFD3',
    divider: '#E3E9E1',
    progressTrack: '#DCE5D9',
    surfaceMuted: '#E8EFE6',
    imageSurface: '#C7D8C4',
    textMuted: '#52675A',
    textSubtle: '#6B7F71',
    iconMuted: '#64776A',
    textOnDarkMuted: '#B8C7BD',
    heroSupporting: '#D0DFCC',
    onboardingInactiveDot: '#476252',
    transparent: 'transparent',
  },
  'crave-orchard': {
    canvas: '#F7EFE6',
    contentCanvas: '#FFF4E9',
    surface: '#FFFFFF',
    surfaceDark: '#3D322E',
    ink: '#261E1C',
    accent: '#FC7D00',
    accentSoft: '#FFAF5F',
    danger: '#D0442F',
    border: '#EADCCC',
    divider: '#EFE3D6',
    progressTrack: '#F1E5D8',
    surfaceMuted: '#F4ECE3',
    imageSurface: '#EAD3BE',
    textMuted: '#7A695D',
    textSubtle: '#9C8A7C',
    iconMuted: '#A9998B',
    textOnDarkMuted: '#B9A899',
    heroSupporting: '#E9D6C4',
    onboardingInactiveDot: '#5C4C42',
    transparent: 'transparent',
  },
};

export const FONT_TOKEN_PROFILES = {
  'outfit-figtree': {
    imports: [
      ['Figtree_400Regular', '@expo-google-fonts/figtree/400Regular/index.js'],
      ['Figtree_500Medium', '@expo-google-fonts/figtree/500Medium/index.js'],
      ['Figtree_600SemiBold', '@expo-google-fonts/figtree/600SemiBold/index.js'],
      ['Figtree_700Bold', '@expo-google-fonts/figtree/700Bold/index.js'],
      [
        'InstrumentSerif_400Regular_Italic',
        '@expo-google-fonts/instrument-serif/400Regular_Italic/index.js',
      ],
      ['Outfit_600SemiBold', '@expo-google-fonts/outfit/600SemiBold/index.js'],
      ['Outfit_700Bold', '@expo-google-fonts/outfit/700Bold/index.js'],
      ['Outfit_800ExtraBold', '@expo-google-fonts/outfit/800ExtraBold/index.js'],
    ],
    packages: [
      '@expo-google-fonts/figtree',
      '@expo-google-fonts/instrument-serif',
      '@expo-google-fonts/outfit',
    ],
    families: {
      bodyRegular: 'Figtree_400Regular',
      bodyMedium: 'Figtree_500Medium',
      bodySemiBold: 'Figtree_600SemiBold',
      bodyBold: 'Figtree_700Bold',
      editorialItalic: 'InstrumentSerif_400Regular_Italic',
      headingSemiBold: 'Outfit_600SemiBold',
      headingBold: 'Outfit_700Bold',
      headingExtraBold: 'Outfit_800ExtraBold',
    },
  },
  'source-sans': {
    imports: [
      ['SourceSans3_400Regular', '@expo-google-fonts/source-sans-3/400Regular/index.js'],
      [
        'SourceSans3_400Regular_Italic',
        '@expo-google-fonts/source-sans-3/400Regular_Italic/index.js',
      ],
      ['SourceSans3_500Medium', '@expo-google-fonts/source-sans-3/500Medium/index.js'],
      ['SourceSans3_600SemiBold', '@expo-google-fonts/source-sans-3/600SemiBold/index.js'],
      ['SourceSans3_700Bold', '@expo-google-fonts/source-sans-3/700Bold/index.js'],
      ['SourceSans3_800ExtraBold', '@expo-google-fonts/source-sans-3/800ExtraBold/index.js'],
    ],
    packages: ['@expo-google-fonts/source-sans-3'],
    families: {
      bodyRegular: 'SourceSans3_400Regular',
      bodyMedium: 'SourceSans3_500Medium',
      bodySemiBold: 'SourceSans3_600SemiBold',
      bodyBold: 'SourceSans3_700Bold',
      editorialItalic: 'SourceSans3_400Regular_Italic',
      headingSemiBold: 'SourceSans3_600SemiBold',
      headingBold: 'SourceSans3_700Bold',
      headingExtraBold: 'SourceSans3_800ExtraBold',
    },
  },
};

export const KNOWN_FONT_PROFILE_PACKAGES = [
  ...new Set(
    Object.values(FONT_TOKEN_PROFILES).flatMap(({ packages }) => packages),
  ),
];

export function getFontProfilePackages(profileName) {
  return FONT_TOKEN_PROFILES[profileName]?.packages ?? [];
}

function uniqueProfileValues(profiles, selectedName, selectValues) {
  const selectedValues = selectValues(profiles[selectedName]);
  const otherValues = new Set(
    Object.entries(profiles)
      .filter(([name]) => name !== selectedName)
      .flatMap(([, profile]) => selectValues(profile))
      .map((value) => value.toLowerCase()),
  );
  return selectedValues.filter(
    (value) => !otherValues.has(value.toLowerCase()),
  );
}

export function getDesignProfileMarkers(brand) {
  return [
    brand.colorTokenProfile,
    brand.fontTokenProfile,
    ...uniqueProfileValues(
      COLOR_TOKEN_PROFILES,
      brand.colorTokenProfile,
      (profile) => Object.values(profile),
    ),
    ...uniqueProfileValues(
      FONT_TOKEN_PROFILES,
      brand.fontTokenProfile,
      (profile) => [
        ...profile.packages,
        ...profile.imports.flat(),
        ...Object.values(profile.families),
      ],
    ),
  ];
}

export function renderBrandTheme(manifest) {
  const colorProfile = COLOR_TOKEN_PROFILES[manifest.brand.colorTokenProfile];
  const fontProfile = FONT_TOKEN_PROFILES[manifest.brand.fontTokenProfile];
  if (!colorProfile || !fontProfile) {
    throw new Error('Manifest selected an unsupported design profile.');
  }

  return [
    '// Generated by scripts/generate-template-profile.mjs. Do not edit by hand.',
    'export const brandThemeProfile = {',
    `  colorTokenProfile: '${manifest.brand.colorTokenProfile}',`,
    `  fontTokenProfile: '${manifest.brand.fontTokenProfile}',`,
    '} as const;',
    '',
    `export const colors = ${JSON.stringify(colorProfile, null, 2)} as const;`,
    '',
    `export const fontFamilies = ${JSON.stringify(fontProfile.families, null, 2)} as const;`,
    '',
  ].join('\n');
}

export function renderBrandFonts(manifest) {
  const fontProfile = FONT_TOKEN_PROFILES[manifest.brand.fontTokenProfile];
  if (!fontProfile) {
    throw new Error('Manifest selected an unsupported font profile.');
  }

  const imports = fontProfile.imports.map(
    ([identifier, source]) => `import { ${identifier} } from '${source}';`,
  );
  const fontIdentifiers = fontProfile.imports.map(([identifier]) => identifier);

  return [
    '// Generated by scripts/generate-template-profile.mjs. Do not edit by hand.',
    ...imports,
    '',
    'export const appFonts = {',
    ...fontIdentifiers.map((identifier) => `  ${identifier},`),
    '};',
    '',
  ].join('\n');
}

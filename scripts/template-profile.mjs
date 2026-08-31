import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

import {
  COLOR_TOKEN_PROFILES,
  FONT_TOKEN_PROFILES,
  renderBrandFonts,
  renderBrandTheme,
} from './template-design-profiles.mjs';

export const CAPABILITY_NAMES = [
  'delivery',
  'loyalty',
  'favourites',
  'claims',
  'savedCards',
  'applePay',
  'googlePay',
  'pushNotifications',
];

export const CAPABILITY_STATES = ['enabled', 'disabled', 'gated'];
export const GENERATED_FILES = [
  'src/config/brand.config.ts',
  'src/config/brand-assets.ts',
  'src/theme/brand-theme.ts',
  'src/theme/brand-fonts.ts',
];

const MANIFEST_FIELDS = ['schemaVersion', 'templateRelease', 'generatedFiles', 'brand'];
const BRAND_FIELDS = [
  'displayName',
  'legalName',
  'slug',
  'scheme',
  'iosBundleIdentifier',
  'androidPackage',
  'assets',
  'colorTokenProfile',
  'copy',
  'fontTokenProfile',
  'links',
  'analyticsNamespace',
  'notificationNamespace',
  'capabilities',
];
const ASSET_FIELDS = [
  'icon',
  'adaptiveIconForeground',
  'adaptiveIconBackground',
  'adaptiveIconMonochrome',
  'splash',
  'favicon',
  'brandMark',
];
const COPY_FIELDS = [
  'bagEmptyBody',
  'bagEmptyTitle',
  'catalogCategoriesTitle',
  'catalogFooterBody',
  'catalogFooterTitle',
  'catalogHeroEyebrow',
  'catalogHeroTitle',
  'noNearbyStoresTitle',
  'signInClubLabel',
  'welcomeOnboardingBody',
  'welcomeOnboardingTitle',
];
const LINK_FIELDS = [
  'privacy',
  'terms',
  'support',
  'universalLinkHosts',
  'androidAppLinkHosts',
];
const RESERVED_IDENTIFIERS = new Set([
  'android',
  'apple',
  'expo',
  'exps',
  'file',
  'http',
  'https',
  'javascript',
  'main',
  'null',
  'undefined',
]);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function addIssue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function validateKnownFields(value, expected, path, issues) {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid_type', path, 'Expected an object.');
    return false;
  }

  for (const field of expected) {
    if (!Object.hasOwn(value, field)) {
      addIssue(issues, 'missing_field', `${path}.${field}`, 'Field is required.');
    }
  }
  for (const field of Object.keys(value)) {
    if (!expected.includes(field)) {
      addIssue(issues, 'unknown_field', `${path}.${field}`, 'Unknown fields are not allowed.');
    }
  }
  return true;
}

function validateString(value, path, issues, pattern, message) {
  if (typeof value !== 'string') {
    addIssue(issues, 'invalid_type', path, 'Expected a string.');
    return;
  }
  if (!value.trim() || (pattern && !pattern.test(value))) {
    addIssue(issues, 'invalid_value', path, message);
  }
}

function validateIdentifier(value, path, issues, pattern, message) {
  validateString(value, path, issues, pattern, message);
  if (typeof value === 'string' && RESERVED_IDENTIFIERS.has(value.toLowerCase())) {
    addIssue(issues, 'reserved_identifier', path, 'Identifier is reserved.');
  }
}

function validateHttpsUrl(value, path, issues) {
  if (typeof value !== 'string') {
    addIssue(issues, 'invalid_type', path, 'Expected an HTTPS URL.');
    return;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.includes('.') ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error('unsafe');
    }
  } catch {
    addIssue(issues, 'unsafe_url', path, 'Expected an absolute HTTPS URL without credentials or a fragment.');
  }
}

function validateHostList(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, 'invalid_type', path, 'Expected a non-empty host list.');
    return;
  }
  const seen = new Set();
  for (const [index, host] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (
      typeof host !== 'string' ||
      host !== host.toLowerCase() ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(host)
    ) {
      addIssue(issues, 'invalid_value', itemPath, 'Expected a lowercase hostname without scheme, path, or port.');
      continue;
    }
    if (seen.has(host)) addIssue(issues, 'invalid_value', itemPath, 'Duplicate hosts are not allowed.');
    seen.add(host);
  }
}

function validateAssetPath(value, path, issues) {
  if (
    typeof value !== 'string' ||
    !value ||
    isAbsolute(value) ||
    value.includes('\\') ||
    value.split('/').includes('..') ||
    !/^[a-zA-Z0-9_./ -]+\.(?:png|jpg|jpeg|webp|svg)$/.test(value)
  ) {
    addIssue(issues, 'unsafe_path', path, 'Expected a safe repository-relative image path.');
  }
}

function validateBrand(brand, issues) {
  if (!validateKnownFields(brand, BRAND_FIELDS, 'brand', issues)) return;

  validateString(brand.displayName, 'brand.displayName', issues, /^.{2,80}$/, 'Use 2 to 80 characters.');
  validateString(brand.legalName, 'brand.legalName', issues, /^.{2,120}$/, 'Use 2 to 120 characters.');
  validateIdentifier(brand.slug, 'brand.slug', issues, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase kebab-case slug.');
  validateIdentifier(brand.scheme, 'brand.scheme', issues, /^[a-z][a-z0-9+.-]{2,31}$/, 'Use a lowercase URL scheme.');
  validateIdentifier(
    brand.iosBundleIdentifier,
    'brand.iosBundleIdentifier',
    issues,
    /^(?:[A-Za-z][A-Za-z0-9-]*\.){2,}[A-Za-z][A-Za-z0-9-]*$/,
    'Use a reverse-DNS iOS bundle identifier.',
  );
  validateIdentifier(
    brand.androidPackage,
    'brand.androidPackage',
    issues,
    /^(?:[a-z][a-z0-9_]*\.){2,}[a-z][a-z0-9_]*$/,
    'Use a lowercase reverse-DNS Android package.',
  );
  validateIdentifier(
    brand.analyticsNamespace,
    'brand.analyticsNamespace',
    issues,
    /^[a-z][a-z0-9_]{2,63}$/,
    'Use a lowercase analytics namespace.',
  );
  validateIdentifier(
    brand.notificationNamespace,
    'brand.notificationNamespace',
    issues,
    /^(?:[a-z][a-z0-9_]*\.){2,}[a-z][a-z0-9_]*$/,
    'Use a lowercase reverse-DNS notification namespace.',
  );
  validateString(
    brand.colorTokenProfile,
    'brand.colorTokenProfile',
    issues,
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use a lowercase token profile name.',
  );
  if (
    typeof brand.colorTokenProfile === 'string' &&
    !Object.hasOwn(COLOR_TOKEN_PROFILES, brand.colorTokenProfile)
  ) {
    addIssue(
      issues,
      'invalid_value',
      'brand.colorTokenProfile',
      `Expected one of: ${Object.keys(COLOR_TOKEN_PROFILES).join(', ')}.`,
    );
  }
  validateString(
    brand.fontTokenProfile,
    'brand.fontTokenProfile',
    issues,
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use a lowercase token profile name.',
  );
  if (
    typeof brand.fontTokenProfile === 'string' &&
    !Object.hasOwn(FONT_TOKEN_PROFILES, brand.fontTokenProfile)
  ) {
    addIssue(
      issues,
      'invalid_value',
      'brand.fontTokenProfile',
      `Expected one of: ${Object.keys(FONT_TOKEN_PROFILES).join(', ')}.`,
    );
  }

  if (validateKnownFields(brand.assets, ASSET_FIELDS, 'brand.assets', issues)) {
    for (const field of ASSET_FIELDS) {
      const assetPath = brand.assets[field];
      validateAssetPath(assetPath, `brand.assets.${field}`, issues);
      if (
        field !== 'brandMark' &&
        typeof assetPath === 'string' &&
        !assetPath.toLowerCase().endsWith('.png')
      ) {
        addIssue(
          issues,
          'invalid_value',
          `brand.assets.${field}`,
          'Expo native and web presentation assets must be PNG files.',
        );
      }
    }
  }

  if (validateKnownFields(brand.copy, COPY_FIELDS, 'brand.copy', issues)) {
    for (const field of COPY_FIELDS) {
      validateString(
        brand.copy[field],
        `brand.copy.${field}`,
        issues,
        /^.{2,240}$/u,
        'Use 2 to 240 characters without line breaks.',
      );
    }
  }

  if (validateKnownFields(brand.links, LINK_FIELDS, 'brand.links', issues)) {
    validateHttpsUrl(brand.links.privacy, 'brand.links.privacy', issues);
    validateHttpsUrl(brand.links.terms, 'brand.links.terms', issues);
    validateHttpsUrl(brand.links.support, 'brand.links.support', issues);
    validateHostList(brand.links.universalLinkHosts, 'brand.links.universalLinkHosts', issues);
    validateHostList(brand.links.androidAppLinkHosts, 'brand.links.androidAppLinkHosts', issues);
  }

  if (validateKnownFields(brand.capabilities, CAPABILITY_NAMES, 'brand.capabilities', issues)) {
    for (const capability of CAPABILITY_NAMES) {
      if (!CAPABILITY_STATES.includes(brand.capabilities[capability])) {
        addIssue(
          issues,
          'invalid_value',
          `brand.capabilities.${capability}`,
          `Expected one of: ${CAPABILITY_STATES.join(', ')}.`,
        );
      }
    }
    if (brand.capabilities.claims !== 'disabled' && brand.capabilities.loyalty === 'disabled') {
      addIssue(
        issues,
        'invalid_value',
        'brand.capabilities.claims',
        'Claims cannot be available when loyalty is disabled.',
      );
    }
  }
}

export function findBrandIdentityCollisions(left, right) {
  const fields = [
    'slug',
    'scheme',
    'iosBundleIdentifier',
    'androidPackage',
    'analyticsNamespace',
    'notificationNamespace',
    'colorTokenProfile',
    'fontTokenProfile',
  ];
  const collisions = fields.filter(
    (field) => left[field].toLowerCase() === right[field].toLowerCase(),
  );
  if (CAPABILITY_NAMES.every((name) => left.capabilities[name] === right.capabilities[name])) {
    collisions.push('capabilities');
  }
  if (COPY_FIELDS.every((field) => left.copy[field] === right.copy[field])) {
    collisions.push('copy');
  }
  const leftHosts = new Set([
    ...left.links.universalLinkHosts,
    ...left.links.androidAppLinkHosts,
  ]);
  if (
    [...right.links.universalLinkHosts, ...right.links.androidAppLinkHosts].some((host) =>
      leftHosts.has(host),
    )
  ) {
    collisions.push('linkHosts');
  }
  return collisions;
}

export function validateTemplateManifest(value) {
  const issues = [];
  if (!validateKnownFields(value, MANIFEST_FIELDS, 'manifest', issues)) return { ok: false, issues };

  if (value.schemaVersion !== 1) {
    addIssue(issues, 'invalid_value', 'manifest.schemaVersion', 'Only schema version 1 is supported.');
  }
  validateString(
    value.templateRelease,
    'manifest.templateRelease',
    issues,
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/,
    'Expected an exact semantic version.',
  );
  if (
    !Array.isArray(value.generatedFiles) ||
    value.generatedFiles.length !== GENERATED_FILES.length ||
    value.generatedFiles.some((file, index) => file !== GENERATED_FILES[index])
  ) {
    addIssue(
      issues,
      'invalid_value',
      'manifest.generatedFiles',
      `Expected exactly: ${GENERATED_FILES.join(', ')}.`,
    );
  }
  validateBrand(value.brand, issues);

  return issues.length === 0 ? { ok: true, manifest: value } : { ok: false, issues };
}

export function parseTemplateManifest(source) {
  try {
    return validateTemplateManifest(JSON.parse(source));
  } catch {
    return {
      ok: false,
      issues: [{ code: 'invalid_value', path: 'manifest', message: 'Manifest is not valid JSON.' }],
    };
  }
}

export function validateManifestAssets(manifest, assetRoot) {
  const issues = [];
  const canonicalRoot = realpathSync(resolve(assetRoot));
  for (const [role, assetPath] of Object.entries(manifest.brand.assets)) {
    const resolvedAsset = resolve(canonicalRoot, assetPath);
    const withinRoot = resolvedAsset === canonicalRoot || resolvedAsset.startsWith(`${canonicalRoot}${sep}`);
    let safeFile = false;
    if (withinRoot && existsSync(resolvedAsset)) {
      try {
        const canonicalAsset = realpathSync(resolvedAsset);
        safeFile =
          canonicalAsset === resolvedAsset &&
          canonicalAsset.startsWith(`${canonicalRoot}${sep}`) &&
          lstatSync(canonicalAsset).isFile();
      } catch {
        safeFile = false;
      }
    }
    if (!safeFile) {
      addIssue(
        issues,
        'unsafe_path',
        `brand.assets.${role}`,
        'Declared asset does not exist inside the validated asset root.',
      );
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function readTemplateManifest(manifestPath, assetRoot = process.cwd()) {
  const parsed = parseTemplateManifest(readFileSync(manifestPath, 'utf8'));
  if (!parsed.ok) return parsed;
  const assets = validateManifestAssets(parsed.manifest, assetRoot);
  return assets.ok ? parsed : assets;
}

export function renderBrandConfig(manifest) {
  return [
    '// Generated by scripts/generate-template-profile.mjs. Do not edit by hand.',
    "import type { BrandConfig } from './brand.types.ts';",
    '',
    `export const brandProfileSchemaVersion = ${manifest.schemaVersion} as const;`,
    `export const brandProfileRelease = '${manifest.templateRelease}' as const;`,
    '',
    `export const brandConfig = ${JSON.stringify(manifest.brand, null, 2)} as const satisfies BrandConfig;`,
    '',
  ].join('\n');
}

export function renderBrandAssets(manifest) {
  const brandMark = manifest.brand.assets.brandMark.replaceAll('\\', '/');
  return [
    '// Generated by scripts/generate-template-profile.mjs. Do not edit by hand.',
    `import brandMark from '../../${brandMark}';`,
    '',
    'export const brandAssets = { brandMark } as const;',
    '',
  ].join('\n');
}

export function renderTemplateFiles(manifest) {
  return new Map([
    ['src/config/brand.config.ts', renderBrandConfig(manifest)],
    ['src/config/brand-assets.ts', renderBrandAssets(manifest)],
    ['src/theme/brand-theme.ts', renderBrandTheme(manifest)],
    ['src/theme/brand-fonts.ts', renderBrandFonts(manifest)],
  ]);
}

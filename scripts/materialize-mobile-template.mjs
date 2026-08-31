import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateTemplateProfile } from './generate-template-profile.mjs';
import {
  KNOWN_FONT_PROFILE_PACKAGES,
  getFontProfilePackages,
} from './template-design-profiles.mjs';
import {
  GENERATED_FILES,
  readTemplateManifest,
} from './template-profile.mjs';
import {
  computeCurrentTemplateArchiveIntegrity,
  createGenerationReleaseMetadata,
  createTemplateReleaseManifest,
  validateGenerationReleaseMetadata,
} from './template-release.mjs';

const GENERATED_PROJECT_ROOT_FILES = [
  '.env.example',
  '.gitignore',
  '.nvmrc',
  'LICENSE',
  'app.config.ts',
  'eslint.config.cjs',
  'expo-env.d.ts',
  'tsconfig.json',
];
const GENERATED_PROJECT_SCRIPTS = [
  'scripts/check-public-environment.mjs',
];
// These files validate the reference repository's design evidence, plans, or workflows. All other
// application tests are contract-owned output and must remain executable in generated projects.
const REPOSITORY_ONLY_TESTS = new Set([
  'src/features/locations/location-directory-closure.test.ts',
  'src/lib/figma-asset-digest.test.ts',
  'src/lib/figma-env-config.test.ts',
  'src/lib/github-workflow-contract.test.ts',
]);
const GENERATED_FILE_SET = new Set(GENERATED_FILES);

export function normalizeProjectPath(path) {
  return path.replaceAll('\\', '/');
}

export function shouldCopySharedSourcePath(path) {
  const projectPath = normalizeProjectPath(path);
  return (
    !GENERATED_FILE_SET.has(projectPath) &&
    !REPOSITORY_ONLY_TESTS.has(projectPath)
  );
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function collectProjectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Template output cannot contain a symbolic link: ${path}`);
    }
    return entry.isDirectory() ? collectProjectFiles(path) : [path];
  });
}

function manifestSha256(manifestPath) {
  return sha256(readFileSync(manifestPath));
}

export function createAcceptanceTemplateRelease({
  generatedAt,
  templateRoot = process.cwd(),
}) {
  const templateManifestPath = resolve(
    templateRoot,
    'template/mobile-template.manifest.json',
  );
  const result = readTemplateManifest(templateManifestPath, templateRoot);
  if (!result.ok) {
    throw new Error(result.issues.map(({ message, path }) => `${path}: ${message}`).join('\n'));
  }
  return createGenerationReleaseMetadata(
    createTemplateReleaseManifest({
      templateIntegrity: computeCurrentTemplateArchiveIntegrity(
        result.manifest.templateRelease,
        templateRoot,
      ),
      templateRoot,
    }),
    {
      generatedBy: '@craveup/cli@2.0.0',
      generatedAt,
    },
  );
}

function assertSafeTarget(outputDirectory) {
  let current = resolve(outputDirectory);
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`Template target path cannot contain a symbolic link: ${current}`);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function assertTargetOutsideTemplateSource(target, templateRoot) {
  const relativeTarget = relative(resolve(templateRoot), target);
  if (
    relativeTarget === '' ||
    (relativeTarget !== '..' &&
      !relativeTarget.startsWith(`..${sep}`) &&
      !isAbsolute(relativeTarget))
  ) {
    throw new Error('Template target must be outside the immutable template source.');
  }
}

function assertManifestInsideAssetRoot(manifestPath, assetRoot) {
  const canonicalRoot = realpathSync(resolve(assetRoot));
  const requestedManifest = resolve(manifestPath);
  const canonicalManifest = realpathSync(requestedManifest);
  const relativeManifest = relative(canonicalRoot, canonicalManifest);
  if (
    !relativeManifest ||
    relativeManifest === '..' ||
    relativeManifest.startsWith(`..${sep}`) ||
    isAbsolute(relativeManifest) ||
    !lstatSync(requestedManifest).isFile()
  ) {
    throw new Error(
      'Brand manifest must be a regular file inside the validated asset root.',
    );
  }
  return canonicalRoot;
}

function copyProjectFile(sourceRoot, outputDirectory, path) {
  const canonicalRoot = realpathSync(resolve(sourceRoot));
  const source = resolve(canonicalRoot, path);
  const canonicalSource = realpathSync(source);
  const relativeSource = relative(canonicalRoot, canonicalSource);
  if (
    canonicalSource !== source ||
    relativeSource === '..' ||
    relativeSource.startsWith(`..${sep}`) ||
    isAbsolute(relativeSource) ||
    !lstatSync(canonicalSource).isFile()
  ) {
    throw new Error(
      `Materializer source must be a regular file inside its validated root: ${path}`,
    );
  }
  const target = resolve(outputDirectory, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function copySharedSource(templateRoot, outputDirectory, directory = 'src') {
  for (const entry of readdirSync(resolve(templateRoot, directory), {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Template source cannot be a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) {
      copySharedSource(templateRoot, outputDirectory, path);
      continue;
    }
    if (!shouldCopySharedSourcePath(path)) continue;
    copyProjectFile(
      templateRoot,
      outputDirectory,
      normalizeProjectPath(path),
    );
  }
}

// This materializer is the single owner of the customer project's package
// metadata. It keeps package.json and package-lock.json in sync after applying
// brand naming, runnable scripts, and font-profile dependency pruning.
function writeGeneratedPackageMetadata(templateRoot, outputDirectory, brand) {
  const packageName = `${brand.slug}-ordering-app`;
  const manifest = JSON.parse(readFileSync(resolve(templateRoot, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(
    readFileSync(resolve(templateRoot, 'package-lock.json'), 'utf8'),
  );
  const sharedScripts = [
    'start',
    'ios',
    'android',
    'web',
    'lint',
    'typecheck',
    'test',
    'expo:check',
    'public-env:check',
  ];
  const selectedFontPackages = new Set(
    getFontProfilePackages(brand.fontTokenProfile),
  );

  for (const fontPackage of KNOWN_FONT_PROFILE_PACKAGES) {
    if (selectedFontPackages.has(fontPackage)) continue;
    delete manifest.dependencies[fontPackage];
    delete lockfile.packages[''].dependencies[fontPackage];
    delete lockfile.packages[`node_modules/${fontPackage}`];
  }

  manifest.name = packageName;
  manifest.scripts.test = 'node --test --test-concurrency=4';
  manifest.scripts.verify =
    'npm run lint && npm run typecheck && npm run test && npm run expo:check && npm run public-env:check';
  manifest.scripts = Object.fromEntries(
    ['verify', ...sharedScripts].map((name) => [name, manifest.scripts[name]]),
  );
  lockfile.name = packageName;
  lockfile.packages[''].name = packageName;

  writeFileSync(
    resolve(outputDirectory, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    resolve(outputDirectory, 'package-lock.json'),
    `${JSON.stringify(lockfile, null, 2)}\n`,
  );
}

function ownedFileDigests(outputDirectory) {
  return Object.fromEntries(
    collectProjectFiles(outputDirectory)
      .map((path) => normalizeProjectPath(relative(outputDirectory, path)))
      .filter((path) => path !== '.crave/mobile-template.json')
      .sort()
      .map((path) => [path, sha256(readFileSync(resolve(outputDirectory, path)))]),
  );
}

function writeProvenance(outputDirectory, release) {
  const provenance = {
    ...release,
    ownedFiles: ownedFileDigests(outputDirectory),
  };
  const path = resolve(outputDirectory, '.crave/mobile-template.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(provenance, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

function snapshot(directory) {
  return new Map(
    collectProjectFiles(directory)
      .map((path) => normalizeProjectPath(relative(directory, path)))
      .sort()
      .map((path) => [path, sha256(readFileSync(resolve(directory, path)))]),
  );
}

function buildFilePlan(stagedSnapshot, targetSnapshot) {
  return [...new Set([...stagedSnapshot.keys(), ...targetSnapshot.keys()])]
    .sort()
    .map((path) => {
      const expectedSha256 = stagedSnapshot.get(path);
      const currentSha256 = targetSnapshot.get(path);
      let action = 'conflict';
      if (expectedSha256 && !currentSha256) action = 'create';
      if (expectedSha256 && expectedSha256 === currentSha256) action = 'preserve';
      return {
        action,
        ...(currentSha256 ? { currentSha256 } : {}),
        ...(expectedSha256 ? { expectedSha256 } : {}),
        path,
      };
    });
}

function readPublicEnvironmentKeys(templateRoot) {
  return readFileSync(resolve(templateRoot, '.env.example'), 'utf8')
    .split(/\r?\n/u)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/u.exec(line)?.[1])
    .filter((key) => key?.startsWith('EXPO_PUBLIC_'));
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function buildOperatorPlan({ action, files, manifest, release, target, templateRoot }) {
  return {
    action,
    commands: {
      exports: [
        'npx expo export --platform ios',
        'npx expo export --platform android',
        'npx expo export --platform web',
      ],
      install: 'npm ci',
      nativeBuilds: [
        'eas build --platform ios --profile production',
        'eas build --platform android --profile production',
      ],
      rollback: `npx @craveup/cli@${release.minimumCliVersion} template rollback --project ${shellQuote(target)}`,
      start: 'npx expo start',
      verify: 'npm run verify',
    },
    files,
    normalizedBrand: {
      androidPackage: manifest.brand.androidPackage,
      displayName: manifest.brand.displayName,
      iosBundleIdentifier: manifest.brand.iosBundleIdentifier,
      legalName: manifest.brand.legalName,
      scheme: manifest.brand.scheme,
      slug: manifest.brand.slug,
    },
    outputDirectory: target,
    provenance: release,
    publicEnvironmentKeys: readPublicEnvironmentKeys(templateRoot),
  };
}

function buildStagedProject({
  assetRoot,
  manifest,
  manifestPath,
  provenance,
  stage,
  templateRoot,
}) {
  mkdirSync(stage, { recursive: true });
  for (const path of [
    ...GENERATED_PROJECT_ROOT_FILES,
    ...GENERATED_PROJECT_SCRIPTS,
  ]) {
    copyProjectFile(templateRoot, stage, path);
  }
  copySharedSource(templateRoot, stage);
  writeGeneratedPackageMetadata(templateRoot, stage, manifest.brand);

  for (const assetPath of Object.values(manifest.brand.assets)) {
    copyProjectFile(assetRoot, stage, assetPath);
  }

  generateTemplateProfile({
    assetRoot,
    manifestPath,
    outputDirectory: stage,
  });
  writeProvenance(stage, provenance);
}

export function materializeMobileTemplate({
  assetRoot,
  dryRun = false,
  manifestPath,
  outputDirectory,
  release,
  templateRoot = process.cwd(),
}) {
  const canonicalAssetRoot = assertManifestInsideAssetRoot(
    manifestPath,
    assetRoot,
  );
  const result = readTemplateManifest(manifestPath, canonicalAssetRoot);
  if (!result.ok) {
    throw new Error(result.issues.map(({ message, path }) => `${path}: ${message}`).join('\n'));
  }
  validateGenerationReleaseMetadata(release, templateRoot);
  const provenance = Object.freeze({
    ...release,
    brandManifestSha256: manifestSha256(manifestPath),
  });

  const target = resolve(outputDirectory);
  assertTargetOutsideTemplateSource(target, templateRoot);
  assertSafeTarget(target);
  const parent = dirname(target);
  let stageParent = parent;
  if (dryRun) {
    while (!existsSync(stageParent)) stageParent = dirname(stageParent);
  } else {
    mkdirSync(parent, { recursive: true });
  }
  const stage = mkdtempSync(join(stageParent, `.${basename(target)}.crave-stage-`));

  try {
    buildStagedProject({
      assetRoot: canonicalAssetRoot,
      manifest: result.manifest,
      manifestPath,
      provenance,
      stage,
      templateRoot,
    });
    const stagedSnapshot = snapshot(stage);
    const targetExists = existsSync(target);
    const targetIsDirectory = !targetExists || lstatSync(target).isDirectory();
    const targetSnapshot = !targetExists
      ? new Map()
      : targetIsDirectory
        ? snapshot(target)
        : new Map([['.', 'non-directory-target']]);
    const files = buildFilePlan(stagedSnapshot, targetSnapshot);
    const targetIsEmpty =
      targetExists &&
      targetIsDirectory &&
      readdirSync(target).length === 0;
    const targetMatches =
      targetIsDirectory &&
      stagedSnapshot.size === targetSnapshot.size &&
      files.every(({ action }) => action === 'preserve');
    const action = !targetExists || targetIsEmpty
      ? 'create'
      : targetMatches
        ? 'unchanged'
        : 'conflict';
    const plan = buildOperatorPlan({
      action,
      files,
      manifest: result.manifest,
      release: provenance,
      target,
      templateRoot,
    });
    if (action === 'conflict') {
      const error = new Error('Generation stopped because the target contains different files.');
      error.plan = plan;
      throw error;
    }
    if (!dryRun && action === 'create') {
      assertSafeTarget(target);
      if (targetExists) rmdirSync(target);
      renameSync(stage, target);
    }
    return plan;
  } finally {
    rmSync(stage, { force: true, recursive: true });
  }
}

function parseArguments(args) {
  const options = {
    assetRoot: undefined,
    dryRun: false,
    manifest: undefined,
    output: undefined,
    releaseMetadata: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (
      ['--asset-root', '--manifest', '--output', '--release-metadata'].includes(
        argument,
      )
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      options[
        argument === '--release-metadata'
          ? 'releaseMetadata'
          : argument === '--asset-root'
            ? 'assetRoot'
            : argument.slice(2)
      ] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  for (const field of ['assetRoot', 'manifest', 'output', 'releaseMetadata']) {
    if (!options[field]) throw new Error(`--${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }
  return options;
}

export function runMobileTemplateMaterializer(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const root = process.cwd();
  const plan = materializeMobileTemplate({
    assetRoot: resolve(root, options.assetRoot),
    dryRun: options.dryRun,
    manifestPath: resolve(root, options.manifest),
    outputDirectory: resolve(root, options.output),
    release: JSON.parse(readFileSync(resolve(root, options.releaseMetadata), 'utf8')),
    templateRoot: root,
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

function isDirectExecution() {
  if (typeof process.argv[1] !== 'string') return false;
  try {
    return (
      realpathSync.native(process.argv[1]) ===
      realpathSync.native(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    runMobileTemplateMaterializer();
  } catch (error) {
    if (error && typeof error === 'object' && 'plan' in error) {
      process.stdout.write(`${JSON.stringify(error.plan, null, 2)}\n`);
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

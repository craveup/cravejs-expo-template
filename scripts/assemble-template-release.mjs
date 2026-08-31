import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createTemplateArchive,
  createTemplateReleaseManifest,
  sha256Sri,
  validateTemplateReleaseManifest,
} from './template-release.mjs';

const MAXIMUM_ARTIFACT_BYTES = 256 * 1024 * 1024;

class AssemblyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new AssemblyError(code);
}

function git(repositoryRoot, args, encoding = 'utf8') {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding,
      maxBuffer: MAXIMUM_ARTIFACT_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail('GIT');
  }
}

function readArchiveMember(artifactPath, memberPath) {
  try {
    return execFileSync('tar', ['-xOf', artifactPath, memberPath], {
      maxBuffer: MAXIMUM_ARTIFACT_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail('ARCHIVE');
  }
}

function canonicalPathForCreation(absolutePath) {
  const missingSegments = [];
  let existingAncestor = absolutePath;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) fail('OUTPUT_PATH');
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  return join(realpathSync.native(existingAncestor), ...missingSegments);
}

function assertOutputOutsideSource(outputDirectory, repositoryRoot) {
  const relativeOutput = relative(repositoryRoot, outputDirectory);
  if (
    relativeOutput === '' ||
    (relativeOutput !== '..' &&
      !relativeOutput.startsWith(`..${sep}`) &&
      !isAbsolute(relativeOutput))
  ) {
    fail('OUTPUT_INSIDE_SOURCE');
  }
}

function parseArguments(args) {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (normalized.length !== 2 || normalized[0] !== '--output' || !normalized[1]) {
    fail('USAGE');
  }
  return { outputDirectory: normalized[1] };
}

export function assembleTemplateRelease(
  { outputDirectory },
  repositoryRoot = process.cwd(),
) {
  const canonicalRepositoryRoot = realpathSync.native(repositoryRoot);
  const gitRoot = realpathSync.native(
    git(canonicalRepositoryRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  if (gitRoot !== canonicalRepositoryRoot) fail('REPOSITORY_ROOT');
  if (
    git(canonicalRepositoryRoot, [
      'status',
      '--porcelain',
      '--untracked-files=all',
    ]).trim()
  ) {
    fail('DIRTY_SOURCE');
  }
  if (!isAbsolute(outputDirectory)) fail('OUTPUT_ABSOLUTE');

  const canonicalOutputDirectory = canonicalPathForCreation(resolve(outputDirectory));
  assertOutputOutsideSource(canonicalOutputDirectory, canonicalRepositoryRoot);
  if (existsSync(canonicalOutputDirectory)) {
    if (!lstatSync(canonicalOutputDirectory).isDirectory()) fail('OUTPUT_NOT_DIRECTORY');
    if (readdirSync(canonicalOutputDirectory).length > 0) fail('OUTPUT_NOT_EMPTY');
  }

  const templateCommit = git(canonicalRepositoryRoot, ['rev-parse', 'HEAD']).trim();
  if (!/^[0-9a-f]{40}$/u.test(templateCommit)) fail('RELEASE_REFERENCE');
  if (
    git(canonicalRepositoryRoot, ['ls-files', '-s'])
      .split('\n')
      .some((entry) => entry.startsWith('120000 '))
  ) {
    throw new Error('Template source cannot include a symbolic link.');
  }
  let templateRelease;
  try {
    const source = git(
      canonicalRepositoryRoot,
      ['show', `${templateCommit}:template/mobile-template.manifest.json`],
    );
    templateRelease = JSON.parse(source).templateRelease;
  } catch {
    fail('RELEASE_REFERENCE');
  }
  if (typeof templateRelease !== 'string' || !templateRelease) fail('RELEASE_REFERENCE');

  let artifact;
  try {
    artifact = createTemplateArchive({
      templateCommit,
      templateRelease,
      templateRoot: canonicalRepositoryRoot,
    });
  } catch {
    fail('RELEASE_REFERENCE');
  }
  const artifactName = `cravejs-expo-template-${templateRelease}.tar`;
  const prefix = `cravejs-expo-template-${templateRelease}/`;
  const createdOutput = !existsSync(canonicalOutputDirectory);
  mkdirSync(canonicalOutputDirectory, { recursive: true });
  const artifactPath = join(canonicalOutputDirectory, artifactName);
  const manifestPath = join(canonicalOutputDirectory, 'template-release.json');
  let artifactCreated = false;
  let manifestCreated = false;

  try {
    writeFileSync(artifactPath, artifact, { flag: 'wx' });
    artifactCreated = true;
    const configSchemaSource = readArchiveMember(
      artifactPath,
      `${prefix}scripts/template-profile.mjs`,
    );
    const templateManifestSource = readArchiveMember(
      artifactPath,
      `${prefix}template/mobile-template.manifest.json`,
    );
    const release = createTemplateReleaseManifest({
      configSchemaSource,
      templateIntegrity: sha256Sri(artifact),
      templateManifestSource,
      templateRoot: canonicalRepositoryRoot,
    });
    validateTemplateReleaseManifest(release, canonicalRepositoryRoot, {
      artifact,
      configSchemaSource,
      templateManifestSource,
    });
    writeFileSync(manifestPath, `${JSON.stringify(release, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    manifestCreated = true;
    validateTemplateReleaseManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')),
      canonicalRepositoryRoot,
      { artifact, configSchemaSource, templateManifestSource },
    );
  } catch (error) {
    if (artifactCreated) rmSync(artifactPath, { force: true });
    if (manifestCreated) rmSync(manifestPath, { force: true });
    if (createdOutput) {
      try {
        rmdirSync(canonicalOutputDirectory);
      } catch {
        // Preserve any unexpected file created by another process during assembly.
      }
    }
    throw error;
  }

  return { artifactPath, manifestPath };
}

function run() {
  try {
    const result = assembleTemplateRelease(parseArguments(process.argv.slice(2)));
    process.stdout.write(
      `${JSON.stringify({ artifact: result.artifactPath, manifest: result.manifestPath }, null, 2)}\n`,
    );
  } catch (error) {
    const code = error instanceof AssemblyError ? error.code : 'ASSEMBLY';
    process.stderr.write(`Template release assembly failed: ${code}\n`);
    process.exitCode = 1;
  }
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

if (isDirectExecution()) run();

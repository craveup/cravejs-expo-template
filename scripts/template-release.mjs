import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { createCliPayloadArchive } from './build-cli-payload.mjs';
import { readTemplateManifest } from './template-profile.mjs';

const POLICY_PATH = 'template/release/compatibility.json';
const RELEASE_SCHEMA_PATH = 'template/release/template-release.schema.json';
const TEMPLATE_MANIFEST_PATH = 'template/mobile-template.manifest.json';
const MAXIMUM_ARTIFACT_BYTES = 256 * 1024 * 1024;
const EXACT_SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

export const TEMPLATE_RELEASE_FIELDS = Object.freeze([
  'schemaVersion',
  'id',
  'repository',
  'platform',
  'profile',
  'templateRelease',
  'templateCommit',
  'templateIntegrity',
  'minimumCliVersion',
  'configSchemaVersion',
  'configSchemaSha256',
  'sdkPackage',
  'sdkVersion',
  'sdkIntegrity',
  'apiRelease',
  'openapiSha256',
  'templateManifestSha256',
  'packageManager',
  'generateCommand',
  'verifyCommand',
  'startCommand',
]);
const TEMPLATE_RELEASE_FIELD_SET = new Set(TEMPLATE_RELEASE_FIELDS);
const GENERATION_FIELDS = new Set([
  ...TEMPLATE_RELEASE_FIELDS,
  'generatedBy',
  'generatedAt',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, path, issues) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    issues.push(`${path} must contain exactly: ${wanted.join(', ')}.`);
    return false;
  }
  return true;
}

function parseJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Sri(bytes) {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

function validateHex(value, path, issues) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    issues.push(`${path} must be 64 lowercase hexadecimal characters.`);
  }
}

function validateSri(value, algorithm, byteLength, path, issues) {
  const prefix = `${algorithm}-`;
  if (typeof value !== 'string' || !value.startsWith(prefix)) {
    issues.push(`${path} must contain canonical ${algorithm} base64.`);
    return;
  }
  const encoded = value.slice(prefix.length);
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length !== byteLength || decoded.toString('base64') !== encoded) {
    issues.push(`${path} must contain canonical ${algorithm} base64.`);
  }
}

function readCanonicalTemplateManifest(templateRoot) {
  const path = resolve(templateRoot, TEMPLATE_MANIFEST_PATH);
  const result = readTemplateManifest(path, templateRoot);
  if (!result.ok) {
    throw new Error(
      result.issues.map(({ message, path: issuePath }) => `${issuePath}: ${message}`).join('\n'),
    );
  }
  return { manifest: result.manifest, path };
}

function currentGitRoot(templateRoot) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: templateRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const root = result.stdout.trim();
  if (!root) return null;
  try {
    return realpathSync.native(root) === realpathSync.native(templateRoot)
      ? realpathSync.native(root)
      : null;
  } catch {
    return null;
  }
}

function currentGitCommit(templateRoot) {
  if (!currentGitRoot(templateRoot)) return null;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: templateRoot,
    encoding: 'utf8',
  });
  const commit = result.stdout.trim();
  return result.status === 0 && /^[0-9a-f]{40}$/u.test(commit) ? commit : null;
}

export function createTemplateArchive({
  templateCommit,
  templateRelease,
  templateRoot = process.cwd(),
}) {
  if (!currentGitRoot(templateRoot)) {
    throw new Error('Template archive requires the exact Git repository root.');
  }
  if (!/^[0-9a-f]{40}$/u.test(templateCommit ?? '')) {
    throw new Error('Template archive requires an exact Git commit.');
  }
  if (!EXACT_SEMVER.test(templateRelease ?? '')) {
    throw new Error('Template archive requires an exact semantic release version.');
  }
  try {
    return createCliPayloadArchive({
      archivePrefix: `cravejs-expo-template-${templateRelease}/`,
      manifestPath: resolve(templateRoot, 'distribution/cli-payload.json'),
      repositoryRoot: templateRoot,
      treeish: templateCommit,
    }).artifact;
  } catch {
    throw new Error('Template archive could not be created from the exact Git commit.');
  }
}

export function computeCurrentTemplateArchiveIntegrity(
  templateRelease,
  templateRoot = process.cwd(),
) {
  const templateCommit = currentGitCommit(templateRoot);
  if (!templateCommit) throw new Error('Template release identity requires an exact Git commit.');
  return sha256Sri(createTemplateArchive({ templateCommit, templateRelease, templateRoot }));
}

function readArchiveCommit(artifact) {
  const result = spawnSync('git', ['get-tar-commit-id'], {
    encoding: 'utf8',
    input: artifact,
    maxBuffer: MAXIMUM_ARTIFACT_BYTES,
  });
  const commit = result.stdout?.trim();
  return result.status === 0 && /^[0-9a-f]{40}$/u.test(commit) ? commit : null;
}

export function readTemplateReleasePolicy(templateRoot = process.cwd()) {
  const policy = parseJson(resolve(templateRoot, POLICY_PATH), 'Template release policy');
  const issues = [];
  const policyIsRecord = exactKeys(
    policy,
    [
      'schemaVersion',
      'policyVersion',
      'identity',
      'template',
      'cli',
      'node',
      'sdk',
      'openapi',
      'configSchema',
      'packageManager',
      'commands',
      'upgrade',
    ],
    'Template release policy',
    issues,
  );
  if (!policyIsRecord) throw new Error(issues.join('\n'));
  exactKeys(policy.identity, ['id', 'repository', 'platform', 'profile'], 'identity', issues);
  exactKeys(policy.template, ['versioning', 'minimumVersion'], 'template', issues);
  exactKeys(policy.cli, ['minimumVersion'], 'cli', issues);
  exactKeys(policy.node, ['major'], 'node', issues);
  exactKeys(policy.sdk, ['package', 'version', 'integrity'], 'sdk', issues);
  exactKeys(policy.openapi, ['apiRelease', 'sha256'], 'openapi', issues);
  exactKeys(policy.configSchema, ['version', 'source'], 'configSchema', issues);
  exactKeys(policy.commands, ['generate', 'verify', 'start'], 'commands', issues);
  exactKeys(
    policy.upgrade,
    ['conflictStrategy', 'allowMutableSources', 'allowPrivateRepositories'],
    'upgrade',
    issues,
  );

  if (policy.schemaVersion !== 1) issues.push('schemaVersion must be exactly 1.');
  if (policy.policyVersion !== '1.0.0') issues.push('policyVersion must be exactly 1.0.0.');
  if (!EXACT_SEMVER.test(policy.template?.minimumVersion ?? '')) {
    issues.push('template.minimumVersion must be an exact semantic version.');
  }
  if (policy.template?.versioning !== 'semver-2.0.0') {
    issues.push('template.versioning must be exactly semver-2.0.0.');
  }
  if (policy.cli?.minimumVersion !== '2.0.0') {
    issues.push('cli.minimumVersion must be exactly 2.0.0.');
  }
  if (policy.node?.major !== 24) issues.push('node.major must be exactly 24.');
  if (policy.sdk?.package !== '@craveup/storefront-sdk') {
    issues.push('sdk.package must be exactly @craveup/storefront-sdk.');
  }
  if (policy.sdk?.version !== '2.0.1') issues.push('sdk.version must be exactly 2.0.1.');
  validateSri(policy.sdk?.integrity, 'sha512', 64, 'sdk.integrity', issues);
  if (!/^[0-9a-f]{40}$/u.test(policy.openapi?.apiRelease ?? '')) {
    issues.push('openapi.apiRelease must be an exact 40-character lowercase Git SHA.');
  }
  validateHex(policy.openapi?.sha256, 'openapi.sha256', issues);
  if (policy.configSchema?.version !== '1.0.0') {
    issues.push('configSchema.version must be exactly 1.0.0.');
  }
  if (
    policy.configSchema?.source !== 'scripts/template-profile.mjs' ||
    isAbsolute(policy.configSchema?.source ?? '')
  ) {
    issues.push('configSchema.source must be exactly scripts/template-profile.mjs.');
  }
  if (policy.packageManager !== 'npm') issues.push('packageManager must be exactly npm.');
  for (const [field, expected] of Object.entries({
    generate: 'npm run template:materialize',
    verify: 'npm run verify',
    start: 'npx expo start',
  })) {
    if (policy.commands?.[field] !== expected) {
      issues.push(`commands.${field} must be exactly ${expected}.`);
    }
  }
  if (
    policy.upgrade?.conflictStrategy !== 'stop' ||
    policy.upgrade?.allowMutableSources !== false ||
    policy.upgrade?.allowPrivateRepositories !== false
  ) {
    issues.push('upgrade policy must stop on conflicts and reject mutable or private sources.');
  }

  const packageManifest = parseJson(resolve(templateRoot, 'package.json'), 'Package manifest');
  const lockfile = parseJson(resolve(templateRoot, 'package-lock.json'), 'Package lockfile');
  if (packageManifest?.dependencies?.[policy.sdk?.package] !== policy.sdk?.version) {
    issues.push('Package manifest must exact-pin the release policy SDK.');
  }
  if (lockfile?.packages?.['']?.dependencies?.[policy.sdk?.package] !== policy.sdk?.version) {
    issues.push('Package lockfile must exact-pin the release policy SDK.');
  }
  const lockedSdk = lockfile?.packages?.[`node_modules/${policy.sdk?.package}`];
  if (lockedSdk?.version !== policy.sdk?.version) {
    issues.push('Package lockfile SDK version must match the release policy.');
  }
  if (lockedSdk?.integrity !== policy.sdk?.integrity) {
    issues.push('Package lockfile SDK integrity must match the release policy.');
  }
  if (
    lockedSdk?.resolved !==
    'https://registry.npmjs.org/@craveup/storefront-sdk/-/storefront-sdk-2.0.1.tgz'
  ) {
    issues.push('Package lockfile SDK must resolve from the published npm package.');
  }
  if (readFileSync(resolve(templateRoot, '.nvmrc'), 'utf8').trim() !== String(policy.node?.major)) {
    issues.push('Node version file must match the release policy major.');
  }
  if (!existsSync(resolve(templateRoot, policy.configSchema?.source ?? ''))) {
    issues.push('Config schema source must exist inside the template source.');
  }

  if (issues.length > 0) throw new Error(issues.join('\n'));
  return policy;
}

export function validateTemplateReleaseSchema(templateRoot = process.cwd()) {
  const policy = readTemplateReleasePolicy(templateRoot);
  const schema = parseJson(resolve(templateRoot, RELEASE_SCHEMA_PATH), 'Template release schema');
  const issues = [];
  exactKeys(
    schema,
    ['$schema', 'title', 'type', 'additionalProperties', 'required', 'properties'],
    'Template release schema',
    issues,
  );
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    issues.push('Template release schema must use JSON Schema draft 2020-12.');
  }
  if (schema.type !== 'object' || schema.additionalProperties !== false) {
    issues.push('Template release schema must be a closed object.');
  }
  if (
    !Array.isArray(schema.required) ||
    [...schema.required].sort().join('\0') !== [...TEMPLATE_RELEASE_FIELDS].sort().join('\0')
  ) {
    issues.push('Template release schema required fields must match the release interface.');
  }
  if (
    !isRecord(schema.properties) ||
    Object.keys(schema.properties).sort().join('\0') !== [...TEMPLATE_RELEASE_FIELDS].sort().join('\0')
  ) {
    issues.push('Template release schema properties must match the release interface.');
  }
  const expectedConstants = {
    schemaVersion: 1,
    ...policy.identity,
    minimumCliVersion: policy.cli.minimumVersion,
    configSchemaVersion: policy.configSchema.version,
    sdkPackage: policy.sdk.package,
    sdkVersion: policy.sdk.version,
    packageManager: policy.packageManager,
    generateCommand: policy.commands.generate,
    verifyCommand: policy.commands.verify,
    startCommand: policy.commands.start,
  };
  for (const [field, expected] of Object.entries(expectedConstants)) {
    if (schema.properties?.[field]?.const !== expected) {
      issues.push(`Template release schema ${field} constant must match compatibility policy.`);
    }
  }
  if (issues.length > 0) throw new Error(issues.join('\n'));
  return schema;
}

export function createTemplateReleaseManifest({
  configSchemaSource,
  templateIntegrity,
  templateManifestSource,
  templateRoot = process.cwd(),
} = {}) {
  const policy = readTemplateReleasePolicy(templateRoot);
  validateTemplateReleaseSchema(templateRoot);
  const { manifest, path: templateManifestPath } = readCanonicalTemplateManifest(templateRoot);
  const templateCommit = currentGitCommit(templateRoot);
  if (!templateCommit) throw new Error('Template release identity requires an exact Git commit.');
  const integrityIssues = [];
  validateSri(templateIntegrity, 'sha256', 32, 'templateIntegrity', integrityIssues);
  if (integrityIssues.length > 0) throw new Error(integrityIssues.join('\n'));
  return {
    schemaVersion: 1,
    ...policy.identity,
    templateRelease: manifest.templateRelease,
    templateCommit,
    templateIntegrity,
    minimumCliVersion: policy.cli.minimumVersion,
    configSchemaVersion: policy.configSchema.version,
    configSchemaSha256: sha256Hex(
      configSchemaSource ?? readFileSync(resolve(templateRoot, policy.configSchema.source)),
    ),
    sdkPackage: policy.sdk.package,
    sdkVersion: policy.sdk.version,
    sdkIntegrity: policy.sdk.integrity,
    apiRelease: policy.openapi.apiRelease,
    openapiSha256: policy.openapi.sha256,
    templateManifestSha256: sha256Hex(
      templateManifestSource ?? readFileSync(templateManifestPath),
    ),
    packageManager: policy.packageManager,
    generateCommand: policy.commands.generate,
    verifyCommand: policy.commands.verify,
    startCommand: policy.commands.start,
  };
}

export function validateTemplateReleaseManifest(
  release,
  templateRoot = process.cwd(),
  { artifact, configSchemaSource, templateManifestSource } = {},
) {
  const policy = readTemplateReleasePolicy(templateRoot);
  validateTemplateReleaseSchema(templateRoot);
  const issues = [];
  if (!isRecord(release)) throw new Error('Template release metadata must be an object.');
  for (const field of Object.keys(release)) {
    if (!TEMPLATE_RELEASE_FIELD_SET.has(field)) {
      issues.push(`Unknown template release field: ${field}.`);
    }
  }
  for (const field of TEMPLATE_RELEASE_FIELDS) {
    if (!Object.hasOwn(release, field)) issues.push(`Missing template release field: ${field}.`);
  }
  const expected = {
    schemaVersion: 1,
    ...policy.identity,
    minimumCliVersion: policy.cli.minimumVersion,
    configSchemaVersion: policy.configSchema.version,
    sdkPackage: policy.sdk.package,
    sdkVersion: policy.sdk.version,
    sdkIntegrity: policy.sdk.integrity,
    apiRelease: policy.openapi.apiRelease,
    openapiSha256: policy.openapi.sha256,
    packageManager: policy.packageManager,
    generateCommand: policy.commands.generate,
    verifyCommand: policy.commands.verify,
    startCommand: policy.commands.start,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (release[field] !== value) issues.push(`${field} must be exactly ${value}.`);
  }

  const { manifest, path: templateManifestPath } = readCanonicalTemplateManifest(templateRoot);
  if (!EXACT_SEMVER.test(release.templateRelease ?? '')) {
    issues.push('templateRelease must be an exact semantic version.');
  }
  if (release.templateRelease !== manifest.templateRelease) {
    issues.push(`templateRelease must be exactly ${manifest.templateRelease}.`);
  }
  if (!/^[0-9a-f]{40}$/u.test(release.templateCommit ?? '')) {
    issues.push('templateCommit must be an exact 40-character lowercase Git SHA.');
  }
  const gitCommit = currentGitCommit(templateRoot);
  if (gitCommit && release.templateCommit !== gitCommit) {
    issues.push('templateCommit does not match the template source commit.');
  }
  validateSri(release.templateIntegrity, 'sha256', 32, 'templateIntegrity', issues);
  if (artifact) {
    if (release.templateIntegrity !== sha256Sri(artifact)) {
      issues.push('templateIntegrity does not match the exact release archive.');
    }
    const archiveCommit = readArchiveCommit(artifact);
    if (!archiveCommit || release.templateCommit !== archiveCommit) {
      issues.push('templateCommit does not match the exact release archive.');
    }
  }
  validateSri(release.sdkIntegrity, 'sha512', 64, 'sdkIntegrity', issues);
  for (const field of ['configSchemaSha256', 'openapiSha256', 'templateManifestSha256']) {
    validateHex(release[field], field, issues);
  }
  const expectedConfigSchemaDigest = sha256Hex(
    configSchemaSource ?? readFileSync(resolve(templateRoot, policy.configSchema.source)),
  );
  if (release.configSchemaSha256 !== expectedConfigSchemaDigest) {
    issues.push('configSchemaSha256 does not match the canonical template validator.');
  }
  if (
    release.templateManifestSha256 !==
    sha256Hex(templateManifestSource ?? readFileSync(templateManifestPath))
  ) {
    issues.push('templateManifestSha256 does not match the canonical template manifest.');
  }
  if (issues.length > 0) throw new Error(issues.join('\n'));
  return release;
}

export function createGenerationReleaseMetadata(release, { generatedAt, generatedBy }) {
  return { ...release, generatedBy, generatedAt };
}

export function validateGenerationReleaseMetadata(release, templateRoot = process.cwd()) {
  if (!isRecord(release)) throw new Error('Release metadata must be an object.');
  const issues = [];
  for (const field of Object.keys(release)) {
    if (!GENERATION_FIELDS.has(field)) issues.push(`Unknown release metadata field: ${field}.`);
  }
  const immutableRelease = Object.fromEntries(
    TEMPLATE_RELEASE_FIELDS.filter((field) => Object.hasOwn(release, field)).map((field) => [
      field,
      release[field],
    ]),
  );
  try {
    validateTemplateReleaseManifest(immutableRelease, templateRoot);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (
    !/^@craveup\/cli@(?:2\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|(?:[3-9]|[1-9]\d+)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/u.test(
      release.generatedBy ?? '',
    )
  ) {
    issues.push('generatedBy must identify an exact supported @craveup/cli version.');
  }
  const parsedGeneratedAt = Date.parse(release.generatedAt ?? '');
  if (
    !Number.isFinite(parsedGeneratedAt) ||
    new Date(parsedGeneratedAt).toISOString() !== release.generatedAt
  ) {
    issues.push('generatedAt must be a canonical RFC 3339 UTC timestamp.');
  }
  if (issues.length > 0) throw new Error(issues.join('\n'));
  return release;
}

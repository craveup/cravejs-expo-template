import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readTemplateReleasePolicy,
  validateTemplateReleaseManifest,
  validateTemplateReleaseSchema,
} from './template-release.mjs';

const MAXIMUM_ARTIFACT_BYTES = 256 * 1024 * 1024;

function parseArguments(args) {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (normalized.length === 0) return {};
  if (normalized.length === 4) {
    const options = new Map();
    for (let index = 0; index < normalized.length; index += 2) {
      const flag = normalized[index];
      const value = normalized[index + 1];
      if (!['--artifact', '--manifest'].includes(flag) || !value || options.has(flag)) {
        throw new Error('USAGE');
      }
      options.set(flag, value);
    }
    if (options.has('--artifact') && options.has('--manifest')) {
      return {
        artifactPath: options.get('--artifact'),
        manifestPath: options.get('--manifest'),
      };
    }
  }
  throw new Error('USAGE');
}

function readArchiveMember(artifactPath, memberPath) {
  return execFileSync('tar', ['-xOf', artifactPath, memberPath], {
    maxBuffer: MAXIMUM_ARTIFACT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function validateTemplateRelease(options = {}, templateRoot = process.cwd()) {
  readTemplateReleasePolicy(templateRoot);
  validateTemplateReleaseSchema(templateRoot);
  if (options.manifestPath && options.artifactPath) {
    const manifest = JSON.parse(readFileSync(resolve(options.manifestPath), 'utf8'));
    const artifactPath = resolve(options.artifactPath);
    const artifact = readFileSync(artifactPath);
    const prefix = `cravejs-expo-template-${manifest.templateRelease}/`;
    validateTemplateReleaseManifest(manifest, templateRoot, {
      artifact,
      configSchemaSource: readArchiveMember(
        artifactPath,
        `${prefix}scripts/template-profile.mjs`,
      ),
      templateManifestSource: readArchiveMember(
        artifactPath,
        `${prefix}template/mobile-template.manifest.json`,
      ),
    });
  }
}

function run() {
  try {
    validateTemplateRelease(parseArguments(process.argv.slice(2)));
    process.stdout.write('Expo template release contract is valid.\n');
  } catch (error) {
    process.stderr.write(
      `Expo template release contract is invalid: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

function isDirectExecution() {
  if (typeof process.argv[1] !== 'string') return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) run();

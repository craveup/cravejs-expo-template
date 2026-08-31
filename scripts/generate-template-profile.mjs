import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTemplateManifest, renderTemplateFiles } from './template-profile.mjs';

function parseArguments(args) {
  const options = { dryRun: false, manifest: undefined, output: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--manifest' || argument === '--output') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.manifest) throw new Error('--manifest is required.');
  if (!options.output) throw new Error('--output is required.');
  return options;
}

export function inspectTemplateGeneration(manifest, outputDirectory) {
  const renderedFiles = renderTemplateFiles(manifest);
  return {
    files: manifest.generatedFiles.map((relativePath) => {
      const content = renderedFiles.get(relativePath);
      if (content === undefined) {
        throw new Error(`No renderer exists for generated file ${relativePath}.`);
      }
      const outputPath = resolve(outputDirectory, relativePath);
      let action = 'create';
      if (existsSync(outputPath)) {
        action = readFileSync(outputPath, 'utf8').replaceAll('\r\n', '\n') === content ? 'unchanged' : 'conflict';
      }
      return { action, path: relativePath };
    }),
    schemaVersion: manifest.schemaVersion,
    templateRelease: manifest.templateRelease,
  };
}

export function generateTemplateProfile({ assetRoot = process.cwd(), dryRun = false, manifestPath, outputDirectory }) {
  const result = readTemplateManifest(manifestPath, assetRoot);
  if (!result.ok) {
    const error = new Error(result.issues.map(({ message, path }) => `${path}: ${message}`).join('\n'));
    error.issues = result.issues;
    throw error;
  }

  const plan = inspectTemplateGeneration(result.manifest, outputDirectory);
  if (plan.files.some(({ action }) => action === 'conflict')) {
    const error = new Error('Generation stopped because a generator-owned file contains user edits.');
    error.plan = plan;
    throw error;
  }

  if (!dryRun) {
    const renderedFiles = renderTemplateFiles(result.manifest);
    for (const file of plan.files) {
      if (file.action !== 'create') continue;
      const outputPath = resolve(outputDirectory, file.path);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, renderedFiles.get(file.path), { encoding: 'utf8', flag: 'wx' });
    }
  }
  return plan;
}

export function runTemplateGenerator(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const plan = generateTemplateProfile({
    dryRun: options.dryRun,
    manifestPath: resolve(options.manifest),
    outputDirectory: resolve(options.output),
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
    runTemplateGenerator();
  } catch (error) {
    if (error && typeof error === 'object' && 'plan' in error) {
      process.stdout.write(`${JSON.stringify(error.plan, null, 2)}\n`);
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

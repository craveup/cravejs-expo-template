import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const rootFile = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('only Figma design commands load the dedicated local env file', async () => {
  const packageJson = JSON.parse(await rootFile('package.json')) as {
    scripts: Record<string, string>;
  };
  const figmaScripts = [
    'design:check',
    'design:snapshot',
    'design:assets',
    'design:assets:check',
  ];

  for (const name of figmaScripts) {
    assert.match(
      packageJson.scripts[name] ?? '',
      /^node --env-file-if-exists=\.env\.figma\.local /,
      `${name} must load only the dedicated Figma env file`,
    );
  }

  for (const [name, command] of Object.entries(packageJson.scripts)) {
    if (!figmaScripts.includes(name)) {
      assert.doesNotMatch(command, /\.env\.figma\.local/, `${name} must not load the Figma env file`);
    }
  }
});

test('the empty example is tracked while the local secret stays ignored', async () => {
  const [gitignore, example] = await Promise.all([
    rootFile('.gitignore'),
    rootFile('.env.figma.example'),
  ]);

  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.figma\.example$/m);
  assert.match(example, /^FIGMA_TOKEN=$/m);
  assert.doesNotMatch(example, /figd_[A-Za-z0-9_-]+/);
});

test('Expo configuration never references the Figma secret file', async () => {
  const appConfig = await rootFile('app.config.ts');
  assert.doesNotMatch(appConfig, /FIGMA_TOKEN|\.env\.figma\.local/);
});

test('tracked setup files contain no Figma token-shaped values', async () => {
  const setupFiles = await Promise.all([
    rootFile('README.md'),
    rootFile('.env.example'),
    rootFile('.env.figma.example'),
    rootFile('docs/DEVELOPMENT-WORKFLOW.md'),
    rootFile('docs/superpowers/plans/2026-08-08-local-figma-token.md'),
  ]);

  assert.doesNotMatch(setupFiles.join('\n'), /figd_[A-Za-z0-9_-]+/);
});

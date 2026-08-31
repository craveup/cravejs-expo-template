import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const expectedNode24ActionPins = new Map([
  ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/setup-node', '820762786026740c76f36085b0efc47a31fe5020'],
]);

function assertCurrentNode24ActionPins(workflows: readonly string[]): void {
  const observedActions = new Set<string>();

  for (const workflow of workflows) {
    for (const match of workflow.matchAll(
      /uses:\s+(actions\/(?:checkout|setup-node))@([^\s#]*)/gu,
    )) {
      const [, action, pin] = match;

      observedActions.add(action!);
      assert.equal(
        pin,
        expectedNode24ActionPins.get(action!),
        `${action} must use its reviewed Node 24 pin`,
      );
    }
  }

  assert.deepEqual(observedActions, new Set(expectedNode24ActionPins.keys()));
}

test('GitHub workflows pin every checkout and Node setup to reviewed Node 24 SHAs', () => {
  const workflowDirectory = resolve(root, '.github/workflows');
  const workflows = readdirSync(workflowDirectory)
    .filter((file) => /\.ya?ml$/u.test(file))
    .map((file) => readFileSync(resolve(workflowDirectory, file), 'utf8'));

  assertCurrentNode24ActionPins(workflows);
});

test('release exports validate the capability-aware public runtime profile first', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const release = readFileSync(
    resolve(root, '.github/workflows/release.yml'),
    'utf8',
  );
  const validator = readFileSync(
    resolve(root, 'scripts/check-public-environment.mjs'),
    'utf8',
  );
  const validationStep = release.indexOf('run: npm run public-env:check');
  const firstExport = release.indexOf('run: npx expo export');

  assert.equal(
    manifest.scripts['public-env:check'],
    'node --env-file-if-exists=.env scripts/check-public-environment.mjs',
  );
  assert.notEqual(validationStep, -1);
  assert.equal(validationStep < firstExport, true);
  assert.match(validator, /readStorefrontRuntimeProfile\s*\(\s*\)/);
  assert.doesNotMatch(validator, /readPublicEnvironment\s*\(\s*\)/);
});

test('release acceptance clean-installs and exports both generated brands', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const release = readFileSync(
    resolve(root, '.github/workflows/release.yml'),
    'utf8',
  );
  const acceptance = readFileSync(
    resolve(root, 'scripts/check-template-residue.mjs'),
    'utf8',
  );

  assert.equal(
    manifest.scripts['template:acceptance'],
    'node scripts/check-template-residue.mjs --acceptance',
  );
  assert.match(release, /run: npm run template:acceptance/);
  assert.match(acceptance, /\['ci', '--no-audit', '--no-fund'\]/);
  assert.match(
    acceptance,
    /GENERATED_EXPORT_PLATFORMS = \['ios', 'android', 'web'\]/,
  );
  assert.match(acceptance, /'expo',[\s\S]{0,120}'export',[\s\S]{0,120}'--platform'/);
});

test('release workflow assembles an unsigned immutable template candidate', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const release = readFileSync(
    resolve(root, '.github/workflows/release.yml'),
    'utf8',
  );
  const verifyStep = release.indexOf('run: npm run verify');
  const candidateStep = release.indexOf(
    'run: npm run template:release:candidate -- --output "$RUNNER_TEMP/template-release"',
  );
  const acceptanceStep = release.indexOf('run: npm run template:acceptance');

  assert.equal(
    manifest.scripts['template:release:candidate'],
    'node scripts/assemble-template-release.mjs',
  );
  assert.equal(verifyStep < candidateStep && candidateStep < acceptanceStep, true);
  assert.doesNotMatch(release, /gh release|git tag|git push/u);
});

test('public config validation loads local .env without overriding explicit values', () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'public-config-check-'));
  try {
    writeFileSync(
      join(workingDirectory, '.env'),
      [
        'EXPO_PUBLIC_CRAVEUP_API_URL=https://api.example.com',
        'EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG=env-file-merchant',
        'EXPO_PUBLIC_CRAVEUP_LOCATION_ID=0123456789abcdef01234567',
        'EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN=https://checkout.example.com',
      ].join('\n'),
    );
    const result = spawnSync(
      process.execPath,
      [
        '--env-file-if-exists=.env',
        resolve(root, 'scripts/check-public-environment.mjs'),
      ],
      {
        cwd: workingDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: 'explicit-merchant',
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).merchantSlug, 'explicit-merchant');
  } finally {
    rmSync(workingDirectory, { force: true, recursive: true });
  }
});

test('workflow pin checks reject a tagged duplicate reference', () => {
  const validReferences = [...expectedNode24ActionPins]
    .map(([action, pin]) => `uses: ${action}@${pin}`)
    .join('\n');

  assert.throws(
    () =>
      assertCurrentNode24ActionPins([
        `${validReferences}\nuses: actions/checkout@v7`,
      ]),
    /actions\/checkout must use its reviewed Node 24 pin/u,
  );
});

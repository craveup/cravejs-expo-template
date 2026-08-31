import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(root, 'src');

function getSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) return getSourceFiles(path);
    if (!['.ts', '.tsx'].includes(extname(entry.name))) return [];

    return [path];
  });
}

function productionSources(): { path: string; source: string }[] {
  return getSourceFiles(sourceRoot)
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .map((path) => ({
      path: relative(root, path).replaceAll('\\', '/'),
      source: readFileSync(path, 'utf8'),
    }));
}

function hasRuntimeStorefrontSdkImport(source: string): boolean {
  if (
    /(?:import|require)\s*\(\s*['"]@craveup\/storefront-sdk['"]\s*\)/.test(
      source,
    )
  ) {
    return true;
  }

  for (const match of source.matchAll(
    /from\s+['"]@craveup\/storefront-sdk['"]/g,
  )) {
    const importStart = source.lastIndexOf('import', match.index);
    const statement = source.slice(importStart, match.index);

    if (!/^import\s+type\b/.test(statement.trimStart())) return true;
  }

  return false;
}

function hasFixtureBackedImport(source: string): boolean {
  return /(?:from\s+|(?:import|require)\s*\(\s*)['"][^'"]*fixtures\//.test(
    source,
  );
}

test('production uses one Storefront SDK client boundary and no direct request path', () => {
  const violations = productionSources().flatMap(({ path, source }) => {
    const reasons: string[] = [];

    if (
      hasRuntimeStorefrontSdkImport(source) &&
      path !== 'src/lib/storefront.ts'
    ) {
      reasons.push('runtime SDK import outside the shared client');
    }
    if (/\bfetch\s*\(/.test(source)) reasons.push('direct fetch');
    if (
      /\bcreateStorefrontClient\s*\(/.test(source) &&
      path !== 'src/lib/storefront.ts'
    ) {
      reasons.push('Storefront client construction outside the shared client');
    }

    return reasons.map((reason) => `${path}: ${reason}`);
  });

  assert.deepEqual(violations, []);

  const storefrontSource = productionSources().find(
    ({ path }) => path === 'src/lib/storefront.ts',
  )?.source;

  assert.ok(storefrontSource);
  assert.equal(
    storefrontSource.match(/\bcreateStorefrontClient\s*\(/g)?.length,
    1,
  );
});

test('SDK guard covers static, dynamic, and CommonJS runtime imports', () => {
  for (const source of [
    "import { createStorefrontClient } from '@craveup/storefront-sdk';",
    "const sdk = await import('@craveup/storefront-sdk');",
    "const sdk = require('@craveup/storefront-sdk');",
  ]) {
    assert.equal(hasRuntimeStorefrontSdkImport(source), true);
  }

  assert.equal(
    hasRuntimeStorefrontSdkImport(
      "import type { Product } from '@craveup/storefront-sdk';",
    ),
    false,
  );
});

test('production routes cannot import fixture-backed success data', () => {
  const violations = productionSources()
    .filter(({ path }) => path.startsWith('src/app/'))
    .filter(({ source }) => hasFixtureBackedImport(source))
    .map(({ path }) => path);

  assert.deepEqual(violations, []);
});

test('native persistence imports stay inside their single production adapters', () => {
  const violations = productionSources().flatMap(({ path, source }) => {
    const reasons: string[] = [];

    if (
      source.includes("from 'expo-secure-store'") &&
      path !== 'src/lib/expo-secure-storefront-session.ts'
    ) {
      reasons.push('SecureStore import outside native secret adapter');
    }
    if (
      source.includes("from '@react-native-async-storage/async-storage'") &&
      path !== 'src/lib/async-local-state-store.ts'
    ) {
      reasons.push('AsyncStorage import outside native local-state adapter');
    }

    return reasons.map((reason) => `${path}: ${reason}`);
  });

  assert.deepEqual(violations, []);
});

test('route fixture guard covers multiline, dynamic, and CommonJS imports', () => {
  for (const source of [
    "import { fixture } from '../fixtures/storefront-fixtures.ts';",
    "const fixture = await import(\n  '@/fixtures/storefront-fixtures.ts'\n);",
    "const fixture = require('@/fixtures/storefront-fixtures.ts');",
  ]) {
    assert.equal(hasFixtureBackedImport(source), true);
  }
});

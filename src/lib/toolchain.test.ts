/**
 * Toolchain regression test.
 *
 * Getting a TypeScript unit test to be green under lint, `tsc --noEmit` AND `node --test` at the
 * same time takes three settings that are easy to lose:
 *
 *   - `types: ["node"]` in tsconfig, or `node:test` fails typecheck with TS2591 even though
 *     @types/node is installed
 *   - `allowImportingTsExtensions: true`, or the explicit `.ts` specifier fails with TS5097
 *   - the explicit `.ts` specifier itself, because Node's native type stripping will not resolve
 *     a bare `./toolchain-fixture`, and it does not read tsconfig `paths` (so `@/lib/...` fails too)
 *
 * If someone removes one of them, this test fails immediately rather than every future test author
 * rediscovering the same three-way constraint. Keep it until there are enough real tests that a
 * regression here would be obvious anyway.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeRule } from './toolchain-fixture.ts';

test('a relative .ts import resolves under node --test', () => {
  assert.equal(describeRule({ min: 1, max: 1 }), 'choose 1');
});

test('type annotations are stripped, not executed', () => {
  assert.equal(describeRule({ min: 0, max: 3 }), 'choose up to 3');
  assert.equal(describeRule({ min: 2, max: 4 }), 'choose 2 to 4');
});

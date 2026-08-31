/**
 * Fixture for `toolchain.test.ts`. Deliberately pure: no React, no React Native, no network.
 *
 * That is not incidental — Node's test runner cannot import React Native, so "is this module
 * testable?" is the same question as "is this module on the right side of the architecture
 * boundary?" Domain logic that cannot be tested here is in the wrong file.
 */

export type ModifierRule = {
  /** Minimum selections the group requires. 0 means optional. */
  min: number;
  /** Maximum selections the group allows. */
  max: number;
};

/** Renders a modifier group's rule as the instruction copy shown under its heading. */
export function describeRule(rule: ModifierRule): string {
  if (rule.min === rule.max) return `choose ${rule.min}`;
  if (rule.min === 0) return `choose up to ${rule.max}`;
  return `choose ${rule.min} to ${rule.max}`;
}

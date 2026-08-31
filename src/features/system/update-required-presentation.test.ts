import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const featureRoot = new URL('./', import.meta.url);
const presentationPath = new URL('./UpdateRequiredPresentation.tsx', featureRoot);
const statePath = new URL('./update-required.ts', featureRoot);

const read = (url: URL) => readFileSync(url, 'utf8');

test('update-required presentation exposes only controlled safe inputs', () => {
  assert.equal(existsSync(presentationPath), true, 'missing controlled presentation');
  assert.equal(existsSync(statePath), true, 'missing controlled view-state contract');
  if (!existsSync(presentationPath) || !existsSync(statePath)) return;

  const presentation = read(presentationPath);
  const state = read(statePath);

  assert.match(state, /export type UpdateRequiredViewState/);
  assert.match(state, /openingStore: boolean/);
  assert.match(state, /requiredVersionLabel\?: string/);
  assert.match(presentation, /export type UpdateRequiredPresentationProps/);
  assert.match(presentation, /onUpdate: \(\) => void/);
  assert.match(presentation, /state: UpdateRequiredViewState/);
  assert.match(presentation, /state\.requiredVersionLabel \?/);
  assert.match(presentation, /loading=\{state\.openingStore\}/);
});

test('update-required presentation stays route-free and contains no release authority', () => {
  assert.equal(existsSync(presentationPath), true, 'missing controlled presentation');
  if (!existsSync(presentationPath)) return;

  const productionSources = [
    presentationPath,
    statePath,
    new URL('../_shared/PresentationIcon.tsx', featureRoot),
    new URL('../../i18n/localization.ts', featureRoot),
  ].map(read).join('\n');

  assert.doesNotMatch(
    productionSources,
    /@craveup\/storefront-sdk|SecureStore|expo-router|expo-updates|process\.env|\bfetch\s*\(|https?:\/\//,
  );
  assert.doesNotMatch(productionSources, /2\.4\.1|keep your points/i);
  assert.doesNotMatch(productionSources, /minimumBuild|versionCode|buildNumber|runtimeVersion/);
  assert.match(productionSources, /system\.updateRequired\.title/);
  assert.match(productionSources, /name="arrowUp"/);
  assert.match(productionSources, /background="ink"/);
});

test('synthetic version evidence remains isolated to the test fixture', () => {
  const placeholderState = {
    openingStore: false,
    requiredVersionLabel: '2.4.1',
  } as const;

  assert.deepEqual(placeholderState, {
    openingStore: false,
    requiredVersionLabel: '2.4.1',
  });
  assert.doesNotMatch(read(presentationPath), /2\.4\.1/);
  assert.doesNotMatch(read(statePath), /2\.4\.1/);
});

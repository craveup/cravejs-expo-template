import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const baseline = JSON.parse(
  readFileSync(
    new URL('../../../design/figma-baseline.json', import.meta.url),
    'utf8',
  ),
) as {
  sections: Record<
    string,
    { hash: string; tree: Record<string, { box?: number[] }> }
  >;
};

const tracked = JSON.parse(
  readFileSync(
    new URL('../../../design/tracked-nodes.json', import.meta.url),
    'utf8',
  ),
) as {
  nodes: {
    code: string;
    coverageStatus: string;
    implementedIn: string | null;
    route: string | null;
  }[];
};

const expected = [
  [
    '2C',
    '19:72',
    'd1c947ae973a',
    'src/app/(tabs)/(home)/locations/index.tsx',
    '/locations',
  ],
  [
    '4F',
    '34:289',
    '9921795858fd',
    'src/app/(tabs)/(home)/locations/[locationId].tsx',
    '/locations/[locationId]',
  ],
  [
    '5C',
    '36:498',
    '90cf86bf1955',
    'src/app/(tabs)/(home)/locations/index.tsx',
    '/locations',
  ],
] as const;

test('location directory closure is tied to exact 390 by 844 Figma sections', () => {
  for (const [code, nodeId, hash, implementedIn, route] of expected) {
    const section = baseline.sections[nodeId];
    assert.ok(section);
    assert.equal(section.hash, hash);
    assert.deepEqual(section.tree[nodeId]?.box?.slice(2), [390, 844]);

    const screen = tracked.nodes.find((node) => node.code === code);
    assert.deepEqual(
      screen && {
        coverageStatus: screen.coverageStatus,
        implementedIn: screen.implementedIn,
        route: screen.route,
      },
      { coverageStatus: 'rendered', implementedIn, route },
    );
  }
});

test('controlled comparison records truthful reductions and responsive boundaries', () => {
  const evidence = readFileSync(
    new URL(
      '../../../design/visual-evidence/location-directory-v1.md',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(evidence, /2C `19:72`[\s\S]*frame `390×844`/);
  assert.match(evidence, /4F `34:289`[\s\S]*frame `390×844`/);
  assert.match(evidence, /5C `36:498`[\s\S]*frame `390×844`/);
  assert.match(evidence, /Unknown or failed distance enrichment[\s\S]*cannot trigger 5C/);
  assert.match(evidence, /matching iOS or Android restricted key/);
  assert.match(evidence, /no component hardcodes the 390 px reference width/);
  assert.doesNotMatch(evidence, /visual comparison (?:is|was) unavailable/i);
});

test('committed location routes contain no fixture, threshold, or direct transport path', () => {
  const pickerRoute = readFileSync(
    new URL('../../app/(tabs)/(home)/locations/index.tsx', import.meta.url),
    'utf8',
  );
  const detailRoute = readFileSync(
    new URL('../../app/(tabs)/(home)/locations/[locationId].tsx', import.meta.url),
    'utf8',
  );
  const locationLayout = readFileSync(
    new URL('../../app/(tabs)/(home)/locations/_layout.tsx', import.meta.url),
    'utf8',
  );
  const homeLayout = readFileSync(
    new URL('../../app/(tabs)/(home)/_layout.tsx', import.meta.url),
    'utf8',
  );
  const combined = `${pickerRoute}\n${detailRoute}`;

  assert.doesNotMatch(
    combined,
    /storefront-fixtures|__location-preview|nearbyThreshold|distanceThreshold|haversine|\bfetch\s*\(|console\./i,
  );
  assert.match(pickerRoute, /useMerchantLocationHeader/);
  assert.match(detailRoute, /useMerchantLocationHeader/);
  assert.match(locationLayout, /anchor: 'index'/);
  assert.match(homeLayout, /anchor: 'index'/);
  assert.match(homeLayout, /name="locations"[\s\S]{0,120}presentation: 'modal'/);
});

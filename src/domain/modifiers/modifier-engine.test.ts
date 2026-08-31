import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Modifier,
  Product,
  SelectedModifierTypes,
} from '@craveup/storefront-sdk';

import { buildModifierSelectionPayload, validateModifierSelections } from './index.ts';

function modifier(overrides: Partial<Modifier> = {}): Modifier {
  return {
    id: 'milk',
    name: 'Milk',
    rule: { min: 0, max: 2 },
    items: [
      { id: 'whole', name: 'Whole', price: '0.00', maxQuantity: 2 },
      { id: 'oat', name: 'Oat', price: '0.50', maxQuantity: 2 },
    ],
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Fixture Product',
    description: 'Product',
    availability: 'AVAILABLE',
    images: [],
    locationId: '0123456789abcdef01234567',
    price: '5.00',
    displayPrice: '$5.00',
    currency: 'USD' as Product['currency'],
    modifierIds: ['milk'],
    modifiers: [modifier()],
    ...overrides,
  };
}

function selection(
  groupId: string,
  options: SelectedModifierTypes['selectedOptions'],
): SelectedModifierTypes {
  return { groupId, selectedOptions: options };
}

function issueCodes(result: ReturnType<typeof validateModifierSelections>): string[] {
  return result.valid ? [] : result.issues.map((issue) => issue.code);
}

test('accepts products without modifiers and omits empty optional groups', () => {
  assert.deepEqual(validateModifierSelections(product({ modifierIds: [], modifiers: [] }), []), {
    valid: true,
    selections: [],
  });
  assert.deepEqual(buildModifierSelectionPayload(product(), [selection('milk', [])]), {
    ok: true,
    payload: [],
  });
});

test('counts summed quantities at exact group boundaries', () => {
  const requiredProduct = product({
    modifiers: [modifier({ rule: { min: 2, max: 3 } })],
  });

  assert.equal(
    validateModifierSelections(requiredProduct, [
      selection('milk', [{ optionId: 'whole', quantity: 2 }]),
    ]).valid,
    true,
  );
  assert.deepEqual(
    issueCodes(
      validateModifierSelections(requiredProduct, [
        selection('milk', [{ optionId: 'whole', quantity: 1 }]),
      ]),
    ),
    ['MIN_SELECTIONS_NOT_MET'],
  );
  assert.deepEqual(
    issueCodes(
      validateModifierSelections(requiredProduct, [
        selection('milk', [
          { optionId: 'whole', quantity: 2 },
          { optionId: 'oat', quantity: 2 },
        ]),
      ]),
    ),
    ['MAX_SELECTIONS_EXCEEDED'],
  );
});

test('rejects invalid and over-limit option quantities', () => {
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(
      issueCodes(
        validateModifierSelections(product(), [
          selection('milk', [{ optionId: 'whole', quantity }]),
        ]),
      ).includes('INVALID_OPTION_QUANTITY'),
    );
  }

  assert.deepEqual(
    issueCodes(
      validateModifierSelections(product(), [
        selection('milk', [{ optionId: 'whole', quantity: 3 }]),
      ]),
    ),
    ['OPTION_QUANTITY_EXCEEDED', 'MAX_SELECTIONS_EXCEEDED'],
  );
});

test('fails closed for unavailable products and options', () => {
  assert.deepEqual(
    issueCodes(validateModifierSelections(product({ availability: 'SOLD_OUT' }), [])),
    ['PRODUCT_UNAVAILABLE'],
  );
  assert.deepEqual(
    issueCodes(validateModifierSelections(product({ availability: 'coming_soon' }), [])),
    ['PRODUCT_UNAVAILABLE'],
  );

  const unavailableOptionProduct = product({
    modifiers: [
      modifier({
        items: [
          { id: 'zero', name: 'Zero', price: '0.00', maxQuantity: 0 },
          { id: 'invalid', name: 'Invalid', price: '0.00', maxQuantity: 1.5 },
        ],
      }),
    ],
  });
  const result = validateModifierSelections(unavailableOptionProduct, [
    selection('milk', [
      { optionId: 'zero', quantity: 1 },
      { optionId: 'invalid', quantity: 1 },
    ]),
  ]);

  assert.deepEqual(issueCodes(result), ['OPTION_UNAVAILABLE', 'OPTION_UNAVAILABLE']);
  if (!result.valid) {
    assert.deepEqual(
      result.issues.map((issue) =>
        issue.code === 'OPTION_UNAVAILABLE' ? issue.reason : undefined,
      ),
      ['non_positive_limit', 'invalid_limit'],
    );
  }
});

test('rejects unknown and duplicate groups and options', () => {
  const duplicateCatalogGroup = modifier();
  const duplicateCatalogOption = modifier({
    id: 'toppings',
    items: [
      { id: 'boba', name: 'Boba', price: '0.50', maxQuantity: 1 },
      { id: 'boba', name: 'Boba again', price: '0.50', maxQuantity: 1 },
    ],
  });
  const result = validateModifierSelections(
    product({
      modifierIds: ['milk', 'toppings'],
      modifiers: [duplicateCatalogGroup, duplicateCatalogGroup, duplicateCatalogOption],
    }),
    [
      selection('milk', [
        { optionId: 'whole', quantity: 1 },
        { optionId: 'whole', quantity: 1 },
        { optionId: 'missing', quantity: 1 },
      ]),
      selection('milk', []),
      selection('unknown', []),
    ],
  );

  assert.deepEqual(issueCodes(result), [
    'DUPLICATE_GROUP',
    'DUPLICATE_GROUP',
    'UNKNOWN_GROUP',
    'DUPLICATE_OPTION',
    'UNKNOWN_OPTION',
    'DUPLICATE_OPTION',
  ]);
});

test('validates nested groups only under their selected parent option', () => {
  const sweetness = modifier({
    id: 'sweetness',
    name: 'Sweetness',
    rule: { min: 1, max: 1 },
    items: [{ id: 'regular', name: 'Regular', price: '0.00', maxQuantity: 1 }],
  });
  const size = modifier({
    id: 'size',
    name: 'Size',
    rule: { min: 1, max: 1 },
    items: [
      {
        id: 'large',
        name: 'Large',
        price: '1.00',
        maxQuantity: 1,
        childGroups: [{ groupId: 'sweetness', group: sweetness }],
      },
    ],
  });
  const nestedProduct = product({ modifierIds: ['size'], modifiers: [size] });

  assert.deepEqual(
    issueCodes(
      validateModifierSelections(nestedProduct, [
        selection('size', [{ optionId: 'large', quantity: 1 }]),
      ]),
    ),
    ['MIN_SELECTIONS_NOT_MET'],
  );

  const valid = buildModifierSelectionPayload(nestedProduct, [
    selection('size', [
      {
        optionId: 'large',
        quantity: 1,
        children: [selection('sweetness', [{ optionId: 'regular', quantity: 1 }])],
      },
    ]),
  ]);

  assert.deepEqual(valid, {
    ok: true,
    payload: [
      {
        groupId: 'size',
        selectedOptions: [
          {
            optionId: 'large',
            quantity: 1,
            children: [
              {
                groupId: 'sweetness',
                selectedOptions: [{ optionId: 'regular', quantity: 1 }],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(
    issueCodes(
      validateModifierSelections(nestedProduct, [
        selection('size', [
          {
            optionId: 'large',
            quantity: 1,
            children: [selection('not-linked', [])],
          },
        ]),
      ]),
    ),
    ['MIN_SELECTIONS_NOT_MET', 'ORPHANED_CHILD_SELECTION'],
  );
});

test('applies child rule overrides and scales them by parent quantity', () => {
  const topping = modifier({
    id: 'topping',
    rule: { min: 0, max: 5 },
    items: [{ id: 'boba', name: 'Boba', price: '0.50', maxQuantity: 4 }],
  });
  const bundle = modifier({
    id: 'bundle',
    rule: { min: 1, max: 2 },
    items: [
      {
        id: 'bundle-item',
        name: 'Bundle item',
        price: '0.00',
        maxQuantity: 2,
        childGroups: [
          {
            groupId: 'topping',
            group: topping,
            overrides: { min: 1, max: 2 },
            applyPerParentQuantity: true,
          },
        ],
      },
    ],
  });
  const bundleProduct = product({ modifierIds: ['bundle'], modifiers: [bundle] });

  assert.deepEqual(
    issueCodes(
      validateModifierSelections(bundleProduct, [
        selection('bundle', [
          {
            optionId: 'bundle-item',
            quantity: 2,
            children: [selection('topping', [{ optionId: 'boba', quantity: 1 }])],
          },
        ]),
      ]),
    ),
    ['MIN_SELECTIONS_NOT_MET'],
  );

  assert.equal(
    validateModifierSelections(bundleProduct, [
      selection('bundle', [
        {
          optionId: 'bundle-item',
          quantity: 2,
          children: [selection('topping', [{ optionId: 'boba', quantity: 4 }])],
        },
      ]),
    ]).valid,
    true,
  );
});

test('rejects unresolved and circular child groups', () => {
  const unresolved = modifier({
    id: 'parent',
    items: [
      {
        id: 'choice',
        name: 'Choice',
        price: '0.00',
        maxQuantity: 1,
        childGroups: [{ groupId: 'missing', group: null }],
      },
    ],
  });
  assert.deepEqual(
    issueCodes(
      validateModifierSelections(product({ modifierIds: ['parent'], modifiers: [unresolved] }), [
        selection('parent', [{ optionId: 'choice', quantity: 1 }]),
      ]),
    ),
    ['UNRESOLVED_CHILD_GROUP'],
  );

  const circular = modifier({ id: 'loop', items: [] });
  circular.items = [
    {
      id: 'again',
      name: 'Again',
      price: '0.00',
      maxQuantity: 1,
      childGroups: [{ groupId: 'loop', group: circular }],
    },
  ];
  assert.deepEqual(
    issueCodes(
      validateModifierSelections(product({ modifierIds: ['loop'], modifiers: [circular] }), [
        selection('loop', [{ optionId: 'again', quantity: 1 }]),
      ]),
    ),
    ['CIRCULAR_MODIFIER_TREE'],
  );

  const flagged = modifier({
    id: 'flagged',
    items: [
      {
        id: 'choice',
        name: 'Choice',
        price: '0.00',
        maxQuantity: 1,
        childGroups: [{ groupId: 'elsewhere', circular: true }],
      },
    ],
  });
  assert.deepEqual(
    issueCodes(
      validateModifierSelections(product({ modifierIds: ['flagged'], modifiers: [flagged] }), [
        selection('flagged', [{ optionId: 'choice', quantity: 1 }]),
      ]),
    ),
    ['CIRCULAR_MODIFIER_TREE'],
  );
});

test('returns a stable SDK payload without mutating inputs or copying catalog data', () => {
  const stableProduct = product({
    modifierIds: ['milk', 'temperature'],
    modifiers: [
      modifier(),
      modifier({
        id: 'temperature',
        name: 'Temperature',
        rule: { min: 1, max: 1 },
        items: [
          { id: 'hot', name: 'Hot', price: '0.00', maxQuantity: 1 },
          { id: 'iced', name: 'Iced', price: '0.00', maxQuantity: 1 },
        ],
      }),
    ],
  });
  const selections = [
    selection('temperature', [{ optionId: 'iced', quantity: 1 }]),
    selection('milk', [
      { optionId: 'oat', quantity: 1 },
      { optionId: 'whole', quantity: 1 },
    ]),
  ];
  const originalProduct = structuredClone(stableProduct);
  const originalSelections = structuredClone(selections);

  const result = buildModifierSelectionPayload(stableProduct, selections);

  assert.deepEqual(result, {
    ok: true,
    payload: [
      {
        groupId: 'milk',
        selectedOptions: [
          { optionId: 'whole', quantity: 1 },
          { optionId: 'oat', quantity: 1 },
        ],
      },
      {
        groupId: 'temperature',
        selectedOptions: [{ optionId: 'iced', quantity: 1 }],
      },
    ],
  });
  assert.deepEqual(stableProduct, originalProduct);
  assert.deepEqual(selections, originalSelections);
  assert.doesNotMatch(JSON.stringify(result), /price|name|displayPrice/);
});

test('uses modifierIds as the canonical root-group order', () => {
  const temperature = modifier({
    id: 'temperature',
    name: 'Temperature',
    rule: { min: 1, max: 1 },
    items: [{ id: 'iced', name: 'Iced', price: '0.00', maxQuantity: 1 }],
  });
  const orderedProduct = product({
    modifierIds: ['temperature', 'milk'],
    modifiers: [modifier(), temperature],
  });

  assert.deepEqual(
    buildModifierSelectionPayload(orderedProduct, [
      selection('milk', [{ optionId: 'whole', quantity: 1 }]),
      selection('temperature', [{ optionId: 'iced', quantity: 1 }]),
    ]),
    {
      ok: true,
      payload: [
        {
          groupId: 'temperature',
          selectedOptions: [{ optionId: 'iced', quantity: 1 }],
        },
        {
          groupId: 'milk',
          selectedOptions: [{ optionId: 'whole', quantity: 1 }],
        },
      ],
    },
  );
});

test('fails closed when root modifier references and hydrated groups disagree', () => {
  const unexpected = modifier({ id: 'unexpected' });
  const mismatchedProduct = product({
    modifierIds: ['milk', 'milk', 'missing'],
    modifiers: [modifier(), unexpected],
  });

  assert.deepEqual(issueCodes(validateModifierSelections(mismatchedProduct, [])), [
    'DUPLICATE_ROOT_GROUP_REFERENCE',
    'MISSING_ROOT_GROUP',
    'UNEXPECTED_ROOT_GROUP',
  ]);
});

test('rejects malformed rules without silently repairing them', () => {
  for (const rule of [
    { min: -1, max: 1 },
    { min: 2, max: 1 },
    { min: 0.5, max: 1 },
    { min: 0, max: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.ok(
      issueCodes(
        validateModifierSelections(product({ modifiers: [modifier({ rule })] }), []),
      ).includes('INVALID_GROUP_RULE'),
    );
  }
});

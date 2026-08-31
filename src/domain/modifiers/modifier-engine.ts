import type {
  Modifier,
  ModifierChildLink,
  ModifierItem,
  Product,
  SelectedModifierOption,
  SelectedModifierTypes,
} from '@craveup/storefront-sdk';

import type {
  ModifierPayloadResult,
  ModifierSelectionPathEntry,
  ModifierValidationIssue,
  ModifierValidationResult,
} from './types.ts';

type EffectiveRule = {
  min: number;
  max: number;
};

type Evaluation = {
  issues: ModifierValidationIssue[];
  selections: SelectedModifierTypes[];
};

function groupPath(
  parentPath: readonly ModifierSelectionPathEntry[],
  groupId: string,
): ModifierSelectionPathEntry[] {
  return [...parentPath, { groupId }];
}

function optionPath(
  currentGroupPath: readonly ModifierSelectionPathEntry[],
  optionId: string,
): ModifierSelectionPathEntry[] {
  const path = currentGroupPath.map((entry) => ({ ...entry }));
  const currentGroup = path.at(-1);

  if (currentGroup) {
    currentGroup.optionId = optionId;
  }

  return path;
}

function isValidRule(rule: EffectiveRule): boolean {
  return (
    Number.isSafeInteger(rule.min) &&
    Number.isSafeInteger(rule.max) &&
    rule.min >= 0 &&
    rule.max >= rule.min
  );
}

function effectiveChildRule(
  link: ModifierChildLink,
  group: Modifier,
  parentQuantity: number,
): EffectiveRule {
  const multiplier = link.applyPerParentQuantity ? parentQuantity : 1;

  return {
    min: (link.overrides?.min ?? group.rule.min) * multiplier,
    max: (link.overrides?.max ?? group.rule.max) * multiplier,
  };
}

function indexSelectedGroups(
  selections: readonly SelectedModifierTypes[],
  parentPath: readonly ModifierSelectionPathEntry[],
  issues: ModifierValidationIssue[],
): Map<string, SelectedModifierTypes> {
  const indexed = new Map<string, SelectedModifierTypes>();

  for (const selection of selections) {
    if (indexed.has(selection.groupId)) {
      issues.push({
        code: 'DUPLICATE_GROUP',
        groupId: selection.groupId,
        source: 'selection',
        path: groupPath(parentPath, selection.groupId),
      });
      continue;
    }

    indexed.set(selection.groupId, selection);
  }

  return indexed;
}

function indexCatalogOptions(
  group: Modifier,
  path: readonly ModifierSelectionPathEntry[],
  issues: ModifierValidationIssue[],
): Map<string, ModifierItem> {
  const indexed = new Map<string, ModifierItem>();

  for (const option of group.items) {
    if (indexed.has(option.id)) {
      issues.push({
        code: 'DUPLICATE_OPTION',
        groupId: group.id,
        optionId: option.id,
        source: 'catalog',
        path: optionPath(path, option.id),
      });
      continue;
    }

    indexed.set(option.id, option);
  }

  return indexed;
}

function indexSelectedOptions(
  group: Modifier,
  selection: SelectedModifierTypes | undefined,
  path: readonly ModifierSelectionPathEntry[],
  issues: ModifierValidationIssue[],
): Map<string, SelectedModifierOption> {
  const indexed = new Map<string, SelectedModifierOption>();

  for (const option of selection?.selectedOptions ?? []) {
    if (indexed.has(option.optionId)) {
      issues.push({
        code: 'DUPLICATE_OPTION',
        groupId: group.id,
        optionId: option.optionId,
        source: 'selection',
        path: optionPath(path, option.optionId),
      });
      continue;
    }

    indexed.set(option.optionId, option);
  }

  return indexed;
}

function reconcileRootGroups(
  product: Product,
  issues: ModifierValidationIssue[],
): Modifier[] {
  const groupsById = new Map<string, Modifier>();

  for (const group of product.modifiers) {
    if (groupsById.has(group.id)) {
      issues.push({
        code: 'DUPLICATE_GROUP',
        groupId: group.id,
        source: 'catalog',
        path: groupPath([], group.id),
      });
      continue;
    }

    groupsById.set(group.id, group);
  }

  const referencedIds = new Set<string>();
  const canonicalGroups: Modifier[] = [];

  for (const groupId of product.modifierIds) {
    if (referencedIds.has(groupId)) {
      issues.push({
        code: 'DUPLICATE_ROOT_GROUP_REFERENCE',
        groupId,
        path: groupPath([], groupId),
      });
      continue;
    }
    referencedIds.add(groupId);

    const group = groupsById.get(groupId);
    if (!group) {
      issues.push({
        code: 'MISSING_ROOT_GROUP',
        groupId,
        path: groupPath([], groupId),
      });
      continue;
    }

    canonicalGroups.push(group);
  }

  for (const groupId of groupsById.keys()) {
    if (!referencedIds.has(groupId)) {
      issues.push({
        code: 'UNEXPECTED_ROOT_GROUP',
        groupId,
        path: groupPath([], groupId),
      });
    }
  }

  return canonicalGroups;
}

function validateChildSelections(
  group: Modifier,
  option: ModifierItem,
  selectedOption: SelectedModifierOption,
  currentOptionPath: readonly ModifierSelectionPathEntry[],
  ancestors: readonly string[],
  issues: ModifierValidationIssue[],
): SelectedModifierTypes[] {
  const selectedChildren = indexSelectedGroups(
    selectedOption.children ?? [],
    currentOptionPath,
    issues,
  );
  const links = option.childGroups ?? [];
  const linkedGroupIds = new Set<string>();
  const canonicalChildren: SelectedModifierTypes[] = [];

  for (const link of links) {
    const childPath = groupPath(currentOptionPath, link.groupId);

    if (linkedGroupIds.has(link.groupId)) {
      issues.push({
        code: 'DUPLICATE_GROUP',
        groupId: link.groupId,
        source: 'catalog',
        path: childPath,
      });
      continue;
    }
    linkedGroupIds.add(link.groupId);

    if (link.circular || ancestors.includes(link.groupId)) {
      issues.push({
        code: 'CIRCULAR_MODIFIER_TREE',
        groupId: link.groupId,
        path: childPath,
      });
      continue;
    }

    if (!link.group || link.group.id !== link.groupId) {
      issues.push({
        code: 'UNRESOLVED_CHILD_GROUP',
        groupId: group.id,
        optionId: option.id,
        childGroupId: link.groupId,
        path: childPath,
      });
      continue;
    }

    const childSelection = selectedChildren.get(link.groupId);
    const childRule = effectiveChildRule(link, link.group, selectedOption.quantity);
    const canonicalChild = validateGroup(
      link.group,
      childSelection,
      childRule,
      childPath,
      ancestors,
      issues,
    );

    if (canonicalChild) {
      canonicalChildren.push(canonicalChild);
    }
  }

  for (const childSelection of selectedChildren.values()) {
    if (!linkedGroupIds.has(childSelection.groupId)) {
      issues.push({
        code: 'ORPHANED_CHILD_SELECTION',
        groupId: group.id,
        optionId: option.id,
        childGroupId: childSelection.groupId,
        path: groupPath(currentOptionPath, childSelection.groupId),
      });
    }
  }

  return canonicalChildren;
}

function validateGroup(
  group: Modifier,
  selection: SelectedModifierTypes | undefined,
  rule: EffectiveRule,
  path: readonly ModifierSelectionPathEntry[],
  ancestors: readonly string[],
  issues: ModifierValidationIssue[],
): SelectedModifierTypes | null {
  if (ancestors.includes(group.id)) {
    issues.push({
      code: 'CIRCULAR_MODIFIER_TREE',
      groupId: group.id,
      path: [...path],
    });
    return null;
  }

  const nextAncestors = [...ancestors, group.id];
  const catalogOptions = indexCatalogOptions(group, path, issues);
  const selectedOptions = indexSelectedOptions(group, selection, path, issues);
  const canonicalOptions: SelectedModifierOption[] = [];
  const processedOptionIds = new Set<string>();
  let selectedQuantity = 0;

  if (!isValidRule(rule)) {
    issues.push({
      code: 'INVALID_GROUP_RULE',
      groupId: group.id,
      minimum: rule.min,
      maximum: rule.max,
      path: [...path],
    });
  }

  for (const selectedOption of selectedOptions.values()) {
    if (!catalogOptions.has(selectedOption.optionId)) {
      issues.push({
        code: 'UNKNOWN_OPTION',
        groupId: group.id,
        optionId: selectedOption.optionId,
        path: optionPath(path, selectedOption.optionId),
      });
    }
  }

  for (const catalogOption of group.items) {
    if (processedOptionIds.has(catalogOption.id)) {
      continue;
    }
    processedOptionIds.add(catalogOption.id);

    const selectedOption = selectedOptions.get(catalogOption.id);
    if (!selectedOption) {
      continue;
    }

    const currentOptionPath = optionPath(path, catalogOption.id);
    if (!Number.isSafeInteger(selectedOption.quantity) || selectedOption.quantity <= 0) {
      issues.push({
        code: 'INVALID_OPTION_QUANTITY',
        groupId: group.id,
        optionId: catalogOption.id,
        quantity: selectedOption.quantity,
        path: currentOptionPath,
      });
      continue;
    }

    selectedQuantity += selectedOption.quantity;

    if (!Number.isSafeInteger(catalogOption.maxQuantity)) {
      issues.push({
        code: 'OPTION_UNAVAILABLE',
        groupId: group.id,
        optionId: catalogOption.id,
        maxQuantity: catalogOption.maxQuantity,
        reason: 'invalid_limit',
        path: currentOptionPath,
      });
      continue;
    }

    if (catalogOption.maxQuantity <= 0) {
      issues.push({
        code: 'OPTION_UNAVAILABLE',
        groupId: group.id,
        optionId: catalogOption.id,
        maxQuantity: catalogOption.maxQuantity,
        reason: 'non_positive_limit',
        path: currentOptionPath,
      });
      continue;
    }

    if (selectedOption.quantity > catalogOption.maxQuantity) {
      issues.push({
        code: 'OPTION_QUANTITY_EXCEEDED',
        groupId: group.id,
        optionId: catalogOption.id,
        quantity: selectedOption.quantity,
        maxQuantity: catalogOption.maxQuantity,
        path: currentOptionPath,
      });
      continue;
    }

    const children = validateChildSelections(
      group,
      catalogOption,
      selectedOption,
      currentOptionPath,
      nextAncestors,
      issues,
    );
    canonicalOptions.push({
      optionId: catalogOption.id,
      quantity: selectedOption.quantity,
      ...(children.length > 0 ? { children } : {}),
    });
  }

  if (isValidRule(rule) && selectedQuantity < rule.min) {
    issues.push({
      code: 'MIN_SELECTIONS_NOT_MET',
      groupId: group.id,
      minimum: rule.min,
      actual: selectedQuantity,
      path: [...path],
    });
  }

  if (isValidRule(rule) && selectedQuantity > rule.max) {
    issues.push({
      code: 'MAX_SELECTIONS_EXCEEDED',
      groupId: group.id,
      maximum: rule.max,
      actual: selectedQuantity,
      path: [...path],
    });
  }

  return canonicalOptions.length > 0
    ? {
        groupId: group.id,
        selectedOptions: canonicalOptions,
      }
    : null;
}

function evaluateModifierSelections(
  product: Product,
  selections: readonly SelectedModifierTypes[],
): Evaluation {
  const issues: ModifierValidationIssue[] = [];
  const canonicalSelections: SelectedModifierTypes[] = [];

  if (product.availability !== 'AVAILABLE') {
    issues.push({
      code: 'PRODUCT_UNAVAILABLE',
      productId: product.id,
      availability: product.availability,
      path: [],
    });
  }

  const selectedGroups = indexSelectedGroups(selections, [], issues);
  const rootGroups = reconcileRootGroups(product, issues);
  const rootGroupIds = new Set(rootGroups.map((group) => group.id));

  for (const selection of selectedGroups.values()) {
    if (!rootGroupIds.has(selection.groupId)) {
      issues.push({
        code: 'UNKNOWN_GROUP',
        groupId: selection.groupId,
        path: groupPath([], selection.groupId),
      });
    }
  }

  for (const group of rootGroups) {
    const canonicalGroup = validateGroup(
      group,
      selectedGroups.get(group.id),
      group.rule,
      groupPath([], group.id),
      [],
      issues,
    );

    if (canonicalGroup) {
      canonicalSelections.push(canonicalGroup);
    }
  }

  return { issues, selections: canonicalSelections };
}

export function validateModifierSelections(
  product: Product,
  selections: readonly SelectedModifierTypes[],
): ModifierValidationResult {
  const evaluation = evaluateModifierSelections(product, selections);

  return evaluation.issues.length === 0
    ? { valid: true, selections: evaluation.selections }
    : { valid: false, issues: evaluation.issues };
}

export function buildModifierSelectionPayload(
  product: Product,
  selections: readonly SelectedModifierTypes[],
): ModifierPayloadResult {
  const evaluation = evaluateModifierSelections(product, selections);

  return evaluation.issues.length === 0
    ? { ok: true, payload: evaluation.selections }
    : { ok: false, issues: evaluation.issues };
}

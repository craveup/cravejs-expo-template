import type {
  Modifier,
  Product,
  SelectedModifierTypes,
} from '@craveup/storefront-sdk';

import {
  buildModifierSelectionPayload,
  validateModifierSelections,
  type ModifierValidationIssue,
} from '../../domain/modifiers/index.ts';
import {
  createTranslator,
  formatCurrency,
  type AppLocale,
} from '../../i18n/index.ts';
import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import { mapStorefrontError } from '../../lib/storefront-errors.ts';
import { isScopedStorefrontProduct } from '../../lib/storefront-response-contracts.ts';
import {
  assertSafeIdempotencyKey,
  assertSafeStorefrontResourceId,
} from '../../lib/storefront-session-scope.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import {
  projectCatalogSnapshot,
  type CatalogProductPresentation,
  type CatalogSectionPresentation,
} from '../catalog/catalog-browse.ts';

type ItemProductsClient = Pick<StorefrontClient['products'], 'get'>;

export type ItemDetailNetworkState = Readonly<{
  isConnected?: boolean;
  isInternetReachable?: boolean;
}>;

export type ItemDetailNutrition = Readonly<{
  calorieCount?: number;
  dietaryPreferences?: readonly string[];
  ingredients?: readonly string[];
}>;

export type ItemDetailAlternative = Readonly<{
  id: string;
  imageUrl?: string;
  name: string;
  priceLabel: string;
}>;

export type ItemFavouriteConfiguration = Readonly<{
  productId: string;
  selections: readonly SelectedModifierTypes[];
}>;

export type ItemFavouriteProjection = Readonly<{
  favourite: boolean;
  selections: readonly SelectedModifierTypes[];
}>;

export type ItemDetailLoadResult =
  | Readonly<{
      alternatives: readonly ItemDetailAlternative[];
      canStartOrder: boolean;
      kind: 'ready';
      nutrition: ItemDetailNutrition;
      product: Product;
    }>
  | Readonly<{
      kind: 'failed';
      status: 'error' | 'not-found' | 'offline' | 'unavailable';
    }>;

export type ItemModifierPathEntry = Readonly<{
  groupId: string;
  viaOptionId?: string;
}>;

export type ItemModifierOptionPresentation = Readonly<{
  childGroups: readonly ItemModifierGroupPresentation[];
  id: string;
  maxQuantity: number;
  name: string;
  path: readonly ItemModifierPathEntry[];
  priceLabel?: string;
  selectedQuantity: number;
}>;

export type ItemModifierGroupPresentation = Readonly<{
  description?: string;
  id: string;
  maximum: number;
  minimum: number;
  name: string;
  options: readonly ItemModifierOptionPresentation[];
  path: readonly ItemModifierPathEntry[];
  required: boolean;
}>;

export function getItemOptionPressQuantity(
  group: ItemModifierGroupPresentation,
  option: ItemModifierOptionPresentation,
): number {
  if (option.selectedQuantity === 0) return 1;
  return group.maximum === 1 && group.required
    ? option.selectedQuantity
    : 0;
}

export type ItemDetailPresentationModel = Readonly<{
  addLabel: string;
  alternatives: readonly ItemDetailAlternative[];
  availability: 'available' | 'sold-out';
  canAdd: boolean;
  description?: string;
  groups: readonly ItemModifierGroupPresentation[];
  id: string;
  imageUrl?: string;
  name: string;
  nutrition: ItemDetailNutrition;
  priceLabel: string;
  quantity: number;
}>;

export type ItemCartIntentIds = Readonly<{
  add: string;
  start: string;
}>;

export type ItemCartRetryPhase = 'add' | 'start';

export type ItemCartSubmissionResult =
  | Readonly<{ kind: 'added' }>
  | Readonly<{ kind: 'refresh_required' }>
  | Readonly<{
      issues: readonly ModifierValidationIssue[];
      kind: 'selection_invalid';
    }>
  | Readonly<{
      kind: 'retryable';
      phase?: ItemCartRetryPhase;
      retry: 'new_intent' | 'same_intent';
    }>
  | Readonly<{ kind: 'unavailable' }>;

export type ItemCartSubmissionInput = Readonly<{
  cart: CartService;
  intents: ItemCartIntentIds;
  locationId: string;
  productId: string;
  products: ItemProductsClient;
  quantity: number;
  retryPhase?: ItemCartRetryPhase;
  selections: readonly SelectedModifierTypes[];
}>;

const STRUCTURAL_ISSUES = new Set<ModifierValidationIssue['code']>([
  'CIRCULAR_MODIFIER_TREE',
  'DUPLICATE_GROUP',
  'DUPLICATE_OPTION',
  'DUPLICATE_ROOT_GROUP_REFERENCE',
  'INVALID_GROUP_RULE',
  'MISSING_ROOT_GROUP',
  'OPTION_UNAVAILABLE',
  'UNEXPECTED_ROOT_GROUP',
  'UNRESOLVED_CHILD_GROUP',
]);
const MAX_NUTRITION_ITEMS = 100;
const MAX_NUTRITION_TEXT = 500;

function isSafeNutritionText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_NUTRITION_TEXT &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isSafeNutritionList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_NUTRITION_ITEMS &&
    value.every(isSafeNutritionText) &&
    new Set(value).size === value.length
  );
}

function isOffline(network: ItemDetailNetworkState): boolean {
  return (
    network.isConnected === false || network.isInternetReachable === false
  );
}

function publicHttpsUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function hasStructurallyValidModifiers(product: Product): boolean {
  const validation = validateModifierSelections(product, []);
  return (
    validation.valid ||
    !validation.issues.some((issue) => STRUCTURAL_ISSUES.has(issue.code))
  );
}

function projectNutrition(value: unknown): ItemDetailNutrition | undefined {
  if (value === undefined || value === null) return Object.freeze({});
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;

  const nutrition = value as Record<string, unknown>;
  const calorieCount = nutrition.calorieCount;
  const dietaryPreferences = nutrition.dietaryPreferences;
  const ingredients = nutrition.ingredients;

  if (
    calorieCount !== undefined &&
    calorieCount !== null &&
    (!Number.isSafeInteger(calorieCount) ||
      (calorieCount as number) < 0 ||
      (calorieCount as number) > 100_000)
  ) {
    return undefined;
  }
  if (
    dietaryPreferences !== undefined &&
    !isSafeNutritionList(dietaryPreferences)
  ) {
    return undefined;
  }
  if (
    ingredients !== undefined &&
    !isSafeNutritionList(ingredients)
  ) {
    return undefined;
  }

  return Object.freeze({
    ...(calorieCount === undefined || calorieCount === null
      ? {}
      : { calorieCount: calorieCount as number }),
    ...(Array.isArray(dietaryPreferences)
      ? { dietaryPreferences: Object.freeze([...dietaryPreferences]) as readonly string[] }
      : {}),
    ...(Array.isArray(ingredients)
      ? { ingredients: Object.freeze([...ingredients]) as readonly string[] }
      : {}),
  });
}

function matchingMenuNutrition(
  menus: unknown,
  productId: string,
): ItemDetailNutrition | undefined {
  if (typeof menus !== 'object' || menus === null) return undefined;
  const menuList = Reflect.get(menus, 'menus');
  if (!Array.isArray(menuList)) return undefined;

  const matches: ItemDetailNutrition[] = [];
  for (const menu of menuList) {
    if (typeof menu !== 'object' || menu === null) return undefined;
    const isActive = Reflect.get(menu, 'isActive');
    if (typeof isActive !== 'boolean') return undefined;
    if (!isActive) continue;
    const categories = Reflect.get(menu, 'categories');
    if (!Array.isArray(categories)) return undefined;
    for (const category of categories) {
      if (typeof category !== 'object' || category === null) return undefined;
      const products = Reflect.get(category, 'products');
      if (!Array.isArray(products)) return undefined;
      for (const product of products) {
        if (
          typeof product === 'object' &&
          product !== null &&
          Reflect.get(product, 'id') === productId
        ) {
          const projected = projectNutrition(Reflect.get(product, 'nutrition'));
          if (!projected) return undefined;
          matches.push(projected);
        }
      }
    }
  }
  if (matches.length === 0) return undefined;
  const canonical = JSON.stringify(matches[0]);
  return matches.every((match) => JSON.stringify(match) === canonical)
    ? matches[0]
    : undefined;
}

function toAlternative(
  product: CatalogProductPresentation,
): ItemDetailAlternative {
  return Object.freeze({
    id: product.id,
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    name: product.name,
    priceLabel: product.priceLabel,
  });
}

function alternativesFor(
  sections: readonly CatalogSectionPresentation[],
  productId: string,
): readonly ItemDetailAlternative[] {
  const seen = new Set<string>();
  const alternatives: ItemDetailAlternative[] = [];

  for (const section of sections) {
    for (const candidate of section.products) {
      if (
        candidate.id === productId ||
        candidate.availability !== 'available' ||
        seen.has(candidate.id)
      ) {
        continue;
      }
      seen.add(candidate.id);
      alternatives.push(toAlternative(candidate));
      if (alternatives.length === 3) return Object.freeze(alternatives);
    }
  }

  return Object.freeze(alternatives);
}

export async function loadItemDetail(
  dependencies: Readonly<{
    bootstrap: StorefrontBootstrapService;
    locationId: string;
    products: ItemProductsClient;
  }>,
  productIdInput: string,
  network: ItemDetailNetworkState,
): Promise<ItemDetailLoadResult> {
  let productId: string;
  try {
    productId = assertSafeStorefrontResourceId(productIdInput, 'productId');
  } catch {
    return Object.freeze({ kind: 'failed', status: 'not-found' });
  }
  if (isOffline(network)) {
    return Object.freeze({ kind: 'failed', status: 'offline' });
  }

  let product: unknown;
  let bootstrap;
  try {
    [product, bootstrap] = await Promise.all([
      dependencies.products.get(dependencies.locationId, productId),
      dependencies.bootstrap.load(),
    ]);
  } catch (error) {
    const failure = mapStorefrontError(error);
    return Object.freeze({
      kind: 'failed',
      status: failure.kind === 'not_found' ? 'not-found' : failure.kind === 'unavailable' ? 'unavailable' : 'error',
    });
  }

  if (bootstrap.kind === 'failed') {
    return Object.freeze({
      kind: 'failed',
      status:
        bootstrap.failure.kind === 'not_found'
          ? 'not-found'
          : bootstrap.failure.kind === 'unavailable'
            ? 'unavailable'
            : 'error',
    });
  }
  if (
    !isScopedStorefrontProduct(product, dependencies.locationId, productId) ||
    !hasStructurallyValidModifiers(product)
  ) {
    return Object.freeze({ kind: 'failed', status: 'unavailable' });
  }

  const catalog = projectCatalogSnapshot(bootstrap.data);
  if (!catalog.ok) {
    return Object.freeze({ kind: 'failed', status: 'unavailable' });
  }
  if (catalog.status !== 'ready') {
    return Object.freeze({ kind: 'failed', status: 'not-found' });
  }

  const isPublished = catalog.snapshot.sections.some((section) =>
    section.products.some((candidate) => candidate.id === productId),
  );
  if (!isPublished) {
    return Object.freeze({ kind: 'failed', status: 'not-found' });
  }

  const nutrition = matchingMenuNutrition(bootstrap.data.menus, productId);
  if (!nutrition) {
    return Object.freeze({ kind: 'failed', status: 'unavailable' });
  }

  return Object.freeze({
    alternatives: alternativesFor(catalog.snapshot.sections, productId),
    canStartOrder: catalog.snapshot.canStartOrder,
    kind: 'ready',
    nutrition,
    product,
  });
}

type ResolvedGroup = Readonly<{
  group: Modifier;
  rule: Modifier['rule'];
}>;

type ModifierChildLink = NonNullable<
  Modifier['items'][number]['childGroups']
>[number];

function rootGroup(product: Product, groupId: string): ResolvedGroup | undefined {
  if (!product.modifierIds.includes(groupId)) return undefined;
  const matches = product.modifiers.filter((group) => group.id === groupId);
  return matches.length === 1
    ? Object.freeze({ group: matches[0]!, rule: matches[0]!.rule })
    : undefined;
}

function effectiveChildRule(
  link: ModifierChildLink,
  group: Modifier,
  parentQuantity: number,
): Modifier['rule'] | undefined {
  const multiplier = link.applyPerParentQuantity ? parentQuantity : 1;
  const min = (link.overrides?.min ?? group.rule.min) * multiplier;
  const max = (link.overrides?.max ?? group.rule.max) * multiplier;
  return Number.isSafeInteger(min) &&
    Number.isSafeInteger(max) &&
    min >= 0 &&
    max >= min
    ? Object.freeze({ max, min })
    : undefined;
}

function resolveChildGroup(
  parent: Modifier,
  viaOptionId: string,
  childGroupId: string,
  parentQuantity: number,
): ResolvedGroup | undefined {
  const option = parent.items.find((candidate) => candidate.id === viaOptionId);
  const links = (option?.childGroups ?? []).filter(
    (link) =>
      link.groupId === childGroupId &&
      link.group?.id === childGroupId &&
      !link.circular,
  );
  if (links.length !== 1) return undefined;
  const link = links[0]!;
  const group = link.group!;
  const rule = effectiveChildRule(link, group, parentQuantity);
  return rule ? Object.freeze({ group, rule }) : undefined;
}

function resolveGroupPath(
  product: Product,
  selections: readonly SelectedModifierTypes[],
  path: readonly ItemModifierPathEntry[],
): ResolvedGroup | undefined {
  if (path.length === 0) return undefined;
  let resolved = rootGroup(product, path[0]!.groupId);
  if (!resolved) return undefined;
  let levelSelections = selections;

  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index]!;
    const next = path[index + 1]!;
    if (!current.viaOptionId) return undefined;
    const selectedParent = selectionFor(
      levelSelections,
      current.groupId,
    )?.selectedOptions.find(
      (candidate) => candidate.optionId === current.viaOptionId,
    );
    if (!selectedParent || selectedParent.quantity < 1) return undefined;
    resolved = resolveChildGroup(
      resolved.group,
      current.viaOptionId,
      next.groupId,
      selectedParent.quantity,
    );
    if (!resolved) return undefined;
    levelSelections = selectedParent.children ?? [];
  }

  return resolved.group.id === path[path.length - 1]!.groupId
    ? resolved
    : undefined;
}

function cloneSelections(
  selections: readonly SelectedModifierTypes[],
): SelectedModifierTypes[] {
  return selections.map((selection) => ({
    groupId: selection.groupId,
    selectedOptions: selection.selectedOptions.map((option) => ({
      ...(option.children ? { children: cloneSelections(option.children) } : {}),
      optionId: option.optionId,
      quantity: option.quantity,
    })),
  }));
}

export function projectItemFavourite(
  product: Product,
  favourites: readonly ItemFavouriteConfiguration[],
): ItemFavouriteProjection {
  const matches = favourites.filter(
    (favourite) => favourite.productId === product.id,
  );
  if (matches.length !== 1) {
    return Object.freeze({ favourite: false, selections: Object.freeze([]) });
  }

  const payload = buildModifierSelectionPayload(
    product,
    matches[0]!.selections,
  );
  return Object.freeze({
    favourite: true,
    selections: Object.freeze(
      payload.ok ? cloneSelections(payload.payload) : [],
    ),
  });
}

function updateSelectionLevel(
  product: Product,
  selections: readonly SelectedModifierTypes[],
  path: readonly ItemModifierPathEntry[],
  pathIndex: number,
  resolved: ResolvedGroup,
  optionId: string,
  quantity: number,
): readonly SelectedModifierTypes[] | undefined {
  const currentPath = path[pathIndex]!;
  const existing = selections.find(
    (selection) => selection.groupId === currentPath.groupId,
  );
  const untouched = selections.filter(
    (selection) => selection.groupId !== currentPath.groupId,
  );
  let selectedOptions: SelectedModifierTypes['selectedOptions'] = existing
    ? existing.selectedOptions.map((option) => ({
        ...(option.children ? { children: cloneSelections(option.children) } : {}),
        optionId: option.optionId,
        quantity: option.quantity,
      }))
    : [];

  if (pathIndex === path.length - 1) {
    const option = resolved.group.items.find((candidate) => candidate.id === optionId);
    if (
      !option ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      !Number.isSafeInteger(option.maxQuantity) ||
      option.maxQuantity < 1 ||
      quantity > option.maxQuantity
    ) {
      return undefined;
    }

    const previous = selectedOptions.find((candidate) => candidate.optionId === optionId);
    if (resolved.rule.max === 1 && quantity === 1) {
      selectedOptions = [
        {
          ...(previous?.children ? { children: previous.children } : {}),
          optionId,
          quantity,
        },
      ];
    } else {
      selectedOptions = selectedOptions.filter(
        (candidate) => candidate.optionId !== optionId,
      );
      if (quantity > 0) {
        selectedOptions.push({
          ...(previous?.children ? { children: previous.children } : {}),
          optionId,
          quantity,
        });
      }
    }
    const selectedQuantity = selectedOptions.reduce(
      (sum, candidate) => sum + candidate.quantity,
      0,
    );
    if (selectedQuantity > resolved.rule.max) return undefined;
  } else {
    const viaOptionId = currentPath.viaOptionId;
    const parentIndex = selectedOptions.findIndex(
      (candidate) => candidate.optionId === viaOptionId,
    );
    if (!viaOptionId || parentIndex < 0) return undefined;
    const parent = selectedOptions[parentIndex]!;
    const nextPath = path[pathIndex + 1]!;
    const nextResolved = resolveChildGroup(
      resolved.group,
      viaOptionId,
      nextPath.groupId,
      parent.quantity,
    );
    if (!nextResolved) return undefined;
    const updatedChildren = updateSelectionLevel(
      product,
      parent.children ?? [],
      path,
      pathIndex + 1,
      nextResolved,
      optionId,
      quantity,
    );
    if (!updatedChildren) return undefined;
    selectedOptions[parentIndex] = {
      ...parent,
      ...(updatedChildren.length > 0
        ? { children: cloneSelections(updatedChildren) }
        : {}),
    };
  }

  return selectedOptions.length > 0
    ? [...untouched, { groupId: currentPath.groupId, selectedOptions }]
    : untouched;
}

export function setItemOptionQuantity(
  product: Product,
  selections: readonly SelectedModifierTypes[],
  path: readonly ItemModifierPathEntry[],
  optionId: string,
  quantity: number,
): readonly SelectedModifierTypes[] {
  const resolved = resolveGroupPath(product, selections, path);
  if (!resolved) return cloneSelections(selections);
  const updated = updateSelectionLevel(
    product,
    selections,
    path,
    0,
    rootGroup(product, path[0]!.groupId)!,
    optionId,
    quantity,
  );
  return Object.freeze(updated ? cloneSelections(updated) : cloneSelections(selections));
}

function selectionFor(
  selections: readonly SelectedModifierTypes[],
  groupId: string,
): SelectedModifierTypes | undefined {
  return selections.find((selection) => selection.groupId === groupId);
}

function modifierPriceLabel(
  price: string,
  currency: string,
  locale: AppLocale,
): string | undefined {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const label = formatCurrency(locale, amount, currency.toUpperCase());
  return label ? `+${label}` : undefined;
}

function projectGroup(
  group: Modifier,
  rule: Modifier['rule'],
  selections: readonly SelectedModifierTypes[],
  path: readonly ItemModifierPathEntry[],
  currency: string,
  locale: AppLocale,
): ItemModifierGroupPresentation {
  const selected = selectionFor(selections, group.id);
  return Object.freeze({
    ...(group.description?.trim() ? { description: group.description.trim() } : {}),
    id: group.id,
    maximum: rule.max,
    minimum: rule.min,
    name: group.name,
    options: Object.freeze(
      group.items.map((option): ItemModifierOptionPresentation => {
        const selectedOption = selected?.selectedOptions.find(
          (candidate) => candidate.optionId === option.id,
        );
        const childPath = [
          ...path.slice(0, -1),
          { ...path[path.length - 1]!, viaOptionId: option.id },
        ];
        const childGroups = selectedOption
          ? (option.childGroups ?? [])
              .flatMap((link) => {
                const resolvedChild = resolveChildGroup(
                  group,
                  option.id,
                  link.groupId,
                  selectedOption.quantity,
                );
                return resolvedChild
                  ? [
                      projectGroup(
                        resolvedChild.group,
                        resolvedChild.rule,
                        selectedOption.children ?? [],
                        [...childPath, { groupId: link.groupId }],
                        currency,
                        locale,
                      ),
                    ]
                  : [];
              })
          : [];
        const priceLabel = modifierPriceLabel(option.price, currency, locale);

        return Object.freeze({
          childGroups: Object.freeze(childGroups),
          id: option.id,
          maxQuantity: option.maxQuantity,
          name: option.name,
          path,
          ...(priceLabel ? { priceLabel } : {}),
          selectedQuantity: selectedOption?.quantity ?? 0,
        });
      }),
    ),
    path,
    required: rule.min > 0,
  });
}

export function projectItemDetail(
  product: Product,
  selections: readonly SelectedModifierTypes[],
  quantity: number,
  nutrition: ItemDetailNutrition,
  alternatives: readonly ItemDetailAlternative[],
  locale: AppLocale = 'en',
): ItemDetailPresentationModel {
  const t = createTranslator(locale);
  const validation = validateModifierSelections(product, selections);
  const safeQuantity = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 99;
  const imageUrl = product.images.map(publicHttpsUrl).find(Boolean);

  return Object.freeze({
    addLabel: safeQuantity
      ? t('item.addCount', { quantity })
      : t('item.addToOrder'),
    alternatives,
    availability: product.availability === 'AVAILABLE' ? 'available' : 'sold-out',
    canAdd: product.availability === 'AVAILABLE' && safeQuantity && validation.valid,
    ...(product.description.trim() ? { description: product.description.trim() } : {}),
    groups: Object.freeze(
      product.modifierIds.flatMap((groupId) => {
        const resolved = rootGroup(product, groupId);
        return resolved
          ? [
              projectGroup(
                resolved.group,
                resolved.rule,
                selections,
                [{ groupId }],
                product.currency,
                locale,
              ),
            ]
          : [];
      }),
    ),
    id: product.id,
    ...(imageUrl ? { imageUrl } : {}),
    name: product.name,
    nutrition,
    priceLabel: product.displayPrice,
    quantity: safeQuantity ? quantity : 1,
  });
}

export function createItemCartIntentKey(
  phase: ItemCartRetryPhase,
  now: number,
  sequence: number,
): string {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error('Cannot create item cart intent key.');
  }
  return `item_${phase}_${now.toString(36)}_${sequence.toString(36)}`;
}

function classifyCartResult(
  cart: CartService,
  result: CartServiceResult,
  phase: ItemCartRetryPhase,
): ItemCartSubmissionResult {
  if (result.kind === 'ready') return Object.freeze({ kind: 'added' });
  if (result.kind === 'reconciliation_required') {
    return Object.freeze({ kind: 'refresh_required' });
  }
  if (result.kind === 'terminal') {
    return result.reason === 'unauthorized'
      ? Object.freeze({ kind: 'unavailable' })
      : Object.freeze({ kind: 'retryable', retry: 'new_intent' });
  }
  if (result.kind === 'failed') {
    const state = cart.getState();
    if (state.status === 'error' && state.retry === 'same_intent') {
      return Object.freeze({ kind: 'retryable', phase, retry: 'same_intent' });
    }
    return result.failure.retryable
      ? Object.freeze({ kind: 'retryable', retry: 'new_intent' })
      : Object.freeze({ kind: 'unavailable' });
  }
  return Object.freeze({ kind: 'unavailable' });
}

async function addLatestProduct(
  input: ItemCartSubmissionInput,
): Promise<ItemCartSubmissionResult> {
  let product: unknown;
  try {
    product = await input.products.get(input.locationId, input.productId);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (
    !isScopedStorefrontProduct(product, input.locationId, input.productId) ||
    !hasStructurallyValidModifiers(product) ||
    product.availability !== 'AVAILABLE'
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }

  const payload = buildModifierSelectionPayload(product, input.selections);
  if (!payload.ok) {
    return Object.freeze({
      issues: Object.freeze(payload.issues),
      kind: 'selection_invalid',
    });
  }

  const result = await input.cart.addItem({
    id: input.intents.add,
    payload: {
      itemUnavailableAction: 'remove_item',
      productId: product.id,
      quantity: input.quantity,
      selections: payload.payload,
    },
  });
  return classifyCartResult(input.cart, result, 'add');
}

async function submitValidatedItemToCart(
  input: ItemCartSubmissionInput,
): Promise<ItemCartSubmissionResult> {
  if (input.retryPhase) {
    const result = await input.cart.retry();
    if (result.kind !== 'ready') {
      return classifyCartResult(input.cart, result, input.retryPhase);
    }
    return input.retryPhase === 'add'
      ? Object.freeze({ kind: 'added' })
      : addLatestProduct(input);
  }

  let state = input.cart.getState();
  if (state.status === 'error' && state.retry !== 'same_intent') {
    input.cart.dismissError();
    state = input.cart.getState();
  }

  if (state.status === 'idle' || state.status === 'terminal') {
    const started = await input.cart.start({
      channel: 'app',
      fulfillmentMethod: 'takeout',
      id: input.intents.start,
    });
    if (started.kind !== 'ready') {
      return classifyCartResult(input.cart, started, 'start');
    }
  } else if (state.status !== 'ready') {
    return Object.freeze({ kind: 'unavailable' });
  }

  return addLatestProduct(input);
}

export async function submitItemToCart(
  input: ItemCartSubmissionInput,
): Promise<ItemCartSubmissionResult> {
  try {
    assertSafeStorefrontResourceId(input.productId, 'productId');
    assertSafeIdempotencyKey(input.intents.start);
    assertSafeIdempotencyKey(input.intents.add);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
  if (
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 99
  ) {
    return Object.freeze({ kind: 'unavailable' });
  }

  try {
    return await submitValidatedItemToCart(input);
  } catch {
    return Object.freeze({ kind: 'unavailable' });
  }
}

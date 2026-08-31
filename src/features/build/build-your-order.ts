import type {
  Product,
  SelectedModifierTypes,
} from '@craveup/storefront-sdk';

import { validateModifierSelections } from '../../domain/modifiers/index.ts';
import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import {
  loadItemDetail,
  projectItemDetail,
  type ItemDetailNetworkState,
  type ItemModifierGroupPresentation,
} from '../item/item-detail.ts';

export type BuildYourOrderLoadResult =
  | Readonly<{
      canStartOrder: boolean;
      kind: 'ready';
      product: Product;
    }>
  | Readonly<{
      kind: 'failed';
      status: 'error' | 'not-found' | 'offline' | 'unavailable';
    }>;

export type BuildYourOrderPresentationModel = Readonly<{
  basePriceLabel: string;
  canAdd: boolean;
  description?: string;
  groups: readonly ItemModifierGroupPresentation[];
  id: string;
  imageUrl?: string;
  missingRequiredGroupName?: string;
  name: string;
  selectionSummary: readonly string[];
  showRequiredOptionError: boolean;
}>;

type BuildProductsClient = Pick<StorefrontClient['products'], 'get'>;

function selectedOptionLabels(
  groups: readonly ItemModifierGroupPresentation[],
): string[] {
  const labels: string[] = [];

  for (const group of groups) {
    for (const option of group.options) {
      if (option.selectedQuantity < 1) continue;
      labels.push(
        option.selectedQuantity === 1
          ? option.name
          : `${option.name} ×${option.selectedQuantity}`,
      );
      labels.push(...selectedOptionLabels(option.childGroups));
    }
  }

  return labels;
}

function findGroupName(
  groups: readonly ItemModifierGroupPresentation[],
  groupId: string,
): string | undefined {
  for (const group of groups) {
    if (group.id === groupId) return group.name;
    for (const option of group.options) {
      const nested = findGroupName(option.childGroups, groupId);
      if (nested) return nested;
    }
  }
  return undefined;
}

export async function loadBuildYourOrder(
  dependencies: Readonly<{
    bootstrap: StorefrontBootstrapService;
    locationId: string;
    products: BuildProductsClient;
  }>,
  productId: string,
  network: ItemDetailNetworkState,
): Promise<BuildYourOrderLoadResult> {
  const result = await loadItemDetail(
    dependencies,
    productId,
    network,
  );
  if (result.kind === 'failed') return result;
  if (
    result.product.availability !== 'AVAILABLE' ||
    result.product.modifierIds.length === 0
  ) {
    return Object.freeze({ kind: 'failed', status: 'unavailable' });
  }

  return Object.freeze({
    canStartOrder: result.canStartOrder,
    kind: 'ready',
    product: result.product,
  });
}

export function projectBuildYourOrder(
  product: Product,
  selections: readonly SelectedModifierTypes[],
  validationAttempted: boolean,
): BuildYourOrderPresentationModel {
  const item = projectItemDetail(product, selections, 1, {}, []);
  const validation = validateModifierSelections(product, selections);
  const missingRequiredGroupId = validation.valid
    ? undefined
    : validation.issues.find((issue) => issue.code === 'MIN_SELECTIONS_NOT_MET')
        ?.groupId;
  const missingRequiredGroupName = missingRequiredGroupId
    ? findGroupName(item.groups, missingRequiredGroupId)
    : undefined;

  return Object.freeze({
    basePriceLabel: item.priceLabel,
    canAdd: item.canAdd,
    ...(item.description ? { description: item.description } : {}),
    groups: item.groups,
    id: item.id,
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    ...(missingRequiredGroupName ? { missingRequiredGroupName } : {}),
    name: item.name,
    selectionSummary: Object.freeze(selectedOptionLabels(item.groups)),
    showRequiredOptionError: Boolean(
      validationAttempted && missingRequiredGroupName,
    ),
  });
}

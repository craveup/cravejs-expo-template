import type { Product, SelectedModifierTypes } from '@craveup/storefront-sdk';

import type { FavouriteResolution } from './favourites-store.ts';

export type FavouritePresentationRow = Readonly<{
  id: string;
  imageUri?: string;
  kind: FavouriteResolution['kind'];
  name?: string;
  priceLabel?: string;
  selectionLabel?: string;
}>;

export type FavouritesPresentationState =
  | Readonly<{ status: 'error' | 'loading' | 'offline' | 'unavailable' }>
  | Readonly<{
      data: readonly FavouritePresentationRow[];
      status: 'ready';
    }>;

type ModifierGroup = Product['modifiers'][number];

function nonempty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function publicHttpsImage(value: string | undefined): string | undefined {
  const normalized = nonempty(value);
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

function firstImage(product: Product): string | undefined {
  return product.images.map(publicHttpsImage).find((value) => value !== undefined);
}

function indexModifierGroups(product: Product): ReadonlyMap<string, ModifierGroup> {
  const groups = new Map<string, ModifierGroup>();

  function visit(group: ModifierGroup): void {
    if (groups.has(group.id)) return;
    groups.set(group.id, group);

    for (const item of group.items) {
      for (const child of item.childGroups ?? []) {
        if (child.group && !child.circular) visit(child.group);
      }
    }
  }

  product.modifiers.forEach(visit);
  return groups;
}

function getSelectionLabels(
  selections: readonly SelectedModifierTypes[],
  groups: ReadonlyMap<string, ModifierGroup>,
): string[] {
  const labels: string[] = [];

  for (const selection of selections) {
    const group = groups.get(selection.groupId);
    if (!group) continue;
    const options = new Map(group.items.map((item) => [item.id, item]));

    for (const selectedOption of selection.selectedOptions) {
      const option = options.get(selectedOption.optionId);
      const name = nonempty(option?.name);
      if (name) {
        labels.push(
          selectedOption.quantity > 1
            ? `${name} ×${selectedOption.quantity}`
            : name,
        );
      }
      if (selectedOption.children) {
        labels.push(...getSelectionLabels(selectedOption.children, groups));
      }
    }
  }

  return labels;
}

function hasConfiguredSelections(
  selections: readonly SelectedModifierTypes[],
): boolean {
  return selections.some(
    (selection) =>
      selection.selectedOptions.length > 0 ||
      selection.selectedOptions.some((option) =>
        option.children ? hasConfiguredSelections(option.children) : false,
      ),
  );
}

export function toFavouritePresentationRows(
  resolutions: readonly FavouriteResolution[],
): readonly FavouritePresentationRow[] {
  return Object.freeze(
    resolutions.map((resolution): FavouritePresentationRow => {
      if (resolution.kind === 'missing_product') {
        return Object.freeze({
          id: resolution.item.productId,
          kind: resolution.kind,
        });
      }

      const groups = indexModifierGroups(resolution.product);
      const selectionLabel = nonempty(
        getSelectionLabels(resolution.item.selections, groups).join(' · '),
      );
      const imageUri = firstImage(resolution.product);
      const name = nonempty(resolution.product.name);

      return Object.freeze({
        id: resolution.item.productId,
        ...(imageUri ? { imageUri } : {}),
        kind: resolution.kind,
        ...(name ? { name } : {}),
        ...(resolution.kind === 'ready' &&
        !hasConfiguredSelections(resolution.item.selections) &&
        nonempty(resolution.product.displayPrice)
          ? { priceLabel: nonempty(resolution.product.displayPrice) }
          : {}),
        ...(selectionLabel ? { selectionLabel } : {}),
      });
    }),
  );
}

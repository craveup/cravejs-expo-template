import type { ItemDetailLoadResult } from '../item/index.ts';

export type NutritionPresentationModel = Readonly<{
  calorieCount?: number;
  dietaryPreferences: readonly string[];
  hasPublishedNutrition: boolean;
  ingredients: readonly string[];
  productName: string;
}>;

export type NutritionPresentationState =
  | Readonly<{
      status: 'error' | 'loading' | 'not-found' | 'offline' | 'unavailable';
    }>
  | Readonly<{ data: NutritionPresentationModel; status: 'ready' }>;

export function projectNutritionPresentation(
  result: ItemDetailLoadResult,
): NutritionPresentationState {
  if (result.kind === 'failed') {
    return Object.freeze({ status: result.status });
  }

  const dietaryPreferences = Object.freeze([
    ...(result.nutrition.dietaryPreferences ?? []),
  ]) as readonly string[];
  const ingredients = Object.freeze([
    ...(result.nutrition.ingredients ?? []),
  ]) as readonly string[];
  const hasPublishedNutrition =
    result.nutrition.calorieCount !== undefined ||
    dietaryPreferences.length > 0 ||
    ingredients.length > 0;

  return Object.freeze({
    data: Object.freeze({
      ...(result.nutrition.calorieCount === undefined
        ? {}
        : { calorieCount: result.nutrition.calorieCount }),
      dietaryPreferences,
      hasPublishedNutrition,
      ingredients,
      productName: result.product.name,
    }),
    status: 'ready',
  });
}

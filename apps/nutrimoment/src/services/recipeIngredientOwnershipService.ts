import type { Recipe, RecipeIngredientOwnership } from "@/lib/types";

export interface RecipeIngredientOwnershipOptions {
  canonicalize: (ingredient: string) => string;
  isAvailable: (ingredient: string, canonicalName: string) => boolean;
}

export interface RecipeIngredientOwnershipResult {
  lines: RecipeIngredientOwnership[];
  recipe: Recipe;
}

const SEPARATE_PANTRY_PURCHASE_PATTERN =
  /\b(?:broth|stock|bouillon|stuffing|soup|sauce|powder|seasoning|extract|concentrate)\b/i;

export function requiresSeparatePantryPurchase(ingredient: string) {
  return SEPARATE_PANTRY_PURCHASE_PATTERN.test(ingredient);
}

export function buildPantryOwnershipSet(
  input: { inputIngredients: string[]; normalizedIngredients: string[] },
  canonicalize: (ingredient: string) => string
) {
  return new Set(
    [...input.inputIngredients, ...input.normalizedIngredients]
      .map(canonicalize)
      .filter(Boolean)
  );
}

export function isPantryIngredientOwned(input: {
  availableIngredients: Set<string>;
  canonicalName: string;
  displayText: string;
  matchRelatedIngredient: (ingredient: string) => boolean;
}) {
  if (requiresSeparatePantryPurchase(input.displayText)) {
    return input.availableIngredients.has(input.canonicalName);
  }
  return input.matchRelatedIngredient(input.displayText);
}

export function classifyRecipeIngredientOwnership(
  recipe: Recipe,
  options: RecipeIngredientOwnershipOptions
): RecipeIngredientOwnershipResult {
  const uniqueLines = new Map<string, { canonicalName: string; displayText: string }>();

  for (const displayText of [...recipe.ingredients, ...recipe.missing_ingredients]) {
    const trimmed = normalizeIngredientDisplayText(displayText);
    if (!trimmed) continue;
    const canonicalName = options.canonicalize(trimmed) || trimmed.toLocaleLowerCase();
    const existing = uniqueLines.get(canonicalName);
    if (!existing || ingredientDetailScore(trimmed) > ingredientDetailScore(existing.displayText)) {
      uniqueLines.set(canonicalName, { canonicalName, displayText: trimmed });
    }
  }

  const lines: RecipeIngredientOwnership[] = [];
  const owned: string[] = [];
  const missing: string[] = [];

  for (const line of uniqueLines.values()) {
    const availability = options.isAvailable(line.displayText, line.canonicalName)
      ? "owned"
      : "missing";
    lines.push({ ...line, availability });
    (availability === "owned" ? owned : missing).push(line.displayText);
  }

  return {
    lines,
    recipe: {
      ...recipe,
      ingredient_ownership: lines,
      ingredients: owned,
      missing_ingredients: missing
    }
  };
}

export function normalizeCompleteRecipeIngredientLines(
  recipe: Recipe,
  canonicalize: (ingredient: string) => string
) {
  return classifyRecipeIngredientOwnership(recipe, {
    canonicalize,
    isAvailable: () => true
  }).recipe;
}

function ingredientDetailScore(value: string) {
  const hasQuantity = /(?:^|\s)(?:\d+(?:[./]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])(?:\s|$)/u.test(value);
  const hasUnit = /\b(?:cup|cups|tbsp|tsp|g|gram|grams|kg|lb|lbs|oz|ounce|ounces|can|cans|clove|cloves|piece|pieces|slice|slices|portion|portions)\b/i.test(value);
  return (hasQuantity ? 100 : 0) + (hasUnit ? 50 : 0) + Math.min(40, value.length);
}

function normalizeIngredientDisplayText(value: string) {
  return value
    .trim()
    .replace(/\b([A-Za-z]{3,})\s+\1\b/gi, "$1")
    .replace(/\s+/g, " ");
}

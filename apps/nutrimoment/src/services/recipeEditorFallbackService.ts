import type { LocalizedRecipeVariant, Recipe } from "@/lib/types";
import { RecipeQualityGate } from "@/services/recipeQualityGate";

const EDITED_RECIPE_BLOCKING_REASONS = new Set([
  "duplicate_ingredients",
  "duplicate_instructions",
  "english_leakage_in_arabic",
  "forbidden_arabic_transliteration",
  "implausible_calories",
  "implausible_macros",
  "implausible_sodium",
  "incomplete_nutrition",
  "ingredient_only_title",
  "invalid_recipe_instructions",
  "malformed_recipe_title",
  "missing_ingredients",
  "missing_instructions",
  "missing_required_fields",
  "missing_title_or_cuisine",
  "plant_substitution_template_artifact",
  "unrealistic_cooking_time"
]);

const EDITED_RECIPE_BLOCKING_PREFIXES = [
  "ingredient_not_used:",
  "missing_dish_stage:",
  "protein_missing_quantity:",
  "required_ingredient_not_used:",
  "step_ingredient_not_listed:"
];

const SOURCE_FALLBACK_BLOCKING_REASONS = new Set([
  "duplicate_instructions",
  "english_leakage_in_arabic",
  "forbidden_arabic_transliteration",
  "implausible_calories",
  "implausible_macros",
  "implausible_sodium",
  "incomplete_nutrition",
  "invalid_recipe_instructions",
  "malformed_recipe_title",
  "missing_ingredients",
  "missing_instructions",
  "missing_title_or_cuisine",
  "plant_substitution_template_artifact",
  "unrealistic_cooking_time"
]);

const SOURCE_FALLBACK_BLOCKING_PREFIXES = [
  "missing_dish_stage:",
  "required_ingredient_not_used:",
  "step_ingredient_not_listed:"
];

const qualityGate = new RecipeQualityGate();

export function getBlockingEditedRecipeQualityReasons(reasons: string[]) {
  return reasons.filter((reason) =>
    EDITED_RECIPE_BLOCKING_REASONS.has(reason) ||
    EDITED_RECIPE_BLOCKING_PREFIXES.some((prefix) => reason.startsWith(prefix))
  );
}

/**
 * Returns documented source facts only. It never translates, estimates, or
 * synthesizes ingredients and instructions when an editor enhancement fails.
 */
export function buildValidatedSourceFallback(
  sourceRecipe: Recipe,
  recipeLanguage: string
): Recipe | null {
  const selected = selectLanguageVariant(sourceRecipe, recipeLanguage);
  if (!selected) return null;

  const fallback = cloneRecipe(selected);
  const reasons = qualityGate.validate(fallback, recipeLanguage).reasons;
  if (reasons.some((reason) =>
    SOURCE_FALLBACK_BLOCKING_REASONS.has(reason) ||
    SOURCE_FALLBACK_BLOCKING_PREFIXES.some((prefix) => reason.startsWith(prefix))
  )) {
    return null;
  }

  return fallback;
}

function selectLanguageVariant(sourceRecipe: Recipe, recipeLanguage: string): Recipe | null {
  const wantsArabic = recipeLanguage.toLowerCase() === "arabic";
  const localizedVariant = wantsArabic
    ? sourceRecipe.localized?.Arabic
    : sourceRecipe.localized?.English;

  if (isCompleteVariant(localizedVariant)) {
    return mergeLocalizedVariant(sourceRecipe, localizedVariant);
  }

  if (wantsArabic) {
    const userFacingText = collectUserFacingText(sourceRecipe);
    if (/[A-Za-z]/.test(userFacingText) || !/[\u0600-\u06ff]/u.test(userFacingText)) {
      return null;
    }
  }

  return sourceRecipe;
}

function isCompleteVariant(variant: LocalizedRecipeVariant | undefined): variant is LocalizedRecipeVariant {
  return Boolean(
    variant?.name?.trim() &&
    variant.cuisine?.trim() &&
    variant.ingredients?.length &&
    variant.steps?.length >= 2
  );
}

function mergeLocalizedVariant(sourceRecipe: Recipe, variant: LocalizedRecipeVariant): Recipe {
  return {
    ...sourceRecipe,
    ...variant,
    id: sourceRecipe.id,
    source_recipe_id: sourceRecipe.source_recipe_id ?? sourceRecipe.id,
    recipe_source_type: sourceRecipe.recipe_source_type,
    source_url: sourceRecipe.source_url,
    localized: sourceRecipe.localized
  };
}

function collectUserFacingText(recipe: Recipe) {
  return [
    recipe.name,
    recipe.cuisine,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps,
    recipe.cook_time,
    recipe.difficulty
  ].join(" ");
}

function cloneRecipe(recipe: Recipe): Recipe {
  return {
    ...recipe,
    ingredients: [...recipe.ingredients],
    missing_ingredients: [...recipe.missing_ingredients],
    steps: [...recipe.steps],
    preference_hits: recipe.preference_hits ? [...recipe.preference_hits] : undefined,
    image_search_indices: recipe.image_search_indices ? [...recipe.image_search_indices] : undefined,
    localized: recipe.localized
      ? {
          English: recipe.localized.English
            ? cloneLocalizedVariant(recipe.localized.English)
            : undefined,
          Arabic: recipe.localized.Arabic
            ? cloneLocalizedVariant(recipe.localized.Arabic)
            : undefined
        }
      : undefined
  };
}

function cloneLocalizedVariant(variant: LocalizedRecipeVariant): LocalizedRecipeVariant {
  return {
    ...variant,
    ingredients: [...variant.ingredients],
    missing_ingredients: [...variant.missing_ingredients],
    steps: [...variant.steps],
    preference_hits: variant.preference_hits ? [...variant.preference_hits] : undefined,
    image_search_indices: variant.image_search_indices ? [...variant.image_search_indices] : undefined
  };
}

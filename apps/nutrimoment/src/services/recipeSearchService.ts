import type { Recipe, MealPlanMeal } from "@/lib/types";
import { normalizeCuisineLabel } from "@/lib/cuisines";
import { normalizeCachedRecipeCatalogDoc } from "@/data/offline/recipeMetadata";
import type { RankedRecipeResult, RecipeCatalogDoc, RecipeSearchResponse, UserPreferenceSnapshot } from "@/lib/domain";
import { buildPreferenceProfile } from "@/lib/preferences";
import {
  isArabicRecipeLanguage,
  localizeRecipeForArabic,
  localizeRecipeForEnglish,
  translateIngredientToArabic,
  translateIngredientToEnglish
} from "@/lib/arabicRecipeLocalization";
import { enrichRecipeWithDishIntent } from "@/lib/recipeDishIntelligence";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import { rankRecipes } from "@/services/rankingService";
import { retrieveRecipeCandidates } from "@/services/recipeRetrievalService";
import { listSeededRecipes } from "@/repositories/recipeRepo";
import { listSharedCachedRecipes } from "@/services/userRecipeCacheService";

export interface CatalogRecipeSearchInput {
  ingredients: string[];
  preferredCuisine?: string;
  calorieTarget?: number;
  diets?: string[];
  conditions?: string[];
  allergens?: string[];
  maxResults?: number;
  mealType?: string;
  recipeLanguage?: string;
  uid?: string;
}

export interface CatalogRecipeSearchResult extends RecipeSearchResponse {
  rankedRecipeIds: string[];
  candidateRecipes: RecipeCatalogDoc[];
}

export async function searchCatalogRecipes(input: CatalogRecipeSearchInput): Promise<CatalogRecipeSearchResult> {
  const normalized = await normalizeIngredients(input.ingredients);
  const preferences = buildPreferenceProfile({
    preferredCuisine: input.preferredCuisine ?? "Any",
    calorieTarget: input.calorieTarget ?? 2000,
    diets: input.diets ?? [],
    conditions: input.conditions ?? [],
    allergens: input.allergens ?? []
  } satisfies UserPreferenceSnapshot);

  const sharedCachedRecipes = await listSharedCachedRecipes();
  const { candidateRecipes, candidateRecipeIds } = await retrieveRecipeCandidates(normalized.normalized);
  const primaryRecipePool = dedupeCatalogRecipes([
    ...sharedCachedRecipes,
    ...candidateRecipes
  ]);
  const ranked = rankRecipes({
    recipes: primaryRecipePool,
    normalizedIngredients: normalized.normalized,
    preferredCuisine: preferences.preferredCuisine,
    maxCalories: preferences.nutritionGoals.maxCalories,
    mealType: input.mealType,
    preferences
  });
  const fallbackCandidateRecipes = dedupeCatalogRecipes([
    ...sharedCachedRecipes,
    ...listSeededRecipes().filter((recipe) => recipe.isActive)
  ]);
  const fallbackRanked = rankRecipes({
        recipes: fallbackCandidateRecipes,
        normalizedIngredients: normalized.normalized,
        preferredCuisine: preferences.preferredCuisine,
        maxCalories: preferences.nutritionGoals.maxCalories,
        mealType: input.mealType,
        preferences
      });
  const rankedResults = ranked.length ? ranked : fallbackRanked;
  const rankedRecipePool = ranked.length ? primaryRecipePool : fallbackCandidateRecipes;

  const limit = input.maxResults ?? 3;
  const recipeMap = new Map(rankedRecipePool.map((recipe) => [recipe.id, recipe]));
  const topRanked = selectDistinctRankedResults(rankedResults, recipeMap, limit);
  const recipes = topRanked
    .map((result) => {
      const recipe = recipeMap.get(result.recipeId);
      return recipe
        ? mapCatalogRecipeToUiRecipe(
            recipe,
            result.missingRequired.concat(result.missingOptional),
            result.matchQuality,
            result.matchedRequiredCount,
            result.matchedOptionalCount,
            result.preferenceHits,
            input.recipeLanguage
          )
        : null;
    })
    .filter((recipe): recipe is Recipe => Boolean(recipe));

  return {
    ingredientsNormalized: normalized.normalized,
    recipes,
    servedFrom: "offline_catalog",
    canLoadMore:
      rankedResults.length > topRanked.length ||
      Math.max(candidateRecipeIds.length, primaryRecipePool.length, fallbackCandidateRecipes.length) > limit,
    rankedRecipeIds: topRanked.map((item) => item.recipeId),
    candidateRecipes: rankedRecipePool
  };
}

export function mapCatalogRecipeToUiRecipe(
  recipe: RecipeCatalogDoc,
  missingIngredients: string[],
  matchQuality: Recipe["match_quality"],
  matchedRequiredCount: number,
  matchedOptionalCount: number,
  preferenceHits: string[],
  recipeLanguage = "English"
): Recipe {
  const normalizedRecipe = normalizeCachedRecipeCatalogDoc(recipe);
  const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
  const englishBase: Recipe = {
    id: normalizedRecipe.id,
    name: normalizedRecipe.localized?.English?.name ?? normalizedRecipe.title,
    cuisine: normalizedRecipe.localized?.English?.cuisine ?? normalizeCuisineLabel(normalizedRecipe.cuisine),
    ingredients: normalizedRecipe.ingredientCanonicals
      .filter((ingredient) => !missingIngredients.includes(ingredient))
      .map(translateIngredientToEnglish),
    missing_ingredients: missingIngredients.map(translateIngredientToEnglish),
    steps: normalizedRecipe.localized?.English?.steps?.length ? normalizedRecipe.localized.English.steps : normalizedRecipe.steps,
    calories: normalizedRecipe.calories,
    protein: normalizedRecipe.localized?.English?.protein ?? `${normalizedRecipe.protein}g`,
    carbs: normalizedRecipe.localized?.English?.carbs ?? `${normalizedRecipe.carbs}g`,
    fat: normalizedRecipe.localized?.English?.fat ?? `${normalizedRecipe.fat}g`,
    fiber: normalizedRecipe.localized?.English?.fiber ?? (normalizedRecipe.fiber ? `${normalizedRecipe.fiber}g` : undefined),
    sugar: normalizedRecipe.localized?.English?.sugar ?? (normalizedRecipe.sugar ? `${normalizedRecipe.sugar}g` : undefined),
    sodium: normalizedRecipe.localized?.English?.sodium ?? (normalizedRecipe.sodium ? `${normalizedRecipe.sodium}mg` : undefined),
    cook_time: normalizedRecipe.localized?.English?.cook_time ?? `${normalizedRecipe.totalMinutes} mins`,
    difficulty: normalizedRecipe.localized?.English?.difficulty ?? capitalize(normalizedRecipe.difficulty),
    image_url: normalizedRecipe.localized?.English?.image_url ?? normalizeRecipeImageUrl(normalizedRecipe.image.thumbPath || normalizedRecipe.image.storagePath),
    image_source: normalizedRecipe.localized?.English?.image_source,
    image_attribution_name: normalizedRecipe.localized?.English?.image_attribution_name,
    image_attribution_url: normalizedRecipe.localized?.English?.image_attribution_url,
    image_search_index: normalizedRecipe.localized?.English?.image_search_index,
    image_search_indices: normalizedRecipe.localized?.English?.image_search_indices,
    match_quality: matchQuality,
    matched_required_count: matchedRequiredCount,
    matched_optional_count: matchedOptionalCount,
    preference_hits: normalizeStringArray(normalizedRecipe.localized?.English?.preference_hits).length
      ? normalizeStringArray(normalizedRecipe.localized?.English?.preference_hits)
      : preferenceHits
  };

  const localized = selectDisplayLocalizedVariant(normalizedRecipe, englishBase, wantsArabic);

  const availableIngredients = normalizedRecipe.ingredientCanonicals
    .filter((ingredient) => !missingIngredients.includes(ingredient))
    .map(wantsArabic ? translateIngredientToArabic : translateIngredientToEnglish);
  const missingLocalized = missingIngredients.map(wantsArabic ? translateIngredientToArabic : translateIngredientToEnglish);

  return enrichRecipeWithDishIntent({
    ...englishBase,
    name: localized.name,
    cuisine: localized.cuisine,
    ingredients: localized.ingredients?.length ? localized.ingredients : availableIngredients,
    missing_ingredients: localized.missing_ingredients?.length ? localized.missing_ingredients : missingLocalized,
    steps: localized.steps?.length ? localized.steps : englishBase.steps,
    protein: localized.protein ?? englishBase.protein,
    carbs: localized.carbs ?? englishBase.carbs,
    fat: localized.fat ?? englishBase.fat,
    fiber: localized.fiber ?? englishBase.fiber,
    sugar: localized.sugar ?? englishBase.sugar,
    sodium: localized.sodium ?? englishBase.sodium,
    cook_time: localized.cook_time ?? englishBase.cook_time,
    difficulty: localized.difficulty ?? englishBase.difficulty,
    image_url: localized.image_url ?? englishBase.image_url,
    image_source: localized.image_source ?? englishBase.image_source,
    image_attribution_name: localized.image_attribution_name ?? englishBase.image_attribution_name,
    image_attribution_url: localized.image_attribution_url ?? englishBase.image_attribution_url,
    image_search_index: localized.image_search_index ?? englishBase.image_search_index,
    image_search_indices: localized.image_search_indices ?? englishBase.image_search_indices,
    preference_hits: normalizeStringArray(localized.preference_hits).length
      ? normalizeStringArray(localized.preference_hits)
      : englishBase.preference_hits
  }, {
    availableIngredients: [...englishBase.ingredients, ...englishBase.missing_ingredients],
    preferredCuisine: englishBase.cuisine
  });
}

export function mapCatalogRecipeToMeal(recipe: RecipeCatalogDoc | undefined): MealPlanMeal {
  if (!recipe) {
    return {
      name: "Flexible meal slot",
      calories: 0,
      protein: "0g",
      carbs: "0g",
      fat: "0g",
      ingredients: []
    };
  }

  return {
    name: recipe.title,
    calories: recipe.calories,
    protein: `${recipe.protein}g`,
    carbs: `${recipe.carbs}g`,
    fat: `${recipe.fat}g`,
    ingredients: recipe.ingredientCanonicals,
    steps: recipe.steps
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeRecipeImageUrl(value?: string) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function selectDisplayLocalizedVariant(recipe: RecipeCatalogDoc, englishBase: Recipe, wantsArabic: boolean) {
  const englishVariant = recipe.localized?.English ?? localizeRecipeForEnglish(englishBase);
  if (!wantsArabic) {
    return containsArabicDisplayText(englishVariant) ? localizeRecipeForEnglish(englishBase) : englishVariant;
  }

  const arabicVariant = recipe.localized?.Arabic ?? localizeRecipeForArabic(englishBase);
  return containsLatinDisplayText(arabicVariant) ? localizeRecipeForArabic(englishBase) : arabicVariant;
}

function dedupeCatalogRecipes(recipes: RecipeCatalogDoc[]) {
  return Array.from(new Map(recipes.map((recipe) => [recipe.id, recipe])).values());
}

function selectDistinctRankedResults(
  rankedResults: RankedRecipeResult[],
  recipeMap: Map<string, RecipeCatalogDoc>,
  limit: number
) {
  const selected: RankedRecipeResult[] = [];
  const selectedRecipes: RecipeCatalogDoc[] = [];

  for (const result of rankedResults) {
    const recipe = recipeMap.get(result.recipeId);
    if (!recipe) continue;
    if (selectedRecipes.some((existing) => areNearDuplicateRecipes(existing, recipe))) {
      continue;
    }

    selected.push(result);
    selectedRecipes.push(recipe);
    if (selected.length >= limit) break;
  }

  return selected;
}

function areNearDuplicateRecipes(left: RecipeCatalogDoc, right: RecipeCatalogDoc) {
  if (left.id === right.id) return true;

  const leftTitle = normalizeRecipeIdentityTitle(left);
  const rightTitle = normalizeRecipeIdentityTitle(right);
  if (leftTitle && rightTitle && leftTitle === rightTitle) {
    return true;
  }

  const ingredientOverlap = jaccardSimilarity(left.ingredientCanonicals, right.ingredientCanonicals);
  const requiredOverlap = jaccardSimilarity(left.requiredCanonicals, right.requiredCanonicals);
  const cuisineMatches = left.cuisine.trim().toLowerCase() === right.cuisine.trim().toLowerCase();
  const mealTypeMatches = left.mealType === right.mealType;

  return cuisineMatches && mealTypeMatches && ingredientOverlap >= 0.82 && requiredOverlap >= 0.82;
}

function normalizeRecipeIdentityTitle(recipe: RecipeCatalogDoc) {
  return (recipe.localized?.English?.name ?? recipe.title)
    .toLowerCase()
    .replace(/\b(egyptian|middle eastern|mediterranean|italian|american|arabic)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(left: string[], right: string[]) {
  const leftSet = new Set(left.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const rightSet = new Set(right.map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!leftSet.size || !rightSet.size) return 0;

  let intersection = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) intersection += 1;
  }

  return intersection / new Set([...leftSet, ...rightSet]).size;
}

function containsArabicDisplayText(recipe: Pick<Recipe, "name" | "cuisine" | "ingredients" | "missing_ingredients" | "steps">) {
  return /[\u0600-\u06FF]/.test([
    recipe.name,
    recipe.cuisine,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps
  ].join(" "));
}

function containsLatinDisplayText(recipe: Pick<Recipe, "name" | "cuisine" | "ingredients" | "missing_ingredients" | "steps">) {
  return /[A-Za-z]/.test([
    recipe.name,
    recipe.cuisine,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps
  ].join(" "));
}

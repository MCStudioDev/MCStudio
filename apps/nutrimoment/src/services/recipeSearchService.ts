import type { Recipe, MealPlanMeal } from "@/lib/types";
import { normalizeCuisineLabel } from "@/lib/cuisines";
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
import { listSharedCachedRecipes, listUserCachedRecipes } from "@/services/userRecipeCacheService";

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

  const [cachedRecipes, sharedCachedRecipes] = await Promise.all([
    listUserCachedRecipes(input.uid),
    listSharedCachedRecipes()
  ]);
  const { candidateRecipes, candidateRecipeIds } = await retrieveRecipeCandidates(normalized.normalized);
  const primaryRecipePool = dedupeCatalogRecipes([
    ...cachedRecipes,
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
    ...cachedRecipes,
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
  const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
  const englishBase: Recipe = {
    id: recipe.id,
    name: recipe.localized?.English?.name ?? recipe.title,
    cuisine: recipe.localized?.English?.cuisine ?? normalizeCuisineLabel(recipe.cuisine),
    ingredients: recipe.ingredientCanonicals
      .filter((ingredient) => !missingIngredients.includes(ingredient))
      .map(translateIngredientToEnglish),
    missing_ingredients: missingIngredients.map(translateIngredientToEnglish),
    steps: recipe.localized?.English?.steps?.length ? recipe.localized.English.steps : recipe.steps,
    calories: recipe.calories,
    protein: recipe.localized?.English?.protein ?? `${recipe.protein}g`,
    carbs: recipe.localized?.English?.carbs ?? `${recipe.carbs}g`,
    fat: recipe.localized?.English?.fat ?? `${recipe.fat}g`,
    fiber: recipe.localized?.English?.fiber ?? (recipe.fiber ? `${recipe.fiber}g` : undefined),
    sugar: recipe.localized?.English?.sugar ?? (recipe.sugar ? `${recipe.sugar}g` : undefined),
    sodium: recipe.localized?.English?.sodium ?? (recipe.sodium ? `${recipe.sodium}mg` : undefined),
    cook_time: recipe.localized?.English?.cook_time ?? `${recipe.totalMinutes} mins`,
    difficulty: recipe.localized?.English?.difficulty ?? capitalize(recipe.difficulty),
    image_url: recipe.localized?.English?.image_url ?? normalizeRecipeImageUrl(recipe.image.thumbPath || recipe.image.storagePath),
    image_source: recipe.localized?.English?.image_source,
    image_attribution_name: recipe.localized?.English?.image_attribution_name,
    image_attribution_url: recipe.localized?.English?.image_attribution_url,
    image_search_index: recipe.localized?.English?.image_search_index,
    image_search_indices: recipe.localized?.English?.image_search_indices,
    match_quality: matchQuality,
    matched_required_count: matchedRequiredCount,
    matched_optional_count: matchedOptionalCount,
    preference_hits: normalizeStringArray(recipe.localized?.English?.preference_hits).length
      ? normalizeStringArray(recipe.localized?.English?.preference_hits)
      : preferenceHits
  };

  const localized =
    wantsArabic
      ? recipe.localized?.Arabic ?? localizeRecipeForArabic(englishBase)
      : recipe.localized?.English ?? localizeRecipeForEnglish(englishBase);

  const availableIngredients = recipe.ingredientCanonicals
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

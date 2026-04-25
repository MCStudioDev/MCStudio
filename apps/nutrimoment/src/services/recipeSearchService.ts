import type { Recipe, MealPlanMeal } from "@/lib/types";
import { normalizeCuisineLabel } from "@/lib/cuisines";
import type { RecipeCatalogDoc, RecipeSearchResponse, UserPreferenceSnapshot } from "@/lib/domain";
import { buildPreferenceProfile } from "@/lib/preferences";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import { rankRecipes } from "@/services/rankingService";
import { retrieveRecipeCandidates } from "@/services/recipeRetrievalService";

export interface CatalogRecipeSearchInput {
  ingredients: string[];
  preferredCuisine?: string;
  calorieTarget?: number;
  diets?: string[];
  conditions?: string[];
  allergens?: string[];
  maxResults?: number;
  mealType?: string;
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

  const { candidateRecipes, candidateRecipeIds } = await retrieveRecipeCandidates(normalized.normalized);
  const ranked = rankRecipes({
    recipes: candidateRecipes,
    normalizedIngredients: normalized.normalized,
    preferredCuisine: preferences.preferredCuisine,
    maxCalories: preferences.nutritionGoals.maxCalories,
    mealType: input.mealType,
    preferences
  });

  const limit = input.maxResults ?? 3;
  const topRanked = ranked.slice(0, limit);
  const recipeMap = new Map(candidateRecipes.map((recipe) => [recipe.id, recipe]));
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
            result.preferenceHits
          )
        : null;
    })
    .filter((recipe): recipe is Recipe => Boolean(recipe));

  return {
    ingredientsNormalized: normalized.normalized,
    recipes,
    servedFrom: "offline_catalog",
    canLoadMore: candidateRecipeIds.length > limit,
    rankedRecipeIds: topRanked.map((item) => item.recipeId),
    candidateRecipes
  };
}

export function mapCatalogRecipeToUiRecipe(
  recipe: RecipeCatalogDoc,
  missingIngredients: string[],
  matchQuality: Recipe["match_quality"],
  matchedRequiredCount: number,
  matchedOptionalCount: number,
  preferenceHits: string[]
): Recipe {
  return {
    id: recipe.id,
    name: recipe.title,
    cuisine: normalizeCuisineLabel(recipe.cuisine),
    ingredients: recipe.ingredientCanonicals.filter((ingredient) => !missingIngredients.includes(ingredient)),
    missing_ingredients: missingIngredients,
    steps: recipe.steps,
    calories: recipe.calories,
    protein: `${recipe.protein}g`,
    carbs: `${recipe.carbs}g`,
    fat: `${recipe.fat}g`,
    fiber: recipe.fiber ? `${recipe.fiber}g` : undefined,
    sugar: recipe.sugar ? `${recipe.sugar}g` : undefined,
    sodium: recipe.sodium ? `${recipe.sodium}mg` : undefined,
    cook_time: `${recipe.totalMinutes} mins`,
    difficulty: capitalize(recipe.difficulty),
    image_url: normalizeRecipeImageUrl(recipe.image.thumbPath || recipe.image.storagePath),
    match_quality: matchQuality,
    matched_required_count: matchedRequiredCount,
    matched_optional_count: matchedOptionalCount,
    preference_hits: preferenceHits
  };
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
  if (/^(https?:|data:)/.test(value)) return value;
  return undefined;
}

import type { RankedRecipeResult, RecipeCatalogDoc } from "@/lib/domain";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import type { ResolvedPreferenceProfile } from "@/lib/preferences";

export interface RankRecipesInput {
  recipes: RecipeCatalogDoc[];
  normalizedIngredients: string[];
  preferredCuisine: string;
  mealType?: string;
  maxCalories?: number;
  preferences: ResolvedPreferenceProfile;
}

export function rankRecipes({
  recipes,
  normalizedIngredients,
  preferredCuisine,
  mealType,
  maxCalories,
  preferences
}: RankRecipesInput): RankedRecipeResult[] {
  const available = new Set(normalizedIngredients);

  return recipes
    .map((recipe) => {
      const matchedRequired = recipe.requiredCanonicals.filter((item) => available.has(item));
      const missingRequired = recipe.requiredCanonicals.filter((item) => !available.has(item));
      const matchedOptional = recipe.optionalCanonicals.filter((item) => available.has(item));
      const missingOptional = recipe.optionalCanonicals.filter((item) => !available.has(item));
      const allergenViolation = (preferences.allergens ?? []).some((allergen) => recipe.allergenTags.includes(allergen));
      const dietViolation = preferences.requiredDietTags.some((dietTag) => !recipe.dietTags.includes(dietTag));
      const dietMatch = preferences.requiredDietTags.length
        ? Number(preferences.requiredDietTags.every((dietTag) => recipe.dietTags.includes(dietTag)))
        : 0;
      const preferredDietTagMatches = preferences.preferredDietTags.filter((dietTag) => recipe.dietTags.includes(dietTag)).length;
      const calorieMatch = maxCalories ? Number(recipe.calories <= maxCalories) : 0;
      const cuisineMatch = preferredCuisine !== "Any" && cuisineMatchesPreference(recipe.cuisine, preferredCuisine) ? 1 : 0;
      const mealTypeMatch = mealType && recipe.mealType === mealType ? 1 : 0;
      const popularityBoost = normalizeBoost(recipe.popularityScore);
      const qualityBoost = normalizeBoost(recipe.qualityScore);
      const nutritionGoalScore = scoreNutritionGoals(recipe, preferences);
      const preferenceHits = buildPreferenceHits(recipe, preferences, preferredDietTagMatches, calorieMatch);

      const score =
        8 * matchedRequired.length +
        3 * matchedOptional.length -
        7 * missingRequired.length -
        2 * missingOptional.length +
        5 * dietMatch +
        2 * preferredDietTagMatches +
        3 * calorieMatch +
        2 * cuisineMatch +
        2 * mealTypeMatch +
        nutritionGoalScore +
        popularityBoost +
        qualityBoost -
        (allergenViolation ? 100 : 0);

      return {
        recipeId: recipe.id,
        score,
        matchQuality: deriveMatchQuality(missingRequired.length, missingOptional.length),
        matchedRequiredCount: matchedRequired.length,
        matchedOptionalCount: matchedOptional.length,
        missingRequired,
        missingOptional,
        preferenceHits,
        hardRejected: allergenViolation || dietViolation,
        servedFrom: "offline_catalog" as const
      };
    })
    .filter((item) => item.score > -100 && !item.hardRejected)
    .sort((left, right) => right.score - left.score);
}

function deriveMatchQuality(missingRequiredCount: number, missingOptionalCount: number): RankedRecipeResult["matchQuality"] {
  if (missingRequiredCount === 0 && missingOptionalCount <= 1) return "great";
  if (missingRequiredCount === 0) return "good";
  if (missingRequiredCount === 1) return "possible";
  return "stretch";
}

function normalizeBoost(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 90) return 2;
  if (value >= 60) return 1;
  return 0;
}

function scoreNutritionGoals(recipe: RecipeCatalogDoc, preferences: ResolvedPreferenceProfile) {
  const goals = preferences.nutritionGoals;
  let score = 0;

  score += scoreCeiling(recipe.calories, goals.maxCalories, 2);
  score += scoreCeiling(recipe.carbs, goals.maxCarbs, 2);
  score += scoreCeiling(recipe.sugar, goals.maxSugar, 2);
  score += scoreCeiling(recipe.sodium, goals.maxSodium, 2);
  score += scoreCeiling(recipe.fat, goals.maxFat, 2);
  score += scoreFloor(recipe.calories, goals.minCalories, 2);
  score += scoreFloor(recipe.protein, goals.minProtein, 2);
  score += scoreFloor(recipe.sodium, goals.minSodium, 1);
  score += scoreFloor(recipe.fiber, goals.minFiber, 2);

  return score;
}

function scoreCeiling(value: number | undefined, ceiling: number | undefined, weight: number) {
  if (ceiling == null || value == null || !Number.isFinite(value)) return 0;
  return value <= ceiling ? weight : -weight;
}

function scoreFloor(value: number | undefined, floor: number | undefined, weight: number) {
  if (floor == null || value == null || !Number.isFinite(value)) return 0;
  return value >= floor ? weight : -weight;
}

function buildPreferenceHits(
  recipe: RecipeCatalogDoc,
  preferences: ResolvedPreferenceProfile,
  preferredDietTagMatches: number,
  calorieMatch: number
) {
  const hits: string[] = [];

  for (const tag of preferences.requiredDietTags) {
    if (recipe.dietTags.includes(tag)) {
      hits.push(tag);
    }
  }

  if (preferredDietTagMatches > 0) {
    preferences.preferredDietTags.forEach((tag) => {
      if (recipe.dietTags.includes(tag) && !hits.includes(tag)) {
        hits.push(tag);
      }
    });
  }

  if (calorieMatch && !hits.includes("calorie-aligned")) {
    hits.push("calorie-aligned");
  }

  return hits.slice(0, 4);
}

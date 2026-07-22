import type { RankedRecipeResult, RecipeCatalogDoc } from "@/lib/domain";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import { scoreCuisineFit } from "@/lib/cuisineScoring";
import { expandIngredientFamilies } from "@/lib/ingredientFamilies";
import type { ResolvedPreferenceProfile } from "@/lib/preferences";
import { IngredientNormalizer, getIngredientProfileForTerm, normalizeIngredientText } from "@/food/IngredientNormalizer";

export interface RankRecipesInput {
  recipes: RecipeCatalogDoc[];
  normalizedIngredients: string[];
  culinaryDishFamilies?: string[];
  preferredCuisine: string;
  mealType?: string;
  maxCalories?: number;
  preferences: ResolvedPreferenceProfile;
}

export function rankRecipes({
  recipes,
  normalizedIngredients,
  culinaryDishFamilies = [],
  preferredCuisine,
  mealType,
  maxCalories,
  preferences
}: RankRecipesInput): RankedRecipeResult[] {
  const ingredientNormalizer = new IngredientNormalizer();
  const available = buildWeightedAvailableIngredientSet(normalizedIngredients, ingredientNormalizer);

  return recipes
    .map((recipe) => {
      const requiredMatches = recipe.requiredCanonicals.map((item) => ({
        item,
        weight: getAvailableIngredientMatchWeight(item, available, ingredientNormalizer)
      }));
      const optionalMatches = recipe.optionalCanonicals.map((item) => ({
        item,
        weight: getAvailableIngredientMatchWeight(item, available, ingredientNormalizer)
      }));
      const matchedRequired = requiredMatches.filter((match) => match.weight > 0).map((match) => match.item);
      const missingRequired = requiredMatches.filter((match) => match.weight <= 0).map((match) => match.item);
      const matchedOptional = optionalMatches.filter((match) => match.weight > 0).map((match) => match.item);
      const missingOptional = optionalMatches.filter((match) => match.weight <= 0).map((match) => match.item);
      const requiredMatchWeight = requiredMatches.reduce((total, match) => total + match.weight, 0) / 100;
      const optionalMatchWeight = optionalMatches.reduce((total, match) => total + match.weight, 0) / 100;
      const allergenViolation = (preferences.allergens ?? []).some((allergen) => recipe.allergenTags.includes(allergen));
      const dietViolation = preferences.requiredDietTags.some((dietTag) => !recipe.dietTags.includes(dietTag));
      const dietMatch = preferences.requiredDietTags.length
        ? Number(preferences.requiredDietTags.every((dietTag) => recipe.dietTags.includes(dietTag)))
        : 0;
      const preferredDietTagMatches = preferences.preferredDietTags.filter((dietTag) => recipe.dietTags.includes(dietTag)).length;
      const calorieMatch = maxCalories ? Number(recipe.calories <= maxCalories) : 0;
      const cuisineMatch = preferredCuisine !== "Any" && cuisineMatchesPreference(recipe.cuisine, preferredCuisine) ? 1 : 0;
      const regionalCuisineMatch = scoreRegionalCuisineMatch(recipe, preferredCuisine);
      const mealTypeMatch = mealType && recipe.mealType === mealType ? 1 : 0;
      const cuisineFit = scoreCuisineFit({
        preferredCuisine,
        recipeCuisine: recipe.cuisine,
        recipeName: recipe.title,
        mealType: recipe.mealType,
        availableIngredients: normalizedIngredients,
        recipeIngredients: recipe.ingredientCanonicals
      });
      const popularityBoost = normalizeBoost(recipe.popularityScore);
      const qualityBoost = normalizeBoost(recipe.qualityScore);
      const nutritionGoalScore = scoreNutritionGoals(recipe, preferences);
      const healthFit = scoreHealthMetadata(recipe, preferences);
      const aliasOverlapScore = scoreAliasOverlap(recipe, normalizedIngredients);
      const knowledgePathScore = scoreKnowledgePath(recipe, culinaryDishFamilies);
      const preferenceHits = buildPreferenceHits(
        recipe,
        preferences,
        preferredDietTagMatches,
        calorieMatch,
        cuisineFit.hits,
        healthFit.hits
      );

      const score =
        8 * requiredMatchWeight +
        3 * optionalMatchWeight -
        7 * missingRequired.length -
        2 * missingOptional.length +
        5 * dietMatch +
        2 * preferredDietTagMatches +
        3 * calorieMatch +
        2 * cuisineMatch +
        regionalCuisineMatch +
        2 * mealTypeMatch +
        cuisineFit.score +
        healthFit.score +
        aliasOverlapScore +
        knowledgePathScore +
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
        servedFrom: "shared_pool" as const
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
  calorieMatch: number,
  cuisineHits: string[],
  healthHits: string[]
) {
  const hits: string[] = [...cuisineHits, ...healthHits];

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

function scoreRegionalCuisineMatch(recipe: RecipeCatalogDoc, preferredCuisine: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return 0;
  const regionalCuisines = recipe.regionalCuisines ?? [];
  return regionalCuisines.some((cuisine) => cuisineMatchesPreference(cuisine, preferredCuisine)) ? 1 : 0;
}

function scoreAliasOverlap(recipe: RecipeCatalogDoc, normalizedIngredients: string[]) {
  const aliasTokens = recipe.searchMetadata?.aliasTokens ?? [];
  if (!aliasTokens.length || !normalizedIngredients.length) return 0;

  let overlap = 0;
  for (const ingredient of normalizedIngredients) {
    const normalizedIngredient = ingredient.trim().toLowerCase();
    if (!normalizedIngredient) continue;
    if (aliasTokens.some((token) => token === normalizedIngredient || token.includes(normalizedIngredient))) {
      overlap += 1;
    }
  }

  return Math.min(overlap, 3);
}

/**
 * A small prior from the deterministic ingredient graph. Ingredient and health
 * fit still dominate ranking; this only helps surface authentic known families.
 */
function scoreKnowledgePath(recipe: RecipeCatalogDoc, dishFamilies: string[]) {
  if (!dishFamilies.length) return 0;
  const haystack = [
    recipe.title,
    recipe.slug,
    recipe.dishIntent?.dish_name,
    recipe.localized?.English?.name,
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return dishFamilies.some((family) => haystack.includes(family.toLowerCase())) ? 3 : 0;
}

function buildWeightedAvailableIngredientSet(ingredients: string[], normalizer: IngredientNormalizer) {
  const weighted = new Map<string, number>();
  const add = (term: string, weight: number) => {
    const normalized = normalizeIngredientText(term);
    if (!normalized) return;
    weighted.set(normalized, Math.max(weighted.get(normalized) ?? 0, weight));
  };

  for (const ingredient of ingredients) {
    add(ingredient, 100);
    const normalized = normalizer.normalizeOne(ingredient);
    if (normalized) {
      add(normalized.id, 100);
      add(normalized.id.replace(/_/g, " "), 100);
      add(normalized.canonicalEnglishName, 100);
      normalized.aliases.forEach((alias) => add(alias.term, alias.weight));
    }
    expandIngredientFamilies([ingredient]).forEach((candidate) => add(candidate, 96));
  }

  return weighted;
}

function getAvailableIngredientMatchWeight(
  ingredient: string,
  available: Map<string, number>,
  normalizer: IngredientNormalizer
) {
  const normalizedIngredient = normalizeIngredientText(ingredient);
  if (!normalizedIngredient) return 0;

  const direct = available.get(normalizedIngredient);
  if (direct) return direct;

  const profile = getIngredientProfileForTerm(normalizedIngredient);
  if (profile) {
    const idMatch = available.get(profile.id) ?? available.get(profile.id.replace(/_/g, " "));
    if (idMatch) return idMatch;
    const aliasMatch = normalizer
      .expandAliasesForProfile(profile)
      .map((alias) => available.get(alias.term) ?? 0)
      .sort((left, right) => right - left)[0];
    if (aliasMatch) return aliasMatch;
  }

  const familyMatch = expandIngredientFamilies([normalizedIngredient])
    .map((candidate) => available.get(normalizeIngredientText(candidate)) ?? 0)
    .sort((left, right) => right - left)[0];
  if (familyMatch) return Math.min(96, familyMatch);

  for (const [availableIngredient, weight] of available.entries()) {
    if (isSafeIngredientSubsetMatch(normalizedIngredient, availableIngredient)) {
      return Math.min(88, weight);
    }
  }

  return 0;
}

function isSafeIngredientSubsetMatch(recipeIngredient: string, availableIngredient: string) {
  const requiresSeparatePurchase = /\b(broth|stock|bouillon|stuffing|soup|sauce|powder|seasoning|extract|concentrate)\b/i;
  if (requiresSeparatePurchase.test(recipeIngredient) || requiresSeparatePurchase.test(availableIngredient)) {
    return false;
  }

  return (
    (recipeIngredient.length >= 4 && availableIngredient.includes(recipeIngredient)) ||
    (availableIngredient.length >= 4 && recipeIngredient.includes(availableIngredient))
  );
}

function scoreHealthMetadata(recipe: RecipeCatalogDoc, preferences: ResolvedPreferenceProfile) {
  const conditionTags = new Set(recipe.healthMetadata?.conditionTags ?? []);
  const cautionFlags = new Set(recipe.healthMetadata?.cautionFlags ?? []);
  const nutritionClaims = new Set(recipe.healthMetadata?.nutritionClaims ?? []);
  const hits: string[] = [];
  let score = 0;

  for (const condition of preferences.conditions) {
    switch (condition) {
      case "diabetes":
        if (conditionTags.has("diabetes-friendly")) {
          score += 4;
          hits.push("condition:diabetes-friendly");
        }
        if (nutritionClaims.has("high-fiber")) {
          score += 1;
          hits.push("claim:high-fiber");
        }
        break;
      case "highBloodPressure":
        if (conditionTags.has("low-sodium")) {
          score += 4;
          hits.push("condition:low-sodium");
        }
        if (conditionTags.has("heart-healthy")) {
          score += 2;
          hits.push("condition:heart-healthy");
        }
        break;
      case "cholesterol":
        if (conditionTags.has("heart-healthy")) {
          score += 4;
          hits.push("condition:heart-healthy");
        }
        if (nutritionClaims.has("high-fiber")) {
          score += 1;
          hits.push("claim:high-fiber");
        }
        break;
      case "weightLoss":
        if (nutritionClaims.has("high-protein")) {
          score += 2;
          hits.push("claim:high-protein");
        }
        if (recipe.calories <= 450) {
          score += 1;
        }
        break;
      case "weightGain":
        if (recipe.calories >= 450) {
          score += 2;
          hits.push("goal:higher-calorie");
        }
        if (nutritionClaims.has("high-protein")) {
          score += 1;
          hits.push("claim:high-protein");
        }
        break;
      default:
        break;
    }
  }

  if (cautionFlags.has("high-potassium")) {
    score -= 1;
  }

  return {
    score,
    hits: Array.from(new Set(hits)).slice(0, 4)
  };
}

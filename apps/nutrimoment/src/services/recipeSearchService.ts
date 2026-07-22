import type { Recipe, MealPlanMeal } from "@/lib/types";
import { cuisineMatchesPreference, normalizeCuisineLabel } from "@/lib/cuisines";
import { getCompleteCuisineCatalog } from "@/lib/cuisineCatalogs/completeCatalogs";
import { OFFLINE_RECIPES } from "@/data/offline/recipes";
import { normalizeCachedRecipeCatalogDoc } from "@/data/offline/recipeMetadata";
import type { RankedRecipeResult, RecipeCatalogDoc, RecipeSearchResponse, UserPreferenceSnapshot } from "@/lib/domain";
import { buildPreferenceProfile } from "@/lib/preferences";
import {
  buildRecipeTitleSource,
  buildSharedRecipeArabicTitle,
  buildSharedRecipeDistinctKey,
  buildSharedRecipeEnglishTitle,
  isWeakArabicTitle,
  isWeakEnglishTitle,
  normalizeEnglishCuisineLabel,
  translateCuisineLabelToArabic
} from "@/lib/recipeDisplayTitles";
import { expandIngredientFamilies } from "@/lib/ingredientFamilies";
import {
  isArabicRecipeLanguage,
  ensureArabicRecipeLanguage,
  localizeRecipeForArabic,
  localizeRecipeForEnglish,
  translateIngredientToArabic,
  translateIngredientToEnglish
} from "@/lib/arabicRecipeLocalization";
import { enrichRecipeWithDishIntent } from "@/lib/recipeDishIntelligence";
import { buildPhotoIdentityFromCatalog } from "@/lib/photoIdentityBuilders";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import { rankRecipes } from "@/services/rankingService";
import {
  getWarmSharedRecipeCacheSnapshot,
  listSharedCachedRecipes,
  listSharedCachedRecipesForIngredients,
  listUserCachedRecipes,
  primeFullSharedRecipeCache
} from "@/services/userRecipeCacheService";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import { getIngredientCulinaryPaths } from "@/lib/IngredientKnowledgeGraph";
import { RecipeDiversityEngine } from "@/food/RecipeDiversityEngine";

const recipeDiversityEngine = new RecipeDiversityEngine();

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
  const expandedNormalizedIngredients = expandIngredientFamilies(normalized.normalized);
  const culinaryDishFamilies = expandedNormalizedIngredients
    .flatMap((ingredient) => getIngredientCulinaryPaths(ingredient, input.preferredCuisine))
    .map((path) => path.dishFamily);
  const cacheDiscoveryIngredients = expandSeafoodCacheDiscoveryIngredients(expandedNormalizedIngredients);
  const preferences = buildPreferenceProfile({
    preferredCuisine: input.preferredCuisine ?? "Any",
    calorieTarget: input.calorieTarget ?? 2000,
    diets: input.diets ?? [],
    conditions: input.conditions ?? [],
    allergens: input.allergens ?? []
  } satisfies UserPreferenceSnapshot);

  primeFullSharedRecipeCache();
  const warmSharedRecipeCache = getWarmSharedRecipeCacheSnapshot({ allowStale: true });
  const [userCachedRecipes, ingredientSharedCachedRecipes] = await Promise.all([
    listUserCachedRecipes(input.uid),
    warmSharedRecipeCache.length
      ? Promise.resolve([])
      : listSharedCachedRecipesForIngredients(cacheDiscoveryIngredients)
  ]);
  const sharedCachedRecipes =
    warmSharedRecipeCache.length
      ? warmSharedRecipeCache
      : ingredientSharedCachedRecipes.length
        ? ingredientSharedCachedRecipes
        : await listSharedCachedRecipes();
  const seededRecipes = OFFLINE_RECIPES.map((recipe) => normalizeCachedRecipeCatalogDoc(recipe));
  const primaryRecipePool = dedupeCatalogRecipes([...userCachedRecipes, ...sharedCachedRecipes, ...seededRecipes]);
  const ranked = rankRecipes({
    recipes: primaryRecipePool,
    normalizedIngredients: expandedNormalizedIngredients,
    culinaryDishFamilies,
    preferredCuisine: preferences.preferredCuisine,
    maxCalories: preferences.nutritionGoals.maxCalories,
    mealType: input.mealType,
    preferences
  });
  const ingredientMatchedRanked = ranked.filter(
    (result) => result.matchedRequiredCount + result.matchedOptionalCount > 0
  );
  const rankedResults = filterRankedResultsForSpecificCuisineQuality(
    ingredientMatchedRanked.length ? ingredientMatchedRanked : ranked,
    primaryRecipePool,
    preferences.preferredCuisine
  );
  const rankedRecipePool = primaryRecipePool;

  const limit = input.maxResults ?? 3;
  const recipeMap = new Map(rankedRecipePool.map((recipe) => [recipe.id, recipe]));
  const topRanked = selectDistinctRankedResults(rankedResults, recipeMap, limit, preferences.preferredCuisine);
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
    servedFrom: "shared_pool",
    canLoadMore:
      rankedResults.length > topRanked.length || primaryRecipePool.length > limit,
    rankedRecipeIds: topRanked.map((item) => item.recipeId),
    candidateRecipes: rankedRecipePool
  };
}

function expandSeafoodCacheDiscoveryIngredients(ingredients: string[]) {
  const expanded = new Set(ingredients);
  const hasSeafood = ingredients.some((ingredient) =>
    /\b(shrimp|prawn|prawns|fish|white fish|seafood|salmon|tilapia|cod|tuna|sea bass)\b/i.test(ingredient)
  );

  if (hasSeafood) {
    ["seafood", "fish", "white fish", "salmon", "tilapia", "shrimp"].forEach((ingredient) => expanded.add(ingredient));
  }

  return Array.from(expanded);
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
  const recipeTitleSource = buildRecipeTitleSource(normalizedRecipe);
  const cleanedEnglishName = buildSharedRecipeEnglishTitle(recipeTitleSource);
  const cleanedEnglishCuisine = normalizeEnglishCuisineLabel(normalizedRecipe.localized?.English?.cuisine ?? normalizedRecipe.cuisine);
  const cleanedArabicCuisine = translateCuisineLabelToArabic(normalizedRecipe.localized?.Arabic?.cuisine ?? normalizedRecipe.cuisine);
  const photoIdentity = buildPhotoIdentityFromCatalog(normalizedRecipe);
  const englishImageUrl =
    normalizeRecipeImageUrl(normalizedRecipe.localized?.English?.image_url) ??
    normalizeRecipeImageUrl(normalizedRecipe.image.thumbPath || normalizedRecipe.image.storagePath);
  const englishBase: Recipe = {
    id: normalizedRecipe.id,
    name: isWeakEnglishTitle(normalizedRecipe.localized?.English?.name ?? normalizedRecipe.title)
      ? cleanedEnglishName
      : normalizedRecipe.localized?.English?.name ?? normalizedRecipe.title,
    cuisine: cleanedEnglishCuisine || normalizeCuisineLabel(normalizedRecipe.cuisine),
    recipe_source_type: "local_database",
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
    image_url: englishImageUrl,
    image_source: englishImageUrl ? normalizedRecipe.localized?.English?.image_source : undefined,
    image_attribution_name: englishImageUrl ? normalizedRecipe.localized?.English?.image_attribution_name : undefined,
    image_attribution_url: englishImageUrl ? normalizedRecipe.localized?.English?.image_attribution_url : undefined,
    image_search_index: normalizedRecipe.localized?.English?.image_search_index,
    image_search_indices: normalizedRecipe.localized?.English?.image_search_indices,
    match_quality: matchQuality,
    matched_required_count: matchedRequiredCount,
    matched_optional_count: matchedOptionalCount,
    dish_intent:
      normalizedRecipe.localized?.English?.dish_intent ??
      normalizedRecipe.localized?.Arabic?.dish_intent ??
      normalizedRecipe.dishIntent,
    ...(photoIdentity ? { photo_identity: photoIdentity } : {}),
    preference_hits: normalizeStringArray(normalizedRecipe.localized?.English?.preference_hits).length
      ? normalizeStringArray(normalizedRecipe.localized?.English?.preference_hits)
      : preferenceHits
  };

  const localized = selectDisplayLocalizedVariant(normalizedRecipe, englishBase, wantsArabic);

  const availableIngredients = normalizedRecipe.ingredientCanonicals
    .filter((ingredient) => !missingIngredients.includes(ingredient))
    .map(wantsArabic ? translateIngredientToArabic : translateIngredientToEnglish);
  const missingLocalized = missingIngredients.map(wantsArabic ? translateIngredientToArabic : translateIngredientToEnglish);

  const localizedImageUrl = normalizeRecipeImageUrl(localized.image_url) ?? englishBase.image_url;
  const localizedRecipe: Recipe = {
    ...englishBase,
    name: localized.name,
    cuisine: wantsArabic ? cleanedArabicCuisine || localized.cuisine : cleanedEnglishCuisine || localized.cuisine,
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
    image_url: localizedImageUrl,
    image_source: localizedImageUrl ? localized.image_source ?? englishBase.image_source : undefined,
    image_attribution_name: localizedImageUrl ? localized.image_attribution_name ?? englishBase.image_attribution_name : undefined,
    image_attribution_url: localizedImageUrl ? localized.image_attribution_url ?? englishBase.image_attribution_url : undefined,
    image_search_index: englishBase.image_search_index,
    image_search_indices: englishBase.image_search_indices,
    preference_hits: normalizeStringArray(localized.preference_hits).length
      ? normalizeStringArray(localized.preference_hits)
      : englishBase.preference_hits
  };

  const repairedLocalizedRecipe =
    wantsArabic && containsLatinDisplayText(localizedRecipe)
      ? buildStrictArabicFallbackRecipe({
          recipeTitleSource,
          englishBase,
          localizedRecipe
        })
      : localizedRecipe;

  return repairedLocalizedRecipe.dish_intent
    ? repairedLocalizedRecipe
    : enrichRecipeWithDishIntent(repairedLocalizedRecipe, {
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

  const photoIdentity = buildPhotoIdentityFromCatalog(recipe);

  return {
    name: recipe.title,
    cuisine: recipe.cuisine,
    calories: recipe.calories,
    protein: `${recipe.protein}g`,
    carbs: `${recipe.carbs}g`,
    fat: `${recipe.fat}g`,
    ingredients: recipe.ingredientCanonicals,
    steps: recipe.steps,
    ...(photoIdentity ? { photo_identity: photoIdentity } : {})
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeRecipeImageUrl(value?: string) {
  return isDurableRecipeImageUrl(value) ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function selectDisplayLocalizedVariant(recipe: RecipeCatalogDoc, englishBase: Recipe, wantsArabic: boolean) {
  const recipeTitleSource = buildRecipeTitleSource(recipe);
  const englishVariant = recipe.localized?.English ?? localizeRecipeForEnglish(englishBase);
  if (!wantsArabic) {
    const normalizedEnglish = containsArabicDisplayText(englishVariant) || isWeakEnglishTitle(englishVariant.name)
      ? localizeRecipeForEnglish({
          ...englishBase,
          name: buildSharedRecipeEnglishTitle(recipeTitleSource),
          cuisine: normalizeEnglishCuisineLabel(englishVariant.cuisine || recipe.cuisine)
        })
      : englishVariant;
    return {
      ...normalizedEnglish,
      name: isWeakEnglishTitle(normalizedEnglish.name) ? buildSharedRecipeEnglishTitle(recipeTitleSource) : normalizedEnglish.name,
      cuisine: normalizeEnglishCuisineLabel(normalizedEnglish.cuisine || recipe.cuisine)
    };
  }

  const arabicVariant = recipe.localized?.Arabic ?? localizeRecipeForArabic(englishBase);
  const normalizedArabic = containsLatinDisplayText(arabicVariant) || isWeakArabicTitle(arabicVariant.name)
    ? localizeRecipeForArabic({
        ...englishBase,
        name: buildSharedRecipeEnglishTitle(recipeTitleSource),
        cuisine: normalizeEnglishCuisineLabel(recipe.cuisine)
      })
    : arabicVariant;
  return {
    ...normalizedArabic,
    name: isWeakArabicTitle(normalizedArabic.name) ? buildSharedRecipeArabicTitle(recipeTitleSource) : normalizedArabic.name,
    cuisine: translateCuisineLabelToArabic(normalizedArabic.cuisine || recipe.cuisine)
  };
}

function dedupeCatalogRecipes(recipes: RecipeCatalogDoc[]) {
  return Array.from(new Map(recipes.map((recipe) => [recipe.id, recipe])).values());
}

function selectDistinctRankedResults(
  rankedResults: RankedRecipeResult[],
  recipeMap: Map<string, RecipeCatalogDoc>,
  limit: number,
  preferredCuisine: string
) {
  const selected = recipeDiversityEngine.select(
    rankedResults.flatMap((result) => {
      const recipe = recipeMap.get(result.recipeId);
      if (!recipe) return [];
      return [{
        value: result,
        score: result.score,
        cuisine: recipe.cuisine,
        dishFamily: normalizeRecipeDishFamily(recipe),
        cookingMethod: recipe.dishIntent?.cooking_method ?? recipe.styleTags?.find((tag) => /grill|bake|stew|fry|roast|soup|pasta/i.test(tag))
      }];
    }),
    { limit, rotateCuisines: !preferredCuisine || preferredCuisine === "Any" }
  );
  const selectedRecipes = selected
    .map((result) => recipeMap.get(result.recipeId))
    .filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe));
  const selectedDistinctKeys = new Set(
    selectedRecipes.map((recipe) => buildSharedRecipeDistinctKey(buildRecipeTitleSource(recipe)))
  );

  if (selected.length < limit) {
    for (const result of rankedResults) {
      const recipe = recipeMap.get(result.recipeId);
      if (!recipe) continue;
      const distinctKey = buildSharedRecipeDistinctKey(buildRecipeTitleSource(recipe));
      if (selectedDistinctKeys.has(distinctKey)) {
        continue;
      }
      if (selectedRecipes.some((existing) => areNearDuplicateRecipes(existing, recipe))) {
        continue;
      }

      selected.push(result);
      selectedRecipes.push(recipe);
      selectedDistinctKeys.add(distinctKey);
      if (selected.length >= limit) break;
    }
  }

  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((item) => item.recipeId));
    const selectedExactIdentities = new Set(
      selectedRecipes.map((recipe) => buildExactRecipeIdentity(recipe))
    );

    for (const result of rankedResults) {
      const recipe = recipeMap.get(result.recipeId);
      if (!recipe) continue;
      if (selectedIds.has(result.recipeId)) continue;

      const exactIdentity = buildExactRecipeIdentity(recipe);
      if (selectedExactIdentities.has(exactIdentity)) {
        continue;
      }

      selected.push(result);
      selectedRecipes.push(recipe);
      selectedIds.add(result.recipeId);
      selectedExactIdentities.add(exactIdentity);
      if (selected.length >= limit) break;
    }
  }

  return selected;
}

function filterRankedResultsForSpecificCuisineQuality(
  rankedResults: RankedRecipeResult[],
  recipes: RecipeCatalogDoc[],
  preferredCuisine: string
) {
  if (!preferredCuisine || preferredCuisine === "Any") return rankedResults;

  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return rankedResults.filter((result) => {
    const recipe = recipeMap.get(result.recipeId);
    if (!recipe) return false;
    return (
      cuisineMatchesPreference(recipe.cuisine, preferredCuisine) &&
      hasSpecificCuisineDishSignal(recipe, preferredCuisine)
    );
  });
}

function hasSpecificCuisineDishSignal(recipe: RecipeCatalogDoc, preferredCuisine: string) {
  const haystack = normalizeCuisineIdentityText([
    recipe.title,
    recipe.slug,
    recipe.localized?.English?.name,
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    recipe.localized?.Arabic?.name,
    recipe.localized?.Arabic?.dish_intent?.dish_name,
    recipe.dishIntent?.dish_name,
    ...(recipe.dishIntent?.visual_keywords ?? []),
    recipe.image.sourceQuery,
    ...(recipe.regionalCuisines ?? []),
    ...(recipe.styleTags ?? []),
    ...(recipe.searchMetadata?.cuisineTokens ?? [])
  ].filter(Boolean).join(" "));

  if (!haystack) return false;
  if (!hasCuisineSpecificIdentitySignal(haystack, preferredCuisine)) return false;
  return getCuisineDishAliases(preferredCuisine).some((alias) => identityTextIncludesAlias(haystack, alias));
}

function hasCuisineSpecificIdentitySignal(haystack: string, preferredCuisine: string) {
  const signals: Record<string, string[]> = {
    egyptian: ["alexandrian", "baladi", "basha", "egyptian", "fattah", "hawawshi", "kebda", "kofta", "koshary", "liver", "molokhia", "sayadeya"],
    indian: ["baingan", "biryani", "chana", "dal", "gobi", "indian", "masala", "palak", "rajma", "rasam", "saag", "sambar", "tadka", "tikka"],
    italian: ["arrabbiata", "caponata", "ciambotta", "fagioli", "italian", "margherita", "melanzane", "minestrone", "norma", "polenta", "pomodoro", "ribollita", "risotto"],
    mediterranean: ["briam", "caponata", "dolma", "fasolada", "gemista", "greek", "mediterranean", "moussaka", "ratatouille", "saganaki", "souvlaki"],
    mexican: ["caldo", "chilaquiles", "chile", "enchilada", "fajita", "fajitas", "huevos", "mexican", "mole", "pescado", "pozole", "quesadilla", "sopa", "taco", "tinga", "tostada", "tostadas", "veracruzana"],
    middleeastern: ["fatteh", "hummus", "kibbeh", "maqluba", "mansaf", "middle eastern", "mujadara", "shawarma", "tabbouleh"],
    thai: ["gaeng", "goong", "khao", "krapow", "larb", "massaman", "pad", "panang", "pla", "prik", "sen", "thai", "tom kha", "tom yum", "woon", "yum"],
    turkish: ["adana", "biber", "borek", "dolma", "izgara", "karniyarik", "kebab", "kofte", "lahmacun", "menemen", "patlican", "pide", "saksuka", "turkish"]
  };
  const key = preferredCuisine.toLowerCase().replace(/[^a-z]/g, "");
  return (signals[key] ?? [key]).some((signal) => identityTextIncludesAlias(haystack, signal));
}

function identityTextIncludesAlias(haystack: string, alias: string) {
  if (!haystack || !alias) return false;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "u").test(haystack);
}

function getCuisineDishAliases(preferredCuisine: string) {
  const oneWordSignals = new Set([
    "arrabbiata",
    "biryani",
    "caponata",
    "chana",
    "ciambotta",
    "dal",
    "dolma",
    "fagioli",
    "gobi",
    "hawawshi",
    "kebda",
    "kofta",
    "koshary",
    "kofte",
    "liver",
    "menemen",
    "minestrone",
    "palak",
    "polenta",
    "pozole",
    "ribollita",
    "risotto",
    "sambar",
    "shawarma"
  ]);

  return [
    ...getManualCuisineDishAliases(preferredCuisine),
    ...(getCompleteCuisineCatalog(preferredCuisine) ?? [])
      .flatMap((dish) => [
      dish.id.replace(/-/g, " "),
      ...dish.names.english,
      ...dish.names.native,
      ...(dish.names.other ?? [])
      ])
  ]
    .map(normalizeCuisineIdentityText)
    .filter((alias) => alias.length >= 4)
    .filter((alias) => alias.includes(" ") || oneWordSignals.has(alias));
}

function getManualCuisineDishAliases(preferredCuisine: string) {
  const key = preferredCuisine.toLowerCase().replace(/[^a-z]/g, "");
  if (key === "egyptian") {
    return [
      "alexandrian kebda",
      "alexandrian liver",
      "egyptian kebda",
      "egyptian liver",
      "kebda eskandarani",
      "kebda sandwiches",
      "liver and rice",
      "liver sandwiches"
    ];
  }
  return [];
}

function normalizeCuisineIdentityText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStrictArabicFallbackRecipe(input: {
  recipeTitleSource: ReturnType<typeof buildRecipeTitleSource>;
  englishBase: Recipe;
  localizedRecipe: Recipe;
}) {
  const localizedFallback = ensureArabicRecipeLanguage({
    ...input.englishBase,
    name: buildSharedRecipeEnglishTitle(input.recipeTitleSource),
    cuisine: normalizeEnglishCuisineLabel(input.englishBase.cuisine)
  });

  return {
    ...localizedFallback,
    id: input.englishBase.id,
    name: buildSharedRecipeArabicTitle(input.recipeTitleSource),
    cuisine: translateCuisineLabelToArabic(input.localizedRecipe.cuisine || input.englishBase.cuisine),
    image_url: input.localizedRecipe.image_url,
    image_source: input.localizedRecipe.image_source,
    image_attribution_name: input.localizedRecipe.image_attribution_name,
    image_attribution_url: input.localizedRecipe.image_attribution_url,
    image_search_index: input.localizedRecipe.image_search_index,
    image_search_indices: input.localizedRecipe.image_search_indices,
    match_quality: input.localizedRecipe.match_quality,
    matched_required_count: input.localizedRecipe.matched_required_count,
    matched_optional_count: input.localizedRecipe.matched_optional_count,
    preference_hits: input.localizedRecipe.preference_hits,
    dish_intent: input.localizedRecipe.dish_intent
  } satisfies Recipe;
}

function buildExactRecipeIdentity(recipe: RecipeCatalogDoc) {
  const source = buildRecipeTitleSource(recipe);
  return [
    buildSharedRecipeEnglishTitle(source).trim().toLowerCase(),
    normalizeEnglishCuisineLabel(recipe.cuisine).trim().toLowerCase(),
    recipe.mealType
  ].join("|");
}

function areNearDuplicateRecipes(left: RecipeCatalogDoc, right: RecipeCatalogDoc) {
  if (left.id === right.id) return true;

  const leftDishFamily = normalizeRecipeDishFamily(left);
  const rightDishFamily = normalizeRecipeDishFamily(right);
  if (leftDishFamily && rightDishFamily && leftDishFamily !== rightDishFamily) {
    return false;
  }

  const ingredientOverlap = jaccardSimilarity(left.ingredientCanonicals, right.ingredientCanonicals);
  const requiredOverlap = jaccardSimilarity(left.requiredCanonicals, right.requiredCanonicals);
  const cuisineMatches = left.cuisine.trim().toLowerCase() === right.cuisine.trim().toLowerCase();
  const mealTypeMatches = left.mealType === right.mealType;

  return cuisineMatches && mealTypeMatches && ingredientOverlap >= 0.82 && requiredOverlap >= 0.82;
}

function normalizeRecipeDishFamily(recipe: RecipeCatalogDoc) {
  return (
    recipe.localized?.English?.dish_intent?.dish_name ??
    recipe.localized?.Arabic?.dish_intent?.dish_name ??
    recipe.localized?.English?.image_search_index ??
    recipe.localized?.English?.image_search_indices?.[0] ??
    recipe.title
  )
    .toLowerCase()
    .replace(/\b(egyptian|middle eastern|mediterranean|italian|american|arabic|food|dish|dinner|lunch|breakfast|plate|meal|any)\b/g, " ")
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

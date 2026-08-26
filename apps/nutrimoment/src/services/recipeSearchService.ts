import type { Recipe, MealPlanMeal } from "@/lib/types";
import { cuisineMatchesPreference, normalizeCuisineLabel } from "@/lib/cuisines";
import { getCompleteCuisineCatalog } from "@/lib/cuisineCatalogs/completeCatalogs";
import { OFFLINE_RECIPES } from "@/data/offline/recipes";
import { getCuisineCatalogV2RecipeDocs } from "@/data/offline/cuisineCatalogV2Recipes";
import { normalizeCachedRecipeCatalogDoc } from "@/data/offline/recipeMetadata";
import { listFirestoreReferenceCatalogRecipes } from "@/data/offline/firestoreRecipeReferenceCatalog";
import { getRealSourceArtifactRecipes } from "@/data/offline/realSourceRecipeArtifacts";
import { RecipeGenerationStatus } from "@/lib/RecipeGenerationStatus";
import type { RankedRecipeResult, RecipeCatalogDoc, RecipeIngredient, RecipeSearchResponse, UserPreferenceSnapshot } from "@/lib/domain";
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
import { buildIngredientLookupCanonicals, expandIngredientFamilies } from "@/lib/ingredientFamilies";
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
  listSharedCachedRecipesForIngredients,
  listUserCachedRecipes
} from "@/services/userRecipeCacheService";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import { logger } from "@/lib/logger";
import { IngredientGraph } from "@/food/IngredientGraph";
import { RecipeDiversityEngine } from "@/food/RecipeDiversityEngine";
import { getIngredientProfileForTerm, normalizeIngredientText } from "@/food/IngredientNormalizer";
import type { IngredientNormalizationResult } from "@/services/ingredientNormalizationService";
import { countMissingIngredientPurchaseBurden } from "@/services/recipeMissingIngredientPolicyService";
import { buildRecipeDiscoveryPlan, type RecipeDiscoveryPlan } from "@/services/recipePipeline/recipeDiscoveryPlan";
import {
  createRecipeIngredientCompatibilityEvaluator,
  specializeCatalogRecipeForRequestedProteins
} from "@/services/recipePrimaryIngredientCompatibility";
import {
  partitionRecipeCatalogByQuality
} from "@/services/recipeContentQualityService";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { attachValidatedRecipePhotoAsset } from "@/services/recipePhotoReusePolicy";
import { getKnownDishRecipePhoto } from "@/lib/freeRecipePhotos";

const recipeDiversityEngine = new RecipeDiversityEngine();
const ingredientGraph = new IngredientGraph();
let staticLocalRecipeSources: {
  cuisineCatalogRecipes: RecipeCatalogDoc[];
  realSourceArtifactRecipes: RecipeCatalogDoc[];
  seededRecipes: RecipeCatalogDoc[];
  quarantinedRecipes: ReturnType<typeof partitionRecipeCatalogByQuality>["quarantined"];
} | null = null;

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
  includeFirestoreReferences?: boolean;
  allowRemoteCaches?: boolean;
  forceSharedCacheRead?: boolean;
  skipStaticSources?: boolean;
  maxMissingIngredients?: number;
}

export interface CatalogRecipeSearchResult extends RecipeSearchResponse {
  rankedRecipeIds: string[];
  candidateRecipes: RecipeCatalogDoc[];
  matchingRecipeCount: number;
  discoveryPlan: RecipeDiscoveryPlan;
}

export async function searchCatalogRecipes(input: CatalogRecipeSearchInput): Promise<CatalogRecipeSearchResult> {
  const searchStartedAt = Date.now();
  const preferredCuisine = normalizeCuisineLabel(input.preferredCuisine ?? "Any");
  const normalized = await normalizeIngredients(input.ingredients);
  const expandedNormalizedIngredients = Array.from(new Set([
    ...normalized.searchTerms,
    ...expandIngredientFamilies(normalized.raw),
    ...expandIngredientFamilies(normalized.normalized),
    ...expandIngredientFamilies(normalized.resolved.map((ingredient) => ingredient.normalized))
  ]));
  const discoveryPlan = buildRecipeDiscoveryPlan({
    normalizedIngredients: expandedNormalizedIngredients,
    preferredCuisine
  });
  const culinaryDishFamilies = discoveryPlan.dishIntents.map((path) => path.dishFamily);
  const cacheDiscoveryIngredients = expandSeafoodCacheDiscoveryIngredients(
    buildIngredientLookupCanonicals(expandedNormalizedIngredients)
  );
  const preferences = buildPreferenceProfile({
    preferredCuisine,
    calorieTarget: input.calorieTarget ?? 2000,
    diets: input.diets ?? [],
    conditions: input.conditions ?? [],
    allergens: input.allergens ?? []
  } satisfies UserPreferenceSnapshot);
  const normalizationCompletedAt = Date.now();

  const limit = input.maxResults ?? 3;
  const { seededRecipes, cuisineCatalogRecipes, realSourceArtifactRecipes, quarantinedRecipes } = input.skipStaticSources
    ? {
        seededRecipes: [],
        cuisineCatalogRecipes: [],
        realSourceArtifactRecipes: [],
        quarantinedRecipes: []
      }
    : getStaticLocalRecipeSources();
  const localSourceCount = seededRecipes.length + cuisineCatalogRecipes.length + realSourceArtifactRecipes.length;
  const warmSharedRecipeCache = getWarmSharedRecipeCacheSnapshot({ allowStale: true });
  const forceSharedCacheRead = input.forceSharedCacheRead === true;
  const readRemoteRecipeCaches = shouldReadRemoteRecipeCaches({
    allowRemoteCaches: input.allowRemoteCaches !== false,
    forceSharedCacheRead,
    localSourceCount,
    requestedRecipeCount: limit
  });
  const [firestoreReferenceRecipes, userCachedRecipes, ingredientSharedCachedRecipes] = await Promise.all([
    input.includeFirestoreReferences === false
      ? Promise.resolve([])
      : listFirestoreReferenceCatalogRecipes(normalized),
    readRemoteRecipeCaches ? listUserCachedRecipes(input.uid) : Promise.resolve([]),
    (warmSharedRecipeCache.length && !forceSharedCacheRead) || !readRemoteRecipeCaches
      ? Promise.resolve([])
      : listSharedCachedRecipesForIngredients(cacheDiscoveryIngredients, {
          forceFirestoreRead: forceSharedCacheRead
        })
  ]);
  const sharedReadStrategy = selectSharedRecipeReadStrategy({
    targetedRecipeCount: ingredientSharedCachedRecipes.length,
    warmRecipeCount: warmSharedRecipeCache.length
  });
  const sharedCachedRecipes = forceSharedCacheRead
    ? dedupeCatalogRecipes([...ingredientSharedCachedRecipes, ...warmSharedRecipeCache])
    : sharedReadStrategy === "warm"
      ? warmSharedRecipeCache
      : sharedReadStrategy === "targeted"
        ? ingredientSharedCachedRecipes
        : [];

  const recipePoolQuality = partitionRecipeCatalogByQuality(dedupeCatalogRecipes([
    ...userCachedRecipes,
    ...sharedCachedRecipes,
    ...firestoreReferenceRecipes,
    ...realSourceArtifactRecipes,
    ...seededRecipes,
    ...cuisineCatalogRecipes
  ]));
  const allQuarantinedRecipes = [...quarantinedRecipes, ...recipePoolQuality.quarantined];
  const primaryRecipePool = filterRecipeCatalogByDietConstraints(
    recipePoolQuality.discoverable,
    input.diets ?? [],
    input.allergens ?? []
  );
  const cuisineFocusedRecipePool = selectRecipeSearchCuisinePool(
    primaryRecipePool,
    preferences.preferredCuisine
  );
  const sourceLoadingCompletedAt = Date.now();
  const cuisineSearchOrder = buildCuisineSearchOrder(expandedNormalizedIngredients, preferences.preferredCuisine);
  // Score the complete catalog once. Cuisine expansion is an ordering concern;
  // ranking the same catalog once per cuisine made a simple chicken search take
  // tens of seconds without improving relevance.
  const rankedBase = rankRecipes({
    recipes: cuisineFocusedRecipePool,
    normalizedIngredients: expandedNormalizedIngredients,
    culinaryDishFamilies,
    preferredCuisine: preferences.preferredCuisine,
    maxCalories: preferences.nutritionGoals.maxCalories,
    mealType: input.mealType,
    preferences
  });
  const ranked = cuisineSearchOrder.length
    ? prioritizeCuisineSearchOrder(rankedBase, cuisineFocusedRecipePool, cuisineSearchOrder)
    : rankedBase;
  const rankingCompletedAt = Date.now();
  const recipeMap = new Map(cuisineFocusedRecipePool.map((recipe) => [recipe.id, recipe]));
  const ingredientCompatibilityEvaluator = createRecipeIngredientCompatibilityEvaluator(normalized.raw);
  const compatibilityRanked = cuisineSearchOrder.length
    ? ranked
    : prioritizeRankedResultsForSpecificCuisine(
        ranked,
        cuisineFocusedRecipePool,
        preferences.preferredCuisine
      );
  const compatibilitySelection = selectCompatibleRankedCandidates({
    evaluator: ingredientCompatibilityEvaluator,
    normalized,
    ranked: compatibilityRanked,
    recipeMap,
    requestedCount: limit
  });
  const primaryCompatibleRanked = compatibilitySelection.primaryCompatible;
  const evidenceCompatibleRanked = compatibilitySelection.compatible;
  const ingredientMatchedRanked = compatibilitySelection.ingredientMatched;
  const compatibilityCompletedAt = Date.now();
  // Ingredient and cuisine matching determine order. They must never turn a
  // usable source pool into an empty result set.
  const missingIngredientLimit = Number.isFinite(input.maxMissingIngredients)
    ? Math.max(0, Number(input.maxMissingIngredients))
    : Number.POSITIVE_INFINITY;
  const safeSharedPoolRanked = mergeDistinctRankedResults(
    evidenceCompatibleRanked,
    primaryCompatibleRanked
  ).filter((result) => countNonPantryMissingIngredients(result, normalized.raw.length) <= missingIngredientLimit);
  const ingredientPrioritized = prioritizeIngredientMatches(safeSharedPoolRanked, ingredientMatchedRanked);
  const rankedResults = cuisineSearchOrder.length
    ? ingredientPrioritized
    : prioritizeRankedResultsForSpecificCuisine(
        ingredientPrioritized,
        cuisineFocusedRecipePool,
        preferences.preferredCuisine
      );
  const rankedRecipePool = cuisineFocusedRecipePool;

  const wantsArabic = isArabicRecipeLanguage(input.recipeLanguage ?? "English");
  const rankedCandidates = selectDistinctRankedResults(
    rankedResults,
    recipeMap,
    wantsArabic ? Math.max(limit * 3, limit) : limit,
    preferences.preferredCuisine
  );
  const mappedResults = rankedCandidates
    .map((result) => {
      const recipe = recipeMap.get(result.recipeId);
      const specializedRecipe = recipe
        ? specializeCatalogRecipeForRequestedProteins(recipe, normalized.raw)
        : null;
      const specializedCanonicals = new Set(specializedRecipe?.ingredientCanonicals ?? []);
      const specializedMissingIngredients = result.missingRequired
        .concat(result.missingOptional)
        .filter((ingredient) => specializedCanonicals.has(ingredient));
      const mappedRecipe = specializedRecipe
        ? attachValidatedRecipePhotoAsset(
            mapCatalogRecipeToUiRecipe(
              specializedRecipe,
              specializedMissingIngredients,
              result.matchQuality,
              result.matchedRequiredCount,
              result.matchedOptionalCount,
              result.preferenceHits,
              input.recipeLanguage
            ),
            input.diets ?? []
          )
        : null;
      return mappedRecipe ? { recipe: mappedRecipe, result } : null;
    })
    .filter((entry): entry is { recipe: Recipe; result: RankedRecipeResult } => Boolean(entry))
    .filter((entry) => !wantsArabic || !containsLatinDisplayText(entry.recipe))
    .slice(0, limit);
  const recipes = mappedResults.map((entry) => entry.recipe);
  const topRanked = mappedResults.map((entry) => entry.result);
  const responseMappingCompletedAt = Date.now();

  logger.info("Recipe dataset retrieval completed", {
    inputIngredientCount: input.ingredients.length,
    normalizedIngredientIds: normalized.ingredientIds,
    expandedAliases: normalized.expandedAliases.slice(0, 20).map((alias) => ({
      term: alias.term,
      weight: alias.weight
    })),
    candidateRecipeCount: rankedRecipePool.length,
    quarantinedRecipeCount: allQuarantinedRecipes.length,
    quarantinedRecipeStatuses: summarizeQuarantinedRecipeStatuses(allQuarantinedRecipes),
    firestoreReferenceRecipeCount: firestoreReferenceRecipes.length,
    matchingRecipeCount: ingredientMatchedRanked.length,
    primaryCompatibleRecipeCount: primaryCompatibleRanked.length,
    evidenceCompatibleRecipeCount: evidenceCompatibleRanked.length,
    compatibilityEvaluatedCount: compatibilitySelection.evaluatedCount,
    returnedRecipeCount: recipes.length,
    timingsMs: {
      compatibility: compatibilityCompletedAt - rankingCompletedAt,
      normalization: normalizationCompletedAt - searchStartedAt,
      ranking: rankingCompletedAt - sourceLoadingCompletedAt,
      responseMapping: responseMappingCompletedAt - compatibilityCompletedAt,
      sourceLoading: sourceLoadingCompletedAt - normalizationCompletedAt,
      total: responseMappingCompletedAt - searchStartedAt
    },
    discoveryCuisines: discoveryPlan.predictedCuisines.slice(0, 5).map((prediction) => prediction.cuisine),
    discoveryTechniques: discoveryPlan.predictedTechniques
  });

  return {
    ingredientsNormalized: normalized.normalized,
    recipes,
    servedFrom: "shared_pool",
    generationStatus: RecipeGenerationStatus.SUCCESS_DATASET,
    canLoadMore:
      rankedResults.length > topRanked.length || cuisineFocusedRecipePool.length > limit,
    rankedRecipeIds: topRanked.map((item) => item.recipeId),
    candidateRecipes: rankedRecipePool,
    matchingRecipeCount: ingredientMatchedRanked.length,
    discoveryPlan
  };
}

export function filterRecipeCatalogByDietConstraints(
  recipes: RecipeCatalogDoc[],
  diets: string[],
  allergens: string[]
) {
  if (!diets.length && !allergens.length) return recipes;

  return recipes.filter((recipe) =>
    findRecipeDietViolation(recipe, { diets, allergens }) === null
  );
}

export function countNonPantryMissingIngredients(
  result: Pick<RankedRecipeResult, "missingRequired" | "missingOptional">,
  availableIngredientCount = 3
) {
  return countMissingIngredientPurchaseBurden(
    [...result.missingRequired, ...result.missingOptional],
    availableIngredientCount
  );
}

export function selectRecipeSearchCuisinePool(
  recipes: RecipeCatalogDoc[],
  preferredCuisine: string
) {
  if (!preferredCuisine || preferredCuisine === "Any") return recipes;
  const normalizedPreferred = normalizeCuisineLabel(preferredCuisine);
  const focused = recipes.filter((recipe) =>
    normalizeCuisineLabel(recipe.cuisine) === normalizedPreferred ||
    hasSpecificCuisineDishSignal(recipe, preferredCuisine)
  );
  return focused.length ? focused : recipes;
}

function getStaticLocalRecipeSources() {
  if (staticLocalRecipeSources) return staticLocalRecipeSources;
  const seededPartition = partitionRecipeCatalogByQuality(
    OFFLINE_RECIPES.map((recipe) => normalizeCachedRecipeCatalogDoc(recipe))
  );
  const cuisineCatalogPartition = partitionRecipeCatalogByQuality(getCuisineCatalogV2RecipeDocs());
  const realSourcePartition = partitionRecipeCatalogByQuality(getRealSourceArtifactRecipes());
  staticLocalRecipeSources = {
    seededRecipes: seededPartition.discoverable,
    cuisineCatalogRecipes: cuisineCatalogPartition.discoverable,
    realSourceArtifactRecipes: realSourcePartition.discoverable,
    quarantinedRecipes: [
      ...seededPartition.quarantined,
      ...cuisineCatalogPartition.quarantined,
      ...realSourcePartition.quarantined
    ]
  };
  return staticLocalRecipeSources;
}

function summarizeQuarantinedRecipeStatuses(
  quarantined: ReturnType<typeof partitionRecipeCatalogByQuality>["quarantined"]
) {
  return quarantined.reduce<Record<string, number>>((summary, entry) => {
    summary[entry.quality.status] = (summary[entry.quality.status] ?? 0) + 1;
    return summary;
  }, {});
}

function selectCompatibleRankedCandidates(input: {
  evaluator: ReturnType<typeof createRecipeIngredientCompatibilityEvaluator>;
  normalized: IngredientNormalizationResult;
  ranked: RankedRecipeResult[];
  recipeMap: Map<string, RecipeCatalogDoc>;
  requestedCount: number;
}) {
  const compatible: RankedRecipeResult[] = [];
  const primaryCompatible: RankedRecipeResult[] = [];
  const ingredientMatched: RankedRecipeResult[] = [];
  const minimumEvaluated = Math.min(input.ranked.length, Math.max(300, input.requestedCount * 12));
  const desiredCompatible = Math.max(60, input.requestedCount * 4);
  const desiredIngredientMatched = Math.max(input.requestedCount * 2, 20);
  let evaluatedCount = 0;

  for (const result of input.ranked) {
    evaluatedCount += 1;
    const recipe = input.recipeMap.get(result.recipeId);
    if (recipe) {
      const primary = input.evaluator.evaluatePrimary(recipe);
      if (primary.compatible) {
        primaryCompatible.push(result);
        if (input.evaluator.evaluateEvidence(recipe).compatible) compatible.push(result);
        if (
          result.matchedRequiredCount + result.matchedOptionalCount > 0 &&
          recipeHasRequestedIngredientSignal(recipe, input.normalized)
        ) {
          ingredientMatched.push(result);
        }
      }
    }

    if (
      evaluatedCount >= minimumEvaluated &&
      compatible.length >= desiredCompatible &&
      ingredientMatched.length >= desiredIngredientMatched
    ) {
      break;
    }
  }

  return { compatible, evaluatedCount, ingredientMatched, primaryCompatible };
}

export function selectSharedRecipeReadStrategy(input: {
  targetedRecipeCount: number;
  warmRecipeCount: number;
}): "local_only" | "targeted" | "warm" {
  if (input.warmRecipeCount > 0) return "warm";
  if (input.targetedRecipeCount > 0) return "targeted";
  return "local_only";
}

export function shouldReadRemoteRecipeCaches(input: {
  allowRemoteCaches: boolean;
  forceSharedCacheRead?: boolean;
  localSourceCount: number;
  requestedRecipeCount: number;
}) {
  return input.allowRemoteCaches && (
    input.forceSharedCacheRead === true || input.localSourceCount < input.requestedRecipeCount
  );
}

function mergeDistinctRankedResults(...groups: RankedRecipeResult[][]) {
  const seen = new Set<string>();
  return groups.flat().filter((result) => {
    if (seen.has(result.recipeId)) return false;
    seen.add(result.recipeId);
    return true;
  });
}

const BROAD_RELEVANCE_TERMS = new Set([
  "greens",
  "seafood"
]);

const PRIMARY_IDENTITY_INGREDIENT_IDS = new Set([
  "beef",
  "chicken",
  "fish",
  "ground_beef",
  "liver",
  "shrimp"
]);

function recipeHasRequestedIngredientSignal(
  recipe: RecipeCatalogDoc,
  normalized: IngredientNormalizationResult
) {
  const requestedIds = new Set(normalized.ingredientIds);
  if (!requestedIds.size) return true;

  const allowedTerms = buildRequestedIngredientTerms(normalized, requestedIds);
  const recipeDishIdentityText = normalizeIngredientText([
    recipe.title,
    recipe.slug,
    recipe.description,
    recipe.dishIntent?.dish_name,
    recipe.localized?.English?.name,
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.localized?.Arabic?.name,
    recipe.localized?.Arabic?.dish_intent?.dish_name
  ].filter(Boolean).join(" "));

  const recipeIdentityText = normalizeIngredientText([
    recipeDishIdentityText,
    recipe.image?.sourceQuery,
    ...(recipe.searchTokens ?? []),
    ...(recipe.searchMetadata?.aliasTokens ?? [])
  ].filter(Boolean).join(" "));

  if (requiresPrimaryIngredientIdentity(requestedIds)) {
    return (
      recipeHasRequestedIngredientInTitle(recipeDishIdentityText, allowedTerms) ||
      recipeHasRequestedIngredientInPrimaryCanonicals(recipe, requestedIds, allowedTerms)
    );
  }

  const recipeIngredientTerms = [
    ...recipe.ingredients.flatMap((ingredient) => [ingredient.canonical, ingredient.name]),
    ...recipe.ingredientCanonicals,
    ...recipe.requiredCanonicals,
    ...recipe.optionalCanonicals
  ].map(normalizeIngredientText).filter(Boolean);

  for (const term of recipeIngredientTerms) {
    const profile = getIngredientProfileForTerm(term);
    if (profile && requestedIds.has(profile.id)) return true;
    if (allowedTerms.has(term)) return true;
  }

  return Array.from(allowedTerms).some((term) => phraseAppearsInNormalizedText(recipeIdentityText, term));
}

function buildRequestedIngredientTerms(
  normalized: IngredientNormalizationResult,
  requestedIds: Set<string>
) {
  const terms = new Set<string>();
  const add = (value: string | undefined) => {
    const term = normalizeIngredientText(value ?? "");
    if (!term || BROAD_RELEVANCE_TERMS.has(term)) return;
    terms.add(term);
  };

  normalized.resolved.forEach((ingredient) => {
    if (!ingredient.id || !requestedIds.has(ingredient.id)) return;
    add(ingredient.id);
    add(ingredient.id.replace(/_/g, " "));
    add(ingredient.normalized);
  });
  normalized.canonicalEnglishNames.forEach(add);
  normalized.expandedAliases.forEach((alias) => {
    if (requestedIds.has(alias.ingredientId)) add(alias.term);
  });

  return terms;
}

function phraseAppearsInNormalizedText(haystack: string, phrase: string) {
  if (!haystack || !phrase || BROAD_RELEVANCE_TERMS.has(phrase)) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "u").test(haystack);
}

function requiresPrimaryIngredientIdentity(requestedIds: Set<string>) {
  return Array.from(requestedIds).some((id) => PRIMARY_IDENTITY_INGREDIENT_IDS.has(id));
}

function recipeHasRequestedIngredientInTitle(identityText: string, allowedTerms: Set<string>) {
  return Array.from(allowedTerms).some((term) => phraseAppearsInNormalizedText(identityText, term));
}

function recipeHasRequestedIngredientInPrimaryCanonicals(
  recipe: RecipeCatalogDoc,
  requestedIds: Set<string>,
  allowedTerms: Set<string>
) {
  return recipe.requiredCanonicals.slice(0, 2).some((canonical) => {
    const term = normalizeIngredientText(canonical);
    const profile = getIngredientProfileForTerm(term);
    return Boolean(
      (profile && requestedIds.has(profile.id)) ||
        allowedTerms.has(term)
    );
  });
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
  // Every source is normalized before it enters primaryRecipePool. Re-running
  // the bilingual enrichment here rebuilt both language variants and detailed
  // steps for every candidate card, adding seconds without changing output.
  const normalizedRecipe = recipe;
  const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
  const recipeTitleSource = buildRecipeTitleSource(normalizedRecipe);
  const cleanedEnglishName = buildSharedRecipeEnglishTitle(recipeTitleSource);
  const cleanedEnglishCuisine = normalizeEnglishCuisineLabel(normalizedRecipe.localized?.English?.cuisine ?? normalizedRecipe.cuisine);
  const cleanedArabicCuisine = translateCuisineLabelToArabic(normalizedRecipe.localized?.Arabic?.cuisine ?? normalizedRecipe.cuisine);
  const photoIdentity = buildPhotoIdentityFromCatalog(normalizedRecipe);
  const knownDishPhoto = normalizedRecipe.id.startsWith("trusted-source-")
    ? getKnownDishRecipePhoto(normalizedRecipe.localized?.English?.name ?? normalizedRecipe.title)
    : null;
  const englishImageUrl =
    normalizeRecipeImageUrl(normalizedRecipe.localized?.English?.image_url) ??
    normalizeRecipeImageUrl(normalizedRecipe.image.thumbPath || normalizedRecipe.image.storagePath) ??
    knownDishPhoto?.imageUrl;
  const englishImageSource = englishImageUrl
    ? normalizedRecipe.localized?.English?.image_source ?? normalizedRecipe.image.source ?? knownDishPhoto?.source
    : undefined;
  const recipePhotoDietTags = normalizedRecipe.image.dietTags?.length
    ? normalizedRecipe.image.dietTags
    : normalizedRecipe.dietTags;
  const englishBase: Recipe = {
    id: normalizedRecipe.id,
    name: isWeakEnglishTitle(normalizedRecipe.localized?.English?.name ?? normalizedRecipe.title)
      ? cleanedEnglishName
      : normalizedRecipe.localized?.English?.name ?? normalizedRecipe.title,
    cuisine: cleanedEnglishCuisine || normalizeCuisineLabel(normalizedRecipe.cuisine),
    recipe_source_type: "local_database",
    dish_identity: cleanedEnglishName,
    source_recipe_id: normalizedRecipe.id,
    ingredients: normalizedRecipe.ingredients
      .filter((ingredient) => !missingIngredients.includes(ingredient.canonical))
      .map((ingredient) => formatCatalogIngredientForDisplay(ingredient, false)),
    missing_ingredients: missingIngredients.map((ingredient) => formatCanonicalIngredientForDisplay(ingredient, false)),
    // Raw artifact steps are the source-authored workflow. Some legacy import
    // artifacts contain synthetic localized repair steps, so never let those
    // replace valid original directions during discovery.
    steps: normalizedRecipe.steps.length ? normalizedRecipe.steps : normalizedRecipe.localized?.English?.steps ?? [],
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
    image_source: englishImageSource,
    image_attribution_name: englishImageUrl ? normalizedRecipe.localized?.English?.image_attribution_name ?? normalizedRecipe.image.attributionName : undefined,
    image_attribution_url: englishImageUrl ? normalizedRecipe.localized?.English?.image_attribution_url ?? normalizedRecipe.image.attributionUrl : undefined,
    photo_asset: englishImageUrl ? {
      attributionName: normalizedRecipe.localized?.English?.image_attribution_name ?? normalizedRecipe.image.attributionName,
      attributionUrl: normalizedRecipe.localized?.English?.image_attribution_url ?? normalizedRecipe.image.attributionUrl,
      dietTags: recipePhotoDietTags,
      source: englishImageSource,
      status: "ready",
      url: englishImageUrl,
      validatedAt: normalizedRecipe.image.validatedAt,
      validatorHash: normalizedRecipe.image.validatorHash
    } : {
      dietTags: recipePhotoDietTags,
      status: "pending"
    },
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

  const availableIngredients = normalizedRecipe.ingredients
    .filter((ingredient) => !missingIngredients.includes(ingredient.canonical))
    .map((ingredient) => formatCatalogIngredientForDisplay(ingredient, wantsArabic));
  const missingLocalized = missingIngredients.map((ingredient) => formatCanonicalIngredientForDisplay(ingredient, wantsArabic));

  const localizedImageUrl = normalizeRecipeImageUrl(localized.image_url) ?? englishBase.image_url;
  const localizedRecipe: Recipe = {
    ...englishBase,
    name: localized.name,
    cuisine: wantsArabic ? cleanedArabicCuisine || localized.cuisine : cleanedEnglishCuisine || localized.cuisine,
    ingredients: availableIngredients,
    missing_ingredients: missingLocalized,
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
    preference_hits: wantsArabic
      ? normalizeStringArray(localized.preference_hits)
      : normalizeStringArray(localized.preference_hits).length
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

export function mapCatalogRecipeToMeal(
  recipe: RecipeCatalogDoc | undefined,
  options: { diets?: string[]; recipeLanguage?: string } = {}
): MealPlanMeal {
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

  const uiRecipe = attachValidatedRecipePhotoAsset(
    mapCatalogRecipeToUiRecipe(
      recipe,
      [],
      "good",
      recipe.requiredCanonicals.length,
      recipe.optionalCanonicals.length,
      [],
      options.recipeLanguage ?? "English"
    ),
    options.diets ?? []
  );

  return {
    name: uiRecipe.name,
    cuisine: uiRecipe.cuisine,
    recipe_source_type: "local_database",
    source_recipe_id: recipe.id,
    meal_type: recipe.mealType,
    calories: uiRecipe.calories,
    protein: uiRecipe.protein,
    carbs: uiRecipe.carbs,
    fat: uiRecipe.fat,
    ingredients: [...uiRecipe.ingredients, ...uiRecipe.missing_ingredients],
    steps: uiRecipe.steps,
    cook_time: uiRecipe.cook_time,
    difficulty: uiRecipe.difficulty,
    image_search_index: uiRecipe.image_search_index,
    image_search_indices: uiRecipe.image_search_indices,
    image_url: uiRecipe.image_url,
    image_source: uiRecipe.image_source,
    image_attribution_name: uiRecipe.image_attribution_name,
    image_attribution_url: uiRecipe.image_attribution_url,
    photo_asset: uiRecipe.photo_asset,
    photo_identity: uiRecipe.photo_identity
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

function formatCatalogIngredientForDisplay(ingredient: RecipeIngredient, wantsArabic: boolean) {
  return formatCanonicalIngredientForDisplay(
    ingredient.canonical || ingredient.name,
    wantsArabic,
    ingredient.quantity,
    ingredient.unit
  );
}

function formatCanonicalIngredientForDisplay(
  canonical: string,
  wantsArabic: boolean,
  quantity?: number,
  unit?: string
) {
  const displayName = wantsArabic ? translateIngredientToArabic(canonical) : translateIngredientToEnglish(canonical);
  const normalizedUnit = unit?.trim() || inferDefaultIngredientUnit(canonical);
  const safeQuantity = Number.isFinite(quantity) && quantity != null ? quantity : inferDefaultIngredientQuantity(canonical);
  return [
    formatIngredientQuantity(safeQuantity),
    wantsArabic ? translateIngredientUnitToArabic(normalizedUnit) : normalizedUnit,
    displayName
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function inferDefaultIngredientQuantity(canonical: string) {
  const normalized = canonical.toLowerCase();
  if (/\b(chicken|beef|meat|lamb|fish|salmon|shrimp|turkey|tofu)\b/.test(normalized)) return 1;
  if (/\b(egg)\b/.test(normalized)) return 2;
  if (/\b(rice|pasta|tomato|potato|onion|bread|beans|lentil|chickpea)\b/.test(normalized)) return 1;
  return 1;
}

function inferDefaultIngredientUnit(canonical: string) {
  const normalized = canonical.toLowerCase();
  if (/\b(chicken breast)\b/.test(normalized)) return "breasts";
  if (/\b(egg)\b/.test(normalized)) return "eggs";
  if (/\b(chicken|beef|meat|lamb|fish|salmon|shrimp|turkey|tofu)\b/.test(normalized)) return "serving";
  if (/\b(rice|pasta|beans|lentil|chickpea)\b/.test(normalized)) return "cup";
  if (/\b(tomato|potato|onion|bread)\b/.test(normalized)) return "piece";
  return "portion";
}

function formatIngredientQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function translateIngredientUnitToArabic(unit: string) {
  const normalized = unit.trim().toLowerCase();
  const units: Record<string, string> = {
    breast: "\u0635\u062f\u0631",
    breasts: "\u0635\u062f\u0648\u0631",
    cup: "\u0643\u0648\u0628",
    cups: "\u0623\u0643\u0648\u0627\u0628",
    egg: "\u0628\u064a\u0636\u0629",
    eggs: "\u0628\u064a\u0636\u0627\u062a",
    lb: "\u0631\u0637\u0644",
    ounce: "\u0623\u0648\u0646\u0635\u0629",
    ounces: "\u0623\u0648\u0646\u0635\u0627\u062a",
    piece: "\u062d\u0628\u0629",
    pieces: "\u062d\u0628\u0627\u062a",
    portion: "\u062d\u0635\u0629",
    serving: "\u062d\u0635\u0629",
    tbsp: "\u0645\u0644\u0639\u0642\u0629 \u0643\u0628\u064a\u0631\u0629",
    tsp: "\u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629"
  };
  return units[normalized] ?? unit;
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

function buildCuisineSearchOrder(ingredients: string[], preferredCuisine: string) {
  if (preferredCuisine && preferredCuisine !== "Any") return [];
  return ingredientGraph.possibleCuisines(ingredients, preferredCuisine).slice(0, 8);
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
        score: getRecipeDiversitySelectionScore(result, recipe, preferredCuisine),
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

export function getRecipeDiversitySelectionScore(
  result: RankedRecipeResult,
  recipe: RecipeCatalogDoc,
  preferredCuisine: string
) {
  const trustedCuisineSource = Boolean(
    preferredCuisine &&
      preferredCuisine !== "Any" &&
      recipe.id.startsWith("trusted-source-") &&
      cuisineMatchesPreference(recipe.cuisine, preferredCuisine)
  );
  const namedCuisineDish = Boolean(
    preferredCuisine &&
      preferredCuisine !== "Any" &&
      cuisineMatchesPreference(recipe.cuisine, preferredCuisine) &&
      hasSpecificCuisineDishSignal(recipe, preferredCuisine)
  );

  // RecipeDiversityEngine sorts candidates independently. Carry source
  // authority into its score so a generic import cannot displace a trusted
  // authentic source within the same dish family.
  return result.score + (trustedCuisineSource ? 1_000 : 0) + (namedCuisineDish ? 250 : 0);
}

function prioritizeRankedResultsForSpecificCuisine(
  rankedResults: RankedRecipeResult[],
  recipes: RecipeCatalogDoc[],
  preferredCuisine: string
) {
  if (!preferredCuisine || preferredCuisine === "Any") return rankedResults;

  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return [...rankedResults].sort((left, right) => {
    const leftRecipe = recipeMap.get(left.recipeId);
    const rightRecipe = recipeMap.get(right.recipeId);
    const leftTrustedSource = Boolean(leftRecipe?.id.startsWith("trusted-source-"));
    const rightTrustedSource = Boolean(rightRecipe?.id.startsWith("trusted-source-"));
    const leftMatches = Boolean(
      leftRecipe &&
        cuisineMatchesPreference(leftRecipe.cuisine, preferredCuisine) &&
        hasSpecificCuisineDishSignal(leftRecipe, preferredCuisine)
    );
    const rightMatches = Boolean(
      rightRecipe &&
        cuisineMatchesPreference(rightRecipe.cuisine, preferredCuisine) &&
        hasSpecificCuisineDishSignal(rightRecipe, preferredCuisine)
    );
    return (
      Number(rightTrustedSource) - Number(leftTrustedSource) ||
      Number(rightMatches) - Number(leftMatches) ||
      right.score - left.score
    );
  });
}

function prioritizeIngredientMatches(
  rankedResults: RankedRecipeResult[],
  ingredientMatchedResults: RankedRecipeResult[]
) {
  if (!ingredientMatchedResults.length) return rankedResults;
  const matchedIds = new Set(ingredientMatchedResults.map((result) => result.recipeId));
  return [...rankedResults].sort((left, right) =>
    Number(matchedIds.has(right.recipeId)) - Number(matchedIds.has(left.recipeId)) || right.score - left.score
  );
}

function prioritizeCuisineSearchOrder(
  rankedResults: RankedRecipeResult[],
  recipes: RecipeCatalogDoc[],
  cuisineSearchOrder: string[]
) {
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return [...rankedResults].sort((left, right) => {
    const leftRecipe = recipeMap.get(left.recipeId);
    const rightRecipe = recipeMap.get(right.recipeId);
    const leftIndex = cuisineSearchOrder.findIndex((cuisine) =>
      Boolean(leftRecipe && cuisineMatchesPreference(leftRecipe.cuisine, cuisine))
    );
    const rightIndex = cuisineSearchOrder.findIndex((cuisine) =>
      Boolean(rightRecipe && cuisineMatchesPreference(rightRecipe.cuisine, cuisine))
    );
    const leftPriority = leftIndex < 0 ? cuisineSearchOrder.length : leftIndex;
    const rightPriority = rightIndex < 0 ? cuisineSearchOrder.length : rightIndex;
    return leftPriority - rightPriority || right.score - left.score;
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
    recipe.image?.sourceQuery,
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
    italian: [
      "alfredo", "arrabbiata", "bolognese", "cacciatore", "caponata", "caprese", "carbonara",
      "ciambotta", "fagioli", "florentine", "italian", "margherita", "marsala", "melanzane",
      "minestrone", "norma", "parmesan", "parmigiana", "pesto", "piccata", "polenta", "pomodoro",
      "primavera", "ribollita", "risotto", "tuscan"
    ],
    mediterranean: ["briam", "caponata", "dolma", "fasolada", "gemista", "greek", "mediterranean", "moussaka", "ratatouille", "saganaki", "souvlaki"],
    mexican: ["caldo", "chilaquiles", "chile", "enchilada", "fajita", "fajitas", "huevos", "mexican", "mole", "pescado", "pozole", "quesadilla", "sopa", "taco", "tinga", "tostada", "tostadas", "veracruzana"],
    middleeastern: ["fatteh", "hummus", "kabsa", "kafta", "kibbeh", "kofta", "maklouba", "makloubeh", "maqluba", "mansaf", "middle eastern", "mujadara", "shawarma", "tabbouleh"],
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
    "alfredo",
    "arrabbiata",
    "biryani",
    "caponata",
    "chana",
    "ciambotta",
    "cacciatore",
    "caprese",
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
    "parmesan",
    "parmigiana",
    "pesto",
    "piccata",
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
  if (key === "italian") {
    return [
      "chicken alfredo",
      "chicken cacciatore",
      "chicken caprese",
      "chicken florentine",
      "chicken marsala",
      "chicken parmesan",
      "chicken parmigiana",
      "chicken pesto",
      "chicken piccata",
      "chicken primavera"
    ];
  }
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
    preference_hits: localizedFallback.preference_hits,
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

function containsLatinDisplayText(recipe: Pick<Recipe, "name" | "cuisine" | "ingredients" | "missing_ingredients" | "steps" | "cook_time" | "difficulty" | "preference_hits">) {
  return /[A-Za-z]/.test([
    recipe.name,
    recipe.cuisine,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps,
    recipe.cook_time,
    recipe.difficulty,
    ...(recipe.preference_hits ?? [])
  ].join(" "));
}

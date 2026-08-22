import type { Difficulty, MealType, RecipeCatalogDoc } from "@/lib/domain";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  isArabicRecipeLanguage,
  localizeMealForEnglish,
  translateIngredientToEnglish
} from "@/lib/arabicRecipeLocalization";
import type { DietEnforcementContext } from "@/lib/dietEnforcement";
import {
  buildRecipeHealthMetadata,
  normalizeCachedRecipeCatalogDoc,
  buildRecipeSearchMetadata,
  ensureCompleteLocalizedRecipe
} from "@/data/offline/recipeMetadata";
import {
  buildSharedRecipeArabicTitle,
  buildSharedRecipeEnglishTitle,
  normalizeEnglishCuisineLabel,
  translateCuisineLabelToArabic
} from "@/lib/recipeDisplayTitles";
import type { MealPlanMeal, Recipe } from "@/lib/types";
import {
  normalizeIngredients,
  prepareIngredientForCanonicalNormalization
} from "@/services/ingredientNormalizationService";
import { getIngredientProfileForTerm } from "@/food/IngredientNormalizer";
import { logger } from "@/lib/logger";
import { isDurableRecipeImageUrl, isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";
import {
  auditSharedRecipePoolDocument,
  canonicalizeSharedRecipeForPublication,
  deriveRecipeComplianceTags,
  isSharedRecipeDiscoverable,
  isSharedRecipePublishable,
  resolveSharedRecipeQualityMode
} from "@/services/sharedRecipePoolQualityService";
import {
  buildSharedRecipeIdentityKey,
  buildSharedRecipeIdFromIdentity,
  createPremiumRecipeValidationReceipt,
  hasCurrentPremiumValidationReceipt,
  shouldReplaceSharedRecipeVersion
} from "@/services/recipeValidationContractService";

type CacheRecipeLanguage = "English" | "Arabic";

const USER_CACHE_COLLECTION = "offlineRecipeCache";
const SHARED_CACHE_COLLECTION = "sharedOfflineRecipeCache";
const MAX_USER_CACHE_DOCS = 120;
const MAX_SHARED_CACHE_DOCS = 250;
const MAX_SHARED_CACHE_INGREDIENT_DOCS = 40;
const MAX_SHARED_CACHE_INGREDIENT_QUERIES = 3;
const CACHE_READ_TIMEOUT_MS = 6000;
const SHARED_CACHE_INGREDIENT_READ_TIMEOUT_MS = 15 * 1000;
const SHARED_CACHE_STALE_TTL_MS = 30 * 60 * 1000;
const FULL_SHARED_CACHE_STALE_TTL_MS = 60 * 60 * 1000;
const FULL_SHARED_CACHE_MAX_STALE_TTL_MS = 6 * 60 * 60 * 1000;
const FULL_SHARED_CACHE_RETRY_COOLDOWN_MS = 60 * 1000;
const USER_RECIPE_CACHE_DISABLED = process.env.DISABLE_USER_RECIPE_CACHE === "true";
const SHARED_RECIPE_POOL_DISABLED = process.env.DISABLE_SHARED_RECIPE_POOL === "true";
const SHARED_RECIPE_QUALITY_MODE = resolveSharedRecipeQualityMode(process.env.SHARED_RECIPE_QUALITY_ENFORCEMENT);

let sharedRecipeCacheSnapshot: RecipeCatalogDoc[] = [];
let sharedRecipeCacheUpdatedAt = 0;
let fullSharedRecipeCacheSnapshot: RecipeCatalogDoc[] = [];
let fullSharedRecipeCacheUpdatedAt = 0;
let fullSharedRecipeCacheLoadPromise: Promise<RecipeCatalogDoc[]> | null = null;
let fullSharedRecipeCacheLastAttemptAt = 0;

export async function listUserCachedRecipes(uid?: string | null): Promise<RecipeCatalogDoc[]> {
  if (!uid) return [];
  if (USER_RECIPE_CACHE_DISABLED) {
    logger.info("User recipe cache reads are disabled by environment flag", { uid });
    return [];
  }

  try {
    const db = getAdminDb();
    const cacheQuery = db
      .collection("users")
      .doc(uid)
      .collection(USER_CACHE_COLLECTION)
      .orderBy("updatedAt", "desc")
      .limit(MAX_USER_CACHE_DOCS);
    const snapshot = await withTimeout(cacheQuery.get(), CACHE_READ_TIMEOUT_MS, "load cached recipes");

    if (snapshot.empty) {
      void hydrateUserRecipeCacheFromSavedAppData(uid).catch((error) => {
        logger.warn("Background cache hydration failed", {
          uid,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      });
      return [];
    }

    return snapshot.docs
      .map((docSnap) => normalizeCachedRecipeCatalogDoc(docSnap.data() as RecipeCatalogDoc))
      .filter((recipe) => recipe?.isActive)
      .map(stripGeneratedCacheRecipeImages);
  } catch (error) {
    logger.warn("Loading user cached recipes failed", {
      uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

export async function listSharedCachedRecipes(): Promise<RecipeCatalogDoc[]> {
  if (SHARED_RECIPE_POOL_DISABLED) {
    logger.info("Shared recipe pool reads are disabled by environment flag");
    return [];
  }

  try {
    const recipes = await ensurePublishedSharedRecipeCache();
    return recipes.slice(0, MAX_SHARED_CACHE_DOCS);
  } catch (error) {
    logger.warn("Loading shared cached recipes failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
      fallbackToStaleSnapshot: hasFreshSharedRecipeSnapshot(),
      staleSnapshotCount: sharedRecipeCacheSnapshot.length
    });
    if (hasFreshSharedRecipeSnapshot()) {
      return sharedRecipeCacheSnapshot;
    }

    try {
      const db = getAdminDb();
      const reducedSnapshot = await withTimeout(
        db
          .collection(SHARED_CACHE_COLLECTION)
          .orderBy("updatedAt", "desc")
          .limit(Math.min(100, MAX_SHARED_CACHE_DOCS))
          .get(),
        Math.max(3000, Math.round(CACHE_READ_TIMEOUT_MS * 0.6)),
        "load reduced shared cached recipes"
      );
      const reducedRecipes = reducedSnapshot.docs
        .map((docSnap) => readPublishedSharedRecipeDoc(docSnap.data() as RecipeCatalogDoc))
        .map(stripSharedGeneratedCacheRecipeImages)
        .filter((recipe) => recipe?.isActive && isUsableSharedCachedRecipe(recipe));
      if (reducedRecipes.length) {
        sharedRecipeCacheSnapshot = reducedRecipes;
        sharedRecipeCacheUpdatedAt = Date.now();
        logger.info("Loaded reduced shared cached recipes after primary read failure", {
          recipeCount: reducedRecipes.length
        });
        return reducedRecipes;
      }
    } catch (fallbackError) {
      logger.warn("Reduced shared cached recipes fallback failed", {
        errorMessage: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }

    return [];
  }
}

export function getWarmSharedRecipeCacheSnapshot(options: { allowStale?: boolean } = {}) {
  if (!fullSharedRecipeCacheSnapshot.length) return [];
  const ageMs = Date.now() - fullSharedRecipeCacheUpdatedAt;
  if (ageMs <= FULL_SHARED_CACHE_STALE_TTL_MS) return fullSharedRecipeCacheSnapshot;
  if (options.allowStale && ageMs <= FULL_SHARED_CACHE_MAX_STALE_TTL_MS) {
    primeFullSharedRecipeCache();
    return fullSharedRecipeCacheSnapshot;
  }
  return [];
}

export function primeFullSharedRecipeCache(options: { force?: boolean } = {}) {
  if (SHARED_RECIPE_POOL_DISABLED) return;
  if (!options.force && hasFreshFullSharedRecipeSnapshot()) return;
  if (fullSharedRecipeCacheLoadPromise) return;

  const now = Date.now();
  if (!options.force && now - fullSharedRecipeCacheLastAttemptAt < FULL_SHARED_CACHE_RETRY_COOLDOWN_MS) {
    return;
  }

  fullSharedRecipeCacheLastAttemptAt = now;
  fullSharedRecipeCacheLoadPromise = loadFullSharedRecipeCache()
    .catch((error) => {
      logger.warn("Full shared recipe pool warm load failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
        staleSnapshotCount: fullSharedRecipeCacheSnapshot.length
      });
      return fullSharedRecipeCacheSnapshot;
    })
    .finally(() => {
      fullSharedRecipeCacheLoadPromise = null;
    });
}

export async function listSharedCachedRecipesForIngredients(ingredients: string[]): Promise<RecipeCatalogDoc[]> {
  if (SHARED_RECIPE_POOL_DISABLED) {
    logger.info("Shared recipe pool reads are disabled by environment flag");
    return [];
  }

  const canonicalIngredients = Array.from(
    new Set(ingredients.map((ingredient) => ingredient.trim().toLowerCase()).filter(Boolean))
  ).slice(0, MAX_SHARED_CACHE_INGREDIENT_QUERIES);
  if (!canonicalIngredients.length) return [];

  const warmRecipes = getWarmSharedRecipeCacheSnapshot({ allowStale: true });
  if (warmRecipes.length) {
    return selectSharedRecipesForIngredients(warmRecipes, canonicalIngredients);
  }

  try {
    const recipesById = new Map<string, RecipeCatalogDoc>();
    const ingredientReads = await Promise.allSettled(canonicalIngredients.map(async (ingredient) => {
      const snapshot = await withTimeout(
        getAdminDb()
          .collection(SHARED_CACHE_COLLECTION)
          .where("qualityStatus", "in", ["golden", "verified"])
          .where("ingredientLookupCanonicals", "array-contains", ingredient)
          .orderBy("updatedAt", "desc")
          .limit(MAX_SHARED_CACHE_INGREDIENT_DOCS)
          .get(),
        SHARED_CACHE_INGREDIENT_READ_TIMEOUT_MS,
        `load published shared recipes for ${ingredient}`
      );
      return snapshot.docs
        .map((docSnap) => readPublishedSharedRecipeDoc(docSnap.data() as RecipeCatalogDoc))
        .map(stripSharedGeneratedCacheRecipeImages)
        .filter((recipe) => recipe?.isActive && isUsableSharedCachedRecipe(recipe));
    }));

    ingredientReads.forEach((result, index) => {
      if (result.status === "fulfilled") {
        result.value.forEach((recipe) => recipesById.set(recipe.id, recipe));
        return;
      }
      logger.warn("Indexed shared recipe ingredient read failed", {
        ingredient: canonicalIngredients[index],
        errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason)
      });
    });

    if (!recipesById.size && ingredientReads.some((result) => result.status === "rejected")) {
      throw new Error("All indexed shared recipe ingredient reads failed");
    }
    return sortSharedRecipesForRetrieval(Array.from(recipesById.values()))
      .slice(0, MAX_SHARED_CACHE_INGREDIENT_DOCS * MAX_SHARED_CACHE_INGREDIENT_QUERIES);
  } catch (error) {
    logger.warn("Indexed published shared recipe lookup failed; using raw verified-pool filtering", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return loadPublishedSharedRecipesForIngredients(canonicalIngredients);
  }
}

async function loadPublishedSharedRecipesForIngredients(ingredients: string[]) {
  const requested = new Set(ingredients);
  const snapshot = await withTimeout(
    getAdminDb()
      .collection(SHARED_CACHE_COLLECTION)
      .where("qualityStatus", "in", ["golden", "verified"])
      .get(),
    Math.max(CACHE_READ_TIMEOUT_MS, 10_000),
    "load published shared recipe fallback"
  );

  const recipes = snapshot.docs
    .filter((docSnap) => {
      const data = docSnap.data() as Pick<RecipeCatalogDoc, "ingredientCanonicals" | "ingredientLookupCanonicals">;
      const lookupCanonicals = data.ingredientLookupCanonicals?.length
        ? data.ingredientLookupCanonicals
        : data.ingredientCanonicals;
      return Array.isArray(lookupCanonicals) &&
        lookupCanonicals.some((ingredient) => requested.has(ingredient.toLowerCase()));
    })
    .map((docSnap) => readPublishedSharedRecipeDoc(docSnap.data() as RecipeCatalogDoc))
    .map(stripSharedGeneratedCacheRecipeImages)
    .filter((recipe) => recipe?.isActive && isUsableSharedCachedRecipe(recipe));

  return sortSharedRecipesForRetrieval(recipes)
    .slice(0, MAX_SHARED_CACHE_INGREDIENT_DOCS * MAX_SHARED_CACHE_INGREDIENT_QUERIES);
}

async function loadFullSharedRecipeCache() {
  const startTime = Date.now();
  const db = getAdminDb();
  const snapshot = await db
    .collection(SHARED_CACHE_COLLECTION)
    .where("qualityStatus", "in", ["golden", "verified"])
    .get();
  const recipes = snapshot.docs
    .map((docSnap) => readPublishedSharedRecipeDoc(docSnap.data() as RecipeCatalogDoc))
    .map(stripSharedGeneratedCacheRecipeImages)
    .filter((recipe) => recipe?.isActive && isUsableSharedCachedRecipe(recipe));

  fullSharedRecipeCacheSnapshot = recipes;
  fullSharedRecipeCacheUpdatedAt = Date.now();
  sharedRecipeCacheSnapshot = recipes.slice(0, MAX_SHARED_CACHE_DOCS);
  sharedRecipeCacheUpdatedAt = fullSharedRecipeCacheUpdatedAt;

  logger.info("Full shared recipe pool warmed", {
    docCount: snapshot.size,
    recipeCount: recipes.length,
    durationMs: Date.now() - startTime
  });

  return recipes;
}

function readPublishedSharedRecipeDoc(recipe: RecipeCatalogDoc) {
  if (isSharedRecipeDiscoverable(recipe, "strict")) return recipe;
  return normalizeCachedRecipeCatalogDoc(recipe);
}

async function ensurePublishedSharedRecipeCache() {
  const warm = getWarmSharedRecipeCacheSnapshot({ allowStale: true });
  if (warm.length) return warm;

  primeFullSharedRecipeCache({ force: true });
  if (!fullSharedRecipeCacheLoadPromise) return fullSharedRecipeCacheSnapshot;
  return withTimeout(
    fullSharedRecipeCacheLoadPromise,
    Math.max(CACHE_READ_TIMEOUT_MS, 10_000),
    "load verified shared recipe pool"
  );
}

export function selectSharedRecipesForIngredients(
  recipes: RecipeCatalogDoc[],
  ingredients: string[]
) {
  const requested = new Set(ingredients.map((ingredient) => ingredient.trim().toLowerCase()).filter(Boolean));
  if (!requested.size) return [];

  return sortSharedRecipesForRetrieval(recipes
    .filter((recipe) => {
      const lookupCanonicals = recipe.ingredientLookupCanonicals?.length
        ? recipe.ingredientLookupCanonicals
        : recipe.ingredientCanonicals;
      return lookupCanonicals.some((ingredient) => requested.has(ingredient.toLowerCase()));
    }))
    .slice(0, MAX_SHARED_CACHE_INGREDIENT_DOCS * MAX_SHARED_CACHE_INGREDIENT_QUERIES);
}

export function sortSharedRecipesForRetrieval(recipes: RecipeCatalogDoc[]) {
  return [...recipes].sort((left, right) => {
    const providerDifference = sharedRecipeProviderPriority(right) - sharedRecipeProviderPriority(left);
    if (providerDifference) return providerDifference;

    const qualityDifference = sharedRecipeQualityPriority(right) - sharedRecipeQualityPriority(left);
    if (qualityDifference) return qualityDifference;

    const scoreDifference = sharedRecipeScore(right) - sharedRecipeScore(left);
    if (scoreDifference) return scoreDifference;

    const updatedDifference = right.updatedAt - left.updatedAt;
    if (updatedDifference) return updatedDifference;

    return left.id.localeCompare(right.id);
  });
}

function sharedRecipeProviderPriority(recipe: RecipeCatalogDoc) {
  return recipe.source?.provider === "premium-validated" ? 1 : 0;
}

function sharedRecipeQualityPriority(recipe: RecipeCatalogDoc) {
  if (recipe.qualityStatus === "golden") return 2;
  if (recipe.qualityStatus === "verified") return 1;
  return 0;
}

function sharedRecipeScore(recipe: RecipeCatalogDoc) {
  return recipe.validationReceipt?.acceptanceScore ?? recipe.qualityScore ?? recipe.popularityScore ?? 0;
}

export async function persistGeneratedRecipeCache(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  meals?: MealPlanMeal[];
  uid?: string | null;
  dietContext?: DietEnforcementContext;
}) {
  if (USER_RECIPE_CACHE_DISABLED || !input.uid) return;

  const cacheDocs = await buildCacheDocs(input, { preserveImages: false });
  if (!cacheDocs.length) return;

  const db = getAdminDb();
  const userCacheCollection = db.collection("users").doc(input.uid).collection(USER_CACHE_COLLECTION);

  await writeDocsInBatches(
    cacheDocs,
    75,
    async (batch, recipe) => {
      batch.set(userCacheCollection.doc(recipe.id), stripUndefinedDeep(recipe));
    }
  );
}

export async function persistPremiumValidatedRecipeCache(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
}) {
  if (SHARED_RECIPE_POOL_DISABLED || !input.recipes?.length) {
    return { available: 0, published: 0, rejected: input.recipes?.length ?? 0, reused: 0, superseded: 0 };
  }

  const sourceLanguage: CacheRecipeLanguage = isArabicRecipeLanguage(input.recipeLanguage) ? "Arabic" : "English";
  const acceptedAt = Date.now();
  const publicationRejections: Array<Record<string, unknown>> = [];
  const promoted = (
    await Promise.all(input.recipes.map(async (recipe, index) => {
      const result = await buildPremiumSharedRecipePublicationDocument({
        acceptedAt,
        fallbackId: `premium-recipe-${index}`,
        recipe,
        sourceLanguage
      });
      if (result.document) return result.document;
      publicationRejections.push({ recipeName: recipe.name, ...result.rejection });
      return null;
    }))
  ).filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe));

  if (publicationRejections.length) {
    logger.warn("Premium recipes omitted from shared pool publication", {
      rejectedCount: publicationRejections.length,
      rejections: publicationRejections
    });
  }

  if (!promoted.length) {
    return { available: 0, published: 0, rejected: input.recipes.length, reused: 0, superseded: 0 };
  }

  const db = getAdminDb();
  const collection = db.collection(SHARED_CACHE_COLLECTION);
  const published: RecipeCatalogDoc[] = [];
  const reusable: RecipeCatalogDoc[] = [];
  const supersededIds = new Set<string>();

  for (const incoming of promoted) {
    const [identitySnapshot, titleSnapshot, existingTarget] = await Promise.all([
      collection.where("sharedIdentityKey", "==", incoming.sharedIdentityKey).limit(20).get(),
      collection.where("title", "==", incoming.title).limit(20).get(),
      collection.doc(incoming.id).get()
    ]);
    const matchingDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...identitySnapshot.docs, ...titleSnapshot.docs].forEach((docSnap) => {
      const existing = docSnap.data() as RecipeCatalogDoc;
      if (existing.cuisine === incoming.cuisine && buildSharedRecipeIdentityKey(existing) === incoming.sharedIdentityKey) {
        matchingDocs.set(docSnap.id, docSnap);
      }
    });

    const currentTarget = existingTarget.exists ? existingTarget.data() as RecipeCatalogDoc : undefined;
    const shouldWrite = shouldReplaceSharedRecipeVersion(currentTarget, incoming);
    const batch = db.batch();
    if (shouldWrite) {
      batch.set(collection.doc(incoming.id), buildSharedCacheWriteDoc(incoming));
      published.push(incoming);
      reusable.push(incoming);
    } else if (currentTarget?.isActive && isSharedRecipePublishable(currentTarget)) {
      // A stronger stored version should remain immediately reusable. Without
      // merging it, the warm snapshot exposes only newly written documents.
      reusable.push(currentTarget);
    }

    matchingDocs.forEach((docSnap, id) => {
      if (id === incoming.id) return;
      batch.set(docSnap.ref, {
        isActive: false,
        supersededBy: incoming.id,
        updatedAt: acceptedAt
      }, { merge: true });
      supersededIds.add(id);
    });

    if (shouldWrite || matchingDocs.size > Number(matchingDocs.has(incoming.id))) {
      await batch.commit();
    }
  }

  if (reusable.length || supersededIds.size) {
    updateSharedRecipeSnapshots(reusable, supersededIds, acceptedAt);
  }

  return {
    available: reusable.length,
    published: published.length,
    rejected: input.recipes.length - promoted.length,
    reused: reusable.length - published.length,
    superseded: supersededIds.size
  };
}

export async function buildPremiumSharedRecipePublicationDocument(input: {
  acceptedAt?: number;
  fallbackId?: string;
  recipe: Recipe;
  sourceLanguage: CacheRecipeLanguage;
}): Promise<{
  document: RecipeCatalogDoc | null;
  rejection?: Record<string, unknown>;
}> {
  const acceptanceScore = input.recipe.acceptance_score;
  if (!Number.isFinite(acceptanceScore)) {
    return { document: null, rejection: { reason: "missing_acceptance_score" } };
  }

  const acceptedAt = input.acceptedAt ?? Date.now();
  const cacheDoc = await buildCacheDocFromRecipe(
    input.recipe,
    input.sourceLanguage,
    input.fallbackId ?? "premium-recipe",
    { preserveImages: true, preserveValidatedIdentity: true }
  );
  if (!cacheDoc) {
    return { document: null, rejection: { reason: "cache_document_build_failed" } };
  }

  const taggedDoc = { ...cacheDoc, ...deriveRecipeComplianceTags(cacheDoc) };
  const sharedCacheDoc = toSharedCacheDoc(taggedDoc, "premium-validated");
  const sharedDoc = canonicalizeSharedRecipeForPublication(
    applyValidatedRecipeIdentity(sharedCacheDoc, taggedDoc.title, taggedDoc.cuisine)
  );
  const receipt = createPremiumRecipeValidationReceipt(sharedDoc, {
    acceptanceScore: Number(acceptanceScore),
    acceptanceReasons: input.recipe.acceptance_reasons,
    acceptedAt
  });
  if (!receipt) {
    return {
      document: null,
      rejection: {
        reason: "validation_receipt_creation_failed",
        ingredientCanonicals: sharedDoc.ingredientCanonicals,
        requiredCanonicals: sharedDoc.requiredCanonicals,
        optionalCanonicals: sharedDoc.optionalCanonicals
      }
    };
  }

  const audited = auditSharedRecipePoolDocument({
    ...sharedDoc,
    validationReceipt: receipt
  }, acceptedAt).document;
  if (!isSharedRecipePublishable(audited)) {
    return {
      document: null,
      rejection: {
        reason: "shared_pool_quality_rejected",
        qualityStatus: audited.qualityStatus,
        qualityReasons: audited.qualityReasons,
        hasCurrentPremiumReceipt: hasCurrentPremiumValidationReceipt(audited)
      }
    };
  }

  return { document: audited };
}

export async function persistSharedRecipeCache(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  meals?: MealPlanMeal[];
  sourceProvider?: string;
}) {
  if (SHARED_RECIPE_POOL_DISABLED) {
    logger.info("Shared recipe pool writes are disabled by environment flag");
    return;
  }

  const cacheDocs = await buildCacheDocs(input, { preserveImages: true });
  if (!cacheDocs.length) return;

  const publishableRecipes = cacheDocs
    .map((recipe) => auditSharedRecipePoolDocument(toSharedCacheDoc(recipe, input.sourceProvider)).document)
    .filter(isSharedRecipePublishable);
  if (!publishableRecipes.length) return;

  const db = getAdminDb();
  await writeDocsInBatches(
    publishableRecipes,
    50,
    async (batch, recipe) => {
      batch.set(
        db.collection(SHARED_CACHE_COLLECTION).doc(recipe.id),
        buildSharedCacheWriteDoc(recipe),
        { merge: true }
      );
    }
  );
}

export async function persistSharedRecipeCatalog(recipes: RecipeCatalogDoc[]) {
  if (SHARED_RECIPE_POOL_DISABLED || !recipes.length) {
    return { published: 0, rejected: recipes.length };
  }

  const publishableRecipes = prepareSharedRecipeCatalogForPublication(recipes);

  const db = getAdminDb();
  await writeDocsInBatches(
    publishableRecipes,
    50,
    async (batch, recipe) => {
      batch.set(
        db.collection(SHARED_CACHE_COLLECTION).doc(recipe.id),
        buildSharedCacheWriteDoc(recipe),
        { merge: true }
      );
    }
  );

  return {
    published: publishableRecipes.length,
    rejected: recipes.length - publishableRecipes.length
  };
}

export function prepareSharedRecipeCatalogForPublication(recipes: RecipeCatalogDoc[]) {
  return recipes
    .map((recipe) => toSharedCacheDoc(recipe, recipe.source?.provider ?? "trusted-catalog"))
    .map((recipe) => auditSharedRecipePoolDocument(recipe).document)
    .filter(isSharedRecipePublishable);
}

function createRecipeVariants(recipe: Recipe, sourceLanguage: CacheRecipeLanguage) {
  return ensureCompleteLocalizedRecipe(recipe, sourceLanguage);
}

async function buildCacheDocs(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  meals?: MealPlanMeal[];
}, options: { preserveImages: boolean }) {
  const sourceLanguage: CacheRecipeLanguage = isArabicRecipeLanguage(input.recipeLanguage) ? "Arabic" : "English";
  return (
    await Promise.all([
      ...(input.recipes ?? []).map((recipe, index) =>
        buildCacheDocFromRecipe(recipe, sourceLanguage, `recipe-${index}`, options)
      ),
      ...(input.meals ?? []).map((meal, index) =>
        buildCacheDocFromMeal(meal, sourceLanguage, `meal-${index}`, options)
      )
    ])
  ).filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe));
}

function createMealRecipe(meal: MealPlanMeal, fallbackId: string, options: { preserveImages: boolean }): Recipe {
  const imageUrl = options.preserveImages ? sanitizeCacheRecipeImageUrl(meal.image_url) : undefined;
  return {
    id: meal.source_recipe_id ?? fallbackId,
    name: meal.name,
    cuisine: meal.cuisine ?? "Unknown",
    recipe_source_type: meal.recipe_source_type,
    source_recipe_id: meal.source_recipe_id,
    image_search_index: meal.image_search_index,
    image_search_indices: meal.image_search_indices,
    ingredients: meal.ingredients ?? [],
    missing_ingredients: [],
    steps: meal.steps ?? [],
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    cook_time: meal.cook_time ?? "30 minutes",
    difficulty: meal.difficulty ?? "Easy",
    image_url: imageUrl,
    image_source: imageUrl ? meal.image_source : undefined,
    image_attribution_name: imageUrl ? meal.image_attribution_name : undefined,
    image_attribution_url: imageUrl ? meal.image_attribution_url : undefined,
    photo_asset: imageUrl && meal.photo_asset?.status === "ready"
      ? { ...meal.photo_asset, url: imageUrl }
      : undefined,
    photo_identity: meal.photo_identity
  };
}

async function buildCacheDocFromMeal(
  meal: MealPlanMeal,
  sourceLanguage: CacheRecipeLanguage,
  fallbackId: string,
  options: { preserveImages: boolean }
) {
  const sourceMeal = sourceLanguage === "Arabic" ? localizeMealForEnglish(meal) : meal;
  const recipe = createMealRecipe(sourceMeal, fallbackId, options);
  return buildCacheDocFromRecipe(recipe, sourceLanguage, fallbackId, options);
}

async function buildCacheDocFromRecipe(
  recipe: Recipe,
  sourceLanguage: CacheRecipeLanguage,
  fallbackId: string,
  options: { preserveImages: boolean; preserveValidatedIdentity?: boolean }
): Promise<RecipeCatalogDoc | null> {
  const variants = createRecipeVariants(sanitizeRecipeImageFields(recipe, options), sourceLanguage);
  const englishIngredients = [...variants.English.ingredients, ...variants.English.missing_ingredients]
    .map((ingredient) => translateIngredientToEnglish(ingredient))
    .filter(Boolean);
  const normalized = await normalizeIngredients(englishIngredients.map(prepareCacheIngredientForNormalization));
  const ingredientCanonicals = normalized.normalized.filter(Boolean);
  if (!ingredientCanonicals.length) {
    return null;
  }

  const requiredCanonicals = ingredientCanonicals.slice(0, Math.min(3, ingredientCanonicals.length));
  const optionalCanonicals = ingredientCanonicals.slice(requiredCanonicals.length);
  const timestamp = Date.now();
  const generatedEnglishTitle = buildSharedRecipeEnglishTitle({
    title: variants.English.name || recipe.name || fallbackId,
    englishName: variants.English.name,
    arabicName: variants.Arabic.name,
    cuisine: variants.English.cuisine || recipe.cuisine || "Unknown",
    mealType: inferMealType(variants.English.name || recipe.name || fallbackId),
    requiredCanonicals,
    ingredientCanonicals,
    dishIntentName: variants.English.dish_intent?.dish_name ?? variants.Arabic.dish_intent?.dish_name,
    imageSearchIndex: variants.English.image_search_index ?? variants.Arabic.image_search_index
  });
  const specificIdentity = pickSpecificCacheIdentity(recipe, variants);
  const englishTitle = options.preserveValidatedIdentity
    ? recipe.name || variants.English.name || fallbackId
    : isWeakSharedCacheTitle(generatedEnglishTitle) && specificIdentity
      ? toTitleCase(specificIdentity)
      : generatedEnglishTitle;
  const generatedArabicTitle = buildSharedRecipeArabicTitle({
    title: englishTitle,
    englishName: englishTitle,
    arabicName: variants.Arabic.name,
    cuisine: variants.English.cuisine || recipe.cuisine || "Unknown",
    mealType: inferMealType(englishTitle),
    requiredCanonicals,
    ingredientCanonicals,
    dishIntentName: variants.English.dish_intent?.dish_name ?? variants.Arabic.dish_intent?.dish_name,
    imageSearchIndex: variants.English.image_search_index ?? variants.Arabic.image_search_index
  });
  const arabicTitle = options.preserveValidatedIdentity
    ? variants.Arabic.name || generatedArabicTitle
    : generatedArabicTitle;
  const id = buildCacheId(englishTitle, ingredientCanonicals, fallbackId);
  const imageSignature = buildImageSignature(id, variants.English.cuisine || "Unknown", ingredientCanonicals);
  const normalizedEnglishCuisine = normalizeEnglishCuisineLabel(variants.English.cuisine || recipe.cuisine || "Unknown");
  const normalizedArabicCuisine = translateCuisineLabelToArabic(normalizedEnglishCuisine);
  const durableImageUrl = options.preserveImages ? sanitizeCacheRecipeImageUrl(variants.English.image_url) : undefined;

  const baseRecipe: RecipeCatalogDoc = {
    id,
    title: englishTitle,
    slug: slugify(englishTitle) || fallbackId,
    description: englishTitle,
    ingredients: ingredientCanonicals.map((canonical, index) => ({
      name: canonical,
      canonical,
      required: requiredCanonicals.includes(canonical),
      ...(index < requiredCanonicals.length ? { quantity: 1 } : {})
    })),
    ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    dietTags: [],
    allergenTags: [],
    mealType: inferMealType(englishTitle),
    cuisine: normalizedEnglishCuisine,
    prepMinutes: inferPrepMinutes(variants.English.cook_time),
    cookMinutes: inferCookMinutes(variants.English.cook_time),
    totalMinutes: inferTotalMinutes(variants.English.cook_time),
    difficulty: inferDifficulty(variants.English.difficulty),
    calories: Number.isFinite(recipe.calories) ? recipe.calories : 0,
    protein: readMacroNumber(variants.English.protein, 0) ?? 0,
    carbs: readMacroNumber(variants.English.carbs, 0) ?? 0,
    fat: readMacroNumber(variants.English.fat, 0) ?? 0,
    fiber: readMacroNumber(variants.English.fiber),
    sugar: readMacroNumber(variants.English.sugar),
    sodium: readMacroNumber(variants.English.sodium),
    calorieBand: inferCalorieBand(Number.isFinite(recipe.calories) ? recipe.calories : 0),
    servings: 1,
    steps: variants.English.steps,
    image: {
      storagePath: durableImageUrl ?? "",
      thumbPath: durableImageUrl,
      signature: imageSignature,
      sharedCacheKey: imageSignature,
      sourceQuery: dedupeStrings([variants.English.cuisine, englishTitle, ...ingredientCanonicals.slice(0, 3)]).join(" "),
      source: durableImageUrl ? recipe.photo_asset?.source ?? variants.English.image_source : undefined,
      attributionName: durableImageUrl ? recipe.photo_asset?.attributionName ?? variants.English.image_attribution_name : undefined,
      attributionUrl: durableImageUrl ? recipe.photo_asset?.attributionUrl ?? variants.English.image_attribution_url : undefined,
      dietTags: durableImageUrl ? recipe.photo_asset?.dietTags ?? [] : [],
      status: durableImageUrl ? "ready" : "pending",
      validatedAt: durableImageUrl ? recipe.photo_asset?.validatedAt : undefined,
      validatorHash: durableImageUrl ? recipe.photo_asset?.validatorHash : undefined
    },
    localized: {
      English: {
        ...sanitizeRecipeImageFields(variants.English, options),
        id,
        name: englishTitle,
        cuisine: normalizedEnglishCuisine
      },
      Arabic: {
        ...sanitizeRecipeImageFields(variants.Arabic, options),
        id,
        name: arabicTitle,
        cuisine: normalizedArabicCuisine
      }
    },
    regionalCuisines: inferRegionalCuisines(variants.English.cuisine || "Unknown"),
    styleTags: inferStyleTags(englishTitle, variants.English.steps),
    searchTokens: dedupeStrings([
      englishTitle,
      arabicTitle,
      variants.English.cuisine,
      recipe.image_search_index,
      ...(recipe.image_search_indices ?? []),
      ...ingredientCanonicals
    ]),
    popularityScore: 60,
    qualityScore: 70,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const normalizedDoc = normalizeCachedRecipeCatalogDoc({
    ...baseRecipe,
    healthMetadata: buildRecipeHealthMetadata(baseRecipe),
    searchMetadata: buildRecipeSearchMetadata(baseRecipe)
  });
  if (!options.preserveValidatedIdentity || !normalizedDoc.localized?.English) {
    return normalizedDoc;
  }

  return applyValidatedRecipeIdentity(normalizedDoc, englishTitle, normalizedEnglishCuisine);
}

function applyValidatedRecipeIdentity(recipe: RecipeCatalogDoc, title: string, cuisine: string) {
  const english = recipe.localized?.English;
  if (!english) return { ...recipe, title, description: title };
  const authoritativeEnglish = {
    ...english,
    name: title,
    dish_identity: title,
    dish_intent: {
      ...(english.dish_intent ?? {}),
      cuisine,
      dish_name: title,
      exclude_keywords: english.dish_intent?.exclude_keywords ?? [],
      visual_keywords: english.dish_intent?.visual_keywords ?? []
    }
  };
  return {
    ...recipe,
    title,
    description: title,
    dishIntent: authoritativeEnglish.dish_intent,
    localized: {
      ...recipe.localized,
      English: authoritativeEnglish
    },
    searchTokens: dedupeStrings([...recipe.searchTokens, title])
  };
}

function sanitizeCacheRecipeImageUrl(imageUrl?: string | null) {
  return isDurableRecipeImageUrl(imageUrl) ? imageUrl : undefined;
}

export function prepareCacheIngredientForNormalization(value: string) {
  const primaryPhrase = value
    .replace(/\([^)]*\)/g, " ")
    .split(",", 1)[0]
    .replace(/\s+/g, " ")
    .trim();
  const ingredientPhrase = prepareIngredientForCanonicalNormalization(primaryPhrase);
  if (!ingredientPhrase || /\band\b/i.test(ingredientPhrase)) return ingredientPhrase;
  return getIngredientProfileForTerm(ingredientPhrase)?.canonicalEnglishName ?? ingredientPhrase;
}

export async function rebuildPremiumSharedRecipeCanonicalPayload(
  recipe: RecipeCatalogDoc,
  migratedAt = Date.now()
): Promise<RecipeCatalogDoc | null> {
  if (recipe.source?.provider !== "premium-validated" || recipe.validationReceipt?.profile !== "premium") {
    return null;
  }

  const englishVariant = recipe.localized?.English;
  const sourceIngredientLines = [
    ...(englishVariant?.ingredients ?? []),
    ...(englishVariant?.missing_ingredients ?? [])
  ];
  const fallbackIngredientLines = recipe.ingredients.map((ingredient) => ingredient.name || ingredient.canonical);
  const normalized = await normalizeIngredients(
    (sourceIngredientLines.length ? sourceIngredientLines : fallbackIngredientLines)
      .map(prepareCacheIngredientForNormalization)
  );
  const ingredientCanonicals = normalized.normalized.filter(Boolean);
  if (!ingredientCanonicals.length) return null;

  const requiredCanonicals = ingredientCanonicals.slice(0, Math.min(3, ingredientCanonicals.length));
  const optionalCanonicals = ingredientCanonicals.slice(requiredCanonicals.length);
  const staleCanonicals = new Set(recipe.ingredientCanonicals.map((canonical) => canonical.trim().toLowerCase()));
  const canonicalized = normalizeCachedRecipeCatalogDoc({
    ...recipe,
    ingredients: ingredientCanonicals.map((canonical) => ({
      name: canonical,
      canonical,
      required: requiredCanonicals.includes(canonical)
    })),
    ingredientCanonicals,
    ingredientLookupCanonicals: ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    searchTokens: dedupeStrings([
      ...(recipe.searchTokens ?? []).filter((token) => !staleCanonicals.has(token.trim().toLowerCase())),
      ...ingredientCanonicals
    ]),
    updatedAt: migratedAt
  });
  const tagged = normalizeCachedRecipeCatalogDoc({
    ...canonicalized,
    ...deriveRecipeComplianceTags(canonicalized),
    healthMetadata: buildRecipeHealthMetadata(canonicalized),
    searchMetadata: buildRecipeSearchMetadata(canonicalized)
  });
  const receipt = createPremiumRecipeValidationReceipt(tagged, {
    acceptanceScore: recipe.validationReceipt.acceptanceScore,
    acceptanceReasons: recipe.validationReceipt.acceptanceReasons,
    acceptedAt: migratedAt
  });
  if (!receipt) return null;

  return auditSharedRecipePoolDocument({
    ...tagged,
    validationReceipt: receipt
  }, migratedAt).document;
}

function sanitizeRecipeImageFields<T extends Pick<Recipe, "image_url" | "image_source" | "image_attribution_name" | "image_attribution_url">>(
  recipe: T,
  options: { preserveImages: boolean } = { preserveImages: false }
) {
  const imageUrl = options.preserveImages ? sanitizeCacheRecipeImageUrl(recipe.image_url) : undefined;
  return {
    ...recipe,
    image_url: imageUrl,
    image_source: imageUrl ? recipe.image_source : undefined,
    image_attribution_name: imageUrl ? recipe.image_attribution_name : undefined,
    image_attribution_url: imageUrl ? recipe.image_attribution_url : undefined
  };
}

function stripSharedGeneratedCacheRecipeImages(recipe: RecipeCatalogDoc) {
  return recipe.source?.provider === "shared-user-cache" ? preserveOnlyGeneratedSharedCacheRecipeImages(recipe) : recipe;
}

function stripGeneratedCacheRecipeImages(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  return {
    ...recipe,
    image: {
      ...recipe.image,
      storagePath: "",
      thumbPath: undefined,
      source: undefined,
      attributionName: undefined,
      attributionUrl: undefined,
      dietTags: [],
      status: "pending",
      validatedAt: undefined,
      validatorHash: undefined
    },
    localized: recipe.localized
      ? {
          ...recipe.localized,
          English: recipe.localized.English ? sanitizeRecipeImageFields(recipe.localized.English) : recipe.localized.English,
          Arabic: recipe.localized.Arabic ? sanitizeRecipeImageFields(recipe.localized.Arabic) : recipe.localized.Arabic
        }
      : recipe.localized
  };
}

function preserveOnlyGeneratedSharedCacheRecipeImages(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  const storagePath = isReplicateGeneratedRecipeImageUrl(recipe.image.storagePath) ? recipe.image.storagePath : "";
  const thumbPath = isReplicateGeneratedRecipeImageUrl(recipe.image.thumbPath) ? recipe.image.thumbPath : undefined;
  const hasGeneratedPhoto = Boolean(thumbPath || storagePath);
  return {
    ...recipe,
    image: {
      ...recipe.image,
      storagePath,
      thumbPath,
      source: hasGeneratedPhoto ? recipe.image.source : undefined,
      attributionName: hasGeneratedPhoto ? recipe.image.attributionName : undefined,
      attributionUrl: hasGeneratedPhoto ? recipe.image.attributionUrl : undefined,
      dietTags: hasGeneratedPhoto ? recipe.image.dietTags ?? [] : [],
      status: hasGeneratedPhoto ? "ready" : "pending",
      validatedAt: hasGeneratedPhoto ? recipe.image.validatedAt : undefined,
      validatorHash: hasGeneratedPhoto ? recipe.image.validatorHash : undefined
    },
    localized: recipe.localized
      ? {
          ...recipe.localized,
          English: recipe.localized.English
            ? sanitizeGeneratedCacheRecipeImageFields(recipe.localized.English)
            : recipe.localized.English,
          Arabic: recipe.localized.Arabic
            ? sanitizeGeneratedCacheRecipeImageFields(recipe.localized.Arabic)
            : recipe.localized.Arabic
        }
      : recipe.localized
  };
}

function sanitizeGeneratedCacheRecipeImageFields<
  T extends Pick<Recipe, "image_url" | "image_source" | "image_attribution_name" | "image_attribution_url">
>(recipe: T) {
  const imageUrl = isReplicateGeneratedRecipeImageUrl(recipe.image_url) ? recipe.image_url : undefined;
  return {
    ...recipe,
    image_url: imageUrl,
    image_source: imageUrl ? recipe.image_source : undefined,
    image_attribution_name: imageUrl ? recipe.image_attribution_name : undefined,
    image_attribution_url: imageUrl ? recipe.image_attribution_url : undefined
  };
}

async function hydrateUserRecipeCacheFromSavedAppData(uid: string) {
  const db = getAdminDb();
  const historySnapshot = await withTimeout(
    db.collection("users").doc(uid).collection("history").limit(40).get(),
    CACHE_READ_TIMEOUT_MS,
    "load history for cache hydration"
  );
  const planSnapshot = await withTimeout(
    db.collection("users").doc(uid).collection("plans").doc("currentWeekly").get(),
    CACHE_READ_TIMEOUT_MS,
    "load meal plan for cache hydration"
  );
  const healthSnapshot = await withTimeout(
    db.collection("users").doc(uid).collection("profile").doc("health").get(),
    CACHE_READ_TIMEOUT_MS,
    "load health profile for cache hydration"
  );

  const historyRecipes = historySnapshot.docs.flatMap((docSnap, entryIndex) => {
    const data = docSnap.data() as { recipes?: Recipe[] };
    return (data.recipes ?? []).map((recipe, recipeIndex) => ({
      fallbackId: `history-${entryIndex}-${recipeIndex}`,
      recipe
    }));
  });
  const planData = planSnapshot.exists ? (planSnapshot.data() as { mealPlan?: { plan?: Array<{ breakfast?: MealPlanMeal; lunch?: MealPlanMeal; dinner?: MealPlanMeal }> } }) : null;
  const planMeals = (planData?.mealPlan?.plan ?? []).flatMap((day, dayIndex) =>
    [day.breakfast, day.lunch, day.dinner]
      .filter((meal): meal is MealPlanMeal => Boolean(meal))
      .map((meal, mealIndex) => ({
        fallbackId: `plan-${dayIndex}-${mealIndex}`,
        meal
      }))
  );

  const recipeLanguage = inferStoredLanguage({
    meals: planMeals.map((entry) => entry.meal),
    recipes: historyRecipes.map((entry) => entry.recipe)
  });

  await persistGeneratedRecipeCache({
    uid,
    recipeLanguage,
    meals: planMeals.map((entry) => entry.meal),
    recipes: historyRecipes.map((entry) => entry.recipe),
    dietContext: readDietContextFromHealthProfile(healthSnapshot.data())
  });
}

function readDietContextFromHealthProfile(data: FirebaseFirestore.DocumentData | undefined): DietEnforcementContext {
  return {
    diets: Array.isArray(data?.diets) ? data.diets.filter((value): value is string => typeof value === "string") : [],
    allergens: Array.isArray(data?.allergens) ? data.allergens.filter((value): value is string => typeof value === "string") : []
  };
}

function inferMealType(title: string): MealType {
  const normalized = title.toLowerCase();
  if (/\bbreakfast|toast|omelet|omelette|scramble|oatmeal|yogurt\b/.test(normalized)) return "breakfast";
  if (/\bsnack|dip\b/.test(normalized)) return "snack";
  if (/\bsoup|salad|bowl\b/.test(normalized)) return "lunch";
  return "dinner";
}

function inferDifficulty(value: string): Difficulty {
  const normalized = coerceText(value).toLowerCase();
  if (normalized.includes("hard")) return "hard";
  if (normalized.includes("medium")) return "medium";
  return "easy";
}

function inferTotalMinutes(value: string | number | null | undefined) {
  const match = coerceText(value).match(/(\d+)/);
  const minutes = match ? Number.parseInt(match[1], 10) : 30;
  return Number.isFinite(minutes) ? minutes : 30;
}

function inferPrepMinutes(value: string) {
  return Math.max(5, Math.round(inferTotalMinutes(value) * 0.35));
}

function inferCookMinutes(value: string) {
  return Math.max(10, inferTotalMinutes(value) - inferPrepMinutes(value));
}

function inferCalorieBand(calories: number) {
  if (calories <= 300) return "0_300" as const;
  if (calories <= 500) return "301_500" as const;
  if (calories <= 700) return "501_700" as const;
  return "701_plus" as const;
}

function readMacroNumber(value: string | number | undefined, fallback?: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = coerceText(value);
  if (!normalized) return fallback;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildCacheId(title: string, ingredientCanonicals: string[], fallbackId: string) {
  const source = `${title}|${ingredientCanonicals.join("|")}|${fallbackId}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `cached-${hash.toString(36)}`;
}

function buildSharedCacheId(title: string, cuisine: string, ingredientCanonicals: string[], mealType: MealType) {
  const normalizedTitle = slugify(title) || "recipe";
  const normalizedCuisine = slugify(cuisine) || "unknown";
  const normalizedIngredients = [...ingredientCanonicals]
    .map((ingredient) => ingredient.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
  const source = `${normalizedTitle}|${normalizedCuisine}|${mealType}|${normalizedIngredients}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `shared-${hash.toString(36)}`;
}

function toSharedCacheDoc(recipe: RecipeCatalogDoc, provider = "shared-user-cache"): RecipeCatalogDoc {
  const sharedIdentityKey = provider === "premium-validated"
    ? buildSharedRecipeIdentityKey(recipe)
    : recipe.sharedIdentityKey;
  const sharedId = sharedIdentityKey
    ? buildSharedRecipeIdFromIdentity(sharedIdentityKey)
    : buildSharedCacheId(recipe.title, recipe.cuisine, recipe.ingredientCanonicals, recipe.mealType);
  const imageSignature = buildImageSignature(sharedId, recipe.cuisine, recipe.ingredientCanonicals);
  const durableImageUrl = sanitizeCacheRecipeImageUrl(recipe.image.thumbPath || recipe.image.storagePath);

  return normalizeCachedRecipeCatalogDoc({
    ...recipe,
    id: sharedId,
    sharedIdentityKey,
    ingredientLookupCanonicals: recipe.ingredientLookupCanonicals?.length
      ? recipe.ingredientLookupCanonicals
      : recipe.ingredientCanonicals,
    image: {
      ...recipe.image,
      storagePath: durableImageUrl ?? "",
      thumbPath: durableImageUrl,
      signature: imageSignature,
      sharedCacheKey: imageSignature,
      source: durableImageUrl ? recipe.image.source : undefined,
      attributionName: durableImageUrl ? recipe.image.attributionName : undefined,
      attributionUrl: durableImageUrl ? recipe.image.attributionUrl : undefined,
      dietTags: durableImageUrl ? recipe.image.dietTags ?? recipe.dietTags : [],
      status: durableImageUrl ? "ready" : "pending",
      validatedAt: durableImageUrl ? recipe.image.validatedAt : undefined,
      validatorHash: durableImageUrl ? recipe.image.validatorHash : undefined
    },
    localized: recipe.localized
      ? {
          ...recipe.localized,
          English: recipe.localized.English
            ? {
                ...sanitizeRecipeImageFields(recipe.localized.English, { preserveImages: true }),
                id: sharedId
              }
            : recipe.localized.English,
          Arabic: recipe.localized.Arabic
            ? {
                ...sanitizeRecipeImageFields(recipe.localized.Arabic, { preserveImages: true }),
                id: sharedId
              }
            : recipe.localized.Arabic
        }
      : recipe.localized,
    popularityScore: Math.max(recipe.popularityScore, 65),
    source: {
      provider,
      ...(recipe.source?.externalId ? { externalId: recipe.source.externalId } : {}),
      ...(recipe.source?.url ? { url: recipe.source.url } : {}),
      ...(recipe.source?.license ? { license: recipe.source.license } : {})
    },
    updatedAt: Date.now()
  });
}

function updateSharedRecipeSnapshots(
  published: RecipeCatalogDoc[],
  supersededIds: Set<string>,
  updatedAt: number
) {
  const merge = (recipes: RecipeCatalogDoc[]) => {
    const byId = new Map(
      recipes
        .filter((recipe) => !supersededIds.has(recipe.id))
        .map((recipe) => [recipe.id, recipe])
    );
    published.forEach((recipe) => byId.set(recipe.id, recipe));
    return Array.from(byId.values());
  };

  fullSharedRecipeCacheSnapshot = merge(fullSharedRecipeCacheSnapshot);
  sharedRecipeCacheSnapshot = merge(sharedRecipeCacheSnapshot).slice(0, MAX_SHARED_CACHE_DOCS);
  fullSharedRecipeCacheUpdatedAt = updatedAt;
  sharedRecipeCacheUpdatedAt = updatedAt;
}

function buildSharedCacheWriteDoc(recipe: RecipeCatalogDoc) {
  const writeDoc = { ...stripUndefinedDeep(recipe) } as Record<string, unknown>;
  const dietTags = mergeCacheTags(recipe.dietTags);
  const allergenTags = mergeCacheTags(recipe.allergenTags);
  writeDoc.dietTags = dietTags;
  writeDoc.allergenTags = allergenTags;

  return writeDoc;
}

function mergeCacheTags(...groups: Array<string[] | undefined>) {
  return Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function inferStoredLanguage(input: { meals?: MealPlanMeal[]; recipes?: Recipe[] }) {
  const sample = [
    ...(input.recipes ?? []).map((recipe) => `${recipe.name} ${recipe.steps.join(" ")}`),
    ...(input.meals ?? []).map((meal) => `${meal.name} ${(meal.steps ?? []).join(" ")}`)
  ]
    .join(" ")
    .slice(0, 2000);

  return /[\u0600-\u06FF]/.test(sample) ? "Arabic" : "English";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupeStrings(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim().toLowerCase() ?? "")
        .filter(Boolean)
    )
  ).slice(0, 24);
}

function inferRegionalCuisines(cuisine: string) {
  const normalized = cuisine.trim().toLowerCase();
  if (normalized === "egyptian") return ["egyptian", "middle eastern", "arab"];
  if (normalized === "middle eastern") return ["middle eastern", "arab"];
  if (normalized === "mediterranean") return ["mediterranean"];
  return normalized ? [normalized] : [];
}

function inferStyleTags(title: string, steps: string[]) {
  const normalizedTitle = title.toLowerCase();
  const tags = new Set<string>();
  if (steps.length <= 4) tags.add("simple");
  if (normalizedTitle.includes("bowl")) tags.add("bowl");
  if (normalizedTitle.includes("salad")) tags.add("salad");
  if (normalizedTitle.includes("soup") || normalizedTitle.includes("stew")) tags.add("comfort-food");
  return Array.from(tags);
}

function buildImageSignature(id: string, cuisine: string, ingredientCanonicals: string[]) {
  const source = [id, cuisine, ...ingredientCanonicals].join("|").toLowerCase();
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `recipe-photo-${hash.toString(36)}`;
}

function coerceText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function isUsableSharedCachedRecipe(recipe: RecipeCatalogDoc) {
  const englishName = recipe.localized?.English?.name ?? recipe.title;
  const arabicName = recipe.localized?.Arabic?.name ?? "";
  if (englishName.includes("مكون إضافي") || arabicName.includes("مكون إضافي")) {
    return false;
  }

  const hasUsableIdentity = !isWeakSharedCacheTitle(englishName) || Boolean(pickSpecificCacheIdentityFromDoc(recipe));
  return hasUsableIdentity && isSharedRecipeDiscoverable(recipe, SHARED_RECIPE_QUALITY_MODE);
}

function pickSpecificCacheIdentity(
  recipe: Recipe,
  variants: ReturnType<typeof createRecipeVariants>
) {
  return [
    variants.English.dish_intent?.dish_name,
    variants.Arabic.dish_intent?.dish_name,
    variants.English.image_search_index,
    ...(variants.English.image_search_indices ?? []),
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    variants.English.name,
    recipe.name
  ].find((value) => typeof value === "string" && isSpecificCacheIdentity(value));
}

function pickSpecificCacheIdentityFromDoc(recipe: RecipeCatalogDoc) {
  return [
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.dishIntent?.dish_name,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    recipe.image.sourceQuery,
    recipe.title
  ].find((value) => typeof value === "string" && isSpecificCacheIdentity(value));
}

function isWeakSharedCacheTitle(value: string) {
  const normalized = value.toLowerCase();
  return (
    /\bany\b/.test(normalized) ||
    /\bdinner plate\b/.test(normalized) ||
    /\blunch bowl\b/.test(normalized) ||
    /\bbreakfast bowl\b/.test(normalized) ||
    /\bsnack plate\b/.test(normalized) ||
    hasRepeatedContentToken(normalized) ||
    value.includes("مكون إضافي")
  );
}

function isSpecificCacheIdentity(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !/[a-z]/i.test(normalized) || /[\u0600-\u06FF]/.test(normalized)) return false;
  if (normalized.length < 4) return false;
  if (/\b(any|unknown|global|generic|food|meal|recipe)\b/.test(normalized)) return false;
  if (/\b(assembled|prepared|plated)\b/.test(normalized)) return false;
  if (/\b(dinner plate|lunch bowl|breakfast bowl|snack plate)\b/.test(normalized)) return false;
  if (hasRepeatedContentToken(normalized)) return false;
  return true;
}

function hasRepeatedContentToken(value: string) {
  const tokens = value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4 && !["with", "style"].includes(token));
  const seen = new Set<string>();

  for (const token of tokens) {
    if (seen.has(token)) return true;
    seen.add(token);
  }

  return false;
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }

  return value;
}

async function writeDocsInBatches<T>(
  items: T[],
  chunkSize: number,
  writeItem: (batch: FirebaseFirestore.WriteBatch, item: T) => Promise<void> | void
) {
  const db = getAdminDb();

  for (let index = 0; index < items.length; index += chunkSize) {
    const batch = db.batch();
    const chunk = items.slice(index, index + chunkSize);
    for (const item of chunk) {
      await writeItem(batch, item);
    }
    await batch.commit();
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }) as Promise<T>;
}

function hasFreshSharedRecipeSnapshot() {
  return sharedRecipeCacheSnapshot.length > 0 && Date.now() - sharedRecipeCacheUpdatedAt <= SHARED_CACHE_STALE_TTL_MS;
}

function hasFreshFullSharedRecipeSnapshot() {
  return (
    fullSharedRecipeCacheSnapshot.length > 0 &&
    Date.now() - fullSharedRecipeCacheUpdatedAt <= FULL_SHARED_CACHE_STALE_TTL_MS
  );
}

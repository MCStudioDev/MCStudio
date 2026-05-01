import type { Difficulty, MealType, RecipeCatalogDoc } from "@/lib/domain";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  isArabicRecipeLanguage,
  localizeMealForEnglish,
  translateIngredientToEnglish
} from "@/lib/arabicRecipeLocalization";
import {
  buildRecipeHealthMetadata,
  buildRecipeSearchMetadata,
  enrichOfflineRecipe,
  ensureCompleteLocalizedRecipe
} from "@/data/offline/recipeMetadata";
import type { MealPlanMeal, Recipe } from "@/lib/types";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import { logger } from "@/lib/logger";

type CacheRecipeLanguage = "English" | "Arabic";

const USER_CACHE_COLLECTION = "offlineRecipeCache";
const SHARED_CACHE_COLLECTION = "sharedOfflineRecipeCache";
const MAX_USER_CACHE_DOCS = 120;
const MAX_SHARED_CACHE_DOCS = 240;
const CACHE_READ_TIMEOUT_MS = 2500;

export async function listUserCachedRecipes(uid?: string | null): Promise<RecipeCatalogDoc[]> {
  if (!uid) return [];

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
      .map((docSnap) => enrichOfflineRecipe(docSnap.data() as RecipeCatalogDoc))
      .filter((recipe) => recipe?.isActive);
  } catch (error) {
    logger.warn("Loading user cached recipes failed", {
      uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

export async function listSharedCachedRecipes(): Promise<RecipeCatalogDoc[]> {
  try {
    const db = getAdminDb();
    const cacheQuery = db
      .collection(SHARED_CACHE_COLLECTION)
      .orderBy("updatedAt", "desc")
      .limit(MAX_SHARED_CACHE_DOCS);
    const snapshot = await withTimeout(cacheQuery.get(), CACHE_READ_TIMEOUT_MS, "load shared cached recipes");

    return snapshot.docs
      .map((docSnap) => enrichOfflineRecipe(docSnap.data() as RecipeCatalogDoc))
      .filter((recipe) => recipe?.isActive);
  } catch (error) {
    logger.warn("Loading shared cached recipes failed", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

export async function persistGeneratedRecipeCache(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  meals?: MealPlanMeal[];
  uid?: string | null;
}) {
  if (!input.uid) return;

  const cacheDocs = await buildCacheDocs(input);
  if (!cacheDocs.length) return;

  const db = getAdminDb();
  const userCacheCollection = db.collection("users").doc(input.uid).collection(USER_CACHE_COLLECTION);

  await writeDocsInBatches(
    cacheDocs,
    75,
    async (batch, recipe) => {
      batch.set(userCacheCollection.doc(recipe.id), stripUndefinedDeep(recipe));
      const sharedRecipe = toSharedCacheDoc(recipe);
      batch.set(db.collection(SHARED_CACHE_COLLECTION).doc(sharedRecipe.id), stripUndefinedDeep(sharedRecipe), { merge: true });
    }
  );
}

export async function persistSharedRecipeCache(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  meals?: MealPlanMeal[];
  sourceProvider?: string;
}) {
  const cacheDocs = await buildCacheDocs(input);
  if (!cacheDocs.length) return;

  const db = getAdminDb();
  await writeDocsInBatches(
    cacheDocs,
    50,
    async (batch, recipe) => {
      const sharedRecipe = toSharedCacheDoc(recipe, input.sourceProvider);
      batch.set(db.collection(SHARED_CACHE_COLLECTION).doc(sharedRecipe.id), stripUndefinedDeep(sharedRecipe), { merge: true });
    }
  );
}

function createRecipeVariants(recipe: Recipe, sourceLanguage: CacheRecipeLanguage) {
  return ensureCompleteLocalizedRecipe(recipe, sourceLanguage);
}

async function buildCacheDocs(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  meals?: MealPlanMeal[];
}) {
  const sourceLanguage: CacheRecipeLanguage = isArabicRecipeLanguage(input.recipeLanguage) ? "Arabic" : "English";
  return (
    await Promise.all([
      ...(input.recipes ?? []).map((recipe, index) => buildCacheDocFromRecipe(recipe, sourceLanguage, `recipe-${index}`)),
      ...(input.meals ?? []).map((meal, index) => buildCacheDocFromMeal(meal, sourceLanguage, `meal-${index}`))
    ])
  ).filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe));
}

function createMealRecipe(meal: MealPlanMeal, fallbackId: string): Recipe {
  return {
    id: fallbackId,
    name: meal.name,
    cuisine: "Unknown",
    image_search_index: meal.image_search_index,
    image_search_indices: meal.image_search_indices,
    ingredients: meal.ingredients ?? [],
    missing_ingredients: [],
    steps: meal.steps ?? [],
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    cook_time: "30 mins",
    difficulty: "Easy",
    image_url: meal.image_url,
    image_source: meal.image_source,
    image_attribution_name: meal.image_attribution_name,
    image_attribution_url: meal.image_attribution_url
  };
}

async function buildCacheDocFromMeal(meal: MealPlanMeal, sourceLanguage: CacheRecipeLanguage, fallbackId: string) {
  const sourceMeal = sourceLanguage === "Arabic" ? localizeMealForEnglish(meal) : meal;
  const recipe = createMealRecipe(sourceMeal, fallbackId);
  return buildCacheDocFromRecipe(recipe, sourceLanguage, fallbackId);
}

async function buildCacheDocFromRecipe(
  recipe: Recipe,
  sourceLanguage: CacheRecipeLanguage,
  fallbackId: string
): Promise<RecipeCatalogDoc | null> {
  const variants = createRecipeVariants(recipe, sourceLanguage);
  const englishIngredients = [...variants.English.ingredients, ...variants.English.missing_ingredients]
    .map((ingredient) => translateIngredientToEnglish(ingredient))
    .filter(Boolean);
  const normalized = await normalizeIngredients(englishIngredients);
  const ingredientCanonicals = normalized.normalized.filter(Boolean);
  if (!ingredientCanonicals.length) {
    return null;
  }

  const requiredCanonicals = ingredientCanonicals.slice(0, Math.min(3, ingredientCanonicals.length));
  const optionalCanonicals = ingredientCanonicals.slice(requiredCanonicals.length);
  const timestamp = Date.now();
  const englishTitle = variants.English.name || recipe.name || fallbackId;
  const id = buildCacheId(englishTitle, ingredientCanonicals, fallbackId);
  const imageSignature = buildImageSignature(id, variants.English.cuisine || "Unknown", ingredientCanonicals);

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
    cuisine: variants.English.cuisine || "Unknown",
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
      storagePath: variants.English.image_url ?? "",
      thumbPath: variants.English.image_url,
      signature: imageSignature,
      sharedCacheKey: imageSignature,
      sourceQuery: dedupeStrings([variants.English.cuisine, englishTitle, ...ingredientCanonicals.slice(0, 3)]).join(" ")
    },
    localized: {
      English: {
        ...variants.English,
        id
      },
      Arabic: {
        ...variants.Arabic,
        id
      }
    },
    regionalCuisines: inferRegionalCuisines(variants.English.cuisine || "Unknown"),
    styleTags: inferStyleTags(englishTitle, variants.English.steps),
    searchTokens: dedupeStrings([
      englishTitle,
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

  return enrichOfflineRecipe({
    ...baseRecipe,
    healthMetadata: buildRecipeHealthMetadata(baseRecipe),
    searchMetadata: buildRecipeSearchMetadata(baseRecipe)
  });
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
    recipes: historyRecipes.map((entry) => entry.recipe)
  });
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
  const sharedId = buildSharedCacheId(recipe.title, recipe.cuisine, recipe.ingredientCanonicals, recipe.mealType);
  const imageSignature = buildImageSignature(sharedId, recipe.cuisine, recipe.ingredientCanonicals);

  return enrichOfflineRecipe({
    ...recipe,
    id: sharedId,
    image: {
      ...recipe.image,
      signature: imageSignature,
      sharedCacheKey: imageSignature
    },
    localized: recipe.localized
      ? {
          ...recipe.localized,
          English: recipe.localized.English
            ? {
                ...recipe.localized.English,
                id: sharedId
              }
            : recipe.localized.English,
          Arabic: recipe.localized.Arabic
            ? {
                ...recipe.localized.Arabic,
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

import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { RecipeReferencePromptRecipe } from "@/lib/recipeReferenceTypes";
import type { Recipe } from "@/lib/types";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";

const CACHE_COLLECTION = "recipeEditorSemanticCache";
const CACHE_VERSION = "recipe-editor-v3";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type CacheOrigin = "firestore" | "memory" | "inflight" | "generated";

export interface RecipeEditorCacheInput {
  sourceRecipe: RecipeReferencePromptRecipe;
  recipeLanguage: string;
  preferredCuisine: string;
  availableIngredients: Array<{ name: string; quantity?: string }>;
  diets: string[];
  conditions: string[];
  allergens: string[];
  excludedIngredients: string[];
}

export interface RecipeEditorCacheResult {
  cacheKey: string;
  origin: CacheOrigin;
  recipe: Recipe;
}

type MemoryEntry = {
  expiresAt: number;
  recipe: Recipe;
};

const memory = new Map<string, MemoryEntry>();
const inFlight = new Map<string, Promise<Recipe>>();

export function buildRecipeEditorCacheKey(input: RecipeEditorCacheInput) {
  const sourceFingerprint = sha256(JSON.stringify({
    title: input.sourceRecipe.title,
    cuisine: input.sourceRecipe.cuisine,
    ingredients: input.sourceRecipe.ingredients,
    steps: input.sourceRecipe.steps
  }));
  const semanticRequest = {
    version: CACHE_VERSION,
    recipeId: input.sourceRecipe.id,
    sourceFingerprint,
    language: normalizeValue(input.recipeLanguage),
    preferredCuisine: normalizeValue(input.preferredCuisine),
    availableIngredients: input.availableIngredients
      .map((ingredient) => ({ name: normalizeValue(ingredient.name), quantity: normalizeValue(ingredient.quantity ?? "") }))
      .sort((left, right) => `${left.name}:${left.quantity}`.localeCompare(`${right.name}:${right.quantity}`)),
    diets: normalizeList(input.diets),
    conditions: normalizeList(input.conditions),
    allergens: normalizeList(input.allergens),
    excludedIngredients: normalizeList(input.excludedIngredients)
  };

  return sha256(JSON.stringify(semanticRequest));
}

export async function getOrCreateRecipeEditorCache(
  input: RecipeEditorCacheInput,
  generate: () => Promise<Recipe>,
  isUsable?: (recipe: Recipe) => boolean
): Promise<RecipeEditorCacheResult> {
  const cacheKey = buildRecipeEditorCacheKey(input);
  const memoryRecipe = readMemory(cacheKey);
  if (memoryRecipe && (!isUsable || isUsable(memoryRecipe))) {
    return { cacheKey, origin: "memory", recipe: memoryRecipe };
  }
  if (memoryRecipe) memory.delete(cacheKey);

  const firestoreRecipe = await readFirestore(cacheKey);
  if (firestoreRecipe && (!isUsable || isUsable(firestoreRecipe))) {
    writeMemory(cacheKey, firestoreRecipe);
    return { cacheKey, origin: "firestore", recipe: firestoreRecipe };
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    return { cacheKey, origin: "inflight", recipe: await existing };
  }

  const pending = generate()
    .then(async (recipe) => {
      writeMemory(cacheKey, recipe);
      await writeFirestore(cacheKey, recipe);
      return recipe;
    })
    .finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, pending);

  return { cacheKey, origin: "generated", recipe: await pending };
}

function normalizeValue(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function normalizeList(values: string[]) {
  return Array.from(new Set(values.map(normalizeValue).filter(Boolean))).sort();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function readMemory(cacheKey: string) {
  const entry = memory.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(cacheKey);
    return null;
  }
  return entry.recipe;
}

function writeMemory(cacheKey: string, recipe: Recipe) {
  memory.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, recipe });
}

async function readFirestore(cacheKey: string): Promise<Recipe | null> {
  try {
    const snapshot = await getAdminDb().collection(CACHE_COLLECTION).doc(cacheKey).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as { expiresAt?: Timestamp; recipe?: Recipe } | undefined;
    if (!data?.recipe || !isFresh(data.expiresAt)) return null;
    return data.recipe;
  } catch (error) {
    logger.warn("Recipe editor semantic cache read failed", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function writeFirestore(cacheKey: string, recipe: Recipe) {
  try {
    await getAdminDb().collection(CACHE_COLLECTION).doc(cacheKey).set({
      cacheVersion: CACHE_VERSION,
      recipe: JSON.parse(JSON.stringify(recipe)),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS)
    });
  } catch (error) {
    logger.warn("Recipe editor semantic cache write failed", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}

function isFresh(expiresAt?: Timestamp) {
  return Boolean(expiresAt && expiresAt.toMillis() > Date.now());
}

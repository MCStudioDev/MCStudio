import { createHash } from "node:crypto";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import { rebuildIngredientLookupCanonicals } from "@/lib/ingredientFamilies";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import { RECIPE_PHOTO_ASSET_VALIDATOR_HASH } from "@/services/recipePhotoReusePolicy";
import { isSharedRecipePublishable } from "@/services/sharedRecipePoolQualityService";

export const SHARED_RECIPE_V2_COLLECTION = "sharedRecipesV2";
export const SHARED_RECIPE_V2_POOL_VERSION = 2 as const;

export type SharedRecipeV2PublicationStatus = "pending_photo" | "published" | "superseded";

export type SharedRecipeV2Document = RecipeCatalogDoc & {
  contentHash: string;
  poolVersion: typeof SHARED_RECIPE_V2_POOL_VERSION;
  publicationStatus: SharedRecipeV2PublicationStatus;
  version: number;
  visualFingerprint: string;
};

export interface SharedRecipeV2FulfillmentPlan<T> {
  existing: T[];
  generationDeficit: number;
  unfilledCount: number;
}

export interface SharedRecipeV2CuisineFulfillmentPlan<T> extends SharedRecipeV2FulfillmentPlan<T> {
  alternativeCuisineMatches: T[];
  preferredCuisineMatches: T[];
}

export function planSharedRecipeV2CuisineFulfillment<T extends { cuisine?: string }>(input: {
  canGenerateDeficit: boolean;
  matches: T[];
  preferredCuisine?: string;
  requestedCount: number;
}): SharedRecipeV2CuisineFulfillmentPlan<T> {
  const hasExplicitCuisine = Boolean(input.preferredCuisine && input.preferredCuisine !== "Any");
  const preferredCuisineMatches = hasExplicitCuisine
    ? input.matches.filter((recipe) =>
        cuisineMatchesPreference(recipe.cuisine ?? "", input.preferredCuisine ?? "Any")
      )
    : input.matches;
  const alternativeCuisineMatches = hasExplicitCuisine
    ? input.matches.filter((recipe) =>
        !cuisineMatchesPreference(recipe.cuisine ?? "", input.preferredCuisine ?? "Any")
      )
    : [];
  const planningMatches = input.canGenerateDeficit
    ? preferredCuisineMatches
    : [...preferredCuisineMatches, ...alternativeCuisineMatches];

  return {
    ...planSharedRecipeV2Fulfillment({
      canGenerateDeficit: input.canGenerateDeficit,
      matches: planningMatches,
      requestedCount: input.requestedCount
    }),
    alternativeCuisineMatches,
    preferredCuisineMatches
  };
}

export function planSharedRecipeV2Fulfillment<T>(input: {
  canGenerateDeficit: boolean;
  matches: T[];
  requestedCount: number;
}): SharedRecipeV2FulfillmentPlan<T> {
  const requestedCount = Math.max(0, Math.floor(input.requestedCount));
  const existing = input.matches.slice(0, requestedCount);
  const unfilledCount = Math.max(0, requestedCount - existing.length);
  return {
    existing,
    generationDeficit: input.canGenerateDeficit ? unfilledCount : 0,
    unfilledCount
  };
}

export function mergeSharedRecipeV2Results<
  T extends { id?: string; name?: string; source_recipe_id?: string }
>(existing: T[], generated: T[], requestedCount: number): T[] {
  const merged: T[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  for (const recipe of [...existing, ...generated]) {
    const ids = [recipe.source_recipe_id, recipe.id]
      .map(normalizeIdentity)
      .filter(Boolean);
    const title = normalizeTitle(recipe.name);
    if (ids.some((id) => seenIds.has(id)) || (title && seenTitles.has(title))) continue;

    merged.push(recipe);
    ids.forEach((id) => seenIds.add(id));
    if (title) seenTitles.add(title);
  }

  return merged.slice(0, Math.max(0, Math.floor(requestedCount)));
}

export function buildSharedRecipeV2Document(
  source: RecipeCatalogDoc,
  previous?: Partial<SharedRecipeV2Document>
): SharedRecipeV2Document {
  const normalizedSource: RecipeCatalogDoc = {
    ...source,
    ingredientLookupCanonicals: rebuildIngredientLookupCanonicals(
      source.ingredientCanonicals,
      source.ingredientLookupCanonicals
    )
  };
  const contentHash = buildSharedRecipeV2ContentHash(normalizedSource);
  const previousHash = previous?.contentHash ?? (previous ? buildSharedRecipeV2ContentHash(previous as RecipeCatalogDoc) : undefined);
  const previousVersion = Number.isFinite(previous?.version) ? Math.max(1, Number(previous?.version)) : 1;
  const version = previous && previousHash !== contentHash ? previousVersion + 1 : previousVersion;
  const publicationStatus: SharedRecipeV2PublicationStatus = hasCurrentReadyPhoto(normalizedSource)
    ? "published"
    : "pending_photo";

  return {
    ...normalizedSource,
    contentHash,
    poolVersion: SHARED_RECIPE_V2_POOL_VERSION,
    publicationStatus,
    version,
    visualFingerprint: buildSharedRecipeV2VisualFingerprint(normalizedSource)
  };
}

export function isSharedRecipeV2Searchable(
  recipe: RecipeCatalogDoc | SharedRecipeV2Document
): recipe is SharedRecipeV2Document {
  const candidate = recipe as Partial<SharedRecipeV2Document>;
  return candidate.poolVersion === SHARED_RECIPE_V2_POOL_VERSION &&
    candidate.publicationStatus === "published" &&
    isSharedRecipePublishable(recipe) &&
    hasCurrentReadyPhoto(recipe);
}

export function buildSharedRecipeV2ContentHash(recipe: RecipeCatalogDoc) {
  return sha256(stableStringify({
    allergenTags: recipe.allergenTags,
    calories: recipe.calories,
    carbs: recipe.carbs,
    cookMinutes: recipe.cookMinutes,
    cuisine: recipe.cuisine,
    description: recipe.description,
    dietTags: recipe.dietTags,
    difficulty: recipe.difficulty,
    fat: recipe.fat,
    fiber: recipe.fiber,
    ingredientCanonicals: recipe.ingredientCanonicals,
    ingredients: recipe.ingredients,
    mealType: recipe.mealType,
    optionalCanonicals: recipe.optionalCanonicals,
    prepMinutes: recipe.prepMinutes,
    protein: recipe.protein,
    requiredCanonicals: recipe.requiredCanonicals,
    servings: recipe.servings,
    sodium: recipe.sodium,
    steps: recipe.steps,
    sugar: recipe.sugar,
    title: recipe.title,
    totalMinutes: recipe.totalMinutes
  }));
}

export function buildSharedRecipeV2VisualFingerprint(recipe: RecipeCatalogDoc) {
  return sha256(stableStringify({
    cuisine: normalizeTitle(recipe.cuisine),
    diets: [...recipe.dietTags].map(normalizeTitle).sort(),
    dish: normalizeTitle(recipe.dishIntent?.dish_name || recipe.title),
    ingredients: [...recipe.requiredCanonicals].map(normalizeTitle).sort(),
    method: normalizeTitle(recipe.dishIntent?.cooking_method)
  }));
}

function hasCurrentReadyPhoto(recipe: RecipeCatalogDoc) {
  const imageUrl = recipe.image.thumbPath || recipe.image.storagePath;
  return recipe.image.status === "ready" &&
    recipe.image.source === "replicate" &&
    recipe.image.validatorHash === RECIPE_PHOTO_ASSET_VALIDATOR_HASH &&
    isDurableRecipeImageUrl(imageUrl) &&
    isStoredRecipePhotoUrl(imageUrl);
}

function isStoredRecipePhotoUrl(imageUrl: string) {
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    return host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com";
  } catch {
    return false;
  }
}

function normalizeTitle(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentity(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

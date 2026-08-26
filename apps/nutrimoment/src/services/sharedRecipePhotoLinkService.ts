import type { RecipeCatalogDoc } from "@/lib/domain";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import { buildRecipePhotoIdentity, normalizeRecipePhotoQuery } from "@/lib/recipePhotoIdentity";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import { isReusableSharedRecipePhotoEntry, type SharedRecipePhotoEntry } from "@/lib/sharedRecipePhotoCache";
import type { Recipe, RecipeImageSource } from "@/lib/types";
import {
  isGeneratedRecipePhotoCachePayloadConsistent,
  isGeneratedRecipePhotoUrlCompatibleWithQueries
} from "@/services/recipePhotoCacheCompatibility";
import { normalizeRecipePhotoDietIds } from "@/services/recipePhotoDietCompatibility";
import { attachValidatedRecipePhotoAsset } from "@/services/recipePhotoReusePolicy";
import { mapCatalogRecipeToUiRecipe } from "@/services/recipeSearchService";
import { isSharedRecipePublishable } from "@/services/sharedRecipePoolQualityService";
import {
  buildSharedRecipeV2Document,
  SHARED_RECIPE_V2_COLLECTION,
  type SharedRecipeV2Document
} from "@/services/sharedRecipeV2PolicyService";

const SHARED_RECIPE_COLLECTION = SHARED_RECIPE_V2_COLLECTION;

export interface SharedRecipePhotoLinkInput {
  attributionName?: string;
  attributionUrl?: string;
  cuisine?: string;
  diets: string[];
  exactNames: string[];
  imageUrl: string;
  query: string;
  signature: string;
  sourceRecipeId?: string;
}

export interface ResolveSharedRecipePhotoInput {
  diets: string[];
  excludeImageUrls?: string[];
  sourceRecipeId: string;
}

export async function resolveAndLinkSharedRecipePhotoById(
  input: ResolveSharedRecipePhotoInput
): Promise<SharedRecipePhotoEntry | null> {
  if (!isValidSharedRecipeId(input.sourceRecipeId)) return null;

  const db = getAdminDb();
  const document = await db.collection(SHARED_RECIPE_COLLECTION).doc(input.sourceRecipeId).get();
  if (!document.exists) return null;

  const recipe = { ...document.data(), id: document.id } as RecipeCatalogDoc;
  if (!isSharedRecipePublishable(recipe)) return null;

  const diets = normalizeRecipePhotoDietIds([...recipe.dietTags, ...input.diets]);
  const excluded = new Set((input.excludeImageUrls ?? []).filter(Boolean));
  const uiRecipe = mapCatalogRecipeToUiRecipe(recipe, [], "good", 0, 0, [], "English");
  const existing = buildSharedRecipePhotoEntryFromRecipe(recipe);
  if (existing && !excluded.has(existing.imageUrl) && validateSharedRecipePhotoCandidate(uiRecipe, existing, diets)) {
    return existing;
  }
  return null;
}

export async function linkGeneratedPhotoToSharedRecipes(input: SharedRecipePhotoLinkInput) {
  if (!isDurableRecipeImageUrl(input.imageUrl)) return { linked: 0 };
  const exactNames = dedupeStrings(input.exactNames).slice(0, 10);
  if (!exactNames.length) return { linked: 0 };
  const searchTokens = buildSharedRecipePhotoLinkSearchTokens(exactNames);

  const db = getAdminDb();
  const collection = db.collection(SHARED_RECIPE_COLLECTION);
  const candidates = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  if (input.sourceRecipeId && isValidSharedRecipeId(input.sourceRecipeId)) {
    const sourceDocument = await collection.doc(input.sourceRecipeId).get();
    if (sourceDocument.exists) candidates.set(sourceDocument.id, sourceDocument);
  } else {
    const [tokenSnapshot, ...titleSnapshots] = await Promise.all([
      collection.where("searchTokens", "array-contains-any", searchTokens).limit(30).get(),
      ...exactNames.slice(0, 4).map((name) => collection.where("title", "==", name).limit(10).get())
    ]);
    [tokenSnapshot, ...titleSnapshots].forEach((snapshot) => {
      snapshot.docs.forEach((document) => candidates.set(document.id, document));
    });
  }

  const photoCandidate: SharedRecipePhotoEntry = {
    dietTags: normalizeTags(input.diets),
    imageAttributionName: input.attributionName,
    imageAttributionUrl: input.attributionUrl,
    imageUrl: input.imageUrl,
    query: input.query,
    signature: input.signature,
    source: "generated"
  };
  const matches = Array.from(candidates.values()).flatMap((document) => {
    const recipe = { ...document.data(), id: document.id } as RecipeCatalogDoc;
    if (!canLinkGeneratedPhotoToSharedRecipe(recipe, input)) return [];
    const uiRecipe = mapCatalogRecipeToUiRecipe(recipe, [], "good", 0, 0, [], "English");
    const linked = validateSharedRecipePhotoCandidate(uiRecipe, photoCandidate, input.diets);
    return linked ? [{ document, linked, recipe }] : [];
  });
  if (!matches.length) return { linked: 0 };

  const batch = db.batch();
  matches.forEach(({ document, linked, recipe }) => {
    batch.set(
      document.ref,
      buildLinkedSharedRecipePhotoUpdate(recipe, linked, photoCandidate),
      { merge: true }
    );
  });
  await batch.commit();
  logger.info("Generated recipe photo linked to shared recipe pool", {
    linkedCount: matches.length,
    query: input.query,
    signature: input.signature
  });
  return { linked: matches.length };
}

export function buildSharedRecipePhotoLinkSearchTokens(exactNames: string[]) {
  return dedupeStrings(exactNames.flatMap((name) => {
    const normalized = normalize(name);
    const normalizedPhotoName = normalizeRecipePhotoQuery(name);
    const canonicalDishName = buildRecipePhotoIdentity(name).canonicalDishKey?.replace(/-/g, " ");
    return [
      name,
      normalized,
      normalized.replace(/-/g, " ").replace(/\s+/g, " ").trim(),
      normalizedPhotoName,
      canonicalDishName
    ];
  })).slice(0, 30);
}

export function canLinkGeneratedPhotoToSharedRecipe(
  recipe: RecipeCatalogDoc,
  input: SharedRecipePhotoLinkInput
) {
  if (!isSharedRecipePublishable(recipe)) return false;
  if (input.sourceRecipeId && input.sourceRecipeId !== recipe.id) return false;
  if (input.cuisine && normalize(input.cuisine) !== normalize(recipe.cuisine)) return false;
  const requestedDiets = normalizeTags(input.diets);
  const recipeDiets = new Set(normalizeTags(recipe.dietTags));
  if (requestedDiets.some((diet) => !recipeDiets.has(diet))) return false;

  const recipeNames = [
    recipe.title,
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name,
    recipe.dishIntent?.dish_name
  ].filter((value): value is string => Boolean(value?.trim()));
  const identityMatches = recipeNames.some((name) =>
    input.exactNames.some((exactName) => normalize(exactName) === normalize(name))
  );
  if (!identityMatches) return false;

  return isGeneratedRecipePhotoUrlCompatibleWithQueries(input.imageUrl, recipeNames) &&
    recipeNames.some((name) => isGeneratedRecipePhotoCachePayloadConsistent({
      imageUrl: input.imageUrl,
      query: name,
      signature: input.signature
    }));
}

export function validateSharedRecipePhotoCandidate(
  recipe: Recipe,
  candidate: SharedRecipePhotoEntry | null,
  diets: string[]
) {
  if (!candidate || !isReusableSharedRecipePhotoEntry(candidate)) return null;
  const linked = attachValidatedRecipePhotoAsset({
    ...recipe,
    image_attribution_name: candidate.imageAttributionName,
    image_attribution_url: candidate.imageAttributionUrl,
    image_source: mapPhotoSource(candidate.source),
    image_url: candidate.imageUrl
  }, diets);
  return linked.photo_asset?.status === "ready" && linked.photo_asset.url ? linked : null;
}

export function buildLinkedSharedRecipePhotoUpdate(
  recipe: RecipeCatalogDoc,
  linked: Recipe,
  candidate: SharedRecipePhotoEntry
) {
  const asset = linked.photo_asset;
  if (!asset?.url || asset.status !== "ready") {
    throw new Error("Cannot link a shared recipe without a validated photo asset.");
  }
  const localized = Object.fromEntries(
    Object.entries(recipe.localized ?? {}).map(([language, variant]) => [
      language,
      variant ? {
        ...variant,
        image_attribution_name: asset.attributionName,
        image_attribution_url: asset.attributionUrl,
        image_source: asset.source,
        image_url: asset.url,
        photo_asset: asset
      } : variant
    ])
  );

  const image = {
      ...recipe.image,
      attributionName: asset.attributionName,
      attributionUrl: asset.attributionUrl,
      dietTags: asset.dietTags,
      sharedCacheKey: candidate.signature,
      signature: candidate.signature,
      source: asset.source,
      sourceQuery: candidate.query,
      status: "ready" as const,
      storagePath: asset.url,
      thumbPath: asset.url,
      validatedAt: asset.validatedAt,
      validatorHash: asset.validatorHash
    };
  const updatedAt = Date.now();
  const v2Document = buildSharedRecipeV2Document({
    ...recipe,
    image,
    localized,
    updatedAt
  }, recipe as SharedRecipeV2Document);

  return stripUndefinedDeep({
    contentHash: v2Document.contentHash,
    image,
    localized,
    poolVersion: v2Document.poolVersion,
    publicationStatus: v2Document.publicationStatus,
    updatedAt,
    version: v2Document.version,
    visualFingerprint: v2Document.visualFingerprint
  });
}

function buildSharedRecipePhotoEntryFromRecipe(recipe: RecipeCatalogDoc): SharedRecipePhotoEntry | null {
  const imageUrl = recipe.image.thumbPath || recipe.image.storagePath;
  const source = mapStoredPhotoSource(recipe.image.source);
  if (recipe.image.status !== "ready" || !imageUrl || !source || !isDurableRecipeImageUrl(imageUrl)) return null;
  const entry: SharedRecipePhotoEntry = {
    canonicalDishKey: buildRecipePhotoIdentity(recipe.title).canonicalDishKey,
    dietTags: recipe.image.dietTags ?? recipe.dietTags,
    imageAttributionName: recipe.image.attributionName,
    imageAttributionUrl: recipe.image.attributionUrl,
    imageUrl,
    query: recipe.image.sourceQuery ?? recipe.title,
    signature: recipe.image.signature ?? recipe.image.sharedCacheKey ?? buildRecipePhotoIdentity(recipe.title).signature,
    source
  };
  return isReusableSharedRecipePhotoEntry(entry) ? entry : null;
}

function mapPhotoSource(source: SharedRecipePhotoEntry["source"]): RecipeImageSource {
  if (source === "generated") return "replicate";
  if (source === "pexels_search") return "pexels";
  if (source === "unsplash_search") return "unsplash";
  if (source === "wikimedia") return "wikimedia";
  return "search";
}

function mapStoredPhotoSource(source: RecipeImageSource | undefined): SharedRecipePhotoEntry["source"] | null {
  if (source === "replicate" || source === "api" || source === "cache") return "generated";
  if (source === "wikimedia") return "wikimedia";
  if (source === "pexels") return "pexels_search";
  if (source === "unsplash") return "unsplash_search";
  if (source === "search") return "google_search";
  return null;
}

function isValidSharedRecipeId(value: string) {
  const normalized = value.trim();
  return normalized.startsWith("shared-") && normalized.length <= 500 && !normalized.includes("/");
}

function normalizeTags(values: string[]) {
  return dedupeStrings(values.map(normalize)).sort();
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)).filter((entry) => entry !== undefined) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }
  return value;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

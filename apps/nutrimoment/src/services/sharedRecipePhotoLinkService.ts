import type { RecipeCatalogDoc } from "@/lib/domain";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import { buildRecipePhotoIdentity, normalizeRecipePhotoQuery } from "@/lib/recipePhotoIdentity";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import {
  isGeneratedRecipePhotoCachePayloadConsistent,
  isGeneratedRecipePhotoUrlCompatibleWithQueries
} from "@/services/recipePhotoCacheCompatibility";
import { RECIPE_PHOTO_ASSET_VALIDATOR_HASH } from "@/services/recipePhotoReusePolicy";
import { isSharedRecipePublishable } from "@/services/sharedRecipePoolQualityService";

const SHARED_RECIPE_COLLECTION = "sharedOfflineRecipeCache";

export interface SharedRecipePhotoLinkInput {
  attributionName?: string;
  attributionUrl?: string;
  cuisine?: string;
  diets: string[];
  exactNames: string[];
  imageUrl: string;
  query: string;
  signature: string;
}

export async function linkGeneratedPhotoToSharedRecipes(input: SharedRecipePhotoLinkInput) {
  if (!isDurableRecipeImageUrl(input.imageUrl)) return { linked: 0 };
  const exactNames = dedupeStrings(input.exactNames).slice(0, 10);
  if (!exactNames.length) return { linked: 0 };
  const searchTokens = buildSharedRecipePhotoLinkSearchTokens(exactNames);

  const db = getAdminDb();
  const collection = db.collection(SHARED_RECIPE_COLLECTION);
  const [tokenSnapshot, ...titleSnapshots] = await Promise.all([
    collection.where("searchTokens", "array-contains-any", searchTokens).limit(30).get(),
    ...exactNames.slice(0, 4).map((name) => collection.where("title", "==", name).limit(10).get())
  ]);
  const candidates = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  [tokenSnapshot, ...titleSnapshots].forEach((snapshot) => {
    snapshot.docs.forEach((document) => candidates.set(document.id, document));
  });

  const matches = Array.from(candidates.values()).filter((document) =>
    canLinkGeneratedPhotoToSharedRecipe(document.data() as RecipeCatalogDoc, input)
  );
  if (!matches.length) return { linked: 0 };

  const linkedAt = Date.now();
  const batch = db.batch();
  matches.forEach((document) => {
    const recipe = document.data() as RecipeCatalogDoc;
    batch.update(document.ref, {
      image: {
        ...recipe.image,
        ...(input.attributionName ? { attributionName: input.attributionName } : {}),
        ...(input.attributionUrl ? { attributionUrl: input.attributionUrl } : {}),
        dietTags: normalizeTags(input.diets),
        sharedCacheKey: input.signature,
        signature: input.signature,
        source: "replicate",
        sourceQuery: input.query,
        status: "ready",
        storagePath: input.imageUrl,
        thumbPath: input.imageUrl,
        validatedAt: linkedAt,
        validatorHash: RECIPE_PHOTO_ASSET_VALIDATOR_HASH
      },
      updatedAt: linkedAt
    });
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
  if (input.cuisine && normalize(input.cuisine) !== normalize(recipe.cuisine)) return false;
  const requestedDiets = normalizeTags(input.diets);
  const recipeDiets = new Set(normalizeTags(recipe.dietTags));
  if (requestedDiets.some((diet) => !recipeDiets.has(diet))) return false;

  const requestIdentities = input.exactNames.map((name) => buildRecipePhotoIdentity(name));
  const recipeNames = [
    recipe.title,
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name,
    recipe.dishIntent?.dish_name
  ].filter((value): value is string => Boolean(value?.trim()));
  const identityMatches = recipeNames.some((name) => {
    const normalizedName = normalize(name);
    const recipeIdentity = buildRecipePhotoIdentity(name);
    return input.exactNames.some((exactName) => normalize(exactName) === normalizedName) ||
      requestIdentities.some((requestIdentity) => Boolean(
        requestIdentity.signature === recipeIdentity.signature ||
          (requestIdentity.canonicalDishKey &&
            recipeIdentity.canonicalDishKey &&
            requestIdentity.canonicalDishKey === recipeIdentity.canonicalDishKey)
      ));
  });
  if (!identityMatches) return false;

  return isGeneratedRecipePhotoUrlCompatibleWithQueries(input.imageUrl, recipeNames) &&
    recipeNames.some((name) => isGeneratedRecipePhotoCachePayloadConsistent({
      imageUrl: input.imageUrl,
      query: name,
      signature: input.signature
    }));
}

function normalizeTags(values: string[]) {
  return dedupeStrings(values.map(normalize)).sort();
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

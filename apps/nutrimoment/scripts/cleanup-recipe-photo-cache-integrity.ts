import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { isDurableRecipeImageUrl } from "../src/lib/recipeImageDurability";
import {
  isApproximateRecipePhotoCacheCompatible,
  isGeneratedRecipePhotoCachePayloadConsistent
} from "../src/services/recipePhotoCacheCompatibility";
import {
  isRecipePhotoDietCompatible,
  normalizeRecipePhotoDietIds
} from "../src/services/recipePhotoDietCompatibility";
import { SHARED_RECIPE_VALIDATOR_HASH } from "../src/services/sharedRecipePoolQualityService";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const PHOTO_COLLECTION = "recipePhotoCache";
const RECIPE_COLLECTION = "sharedOfflineRecipeCache";
const DELETE_BATCH_SIZE = 400;
const PAGE_SIZE = 200;
const SAMPLE_LIMIT = 30;
const SUPPORTED_SOURCES = new Set([
  "generated",
  "google_search",
  "pexels_search",
  "unsplash_search",
  "wikimedia"
]);

type CacheCandidate = {
  docId: string;
  imageUrl: string;
  query: string;
  reason: string;
  ref: FirebaseFirestore.DocumentReference;
  signature: string;
};

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const confirmed = process.argv.includes("--confirm");
  const db = getAdminDb();
  const photoSnapshot = await db.collection(PHOTO_COLLECTION).get();
  const rejectedPhotos: CacheCandidate[] = [];

  for (const docSnap of photoSnapshot.docs) {
    const data = docSnap.data();
    const imageUrl = readString(data.imageUrl);
    const query = readString(data.query);
    const signature = readString(data.signature) || docSnap.id;
    const source = readString(data.source);
    const reason = inspectCacheEntry({
      dietTags: readStringArray(data.dietTags),
      docId: docSnap.id,
      imageUrl,
      query,
      signature,
      source
    });
    if (!reason) continue;

    rejectedPhotos.push({
      docId: docSnap.id,
      imageUrl,
      query,
      reason,
      ref: docSnap.ref,
      signature
    });
  }

  const rejectedUrls = new Set(rejectedPhotos.map((entry) => entry.imageUrl).filter(Boolean));
  const recipeUnlinks = await findRecipeImagesToUnlink(rejectedUrls);

  process.stdout.write(
    `${confirmed ? "Apply" : "Dry run"} recipe/photo cache integrity cleanup.\n` +
      `Photo docs scanned: ${photoSnapshot.size}\n` +
      `${confirmed ? "Deleting" : "Would delete"} photo docs: ${rejectedPhotos.length}\n` +
      `Shared recipes scanned: ${recipeUnlinks.scanned}\n` +
      `${confirmed ? "Unlinking" : "Would unlink"} shared recipe photos: ${recipeUnlinks.items.length}\n` +
      `Photo rejection reasons: ${JSON.stringify(countByReason(rejectedPhotos), null, 2)}\n` +
      `Recipe unlink reasons: ${JSON.stringify(countByReason(recipeUnlinks.items), null, 2)}\n` +
      `Samples: ${JSON.stringify([
        ...rejectedPhotos.slice(0, SAMPLE_LIMIT).map(({ docId, query, reason, signature }) => ({
          collection: PHOTO_COLLECTION,
          docId,
          query,
          reason,
          signature
        })),
        ...recipeUnlinks.items.slice(0, SAMPLE_LIMIT).map(({ docId, reason, title }) => ({
          collection: RECIPE_COLLECTION,
          docId,
          reason,
          title
        }))
      ].slice(0, SAMPLE_LIMIT), null, 2)}\n`
  );

  if (!confirmed) {
    process.stdout.write("Dry run only. No Firestore writes were performed.\n");
    return;
  }

  for (let index = 0; index < rejectedPhotos.length; index += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    rejectedPhotos.slice(index, index + DELETE_BATCH_SIZE).forEach((candidate) => batch.delete(candidate.ref));
    await batch.commit();
  }

  for (let index = 0; index < recipeUnlinks.items.length; index += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    recipeUnlinks.items.slice(index, index + DELETE_BATCH_SIZE).forEach((candidate) => {
      batch.set(candidate.ref, removeRecipePhoto(candidate.recipe));
    });
    await batch.commit();
  }

  process.stdout.write(
    `Integrity cleanup complete. Deleted ${rejectedPhotos.length} photo docs and unlinked ${recipeUnlinks.items.length} shared recipe photos.\n`
  );
}

function inspectCacheEntry(input: {
  dietTags: string[];
  docId: string;
  imageUrl: string;
  query: string;
  signature: string;
  source: string;
}) {
  if (!input.imageUrl) return "missing_image_url";
  if (!isDurableRecipeImageUrl(input.imageUrl)) return "non_durable_image_url";
  if (!SUPPORTED_SOURCES.has(input.source)) return "unsupported_source";
  if (!input.query || !input.signature) return "missing_identity_metadata";

  if (
    input.source === "generated" &&
    !isGeneratedRecipePhotoCachePayloadConsistent(input)
  ) {
    return "generated_storage_identity_mismatch";
  }

  const exactRequest = parseExactAliasRequest(input.docId || input.signature);
  if (
    exactRequest &&
    !isApproximateRecipePhotoCacheCompatible(input, [exactRequest])
  ) {
    return "exact_alias_identity_mismatch";
  }

  const scopedDiets = parseDietScope(input.docId || input.signature);
  if (scopedDiets.length) {
    const normalizedTags = new Set(normalizeRecipePhotoDietIds(input.dietTags));
    if (input.source === "generated" && scopedDiets.some((diet) => !normalizedTags.has(diet))) {
      return "generated_diet_scope_without_matching_tag";
    }
    if (!isRecipePhotoDietCompatible(input, { diets: scopedDiets })) {
      return "diet_scope_mismatch";
    }
  }

  return null;
}

async function findRecipeImagesToUnlink(rejectedUrls: Set<string>) {
  const db = getAdminDb();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let scanned = 0;
  const items: Array<{
    docId: string;
    reason: string;
    recipe: RecipeCatalogDoc;
    ref: FirebaseFirestore.DocumentReference;
    title: string;
  }> = [];

  while (true) {
    let query = db.collection(RECIPE_COLLECTION).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const docSnap of snapshot.docs) {
      scanned += 1;
      const recipe = { ...docSnap.data(), id: docSnap.id } as RecipeCatalogDoc;
      const reason = inspectRecipePhoto(recipe, rejectedUrls);
      if (!reason) continue;
      items.push({
        docId: docSnap.id,
        reason,
        recipe,
        ref: docSnap.ref,
        title: recipe.localized?.English?.name ?? recipe.title
      });
    }

    cursor = snapshot.docs.at(-1);
    if (snapshot.size < PAGE_SIZE) break;
  }

  return { items, scanned };
}

function inspectRecipePhoto(recipe: RecipeCatalogDoc, rejectedUrls: Set<string>) {
  if (!recipe.isActive) return null;
  if (recipe.validatorHash !== SHARED_RECIPE_VALIDATOR_HASH) return null;
  if (recipe.qualityStatus !== "golden" && recipe.qualityStatus !== "verified") return null;

  const imageUrl = readString(recipe.image?.thumbPath || recipe.image?.storagePath);
  if (recipe.image?.status !== "ready" && !imageUrl) return null;
  if (!imageUrl || !isDurableRecipeImageUrl(imageUrl)) return "missing_or_non_durable_recipe_image";
  if (rejectedUrls.has(imageUrl)) return "linked_to_rejected_photo_cache_asset";

  const sourceQuery = readString(recipe.image?.sourceQuery);
  const title = recipe.localized?.English?.name ?? recipe.title;
  const source = normalizeRecipePhotoSource(readString(recipe.image?.source));
  const entry = {
    canonicalDishKey: recipe.dishIntent?.dish_name,
    dietTags: recipe.image?.dietTags ?? recipe.dietTags,
    imageUrl,
    query: sourceQuery,
    signature: title,
    source
  };

  if (!sourceQuery) return "missing_recipe_photo_identity";
  if (source === "generated" && !isGeneratedRecipePhotoCachePayloadConsistent(entry)) {
    return "recipe_generated_storage_identity_mismatch";
  }
  if (!isApproximateRecipePhotoCacheCompatible({ ...entry, signature: undefined }, [title])) {
    return "recipe_photo_title_identity_mismatch";
  }
  if (!isRecipePhotoDietCompatible(entry, { diets: recipe.dietTags })) {
    return "recipe_photo_diet_mismatch";
  }

  return null;
}

function removeRecipePhoto(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  const localized = Object.fromEntries(
    Object.entries(recipe.localized ?? {}).map(([language, variant]) => {
      if (!variant) return [language, variant];
      return [language, {
        ...variant,
        image_attribution_name: undefined,
        image_attribution_url: undefined,
        image_source: undefined,
        image_url: undefined,
        photo_asset: undefined
      }];
    })
  );

  return stripUndefinedDeep({
    ...recipe,
    image: {
      ...recipe.image,
      attributionName: undefined,
      attributionUrl: undefined,
      status: "pending",
      storagePath: "",
      thumbPath: undefined
    },
    localized,
    updatedAt: Date.now()
  });
}

function parseDietScope(value: string) {
  const match = value.match(/^diet:([^:]+):/i);
  return match ? normalizeRecipePhotoDietIds(match[1].split("+")) : [];
}

function parseExactAliasRequest(value: string) {
  const unscoped = value.replace(/^diet:[^:]+:/i, "");
  if (/^exact:ar:/i.test(unscoped)) return "";
  const canonical = unscoped.match(/^exact:canonical:(.+)$/i);
  if (canonical) return canonical[1].replace(/[-_]+/g, " ");
  const localized = unscoped.match(/^exact:en:(.+)$/i);
  if (localized) return localized[1].replace(/[-_]+/g, " ");
  const cuisine = unscoped.match(/^exact:cuisine:[^:]+:(.+)$/i);
  return cuisine ? cuisine[1].replace(/[-_]+/g, " ") : "";
}

function normalizeRecipePhotoSource(value: string) {
  if (value === "replicate" || value === "api") return "generated";
  if (value === "pexels" || value === "search") return "pexels_search";
  if (value === "unsplash") return "unsplash_search";
  return value;
}

function countByReason(items: Array<{ reason: string }>) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
    return counts;
  }, {});
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

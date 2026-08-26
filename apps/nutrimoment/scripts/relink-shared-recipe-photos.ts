import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { isDurableRecipeImageUrl } from "../src/lib/recipeImageDurability";
import type { SharedRecipePhotoEntry } from "../src/lib/sharedRecipePhotoCache";
import {
  buildLinkedSharedRecipePhotoUpdate
} from "../src/services/sharedRecipePhotoLinkService";
import {
  buildSharedRecipePhotoRelinkIndex,
  findSharedRecipePhotoRelinkMatch,
  type SharedRecipePhotoRelinkRecord
} from "../src/services/sharedRecipePhotoRelinkService";
import { RECIPE_PHOTO_ASSET_VALIDATOR_HASH } from "../src/services/recipePhotoReusePolicy";
import { isSharedRecipePublishable } from "../src/services/sharedRecipePoolQualityService";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const RECIPE_COLLECTION = "sharedOfflineRecipeCache";
const PHOTO_COLLECTION = "recipePhotoCache";
const confirmed = process.argv.includes("--confirm");
const writeBatchSize = Math.min(
  400,
  readNumberArg("--batch-size") ?? readNumberArg("--page-size") ?? 300
);
const maxRecipes = readNumberArg("--max");
const exactTitle = readStringArg("--title");
const afterId = readStringArg("--after-id");
const sampleLimit = Math.min(100, readNumberArg("--sample-limit") ?? 25);

interface RelinkStats {
  alreadyLinked: number;
  cacheDocuments: number;
  cacheUniqueImages: number;
  dryRun: boolean;
  lastDocumentId?: string;
  matched: number;
  matchedSamples: Array<Record<string, unknown>>;
  publishableMissing: number;
  scanned: number;
  skippedNotPublishable: number;
  unmatched: number;
  unmatchedSamples: Array<Record<string, unknown>>;
  written: number;
}

async function main() {
  if (!hasFirebaseAdminConfig()) throw new Error("Firebase Admin credentials are not configured.");
  const db = getAdminDb();
  const buildRecipeQuery = (qualityStatus: "golden" | "verified") => db
    .collection(RECIPE_COLLECTION)
    .where("isActive", "==", true)
    .where("qualityStatus", "==", qualityStatus)
    .select(
      "title",
      "slug",
      "ingredients",
      "dietTags",
      "cuisine",
      "image",
      "source.provider",
      "localized.English.name",
      "localized.English.cuisine",
      "localized.English.dish_intent",
      "localized.English.image_search_index",
      "localized.English.image_search_indices",
      "localized.Arabic.name",
      "localized.Arabic.dish_intent",
      "dishIntent",
      "isActive",
      "qualityStatus",
      "contentVersion",
      "validatorHash"
    );

  const [photoSnapshot, goldenSnapshot, verifiedSnapshot] = await Promise.all([
    db
      .collection(PHOTO_COLLECTION)
      .where("source", "==", "generated")
      .select(
        "imageUrl",
        "imageAttributionName",
        "imageAttributionUrl",
        "model",
        "dietTags",
        "query",
        "signature",
        "queryKey",
        "signatureKey",
        "canonicalDishKey",
        "queryCanonicalDishKey",
        "familyKey",
        "queryFamilyKey",
        "mainIngredientKey",
        "queryMainIngredientKey",
        "cookingMethodKey",
        "cuisineKey",
        "mealTypeKey",
        "sauceKey",
        "starchKey"
      )
      .get(),
    buildRecipeQuery("golden").get(),
    buildRecipeQuery("verified").get()
  ]);
  const recipeDocuments = [...goldenSnapshot.docs, ...verifiedSnapshot.docs]
    .filter((document) => !afterId || document.id > afterId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const records = photoSnapshot.docs
    .map((document) => mapPhotoCacheDocument(document.id, document.data()))
    .filter((record): record is SharedRecipePhotoRelinkRecord => Boolean(record));
  const index = buildSharedRecipePhotoRelinkIndex(records);
  const stats: RelinkStats = {
    alreadyLinked: 0,
    cacheDocuments: records.length,
    cacheUniqueImages: new Set(records.map((record) => record.entry.imageUrl)).size,
    dryRun: !confirmed,
    matched: 0,
    matchedSamples: [],
    publishableMissing: 0,
    scanned: 0,
    skippedNotPublishable: 0,
    unmatched: 0,
    unmatchedSamples: [],
    written: 0
  };

  let batch = db.batch();
  let pendingWrites = 0;
  for (const document of recipeDocuments) {
    stats.scanned += 1;
    stats.lastDocumentId = document.id;
    const recipe = { ...document.data(), id: document.id } as RecipeCatalogDoc;
    if (exactTitle && recipe.title !== exactTitle) continue;
    if (!isSharedRecipePublishable(recipe)) {
      stats.skippedNotPublishable += 1;
      continue;
    }
    if (hasCurrentReadyPhoto(recipe)) {
      stats.alreadyLinked += 1;
      continue;
    }
    if (maxRecipes != null && stats.publishableMissing >= maxRecipes) break;
    stats.publishableMissing += 1;

    const match = findSharedRecipePhotoRelinkMatch(recipe, index);
    if (!match) {
      stats.unmatched += 1;
      if (stats.unmatchedSamples.length < sampleLimit) {
        stats.unmatchedSamples.push({ id: document.id, title: recipe.title });
      }
    } else {
      stats.matched += 1;
      if (stats.matchedSamples.length < sampleLimit) {
        stats.matchedSamples.push({
          id: document.id,
          imageQuery: match.candidate.query,
          score: match.score,
          signature: match.candidate.signature,
          title: recipe.title
        });
      }
      if (confirmed) {
        batch.set(
          document.ref,
          buildLinkedSharedRecipePhotoUpdate(recipe, match.linkedRecipe, match.candidate),
          { merge: true }
        );
        pendingWrites += 1;
        if (pendingWrites >= writeBatchSize) {
          await batch.commit();
          stats.written += pendingWrites;
          batch = db.batch();
          pendingWrites = 0;
        }
      }
    }

    if (stats.scanned % 500 === 0) {
      process.stderr.write(
        `Relink progress: scanned=${stats.scanned} missing=${stats.publishableMissing} ` +
        `matched=${stats.matched} written=${stats.written} cursor=${stats.lastDocumentId ?? "none"}\n`
      );
    }
  }

  if (confirmed && pendingWrites) {
    await batch.commit();
    stats.written += pendingWrites;
  }

  process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
}

function mapPhotoCacheDocument(
  docId: string,
  data: FirebaseFirestore.DocumentData
): SharedRecipePhotoRelinkRecord | null {
  const imageUrl = readString(data.imageUrl);
  if (!imageUrl || !isDurableRecipeImageUrl(imageUrl)) return null;
  const query = readString(data.query);
  const signature = readString(data.signature) || docId;
  const entry: SharedRecipePhotoEntry = {
    canonicalDishKey: readString(data.canonicalDishKey) || undefined,
    dietTags: readStringArray(data.dietTags),
    familyKey: readString(data.familyKey) || undefined,
    imageAttributionName: readString(data.imageAttributionName) || undefined,
    imageAttributionUrl: readString(data.imageAttributionUrl) || undefined,
    imageUrl,
    mainIngredientKey: readString(data.mainIngredientKey) || undefined,
    model: readString(data.model) || undefined,
    query,
    signature,
    source: "generated"
  };

  return {
    canonicalDishKey: readString(data.canonicalDishKey) || undefined,
    cookingMethodKey: readString(data.cookingMethodKey) || undefined,
    cuisineKey: readString(data.cuisineKey) || undefined,
    docId,
    entry,
    familyKey: readString(data.familyKey) || undefined,
    mainIngredientKey: readString(data.mainIngredientKey) || undefined,
    mealTypeKey: readString(data.mealTypeKey) || undefined,
    queryCanonicalDishKey: readString(data.queryCanonicalDishKey) || undefined,
    queryFamilyKey: readString(data.queryFamilyKey) || undefined,
    queryKey: readString(data.queryKey) || undefined,
    queryMainIngredientKey: readString(data.queryMainIngredientKey) || undefined,
    sauceKey: readString(data.sauceKey) || undefined,
    signatureKey: readString(data.signatureKey) || undefined,
    starchKey: readString(data.starchKey) || undefined
  };
}

function hasCurrentReadyPhoto(recipe: RecipeCatalogDoc) {
  const imageUrl = recipe.image.thumbPath || recipe.image.storagePath;
  return recipe.image.status === "ready" &&
    recipe.image.validatorHash === RECIPE_PHOTO_ASSET_VALIDATOR_HASH &&
    isDurableRecipeImageUrl(imageUrl);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function readNumberArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return Math.floor(parsed);
}

function readStringArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`${name} must have a value.`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

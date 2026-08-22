import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { buildRecipePhotoExactAliases } from "../src/lib/recipePhotoExactIdentity";
import { buildRecipePhotoIdentity } from "../src/lib/recipePhotoIdentity";
import {
  getSharedRecipePhotoByApproximateCategory,
  getSharedRecipePhotoByExactAliases,
  getSharedRecipePhotoByQueryOrSignature,
  type SharedRecipePhotoEntry
} from "../src/lib/sharedRecipePhotoCache";
import type { Recipe, RecipeImageSource } from "../src/lib/types";
import { mapCatalogRecipeToUiRecipe } from "../src/services/recipeSearchService";
import {
  normalizeRecipePhotoDietIds,
  scopeRecipePhotoAliasesForDiet
} from "../src/services/recipePhotoDietCompatibility";
import {
  attachValidatedRecipePhotoAsset,
  RECIPE_PHOTO_ASSET_VALIDATOR_HASH
} from "../src/services/recipePhotoReusePolicy";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "sharedOfflineRecipeCache";
const dryRun = process.argv.includes("--dry-run");
const confirmed = process.argv.includes("--confirm");
const includeAllSources = process.argv.includes("--all");
const pageSize = Math.min(300, readNumberArg("--page-size") ?? 100);
const maxDocs = readNumberArg("--max");

async function main() {
  if (!hasFirebaseAdminConfig()) throw new Error("Firebase Admin credentials are not configured.");
  if (!dryRun && !confirmed) {
    throw new Error("Refusing to migrate without --confirm. Run with --dry-run first.");
  }

  const db = getAdminDb();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let scanned = 0;
  let alreadyLinked = 0;
  let linked = 0;
  let unmatched = 0;
  const samples: Array<Record<string, unknown>> = [];

  while (maxDocs == null || scanned < maxDocs) {
    const limit = Math.min(pageSize, maxDocs == null ? pageSize : maxDocs - scanned);
    let query = includeAllSources
      ? db.collection(COLLECTION_NAME).orderBy(FieldPath.documentId()).limit(limit)
      : db.collection(COLLECTION_NAME)
          .where("source.provider", "==", "premium-validated")
          .orderBy(FieldPath.documentId())
          .limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const batch = db.batch();
    let pendingWrites = 0;

    for (const document of snapshot.docs) {
      scanned += 1;
      const recipe = { ...document.data(), id: document.id } as RecipeCatalogDoc;
      if (recipe.image.status === "ready" && recipe.image.validatorHash === RECIPE_PHOTO_ASSET_VALIDATOR_HASH) {
        alreadyLinked += 1;
        continue;
      }

      const linkedRecipe = await findLinkedRecipePhoto(recipe);
      if (!linkedRecipe?.photo_asset?.url || linkedRecipe.photo_asset.status !== "ready") {
        unmatched += 1;
        if (samples.length < 20) samples.push({ id: document.id, status: "unmatched", title: recipe.title });
        continue;
      }

      linked += 1;
      if (samples.length < 20) {
        samples.push({
          id: document.id,
          imageSource: linkedRecipe.photo_asset.source,
          status: "linked",
          title: recipe.title
        });
      }
      if (!dryRun) {
        batch.set(document.ref, buildLinkedRecipeUpdate(recipe, linkedRecipe), { merge: true });
        pendingWrites += 1;
      }
    }

    if (pendingWrites) await batch.commit();
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < limit) break;
  }

  process.stdout.write(`${JSON.stringify({
    alreadyLinked,
    collection: COLLECTION_NAME,
    dryRun,
    includeAllSources,
    linked,
    samples,
    scanned,
    unmatched
  }, null, 2)}\n`);
}

async function findLinkedRecipePhoto(recipe: RecipeCatalogDoc) {
  const diets = normalizeRecipePhotoDietIds(recipe.dietTags);
  const uiRecipe = mapCatalogRecipeToUiRecipe(recipe, [], "good", 0, 0, [], "English");
  const names = [
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name,
    recipe.title,
    recipe.dishIntent?.dish_name,
    recipe.image.sourceQuery
  ];
  const identities = names
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => buildRecipePhotoIdentity(value));
  const canonicalAliases = identities
    .map((identity) => identity.canonicalDishKey)
    .filter((value): value is string => Boolean(value))
    .map((value) => `exact:canonical:${value}`);
  const unscopedAliases = Array.from(new Set([
    ...buildRecipePhotoExactAliases({ cuisine: recipe.cuisine, names }),
    ...canonicalAliases
  ])).slice(0, 16);
  const aliases = Array.from(new Set([
    ...scopeRecipePhotoAliasesForDiet(unscopedAliases, diets),
    ...unscopedAliases
  ])).slice(0, 24);

  for (const alias of aliases) {
    const candidate = await getSharedRecipePhotoByExactAliases([alias]);
    const linked = validateCandidate(uiRecipe, candidate, diets);
    if (linked) return linked;
  }

  const queries = Array.from(new Set(names.filter((value): value is string => Boolean(value?.trim()))));
  const candidate = await getSharedRecipePhotoByQueryOrSignature({
    queries,
    signatures: identities.map((identity) => identity.signature)
  });
  const directlyLinked = validateCandidate(uiRecipe, candidate, diets);
  if (directlyLinked) return directlyLinked;

  const ingredientTexts = [
    ...uiRecipe.ingredients,
    ...uiRecipe.missing_ingredients
  ];
  const ingredientIdentities = ingredientTexts.map((ingredient) => buildRecipePhotoIdentity(ingredient));
  const approximate = await getSharedRecipePhotoByApproximateCategory({
    allowProviderPhotos: true,
    canonicalDishKeys: identities.map((identity) => identity.canonicalDishKey),
    cookingMethodKeys: identities.map((identity) => identity.cookingMethodKey),
    cuisineKeys: identities.map((identity) => identity.cuisineKey),
    familyKeys: identities.map((identity) => identity.familyKey),
    ingredientTexts,
    mainIngredientKeys: [
      ...identities.map((identity) => identity.mainIngredientKey),
      ...ingredientIdentities.map((identity) => identity.mainIngredientKey)
    ],
    mealTypeKeys: identities.map((identity) => identity.mealTypeKey),
    requestTexts: queries,
    sauceKeys: identities.map((identity) => identity.sauceKey),
    starchKeys: identities.map((identity) => identity.starchKey)
  });
  return validateCandidate(uiRecipe, approximate, diets);
}

function validateCandidate(recipe: Recipe, candidate: SharedRecipePhotoEntry | null, diets: string[]) {
  if (!candidate) return null;
  const source = mapPhotoSource(candidate.source);
  return attachValidatedRecipePhotoAsset({
    ...recipe,
    image_attribution_name: candidate.imageAttributionName,
    image_attribution_url: candidate.imageAttributionUrl,
    image_source: source,
    image_url: candidate.imageUrl
  }, diets);
}

function buildLinkedRecipeUpdate(recipe: RecipeCatalogDoc, linked: Recipe) {
  const asset = linked.photo_asset;
  if (!asset?.url) throw new Error("Cannot link a recipe without a ready photo asset.");
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

  return stripUndefinedDeep({
    image: {
      ...recipe.image,
      attributionName: asset.attributionName,
      attributionUrl: asset.attributionUrl,
      dietTags: asset.dietTags,
      source: asset.source,
      status: "ready",
      storagePath: asset.url,
      thumbPath: asset.url,
      validatedAt: asset.validatedAt,
      validatorHash: asset.validatorHash
    },
    localized,
    updatedAt: Date.now()
  });
}

function mapPhotoSource(source: SharedRecipePhotoEntry["source"]): RecipeImageSource {
  if (source === "generated") return "replicate";
  if (source === "pexels_search") return "pexels";
  if (source === "unsplash_search") return "unsplash";
  if (source === "wikimedia") return "wikimedia";
  return "search";
}

function readNumberArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return Math.floor(parsed);
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

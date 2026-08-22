import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { CURATED_TRUSTED_RECIPE_CATALOG } from "../src/data/offline/curatedTrustedRecipeCatalog";
import { mapReferenceDocToCatalogDoc } from "../src/data/offline/firestoreRecipeReferenceCatalog";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import type { RecipeReferenceDoc } from "../src/lib/recipeReferenceTypes";
import {
  persistSharedRecipeCatalog,
  prepareSharedRecipeCatalogForPublication
} from "../src/services/userRecipeCacheService";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const dryRun = process.argv.includes("--dry-run");
const confirmed = process.argv.includes("--confirm");
const pageSize = Math.min(500, readNumberArg("--page-size") ?? 250);
const maxReferences = readNumberArg("--max-references");

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  if (!dryRun && !confirmed) {
    throw new Error("Refusing to publish without --confirm. Run with --dry-run first.");
  }

  const references = await loadValidatedReferences();
  const candidates = dedupeRecipes([...CURATED_TRUSTED_RECIPE_CATALOG, ...references]);
  const publishable = prepareSharedRecipeCatalogForPublication(candidates);
  const cuisineCoverage = countBy(publishable, (recipe) => recipe.cuisine || "Unknown");
  const dietCoverage = countBy(
    publishable.flatMap((recipe) => recipe.dietTags.map((dietTag) => ({ dietTag }))),
    (entry) => entry.dietTag
  );

  const result = dryRun
    ? { published: 0, rejected: candidates.length - publishable.length }
    : await persistSharedRecipeCatalog(publishable);

  process.stdout.write(`${JSON.stringify({
    confirmed: !dryRun,
    curatedCandidates: CURATED_TRUSTED_RECIPE_CATALOG.length,
    cuisineCoverage,
    dietCoverage,
    publishable: publishable.length,
    published: result.published,
    referenceCandidates: references.length,
    rejected: candidates.length - publishable.length
  }, null, 2)}\n`);
  if (dryRun) process.stdout.write("Dry run only. No Firestore writes were performed.\n");
}

async function loadValidatedReferences() {
  const db = getAdminDb();
  const recipes: RecipeCatalogDoc[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (maxReferences == null || recipes.length < maxReferences) {
    const limit = Math.min(pageSize, maxReferences == null ? pageSize : maxReferences - recipes.length);
    let query = db.collection("recipeReferenceRecipes")
      .where("qualityStatus", "in", ["golden", "verified"])
      .orderBy(FieldPath.documentId())
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) break;
    snapshot.docs.forEach((docSnapshot) => {
      const reference = { ...docSnapshot.data(), id: docSnapshot.id } as RecipeReferenceDoc;
      recipes.push(mapReferenceDocToCatalogDoc(reference));
    });
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < limit) break;
  }

  return recipes;
}

function dedupeRecipes(recipes: RecipeCatalogDoc[]) {
  return Array.from(new Map(recipes.map((recipe) => [recipe.id, recipe])).values());
}

function countBy<T>(items: T[], readKey: (item: T) => string) {
  return Object.fromEntries(
    Array.from(items.reduce((counts, item) => {
      const key = readKey(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()).entries()).sort((left, right) => right[1] - left[1])
  );
}

function readNumberArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return Math.floor(parsed);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

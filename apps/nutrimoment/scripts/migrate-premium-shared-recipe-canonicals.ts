import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { hasCurrentPremiumValidationReceipt } from "../src/services/recipeValidationContractService";
import { isSharedRecipePublishable } from "../src/services/sharedRecipePoolQualityService";
import { rebuildPremiumSharedRecipeCanonicalPayload } from "../src/services/userRecipeCacheService";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "sharedOfflineRecipeCache";
const dryRun = process.argv.includes("--dry-run");
const confirmed = process.argv.includes("--confirm");
const pageSize = Math.min(400, readNumberArg("--page-size") ?? 150);
const maxDocs = readNumberArg("--max");

async function main() {
  if (!hasFirebaseAdminConfig()) throw new Error("Firebase Admin credentials are not configured.");
  if (!dryRun && !confirmed) {
    throw new Error("Refusing to migrate without --confirm. Run with --dry-run first.");
  }

  const db = getAdminDb();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let scanned = 0;
  let premium = 0;
  let migrated = 0;
  let rejected = 0;
  let current = 0;
  const samples: Array<Record<string, unknown>> = [];

  while (maxDocs == null || scanned < maxDocs) {
    const limit = Math.min(pageSize, maxDocs == null ? pageSize : maxDocs - scanned);
    let query = db.collection(COLLECTION_NAME)
      .where("source.provider", "==", "premium-validated")
      .orderBy(FieldPath.documentId())
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const batch = db.batch();
    let pendingWrites = 0;

    for (const docSnapshot of snapshot.docs) {
      scanned += 1;
      const recipe = { ...docSnapshot.data(), id: docSnapshot.id } as RecipeCatalogDoc;
      if (recipe.source?.provider !== "premium-validated") continue;
      premium += 1;

      if (hasCurrentPremiumValidationReceipt(recipe)) {
        current += 1;
        continue;
      }

      const repaired = await rebuildPremiumSharedRecipeCanonicalPayload(recipe);
      if (!repaired || (repaired.isActive && !isSharedRecipePublishable(repaired))) {
        rejected += 1;
        if (samples.length < 20) {
          samples.push({ id: docSnapshot.id, title: recipe.title, status: "rejected" });
        }
        continue;
      }

      migrated += 1;
      if (samples.length < 20) {
        samples.push({
          after: repaired.ingredientCanonicals,
          before: recipe.ingredientCanonicals,
          id: docSnapshot.id,
          title: recipe.title
        });
      }
      if (!dryRun) {
        batch.set(docSnapshot.ref, stripUndefinedDeep(repaired));
        pendingWrites += 1;
      }
    }

    if (pendingWrites) await batch.commit();
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < limit) break;
  }

  process.stdout.write(`${JSON.stringify({
    collection: COLLECTION_NAME,
    current,
    dryRun,
    migrated,
    premium,
    rejected,
    samples,
    scanned
  }, null, 2)}\n`);
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

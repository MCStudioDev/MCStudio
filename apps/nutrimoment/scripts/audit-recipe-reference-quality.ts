import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { classifyRecipeReferenceDocQuality } from "../src/data/offline/firestoreRecipeReferenceCatalog";
import type { RecipeQualityStatus } from "../src/lib/domain";
import type { RecipeReferenceDoc } from "../src/lib/recipeReferenceTypes";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION = getStringArg("--collection") ?? process.env.RECIPE_REFERENCE_COLLECTION ?? "recipeReferenceRecipes";
const PAGE_SIZE = Math.min(500, getNumberArg("--page-size") ?? 250);
const MAX_DOCS = getNumberArg("--max");
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = getAdminDb();
  const statusCounts: Record<RecipeQualityStatus, number> = {
    blocked: 0,
    dish_intent: 0,
    golden: 0,
    probation: 0,
    verified: 0
  };
  const reasonCounts = new Map<string, number>();
  let scanned = 0;
  let updated = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (MAX_DOCS == null || scanned < MAX_DOCS) {
    const limit = Math.min(PAGE_SIZE, MAX_DOCS == null ? PAGE_SIZE : MAX_DOCS - scanned);
    let query = db.collection(COLLECTION).orderBy("__name__").limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchWrites = 0;
    for (const docSnapshot of snapshot.docs) {
      const recipe = { ...docSnapshot.data(), id: docSnapshot.id } as RecipeReferenceDoc;
      const quality = classifyRecipeReferenceDocQuality(recipe);
      statusCounts[quality.status] += 1;
      quality.reasons.forEach((reason) => reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1));
      scanned += 1;

      if (APPLY) {
        batch.set(docSnapshot.ref, {
          contentQualityScore: quality.score,
          contentVersion: quality.contentVersion,
          qualityAuditedAt: Date.now(),
          qualityReasons: quality.reasons,
          qualityStatus: quality.status
        }, { merge: true });
        batchWrites += 1;
      }
    }

    if (APPLY && batchWrites) {
      await batch.commit();
      updated += batchWrites;
    }

    cursor = snapshot.docs.at(-1);
    process.stdout.write(`Scanned ${scanned}${APPLY ? `, updated ${updated}` : ""}...\n`);
    if (snapshot.size < limit) break;
  }

  const topReasons = Array.from(reasonCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([reason, count]) => ({ count, reason }));

  process.stdout.write(`${JSON.stringify({
    apply: APPLY,
    collection: COLLECTION,
    discoverable: statusCounts.golden + statusCounts.verified,
    quarantined: statusCounts.blocked + statusCounts.dish_intent + statusCounts.probation,
    scanned,
    statusCounts,
    topReasons,
    updated
  }, null, 2)}\n`);
  if (!APPLY) process.stdout.write("Dry run only. No Firestore documents were changed. Use --apply to persist labels.\n");
}

function getStringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getNumberArg(name: string) {
  const value = getStringArg(name);
  if (value == null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number.`);
  return Math.floor(number);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

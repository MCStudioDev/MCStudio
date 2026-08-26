import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { rebuildIngredientLookupCanonicals } from "../src/lib/ingredientFamilies";
import { SHARED_RECIPE_V2_COLLECTION } from "../src/services/sharedRecipeV2PolicyService";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const confirmed = process.argv.includes("--confirm");
const pageSize = 300;

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = getAdminDb();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let scanned = 0;
  let changed = 0;
  let written = 0;

  do {
    let query = db.collection(SHARED_RECIPE_V2_COLLECTION)
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let pendingWrites = 0;
    for (const document of snapshot.docs) {
      scanned += 1;
      const recipe = document.data() as RecipeCatalogDoc;
      const nextLookupCanonicals = rebuildIngredientLookupCanonicals(
        recipe.ingredientCanonicals ?? [],
        recipe.ingredientLookupCanonicals ?? []
      );

      if (sameValues(recipe.ingredientLookupCanonicals ?? [], nextLookupCanonicals)) continue;
      changed += 1;
      process.stdout.write(
        `${confirmed ? "UPDATE" : "WOULD UPDATE"} ${document.id}: ${recipe.title ?? "Untitled"} -> ${nextLookupCanonicals.join(", ")}\n`
      );
      if (confirmed) {
        batch.update(document.ref, {
          ingredientLookupCanonicals: nextLookupCanonicals,
          updatedAt: Date.now()
        });
        pendingWrites += 1;
      }
    }

    if (pendingWrites) {
      await batch.commit();
      written += pendingWrites;
    }
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) break;
  } while (true);

  process.stdout.write(
    `Done. mode=${confirmed ? "write" : "dry-run"}, scanned=${scanned}, changed=${changed}, written=${written}\n`
  );
}

function sameValues(left: string[], right: string[]) {
  const normalize = (values: string[]) => Array.from(new Set(values)).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

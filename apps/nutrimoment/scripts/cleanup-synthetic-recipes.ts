import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const PREFIXES = ["ge_", "gm_", "gi_"];
const EXPLICIT_RECIPE_IDS = ["r_1025", "r_1026", "r_1027", "r_1028", "r_1029", "r_1030", "r_1031", "r_1032"];
const DELETE_BATCH_SIZE = 200;

async function deleteByPrefix(prefix: string) {
  const db = getAdminDb();
  let deleted = 0;

  while (true) {
    const snap = await db
      .collection("recipes")
      .where("id", ">=", prefix)
      .where("id", "<", `${prefix}\uf8ff`)
      .limit(DELETE_BATCH_SIZE)
      .get();

    if (snap.empty) {
      break;
    }

    const batch = db.batch();
    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    deleted += snap.size;
    process.stdout.write(`Deleted ${deleted} recipes for prefix ${prefix}...\n`);
  }

  return deleted;
}

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = getAdminDb();
  let total = 0;
  for (const prefix of PREFIXES) {
    total += await deleteByPrefix(prefix);
  }

  if (EXPLICIT_RECIPE_IDS.length) {
    const batch = db.batch();
    EXPLICIT_RECIPE_IDS.forEach((recipeId) => {
      batch.delete(db.collection("recipes").doc(recipeId));
    });
    await batch.commit();
    total += EXPLICIT_RECIPE_IDS.length;
    process.stdout.write(`Deleted ${EXPLICIT_RECIPE_IDS.length} explicit synthetic recipe ids.\n`);
  }

  process.stdout.write(`Deleted ${total} synthetic recipes.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

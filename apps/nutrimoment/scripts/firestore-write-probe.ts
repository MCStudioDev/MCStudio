import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { buildOfflineCatalogSeed } from "../src/data/offline/catalogSeed";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = getAdminDb();
  const startedAt = Date.now();
  const seedId = getArgValue("--seed-id");
  const recipeId = getArgValue("--recipe-id");
  if (seedId || recipeId) {
    const seed = buildOfflineCatalogSeed();
    const entries = [
      ...seed.recipes,
      ...seed.ingredients,
      ...seed.aliases,
      ...seed.ingredientLexicon,
      ...seed.healthTags,
      ...seed.indexDocs
    ];
    const targetId = seedId ?? recipeId;
    const entry = entries.find((item) => item.id === targetId);
    if (!entry) {
      throw new Error(`No seeded document found for id ${targetId}.`);
    }

    process.stdout.write(`Starting Firestore probe write for ${entry.collection}/${entry.id}...\n`);
    process.stdout.write(`Payload size: ${Buffer.byteLength(JSON.stringify(entry.data), "utf8")} bytes.\n`);
    await db.collection(entry.collection).doc(entry.id).set(entry.data, { merge: true });
  } else {
    process.stdout.write("Starting Firestore probe write...\n");
    await db.collection("debugSeedProbe").doc("latest").set(
      {
        source: "firestore-write-probe",
        updatedAt: Date.now()
      },
      { merge: true }
    );
  }
  process.stdout.write(`Probe write succeeded in ${Date.now() - startedAt}ms.\n`);
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

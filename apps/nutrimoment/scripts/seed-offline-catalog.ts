import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { buildOfflineCatalogSeed } from "../src/data/offline/catalogSeed";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

async function writeManifest(seed: ReturnType<typeof buildOfflineCatalogSeed>) {
  const outputDir = path.join(process.cwd(), ".generated");
  await fs.mkdir(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, "offline-catalog-seed-manifest.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    collections: {
      recipes: seed.recipes.length,
      ingredients: seed.ingredients.length,
      ingredientAliases: seed.aliases.length,
      ingredientRecipeIndex: seed.indexDocs.length
    }
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

async function seedFirestore(seed: ReturnType<typeof buildOfflineCatalogSeed>) {
  const db = getAdminDb();
  const writes = [...seed.recipes, ...seed.ingredients, ...seed.aliases, ...seed.indexDocs];

  for (let index = 0; index < writes.length; index += 400) {
    const chunk = writes.slice(index, index + 400);
    const batch = db.batch();
    chunk.forEach((entry) => {
      batch.set(db.collection(entry.collection).doc(entry.id), entry.data, { merge: true });
    });
    await batch.commit();
  }
}

async function main() {
  const seed = buildOfflineCatalogSeed();
  const manifestPath = await writeManifest(seed);
  process.stdout.write(`Wrote ${manifestPath}\n`);

  if (!hasFirebaseAdminConfig()) {
    process.stdout.write("Skipping Firestore import because Firebase Admin credentials are not configured.\n");
    process.stdout.write("Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in .env.local to enable import.\n");
    return;
  }

  await seedFirestore(seed);
  process.stdout.write("Imported offline catalog into Firestore.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

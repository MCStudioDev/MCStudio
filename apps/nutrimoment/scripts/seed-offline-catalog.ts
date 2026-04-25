import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { buildOfflineCatalogSeed } from "../src/data/offline/catalogSeed";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
const MAX_WRITE_ATTEMPTS = 6;
const BASE_RETRY_DELAY_MS = 5_000;
const WRITE_PACING_DELAY_MS = 250;

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
      ingredientLexicon: seed.ingredientLexicon.length,
      healthTags: seed.healthTags.length,
      ingredientRecipeIndex: seed.indexDocs.length
    }
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

async function seedFirestore(seed: ReturnType<typeof buildOfflineCatalogSeed>) {
  const db = getAdminDb();
  const writes = [
    ...seed.recipes,
    ...seed.ingredients,
    ...seed.aliases,
    ...seed.ingredientLexicon,
    ...seed.healthTags,
    ...seed.indexDocs
  ];
  const startedAt = Date.now();
  let skipped = 0;
  let written = 0;

  process.stdout.write(`Starting Firestore import for ${writes.length} documents using sequential writes.\n`);

  for (let index = 0; index < writes.length; index += 1) {
    const entry = writes[index];
    const data = stripUndefinedDeep(entry.data);
    process.stdout.write(
      `Checking document ${index + 1}/${writes.length}: ${entry.collection}/${entry.id}\n`
    );
    if (await isExistingDocUpToDate(db, entry.collection, entry.id, data)) {
      skipped += 1;
      process.stdout.write(
        `Skipped ${entry.collection}/${entry.id}; already up to date. Progress: checked ${index + 1}/${writes.length}, written ${written}, skipped ${skipped} in ${Math.round(
          (Date.now() - startedAt) / 1000
        )}s.\n`
      );
    } else {
      await writeDocWithRetry(db, entry.collection, entry.id, data);
      written += 1;
      process.stdout.write(
        `Wrote ${entry.collection}/${entry.id}. Progress: checked ${index + 1}/${writes.length}, written ${written}, skipped ${skipped} in ${Math.round(
          (Date.now() - startedAt) / 1000
        )}s.\n`
      );
      await sleep(WRITE_PACING_DELAY_MS);
    }
  }
}

async function isExistingDocUpToDate(
  db: FirebaseFirestore.Firestore,
  collection: string,
  id: string,
  expected: unknown
) {
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return false;
  return JSON.stringify(stripUndefinedDeep(snap.data())) === JSON.stringify(expected);
}

async function writeDocWithRetry(db: FirebaseFirestore.Firestore, collection: string, id: string, data: unknown) {
  const label = `${collection}/${id}`;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await db.collection(collection).doc(id).set(data as FirebaseFirestore.DocumentData, { merge: true });
      return;
    } catch (error) {
      if (!isRetryableWriteError(error) || attempt === MAX_WRITE_ATTEMPTS) {
        throw error;
      }

      const delayMs = BASE_RETRY_DELAY_MS * attempt;
      process.stdout.write(
        `${label} hit a transient Firestore quota limit. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_WRITE_ATTEMPTS}).\n`
      );
      await sleep(delayMs);
    }
  }
}

function isRetryableWriteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|Quota exceeded|Total timeout|Deadline exceeded/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }

  return value;
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

  process.stdout.write("Firebase Admin credentials detected. Beginning Firestore import.\n");
  await seedFirestore(seed);
  process.stdout.write("Imported offline catalog into Firestore.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

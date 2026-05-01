import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { normalizeCachedRecipeCatalogDoc } from "../src/data/offline/recipeMetadata";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const PAGE_SIZE = 150;
const DRY_RUN = process.argv.includes("--dry-run");
const MAX_WRITE_ATTEMPTS = 6;
const BASE_RETRY_DELAY_MS = 5_000;
const WRITE_PACING_DELAY_MS = 250;

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = getAdminDb();
  const recipeStats = await backfillCollection({
    label: "recipes",
    getPage: async (cursor) => {
      let q = db.collection("recipes").orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      return q.get();
    }
  });

  const userStats = await backfillUserOfflineRecipeCaches();

  process.stdout.write(
    `Backfill complete. recipes updated=${recipeStats.updated}, recipes scanned=${recipeStats.scanned}, cache updated=${userStats.updated}, cache scanned=${userStats.scanned}, users=${userStats.users}\n`
  );
  if (DRY_RUN) {
    process.stdout.write("Dry run only. No Firestore writes were performed.\n");
  }
}

async function backfillUserOfflineRecipeCaches() {
  const db = getAdminDb();
  let userCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let scanned = 0;
  let updated = 0;
  let users = 0;

  while (true) {
    let q = db.collection("users").orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (userCursor) q = q.startAfter(userCursor);
    const userSnap = await q.get();
    if (userSnap.empty) break;

    for (const userDoc of userSnap.docs) {
      users += 1;
      const stats = await backfillCollection({
        label: `users/${userDoc.id}/offlineRecipeCache`,
        getPage: async (cursor) => {
          let cacheQuery = userDoc.ref.collection("offlineRecipeCache").orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
          if (cursor) cacheQuery = cacheQuery.startAfter(cursor);
          return cacheQuery.get();
        }
      });
      scanned += stats.scanned;
      updated += stats.updated;
    }

    userCursor = userSnap.docs[userSnap.docs.length - 1];
  }

  return { scanned, updated, users };
}

async function backfillCollection(input: {
  label: string;
  getPage: (cursor: FirebaseFirestore.QueryDocumentSnapshot | null) => Promise<FirebaseFirestore.QuerySnapshot>;
}) {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const snap = await input.getPage(cursor);
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      scanned += 1;
      const current = stripUndefinedDeep(docSnap.data() as RecipeCatalogDoc);
      const normalized = stripUndefinedDeep(normalizeRecipe(current));
      if (!isSameRecipeDoc(current, normalized)) {
        updated += 1;
        if (!DRY_RUN) {
          await setDocWithRetry(docSnap.ref, { ...normalized, updatedAt: Date.now() }, `${input.label}/${docSnap.id}`);
          await sleep(WRITE_PACING_DELAY_MS);
        }
      }
    }

    process.stdout.write(`${input.label}: scanned ${scanned}, updated ${updated}\n`);
    cursor = snap.docs[snap.docs.length - 1];
  }

  return { scanned, updated };
}

async function setDocWithRetry(
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData,
  label: string
) {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await ref.set(data);
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

function normalizeRecipe(recipe: RecipeCatalogDoc) {
  return normalizeCachedRecipeCatalogDoc(recipe);
}

function isSameRecipeDoc(left: RecipeCatalogDoc, right: RecipeCatalogDoc) {
  return stableStringify(left) === stableStringify(right);
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

function stableStringify(value: unknown) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeysDeep(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => [key, sortKeysDeep(entry)])
    );
  }

  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

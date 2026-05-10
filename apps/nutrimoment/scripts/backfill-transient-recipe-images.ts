import { randomUUID } from "node:crypto";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { isTransientRecipeImageUrl } from "../src/lib/recipeImageDurability";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const RECIPE_PHOTO_CACHE_COLLECTION = "recipePhotoCache";
const DEFAULT_USER_BATCH_SIZE = 25;
const DEFAULT_CONCURRENCY = 4;
const STORAGE_PREFIX = "recipe-photo-cache/backfill";

type UnknownRecord = Record<string, unknown>;

type BackfillResult =
  | { status: "durable"; imageUrl: string }
  | { status: "expired"; httpStatus?: number; reason: string };

interface Stats {
  cacheDocsDeleted: number;
  cacheDocsScanned: number;
  cacheDocsUpdated: number;
  currentPlansScanned: number;
  currentPlansUpdated: number;
  expiredImages: number;
  failedImages: number;
  historyDocsScanned: number;
  historyDocsUpdated: number;
  rescuedImages: number;
  transientImages: number;
  usersScanned: number;
}

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = !hasFlag("--confirm");
  const userLimit = readNumberArg("--user-limit");
  const userBatchSize = readNumberArg("--batch-size") ?? DEFAULT_USER_BATCH_SIZE;
  const concurrency = readNumberArg("--concurrency") ?? DEFAULT_CONCURRENCY;
  const includeCache = !hasFlag("--skip-cache");
  const includeHistory = !hasFlag("--skip-history");
  const includePlans = !hasFlag("--skip-plans");
  const clearExpired = hasFlag("--clear-expired") || hasFlag("--confirm");

  const stats: Stats = {
    cacheDocsDeleted: 0,
    cacheDocsScanned: 0,
    cacheDocsUpdated: 0,
    currentPlansScanned: 0,
    currentPlansUpdated: 0,
    expiredImages: 0,
    failedImages: 0,
    historyDocsScanned: 0,
    historyDocsUpdated: 0,
    rescuedImages: 0,
    transientImages: 0,
    usersScanned: 0
  };
  const imageResultCache = new Map<string, Promise<BackfillResult>>();

  process.stdout.write(
    `${dryRun ? "Dry run" : "Backfill"} transient recipe images.\n` +
      `Mode: ${dryRun ? "no writes" : clearExpired ? "rescue live URLs and clear expired URLs" : "rescue live URLs only"}\n` +
      `Scopes: cache=${includeCache}, history=${includeHistory}, currentPlans=${includePlans}\n` +
      `User batch size: ${userBatchSize}, concurrency: ${concurrency}\n\n`
  );

  if (includeCache) {
    await backfillRecipePhotoCache({ clearExpired, dryRun, imageResultCache, stats });
  }

  if (includeHistory || includePlans) {
    await backfillUserDocs({
      clearExpired,
      concurrency,
      dryRun,
      imageResultCache,
      includeHistory,
      includePlans,
      stats,
      userBatchSize,
      userLimit
    });
  }

  printStats(stats, dryRun);
}

async function backfillRecipePhotoCache(input: {
  clearExpired: boolean;
  dryRun: boolean;
  imageResultCache: Map<string, Promise<BackfillResult>>;
  stats: Stats;
}) {
  const db = getAdminDb();
  const snapshot = await db.collection(RECIPE_PHOTO_CACHE_COLLECTION).get();
  input.stats.cacheDocsScanned = snapshot.size;

  for (const docs of chunkArray(snapshot.docs, 200)) {
    const batch = db.batch();
    let writes = 0;

    await Promise.all(
      docs.map(async (docSnap) => {
        const data = docSnap.data();
        const imageUrl = readString(data.imageUrl);
        if (!isTransientRecipeImageUrl(imageUrl)) return;

        input.stats.transientImages += 1;
        const result = await getBackfillResult(imageUrl, docSnap.id, input.imageResultCache, input.stats, input.dryRun);
        if (result.status === "durable") {
          input.stats.cacheDocsUpdated += 1;
          if (!input.dryRun) {
            batch.set(docSnap.ref, { imageUrl: result.imageUrl, updatedAt: new Date().toISOString() }, { merge: true });
            writes += 1;
          }
          return;
        }

        if (input.clearExpired) {
          input.stats.cacheDocsDeleted += 1;
          if (!input.dryRun) {
            batch.delete(docSnap.ref);
            writes += 1;
          }
        }
      })
    );

    if (writes > 0) {
      await batch.commit();
    }
  }
}

async function backfillUserDocs(input: {
  clearExpired: boolean;
  concurrency: number;
  dryRun: boolean;
  imageResultCache: Map<string, Promise<BackfillResult>>;
  includeHistory: boolean;
  includePlans: boolean;
  stats: Stats;
  userBatchSize: number;
  userLimit?: number;
}) {
  const db = getAdminDb();
  let lastUserId: string | null = null;

  while (true) {
    let usersQuery = db.collection("users").orderBy(FieldPath.documentId()).limit(input.userBatchSize);
    if (lastUserId) usersQuery = usersQuery.startAfter(lastUserId);

    const usersSnapshot = await usersQuery.get();
    if (usersSnapshot.empty) break;

    await runWithConcurrency(usersSnapshot.docs, input.concurrency, async (userDoc) => {
      if (input.userLimit != null && input.stats.usersScanned >= input.userLimit) return;
      input.stats.usersScanned += 1;
      lastUserId = userDoc.id;

      if (input.includeHistory) {
        await backfillUserHistory(userDoc.ref, input);
      }
      if (input.includePlans) {
        await backfillCurrentPlan(userDoc.ref, input);
      }
    });

    if (input.userLimit != null && input.stats.usersScanned >= input.userLimit) break;
  }
}

async function backfillUserHistory(
  userRef: FirebaseFirestore.DocumentReference,
  input: {
    clearExpired: boolean;
    dryRun: boolean;
    imageResultCache: Map<string, Promise<BackfillResult>>;
    stats: Stats;
  }
) {
  const snapshot = await userRef.collection("history").get();
  input.stats.historyDocsScanned += snapshot.size;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const recipes = Array.isArray(data.recipes) ? data.recipes : [];
    if (!recipes.length) continue;

    let changed = false;
    const nextRecipes = await Promise.all(
      recipes.map(async (recipe, index) => {
        if (!isRecord(recipe)) return recipe;
        const imageUrl = readString(recipe.image_url);
        if (!isTransientRecipeImageUrl(imageUrl)) return recipe;

        input.stats.transientImages += 1;
        const result = await getBackfillResult(
          imageUrl,
          `${docSnap.id}-recipe-${index}`,
          input.imageResultCache,
          input.stats,
          input.dryRun
        );
        if (result.status === "durable") {
          changed = true;
          return { ...recipe, image_url: result.imageUrl, image_loading: false, image_error: false };
        }

        if (!input.clearExpired) return recipe;
        changed = true;
        return clearRecipeImageFields(recipe);
      })
    );

    if (!changed) continue;
    input.stats.historyDocsUpdated += 1;
    if (!input.dryRun) {
      await docSnap.ref.set({ recipes: nextRecipes }, { merge: true });
    }
  }
}

async function backfillCurrentPlan(
  userRef: FirebaseFirestore.DocumentReference,
  input: {
    clearExpired: boolean;
    dryRun: boolean;
    imageResultCache: Map<string, Promise<BackfillResult>>;
    stats: Stats;
  }
) {
  const docSnap = await userRef.collection("plans").doc("currentWeekly").get();
  if (!docSnap.exists) return;

  input.stats.currentPlansScanned += 1;
  const data = docSnap.data() as UnknownRecord | undefined;
  const mealPlan = isRecord(data?.mealPlan) ? data.mealPlan : null;
  const plan = Array.isArray(mealPlan?.plan) ? mealPlan.plan : [];
  if (!plan.length) return;

  let changed = false;
  const nextPlan = await Promise.all(
    plan.map(async (day, dayIndex) => {
      if (!isRecord(day)) return day;
      const nextDay: UnknownRecord = { ...day };
      for (const mealType of ["breakfast", "lunch", "dinner"] as const) {
        const meal = nextDay[mealType];
        if (!isRecord(meal)) continue;

        const imageUrl = readString(meal.image_url);
        if (!isTransientRecipeImageUrl(imageUrl)) continue;

        input.stats.transientImages += 1;
        const result = await getBackfillResult(
          imageUrl,
          `${docSnap.id}-${dayIndex}-${mealType}`,
          input.imageResultCache,
          input.stats,
          input.dryRun
        );
        if (result.status === "durable") {
          changed = true;
          nextDay[mealType] = { ...meal, image_url: result.imageUrl };
        } else if (input.clearExpired) {
          changed = true;
          nextDay[mealType] = clearRecipeImageFields(meal);
        }
      }
      return nextDay;
    })
  );

  if (!changed) return;
  input.stats.currentPlansUpdated += 1;
  if (!input.dryRun) {
    await docSnap.ref.set({ mealPlan: { ...mealPlan, plan: nextPlan } }, { merge: true });
  }
}

function getBackfillResult(
  imageUrl: string,
  storageHint: string,
  cache: Map<string, Promise<BackfillResult>>,
  stats: Stats,
  dryRun: boolean
) {
  const existing = cache.get(imageUrl);
  if (existing) return existing;

  const task = rescueTransientImage(imageUrl, storageHint, stats, dryRun);
  cache.set(imageUrl, task);
  return task;
}

async function rescueTransientImage(
  imageUrl: string,
  storageHint: string,
  stats: Stats,
  dryRun: boolean
): Promise<BackfillResult> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      stats.expiredImages += 1;
      return { status: "expired", httpStatus: response.status, reason: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      stats.failedImages += 1;
      return { status: "expired", reason: `Unexpected content-type ${contentType}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (dryRun) {
      stats.rescuedImages += 1;
      return { status: "durable", imageUrl };
    }

    const durableUrl = await uploadBackfilledImage(storageHint, buffer, contentType);
    stats.rescuedImages += 1;
    return { status: "durable", imageUrl: durableUrl };
  } catch (error) {
    stats.failedImages += 1;
    return { status: "expired", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function uploadBackfilledImage(storageHint: string, buffer: Buffer, contentType: string) {
  const bucket = getAdminStorageBucket();
  const extension = getImageExtension(contentType);
  const objectPath = `${STORAGE_PREFIX}/${slugify(storageHint) || "image"}-${randomUUID()}.${extension}`;
  const token = randomUUID();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: { firebaseStorageDownloadTokens: token }
    },
    resumable: false
  });

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(
    objectPath
  )}?alt=media&token=${encodeURIComponent(token)}`;
}

function clearRecipeImageFields<T extends UnknownRecord>(value: T) {
  const next: UnknownRecord = { ...value };
  delete next.image_url;
  delete next.image_source;
  delete next.image_attribution_name;
  delete next.image_attribution_url;
  next.image_loading = false;
  next.image_error = false;
  return next;
}

function getImageExtension(contentType: string) {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

function printStats(stats: Stats, dryRun: boolean) {
  process.stdout.write(
    `\n${dryRun ? "Dry run complete" : "Backfill complete"}.\n` +
      `Users scanned: ${stats.usersScanned}\n` +
      `History docs scanned/updated: ${stats.historyDocsScanned}/${stats.historyDocsUpdated}\n` +
      `Current plans scanned/updated: ${stats.currentPlansScanned}/${stats.currentPlansUpdated}\n` +
      `Photo cache docs scanned/updated/deleted: ${stats.cacheDocsScanned}/${stats.cacheDocsUpdated}/${stats.cacheDocsDeleted}\n` +
      `Transient image references found: ${stats.transientImages}\n` +
      `${dryRun ? "Images that can be rescued" : "Images rescued to Firebase Storage"}: ${stats.rescuedImages}\n` +
      `Expired image references: ${stats.expiredImages}\n` +
      `Failed image checks: ${stats.failedImages}\n` +
      (dryRun ? `\nNo writes made. Re-run with --confirm to apply updates and clear expired references.\n` : "")
  );
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const workerCount = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) return;
        await worker(item);
      }
    })
  );
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readStringArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function readNumberArg(flag: string) {
  const value = readStringArg(flag);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

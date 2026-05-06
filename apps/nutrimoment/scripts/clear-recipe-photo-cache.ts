import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "recipePhotoCache";
const STORAGE_PREFIX = "recipe-photo-cache/";
const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 450;
const STORAGE_DELETE_CONCURRENCY = 25;

type StorageFile = {
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
};

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = hasFlag("--dry-run");
  const confirmed = hasFlag("--confirm");
  const batchSize = Math.min(readNumberArg("--batch-size") ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);

  if (!dryRun && !confirmed) {
    throw new Error(
      `Refusing to delete ${COLLECTION_NAME} and ${STORAGE_PREFIX} without --confirm. Run with --dry-run first, then rerun with --confirm.`
    );
  }

  const db = getAdminDb();
  const [countSnapshot, storageFiles] = await Promise.all([
    db.collection(COLLECTION_NAME).count().get(),
    listStorageCacheFiles()
  ]);
  const totalDocs = countSnapshot.data().count;

  process.stdout.write(
    `${dryRun ? "Dry run" : "Clear"} recipe photo cache.\n` +
      `Firestore collection: ${COLLECTION_NAME} (${totalDocs} docs)\n` +
      `Storage prefix: ${STORAGE_PREFIX} (${storageFiles.length} files)\n` +
      `Batch size: ${batchSize}\n`
  );

  if (dryRun) {
    process.stdout.write("No cache entries deleted. Re-run with --confirm to start fresh.\n");
    return;
  }

  const deletedDocs = await deleteCollectionDocs(batchSize);
  const deletedFiles = await deleteStorageFiles(storageFiles);

  process.stdout.write(
    `Recipe photo cache clear complete. Deleted ${deletedDocs} Firestore docs and ${deletedFiles} Storage files.\n`
  );
}

async function listStorageCacheFiles() {
  try {
    const bucket = getAdminStorageBucket();
    const [files] = await bucket.getFiles({ autoPaginate: true, prefix: STORAGE_PREFIX });
    return files as StorageFile[];
  } catch (error) {
    process.stdout.write(
      `Storage cache listing skipped: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return [];
  }
}

async function deleteCollectionDocs(batchSize: number) {
  const db = getAdminDb();
  let deletedCount = 0;

  while (true) {
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .orderBy(FieldPath.documentId())
      .limit(batchSize)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();

    deletedCount += snapshot.docs.length;
    process.stdout.write(`Deleted ${deletedCount} Firestore cache docs...\n`);
  }

  return deletedCount;
}

async function deleteStorageFiles(files: StorageFile[]) {
  let deletedCount = 0;

  for (let index = 0; index < files.length; index += STORAGE_DELETE_CONCURRENCY) {
    const chunk = files.slice(index, index + STORAGE_DELETE_CONCURRENCY);
    await Promise.all(
      chunk.map(async (file) => {
        await file.delete({ ignoreNotFound: true });
        deletedCount += 1;
      })
    );
    process.stdout.write(`Deleted ${deletedCount}/${files.length} Storage cache files...\n`);
  }

  return deletedCount;
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

import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "sharedOfflineRecipeCache";
const DEFAULT_BATCH_SIZE = 100;
const MAX_DELETE_BATCH_SIZE = 400;

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = hasFlag("--dry-run");
  const confirmed = hasFlag("--confirm");
  const batchSize = Math.min(readNumberArg("--batch-size") ?? DEFAULT_BATCH_SIZE, MAX_DELETE_BATCH_SIZE);

  if (!dryRun && !confirmed) {
    throw new Error(
      "Refusing to delete sharedOfflineRecipeCache without --confirm. Use --dry-run first, then rerun with --confirm."
    );
  }

  const db = getAdminDb();
  const countSnapshot = await db.collection(COLLECTION_NAME).count().get();
  const totalCount = countSnapshot.data().count;

  process.stdout.write(
    `${dryRun ? "Dry run" : "Delete"} for ${COLLECTION_NAME}.\n` +
      `Documents currently in collection: ${totalCount}\n` +
      `Batch size: ${batchSize}\n`
  );

  if (dryRun || totalCount === 0) {
    process.stdout.write(
      dryRun
        ? `No documents deleted. Re-run with --confirm to remove ${totalCount} documents.\n`
        : "Collection is already empty.\n"
    );
    return;
  }

  let deletedCount = 0;

  while (true) {
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .orderBy(FieldPath.documentId())
      .limit(batchSize)
      .get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();

    deletedCount += snapshot.docs.length;
    process.stdout.write(`Deleted ${deletedCount}/${totalCount} documents from ${COLLECTION_NAME}.\n`);
  }

  process.stdout.write(`Deletion complete. Total deleted from ${COLLECTION_NAME}: ${deletedCount}\n`);
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

import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_USER_BATCH_SIZE = 25;
const DELETE_BATCH_SIZE = 400;

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = hasFlag("--dry-run");
  const historyLimit = readNumberArg("--history-limit") ?? DEFAULT_HISTORY_LIMIT;
  const userBatchSize = readNumberArg("--batch-size") ?? DEFAULT_USER_BATCH_SIZE;
  const userLimit = readNumberArg("--user-limit");

  const db = getAdminDb();
  let scannedUsers = 0;
  let prunedUsers = 0;
  let deletedEntries = 0;
  let failedUsers = 0;
  let lastUserId: string | null = null;

  process.stdout.write(
    `Starting history prune${dryRun ? " (dry run)" : ""} with limit ${historyLimit} and user batch size ${userBatchSize}.\n`
  );

  while (true) {
    let usersQuery = db.collection("users").orderBy(FieldPath.documentId()).limit(userBatchSize);
    if (lastUserId) {
      usersQuery = usersQuery.startAfter(lastUserId);
    }

    const usersSnapshot = await usersQuery.get();
    if (usersSnapshot.empty) {
      break;
    }

    for (const userDoc of usersSnapshot.docs) {
      if (userLimit != null && scannedUsers >= userLimit) {
        break;
      }

      scannedUsers += 1;
      lastUserId = userDoc.id;

      try {
        const historyDocs = await loadHistoryDocsSorted(userDoc.ref);
        const overflowDocs = historyDocs.slice(historyLimit);

        if (!overflowDocs.length) {
          continue;
        }

        prunedUsers += 1;
        deletedEntries += overflowDocs.length;

        if (!dryRun) {
          for (const docs of chunkArray(overflowDocs, DELETE_BATCH_SIZE)) {
            const batch = db.batch();
            docs.forEach((docSnap) => batch.delete(docSnap.ref));
            await batch.commit();
          }
        }

        process.stdout.write(
          `${dryRun ? "Would prune" : "Pruned"} user ${userDoc.id}: kept ${historyLimit}, removed ${overflowDocs.length}.\n`
        );
      } catch (error) {
        failedUsers += 1;
        process.stdout.write(
          `Failed user ${userDoc.id}: ${error instanceof Error ? error.message : String(error)}\n`
        );
      }
    }

    if (userLimit != null && scannedUsers >= userLimit) {
      break;
    }
  }

  process.stdout.write(
    `${dryRun ? "Dry run complete" : "History prune complete"}.\n` +
      `Users scanned: ${scannedUsers}\n` +
      `${dryRun ? "Users that would be pruned" : "Users pruned"}: ${prunedUsers}\n` +
      `${dryRun ? "Entries that would be deleted" : "Entries deleted"}: ${deletedEntries}\n` +
      `Users failed: ${failedUsers}\n`
  );
}

async function loadHistoryDocsSorted(userRef: FirebaseFirestore.DocumentReference) {
  const historyRef = userRef.collection("history");

  try {
    const snapshot = await historyRef.orderBy("createdAt", "desc").get();
    if (snapshot.empty) {
      return [];
    }

    if (snapshot.docs.every((docSnap) => Boolean(docSnap.get("createdAt")))) {
      return snapshot.docs;
    }
  } catch {
    // Fall through to timestamp-based sorting.
  }

  const fallbackSnapshot = await historyRef.get();
  return fallbackSnapshot.docs.sort((left, right) => {
    return compareHistoryDocsDesc(left, right);
  });
}

function compareHistoryDocsDesc(
  left: FirebaseFirestore.QueryDocumentSnapshot,
  right: FirebaseFirestore.QueryDocumentSnapshot
) {
  const leftValue = getHistorySortValue(left);
  const rightValue = getHistorySortValue(right);

  if (leftValue > rightValue) return -1;
  if (leftValue < rightValue) return 1;
  return right.id.localeCompare(left.id);
}

function getHistorySortValue(docSnap: FirebaseFirestore.QueryDocumentSnapshot) {
  const createdAt = docSnap.get("createdAt");
  if (createdAt && typeof createdAt.toMillis === "function") {
    return createdAt.toMillis();
  }

  const timestamp = docSnap.get("timestamp");
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

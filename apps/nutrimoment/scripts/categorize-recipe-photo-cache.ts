import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import {
  buildRecipePhotoCacheCategoryFields,
  normalizeRecipePhotoCacheLookupKey
} from "../src/lib/sharedRecipePhotoCache";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "recipePhotoCache";
const WRITE_BATCH_SIZE = 400;

interface Stats {
  scanned: number;
  skipped: number;
  updated: number;
}

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = !hasFlag("--confirm");
  const force = hasFlag("--force");
  const limit = readNumberArg("--limit");
  const source = readStringArg("--source") ?? "generated";
  const stats: Stats = { scanned: 0, skipped: 0, updated: 0 };

  process.stdout.write(
    `${dryRun ? "Dry run" : "Backfill"} recipe photo cache categories.\n` +
      `Collection: ${COLLECTION_NAME}\n` +
      `Source filter: ${source === "all" ? "all docs" : source}\n` +
      `Mode: ${force ? "force refresh" : "missing category fields only"}\n\n`
  );

  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COLLECTION_NAME);
  if (source !== "all") {
    query = query.where("source", "==", source);
  }
  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();
  stats.scanned = snapshot.size;

  for (const docs of chunkArray(snapshot.docs, WRITE_BATCH_SIZE)) {
    const batch = db.batch();
    let writes = 0;

    for (const docSnap of docs) {
      const data = docSnap.data();
      const queryText = readString(data.query);
      const signature = readString(data.signature) || docSnap.id;
      if (!queryText && !signature) {
        stats.skipped += 1;
        continue;
      }
      if (!force && data.categoryVersion === 2 && data.queryKey && data.signatureKey) {
        stats.skipped += 1;
        continue;
      }

      const categoryFields = buildRecipePhotoCacheCategoryFields({
        query: queryText,
        signature
      });
      stats.updated += 1;
      writes += 1;

      if (!dryRun) {
        batch.set(
          docSnap.ref,
          {
            queryKey: normalizeRecipePhotoCacheLookupKey(queryText),
            signature,
            signatureKey: normalizeRecipePhotoCacheLookupKey(signature),
            ...categoryFields,
            categorizedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    }

    if (!dryRun && writes) {
      await batch.commit();
    }
  }

  process.stdout.write(
    `Done.\n` +
      `Scanned: ${stats.scanned}\n` +
      `${dryRun ? "Would update" : "Updated"}: ${stats.updated}\n` +
      `Skipped: ${stats.skipped}\n`
  );
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readStringArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readNumberArg(name: string) {
  const value = readStringArg(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

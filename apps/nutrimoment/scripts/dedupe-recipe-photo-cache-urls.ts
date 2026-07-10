import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "recipePhotoCache";
const DELETE_BATCH_SIZE = 400;

interface CacheDoc {
  categoryVersion?: unknown;
  docId: string;
  imageUrl: string;
  query?: unknown;
  queryKey?: unknown;
  queryMainIngredientKey?: unknown;
  ref: FirebaseFirestore.DocumentReference;
  signature?: unknown;
  signatureKey?: unknown;
  source?: unknown;
  updatedAt?: unknown;
}

interface Stats {
  duplicateGroups: number;
  duplicateDocsToDelete: number;
  missingImageUrl: number;
  scanned: number;
  uniqueImageUrls: number;
}

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = !hasFlag("--confirm");
  const limit = readNumberArg("--limit");
  const source = readStringArg("--source") ?? "all";
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COLLECTION_NAME);
  if (source !== "all") {
    query = query.where("source", "==", source);
  }
  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  process.stdout.write(
    `${dryRun ? "Dry run" : "Delete"} duplicate recipe photo cache image URLs.\n` +
      `Collection: ${COLLECTION_NAME}\n` +
      `Source filter: ${source}\n\n`
  );

  const snapshot = await query.get();
  const groups = new Map<string, CacheDoc[]>();
  const stats: Stats = {
    duplicateGroups: 0,
    duplicateDocsToDelete: 0,
    missingImageUrl: 0,
    scanned: snapshot.size,
    uniqueImageUrls: 0
  };

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const imageUrl = readString(data.imageUrl);
    if (!imageUrl) {
      stats.missingImageUrl += 1;
      continue;
    }

    const docs = groups.get(imageUrl) ?? [];
    docs.push({
      categoryVersion: data.categoryVersion,
      docId: docSnap.id,
      imageUrl,
      query: data.query,
      queryKey: data.queryKey,
      queryMainIngredientKey: data.queryMainIngredientKey,
      ref: docSnap.ref,
      signature: data.signature,
      signatureKey: data.signatureKey,
      source: data.source,
      updatedAt: data.updatedAt
    });
    groups.set(imageUrl, docs);
  }

  stats.uniqueImageUrls = groups.size;
  const docsToDelete: CacheDoc[] = [];
  const keptExamples: Array<{ deleteCount: number; imageUrlHost: string; keptDocId: string }> = [];

  for (const [imageUrl, docs] of groups.entries()) {
    if (docs.length <= 1) continue;
    stats.duplicateGroups += 1;
    const [keep, ...duplicates] = [...docs].sort(compareCacheDocsToKeep);
    docsToDelete.push(...duplicates);
    if (keptExamples.length < 8) {
      keptExamples.push({
        deleteCount: duplicates.length,
        imageUrlHost: safeImageUrlHost(imageUrl),
        keptDocId: keep.docId
      });
    }
  }

  stats.duplicateDocsToDelete = docsToDelete.length;

  if (!dryRun && docsToDelete.length) {
    for (const docs of chunkArray(docsToDelete, DELETE_BATCH_SIZE)) {
      const batch = db.batch();
      docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  const afterCount = dryRun
    ? stats.scanned
    : (await query.get()).size;
  const afterUniqueImageUrls = dryRun
    ? stats.uniqueImageUrls
    : await countUniqueImageUrls(query);

  process.stdout.write(
    `Done.\n` +
      `Scanned docs: ${stats.scanned}\n` +
      `Docs without imageUrl: ${stats.missingImageUrl}\n` +
      `Unique image URLs before: ${stats.uniqueImageUrls}\n` +
      `Duplicate URL groups: ${stats.duplicateGroups}\n` +
      `${dryRun ? "Would delete" : "Deleted"} duplicate docs: ${stats.duplicateDocsToDelete}\n` +
      `Docs after: ${afterCount}\n` +
      `Unique image URLs after: ${afterUniqueImageUrls}\n` +
      `Examples: ${JSON.stringify(keptExamples, null, 2)}\n`
  );
}

function compareCacheDocsToKeep(left: CacheDoc, right: CacheDoc) {
  return scoreCacheDoc(right) - scoreCacheDoc(left) || left.docId.localeCompare(right.docId);
}

function scoreCacheDoc(doc: CacheDoc) {
  let score = 0;
  if (doc.source === "generated") score += 100;
  if (doc.categoryVersion === 2) score += 20;
  if (readString(doc.queryMainIngredientKey)) score += 10;
  if (readString(doc.queryKey)) score += 8;
  if (readString(doc.signatureKey)) score += 8;
  if (readString(doc.query)) score += 5;
  if (readString(doc.signature) === doc.docId) score += 4;
  if (doc.docId.startsWith("generated:")) score += 3;
  if (!doc.docId.startsWith("exact:")) score += 1;
  return score;
}

async function countUniqueImageUrls(query: FirebaseFirestore.Query) {
  const snapshot = await query.get();
  const unique = new Set<string>();
  for (const docSnap of snapshot.docs) {
    const imageUrl = readString(docSnap.data().imageUrl);
    if (imageUrl) unique.add(imageUrl);
  }
  return unique.size;
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

function safeImageUrlHost(imageUrl: string) {
  try {
    return new URL(imageUrl).host;
  } catch {
    return "invalid";
  }
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

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
const DEFAULT_SEARCH_LIMIT = 1000;
const DEFAULT_SEARCH_TOP = 20;

interface CacheSearchDoc {
  categoryPath: string;
  cuisineKey: string;
  docId: string;
  familyKey: string;
  imageUrl: string;
  mainIngredientKey: string;
  query: string;
  signature: string;
  source: string;
  text: string;
}

interface SearchMatch {
  doc: CacheSearchDoc;
  matchedFields: string[];
  score: number;
}

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
  const searchText = readSearchText();
  const source = readStringArg("--source") ?? (searchText ? "all" : "generated");

  if (searchText) {
    await searchRecipePhotoCache({
      limit: limit ?? DEFAULT_SEARCH_LIMIT,
      searchText,
      source,
      top: readNumberArg("--top") ?? DEFAULT_SEARCH_TOP
    });
    return;
  }

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

async function searchRecipePhotoCache(input: {
  limit: number;
  searchText: string;
  source: string;
  top: number;
}) {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COLLECTION_NAME);
  if (input.source !== "all") {
    query = query.where("source", "==", input.source);
  }
  if (input.limit > 0) {
    query = query.limit(input.limit);
  }

  process.stdout.write(
    `Search recipe photo cache.\n` +
      `Collection: ${COLLECTION_NAME}\n` +
      `Words: ${input.searchText}\n` +
      `Source filter: ${input.source === "all" ? "all docs" : input.source}\n` +
      `Scan limit: ${input.limit > 0 ? input.limit : "all matched docs"}\n` +
      `Showing top: ${input.top}\n\n`
  );

  const snapshot = await query.get();
  const searchTokens = tokenize(input.searchText);
  const searchPhrase = normalizeSearchText(input.searchText);
  const matches = snapshot.docs
    .map((docSnap) => {
      const doc = toCacheSearchDoc(docSnap.id, docSnap.data());
      return {
        doc,
        ...scoreCacheSearchDoc(doc, searchPhrase, searchTokens)
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.doc.docId.localeCompare(right.doc.docId))
    .slice(0, Math.max(1, input.top));

  if (!matches.length) {
    process.stdout.write(`No similar recipe photo cache docs found in ${snapshot.size} scanned docs.\n`);
    return;
  }

  process.stdout.write(`Scanned: ${snapshot.size}\nMatches: ${matches.length}\n\n`);
  matches.forEach((match, index) => {
    process.stdout.write(formatSearchMatch(match, index + 1));
  });
}

function toCacheSearchDoc(docId: string, data: FirebaseFirestore.DocumentData): CacheSearchDoc {
  const source = readString(data.source);
  const queryText = readString(data.query);
  const signature = readString(data.signature) || docId;
  const mainIngredientKey = readString(data.mainIngredientKey || data.queryMainIngredientKey);
  const familyKey = readString(data.familyKey || data.queryFamilyKey);
  const cuisineKey = readString(data.cuisineKey || data.queryCuisineKey);
  const categoryPath = readString(data.categoryPath);
  const coreTokenKeys = Array.isArray(data.coreTokenKeys)
    ? data.coreTokenKeys.filter((value): value is string => typeof value === "string")
    : [];
  const text = [
    docId,
    queryText,
    signature,
    data.queryKey,
    data.signatureKey,
    data.canonicalDishKey,
    data.queryCanonicalDishKey,
    mainIngredientKey,
    familyKey,
    cuisineKey,
    categoryPath,
    ...coreTokenKeys
  ]
    .map(readString)
    .filter(Boolean)
    .join(" ");

  return {
    categoryPath,
    cuisineKey,
    docId,
    familyKey,
    imageUrl: readString(data.imageUrl),
    mainIngredientKey,
    query: queryText,
    signature,
    source,
    text
  };
}

function scoreCacheSearchDoc(doc: CacheSearchDoc, searchPhrase: string, searchTokens: string[]) {
  const matchedFields: string[] = [];
  const normalizedFields = [
    { name: "query", text: normalizeSearchText(doc.query), weight: 6 },
    { name: "signature", text: normalizeSearchText(doc.signature), weight: 5 },
    { name: "docId", text: normalizeSearchText(doc.docId), weight: 4 },
    { name: "mainIngredientKey", text: normalizeSearchText(doc.mainIngredientKey), weight: 5 },
    { name: "familyKey", text: normalizeSearchText(doc.familyKey), weight: 4 },
    { name: "cuisineKey", text: normalizeSearchText(doc.cuisineKey), weight: 2 },
    { name: "categoryPath", text: normalizeSearchText(doc.categoryPath), weight: 3 },
    { name: "allText", text: normalizeSearchText(doc.text), weight: 1 }
  ].filter((field) => field.text);

  let score = 0;
  for (const field of normalizedFields) {
    if (searchPhrase && field.text.includes(searchPhrase)) {
      score += 50 * field.weight;
      matchedFields.push(field.name);
      continue;
    }

    const fieldTokens = tokenize(field.text);
    const tokenScore = scoreTokenSimilarity(searchTokens, fieldTokens);
    if (tokenScore > 0) {
      score += tokenScore * field.weight;
      matchedFields.push(field.name);
    }
  }

  return {
    matchedFields: Array.from(new Set(matchedFields)),
    score
  };
}

function scoreTokenSimilarity(searchTokens: string[], fieldTokens: string[]) {
  if (!searchTokens.length || !fieldTokens.length) return 0;
  const fieldTokenSet = new Set(fieldTokens);
  let exactMatches = 0;
  let partialMatches = 0;

  for (const token of searchTokens) {
    if (fieldTokenSet.has(token)) {
      exactMatches += 1;
      continue;
    }
    if (token.length >= 4 && fieldTokens.some((fieldToken) => fieldToken.includes(token) || token.includes(fieldToken))) {
      partialMatches += 1;
    }
  }

  const coverage = (exactMatches + partialMatches * 0.5) / searchTokens.length;
  return exactMatches * 12 + partialMatches * 4 + coverage * 20;
}

function formatSearchMatch(match: SearchMatch, index: number) {
  const doc = match.doc;
  return (
    `${index}. score=${Math.round(match.score)} source=${doc.source || "unknown"} doc=${doc.docId}\n` +
    `   query: ${doc.query || "(empty)"}\n` +
    `   signature: ${doc.signature || "(empty)"}\n` +
    `   category: ${doc.categoryPath || "(uncategorized)"}\n` +
    `   keys: main=${doc.mainIngredientKey || "-"} family=${doc.familyKey || "-"} cuisine=${doc.cuisineKey || "-"}\n` +
    `   imageHost: ${safeImageUrlHost(doc.imageUrl)}\n` +
    `   imageUrl: ${doc.imageUrl || "(missing)"}\n` +
    `   matched: ${match.matchedFields.join(", ")}\n\n`
  );
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return Array.from(new Set(normalizeSearchText(value).split(" ").filter((token) => token.length >= 2)));
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readStringArg(name: string) {
  const equalsArg = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readSearchText() {
  return readStringArg("--search") ?? readStringArg("--words") ?? readStringArg("--filter");
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

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket, hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import { isDurableRecipeImageUrl, isTransientRecipeImageUrl } from "@/lib/recipeImageDurability";

export interface SharedRecipePhotoEntry {
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageUrl: string;
  model?: string;
  query: string;
  signature: string;
  source: "generated" | "google_search" | "pexels_search" | "unsplash_search" | "wikimedia";
}

const COLLECTION_NAME = "recipePhotoCache";
const CATEGORY_VERSION = 2;
const APPROXIMATE_CATEGORY_SCAN_LIMIT = 500;
const SHARED_RECIPE_PHOTO_SOURCES = new Set<SharedRecipePhotoEntry["source"]>([
  "generated",
  "google_search",
  "pexels_search",
  "unsplash_search",
  "wikimedia"
]);

export async function getSharedRecipePhoto(signature: string): Promise<SharedRecipePhotoEntry | null> {
  if (!hasFirebaseAdminConfig()) return null;

  const snapshot = await getAdminDb().collection(COLLECTION_NAME).doc(signature).get();
  if (!snapshot.exists) return null;

  return mapSharedRecipePhotoData(snapshot.data(), signature);
}

function mapSharedRecipePhotoData(data: FirebaseFirestore.DocumentData | undefined, fallbackSignature: string): SharedRecipePhotoEntry | null {
  if (!data?.imageUrl || !data?.source) return null;
  const source = normalizeSharedRecipePhotoSource(data.source);
  if (!source) {
    logger.info("Ignoring shared recipe photo cache entry with unsupported source", {
      signature: fallbackSignature,
      source: String(data.source)
    });
    return null;
  }
  if (!isDurableRecipeImageUrl(String(data.imageUrl))) {
    logger.warn("Ignoring transient shared recipe photo cache URL", {
      signature: fallbackSignature,
      source,
      imageUrlHost: safeImageUrlHost(String(data.imageUrl))
    });
    return null;
  }

  const signature = typeof data.signature === "string" && data.signature.trim()
    ? data.signature.trim()
    : fallbackSignature;

  return {
    imageAttributionName: typeof data.imageAttributionName === "string" ? data.imageAttributionName : undefined,
    imageAttributionUrl: typeof data.imageAttributionUrl === "string" ? data.imageAttributionUrl : undefined,
    imageUrl: String(data.imageUrl),
    model: typeof data.model === "string" ? data.model : undefined,
    query: typeof data.query === "string" ? data.query : "",
    signature,
    source
  };
}

export async function getSharedRecipePhotoBySignatures(signatures: string[]) {
  for (const signature of signatures) {
    const entry = await getSharedRecipePhoto(signature);
    if (entry) {
      return entry;
    }
  }

  return null;
}

export async function getSharedRecipePhotoByQueryOrSignature(input: {
  queries?: string[];
  signatures?: string[];
}) {
  if (!hasFirebaseAdminConfig()) return null;

  const signatures = normalizeCacheLookupCandidates(input.signatures ?? []);
  const queries = normalizeCacheLookupCandidates(input.queries ?? []);
  const db = getAdminDb();

  const directDocCandidates = Array.from(new Set([...signatures, ...queries])).slice(0, 40);
  for (const candidate of directDocCandidates) {
    const entry = await getSharedRecipePhoto(candidate);
    if (entry) return entry;
  }

  const signatureMatch = await getSharedGeneratedRecipePhotoByFieldValues("signature", signatures);
  if (signatureMatch) return signatureMatch;

  const queryMatch = await getSharedGeneratedRecipePhotoByFieldValues("query", queries);
  if (queryMatch) return queryMatch;

  const normalizedQueryMatch = await getSharedGeneratedRecipePhotoByFieldValues("queryKey", queries.map(normalizeRecipePhotoCacheLookupKey));
  if (normalizedQueryMatch) return normalizedQueryMatch;

  const normalizedSignatureMatch = await getSharedGeneratedRecipePhotoByFieldValues("signatureKey", signatures.map(normalizeRecipePhotoCacheLookupKey));
  if (normalizedSignatureMatch) return normalizedSignatureMatch;

  // Backward-compatible scan for very old docs whose query/signature
  // fields contain stray whitespace or casing differences and do not yet have
  // normalized lookup keys. Keep this bounded so a photo request never walks the
  // full collection.
  const snapshot = await db
    .collection(COLLECTION_NAME)
    .limit(250)
    .get()
    .catch((error) => {
      logger.warn("Shared recipe photo normalized lookup scan failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    });

  if (!snapshot) return null;

  const queryKeys = new Set(queries.map(normalizeRecipePhotoCacheLookupKey).filter(Boolean));
  const signatureKeys = new Set(signatures.map(normalizeRecipePhotoCacheLookupKey).filter(Boolean));
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const docKeys = [
      docSnap.id,
      data.query,
      data.signature,
      data.queryKey,
      data.signatureKey
    ]
      .filter((value): value is string => typeof value === "string")
      .map(normalizeRecipePhotoCacheLookupKey)
      .filter(Boolean);

    if (docKeys.some((key) => queryKeys.has(key) || signatureKeys.has(key))) {
      const entry = mapSharedRecipePhotoData(data, docSnap.id);
      if (entry) return entry;
    }
  }

  return null;
}

export async function getSharedRecipePhotoByExactAliases(aliases: string[]) {
  return getSharedRecipePhotoBySignatures(aliases);
}

export async function getSharedGeneratedRecipePhotoByQueries(queries: string[]) {
  if (!hasFirebaseAdminConfig()) return null;

  const normalizedQueries = Array.from(
    new Set(
      queries
        .flatMap((query) => {
          if (typeof query !== "string") return [];
          const trimmed = query.trim();
          return trimmed ? [trimmed, trimmed.toLowerCase()] : [];
        })
        .filter(Boolean)
    )
  ).slice(0, 20);
  if (!normalizedQueries.length) return null;

  const db = getAdminDb();
  for (let index = 0; index < normalizedQueries.length; index += 10) {
    const chunk = normalizedQueries.slice(index, index + 10);
    let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
    try {
      snapshot = await db
        .collection(COLLECTION_NAME)
        .where("query", "in", chunk)
        .limit(10)
        .get();
    } catch (error) {
      logger.warn("Shared generated recipe photo query lookup failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    for (const docSnap of snapshot.docs) {
      const entry = mapSharedRecipePhotoData(docSnap.data(), docSnap.id);
      if (entry) return entry;
    }
  }

  return null;
}

export async function getSharedGeneratedRecipePhotoByCategory(input: {
  allowProviderPhotos?: boolean;
  cuisineKeys?: Array<string | null | undefined>;
  excludeImageUrls?: string[];
  familyKeys?: Array<string | null | undefined>;
  ingredientTexts?: string[];
  mainIngredientKey: string;
  requestTexts?: string[];
}) {
  return getSharedRecipePhotoByApproximateCategory({
    ...input,
    mainIngredientKeys: [input.mainIngredientKey]
  });
}

export async function getSharedRecipePhotoByApproximateCategory(input: {
  allowProviderPhotos?: boolean;
  cuisineKeys?: Array<string | null | undefined>;
  excludeImageUrls?: string[];
  familyKeys?: Array<string | null | undefined>;
  ingredientTexts?: string[];
  mainIngredientKeys: Array<string | null | undefined>;
  requestTexts?: string[];
}) {
  if (!hasFirebaseAdminConfig()) return null;

  const mainIngredientKeys = Array.from(
    new Set(
      input.mainIngredientKeys
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 6);
  if (!mainIngredientKeys.length) return null;

  const excluded = new Set((input.excludeImageUrls ?? []).filter(Boolean));
  const familyKeys = new Set(
    (input.familyKeys ?? [])
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );
  const cuisineKeys = new Set(
    (input.cuisineKeys ?? [])
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );
  const requestKeys = new Set(
    (input.requestTexts ?? [])
      .map(normalizeRecipePhotoCacheLookupKey)
      .filter((value): value is string => Boolean(value))
  );
  const requestTokens = new Set(
    Array.from(requestKeys)
      .flatMap((value) => value.split(/\s+/g))
      .map(normalizeRecipePhotoCacheToken)
      .filter(isStrongRecipePhotoCacheToken)
  );
  const ingredientTokens = new Set(
    (input.ingredientTexts ?? [])
      .flatMap((value) => normalizeRecipePhotoCacheLookupKey(value).split(/\s+/g))
      .map(normalizeRecipePhotoCacheToken)
      .filter(isStrongRecipePhotoCacheToken)
  );
  const snapshots = await Promise.all(
    mainIngredientKeys.flatMap((mainIngredientKey) => [
      getRecipePhotoCacheCategorySnapshot("mainIngredientKey", mainIngredientKey),
      getRecipePhotoCacheCategorySnapshot("queryMainIngredientKey", mainIngredientKey)
    ])
  );
  const docsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();
  snapshots.forEach((snapshot) => {
    snapshot?.docs.forEach((docSnap) => docsById.set(docSnap.id, docSnap));
  });
  if (docsById.size < 40) {
    const scanSnapshot = await getRecipePhotoCacheApproximateScanSnapshot();
    scanSnapshot?.docs.forEach((docSnap) => docsById.set(docSnap.id, docSnap));
  }

  const candidates = Array.from(docsById.values())
    .map((docSnap) => ({
      docId: docSnap.id,
      entry: mapSharedRecipePhotoData(docSnap.data(), docSnap.id),
      raw: docSnap.data()
    }))
    .filter((candidate): candidate is { docId: string; entry: SharedRecipePhotoEntry; raw: FirebaseFirestore.DocumentData } =>
      Boolean(
        candidate.entry &&
          (candidate.entry.source === "generated" || input.allowProviderPhotos) &&
          !excluded.has(candidate.entry.imageUrl)
      )
    )
    .sort((left, right) =>
      scoreSharedRecipePhotoCategoryMatch(right.raw, right.docId, familyKeys, cuisineKeys, requestKeys, requestTokens, ingredientTokens, mainIngredientKeys) -
        scoreSharedRecipePhotoCategoryMatch(left.raw, left.docId, familyKeys, cuisineKeys, requestKeys, requestTokens, ingredientTokens, mainIngredientKeys) ||
      left.docId.localeCompare(right.docId)
    );

  const best = candidates[0];
  if (!best) return null;

  const bestScore = scoreSharedRecipePhotoCategoryMatch(
    best.raw,
    best.docId,
    familyKeys,
    cuisineKeys,
    requestKeys,
    requestTokens,
    ingredientTokens,
    mainIngredientKeys
  );
  const minimumScore = ingredientTokens.size ? 24 : 18;
  if (requestTokens.size > 1 && bestScore < minimumScore) {
    return null;
  }

  return best.entry;
}

async function getRecipePhotoCacheApproximateScanSnapshot() {
  try {
    return await getAdminDb()
      .collection(COLLECTION_NAME)
      .limit(APPROXIMATE_CATEGORY_SCAN_LIMIT)
      .get();
  } catch (error) {
    logger.warn("Shared recipe photo approximate scan failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function getRecipePhotoCacheCategorySnapshot(field: string, mainIngredientKey: string) {
  try {
    return await getAdminDb()
      .collection(COLLECTION_NAME)
      .where(field, "==", mainIngredientKey)
      .limit(120)
      .get();
  } catch (error) {
    logger.warn("Shared recipe photo category lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      field,
      mainIngredientKey
    });
    return null;
  }
}

function scoreSharedRecipePhotoCategoryMatch(
  data: FirebaseFirestore.DocumentData,
  docId: string,
  familyKeys: Set<string>,
  cuisineKeys: Set<string>,
  requestKeys: Set<string>,
  requestTokens: Set<string>,
  ingredientTokens: Set<string>,
  mainIngredientKeys: string[]
) {
  let score = 0;
  if (typeof data.mainIngredientKey === "string" && mainIngredientKeys.includes(data.mainIngredientKey.toLowerCase())) score += 35;
  if (typeof data.queryMainIngredientKey === "string" && mainIngredientKeys.includes(data.queryMainIngredientKey.toLowerCase())) score += 38;
  if (typeof data.familyKey === "string" && familyKeys.has(data.familyKey.toLowerCase())) score += 50;
  if (typeof data.queryFamilyKey === "string" && familyKeys.has(data.queryFamilyKey.toLowerCase())) score += 45;
  if (typeof data.cuisineKey === "string" && cuisineKeys.has(data.cuisineKey.toLowerCase())) score += 20;
  if (typeof data.queryCuisineKey === "string" && cuisineKeys.has(data.queryCuisineKey.toLowerCase())) score += 18;

  const cacheText = normalizeRecipePhotoCacheLookupKey(
    [
      data.query,
      data.signature,
      data.queryKey,
      data.signatureKey,
      data.mainIngredientKey,
      data.queryMainIngredientKey,
      data.familyKey,
      data.queryFamilyKey,
      data.cuisineKey,
      data.queryCuisineKey,
      data.categoryPath,
      ...(Array.isArray(data.coreTokenKeys) ? data.coreTokenKeys.filter((value): value is string => typeof value === "string") : []),
      docId
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
  );
  const cacheTokens = new Set(
    cacheText
      .split(/\s+/g)
      .map(normalizeRecipePhotoCacheToken)
      .filter(isStrongRecipePhotoCacheToken)
  );
  for (const requestKey of requestKeys) {
    if (requestKey && cacheText.includes(requestKey)) score += 90;
  }
  for (const requestToken of requestTokens) {
    if (cacheTokens.has(requestToken)) score += 12;
  }
  for (const ingredientToken of ingredientTokens) {
    if (cacheTokens.has(ingredientToken)) {
      score += 18;
      continue;
    }
    if (ingredientToken.length >= 4 && Array.from(cacheTokens).some((cacheToken) => cacheToken.includes(ingredientToken) || ingredientToken.includes(cacheToken))) {
      score += 7;
    }
  }

  if (docId.startsWith("generated:")) score += 8;
  if (typeof data.query === "string" && /\b(grilled|pan|sliced|sandwich|kebda|liver|ciger|kaleji|higado|fegato)\b/i.test(data.query)) score += 5;
  if (mainIngredientKeys.includes("liver") && hasGeneratedLiverQueryWithNonLiverSignature(data, docId)) score -= 70;
  return score;
}

function normalizeRecipePhotoCacheToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "")
    .trim();
}

function isStrongRecipePhotoCacheToken(value: string) {
  return value.length > 2 && !RECIPE_PHOTO_CACHE_TOKEN_STOPWORDS.has(value);
}

const RECIPE_PHOTO_CACHE_TOKEN_STOPWORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "style",
  "strict",
  "generated",
  "recipe",
  "dish",
  "food",
  "meal",
  "liver",
  "kebda",
  "kibda",
  "كبدة",
  "كبده",
  "كبد"
]);

function hasGeneratedLiverQueryWithNonLiverSignature(data: FirebaseFirestore.DocumentData, docId: string) {
  const query = typeof data.query === "string" ? data.query : "";
  const signature = typeof data.signature === "string" ? data.signature : docId;
  if (!/\b(liver|kebda|kibda|ciger|cigeri|kaleji|higado|fegato)\b|\u0643\u0628\u062f(?:\u0629|\u0647)?/iu.test(query)) {
    return false;
  }

  const signatureText = normalizeRecipePhotoCacheLookupKey(`${signature} ${docId}`);
  return /\b(pancake|waffle|dessert|cake|cookie|rice-only)\b/i.test(signatureText);
}

function normalizeSharedRecipePhotoSource(source: unknown): SharedRecipePhotoEntry["source"] | null {
  if (typeof source !== "string") return null;
  return SHARED_RECIPE_PHOTO_SOURCES.has(source as SharedRecipePhotoEntry["source"])
    ? source as SharedRecipePhotoEntry["source"]
    : null;
}

async function getSharedGeneratedRecipePhotoByFieldValues(field: string, values: string[]) {
  if (!hasFirebaseAdminConfig()) return null;

  const candidates = normalizeCacheLookupCandidates(values).slice(0, 40);
  if (!candidates.length) return null;

  const db = getAdminDb();
  for (let index = 0; index < candidates.length; index += 10) {
    const chunk = candidates.slice(index, index + 10);
    let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
    try {
      snapshot = await db
        .collection(COLLECTION_NAME)
        .where(field, "in", chunk)
        .limit(10)
        .get();
    } catch (error) {
      logger.warn("Shared generated recipe photo field lookup failed", {
        field,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    for (const docSnap of snapshot.docs) {
      const entry = mapSharedRecipePhotoData(docSnap.data(), docSnap.id);
      if (entry) return entry;
    }
  }

  return null;
}

function normalizeCacheLookupCandidates(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => {
          if (typeof value !== "string") return [];
          const trimmed = value.trim();
          const normalized = normalizeRecipePhotoCacheLookupKey(trimmed);
          return [trimmed, trimmed.toLowerCase(), normalized].filter(Boolean);
        })
        .filter(Boolean)
    )
  );
}

export function normalizeRecipePhotoCacheLookupKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRecipePhotoCacheCategoryFields(input: {
  query?: string | null;
  signature?: string | null;
}) {
  const query = input.query?.trim() ?? "";
  const signature = input.signature?.trim() ?? "";
  const queryIdentity = query ? buildRecipePhotoIdentity(query) : null;
  const identity = queryIdentity ?? buildRecipePhotoIdentity(signature || "recipe photo");
  const signatureIdentity = signature && signature !== query
    ? buildRecipePhotoIdentity(signature)
    : null;
  const queryMainIngredientKey = queryIdentity?.mainIngredientKey ?? null;
  const queryCuisineKey = queryIdentity?.cuisineKey ?? null;
  const queryFamilyKey = queryIdentity?.familyKey ?? null;
  const queryCanonicalDishKey = queryIdentity?.canonicalDishKey ?? null;
  const best = {
    beanTypeKey: identity.beanTypeKey ?? signatureIdentity?.beanTypeKey ?? null,
    canonicalDishKey: identity.canonicalDishKey ?? signatureIdentity?.canonicalDishKey ?? null,
    cookingMethodKey: identity.cookingMethodKey ?? signatureIdentity?.cookingMethodKey ?? null,
    cuisineKey: identity.cuisineKey ?? signatureIdentity?.cuisineKey ?? null,
    familyKey: identity.familyKey ?? signatureIdentity?.familyKey ?? null,
    mainIngredientKey: queryMainIngredientKey ?? identity.mainIngredientKey ?? signatureIdentity?.mainIngredientKey ?? null,
    mealTypeKey: identity.mealTypeKey ?? signatureIdentity?.mealTypeKey ?? null,
    sauceKey: identity.sauceKey ?? signatureIdentity?.sauceKey ?? null,
    starchKey: identity.starchKey ?? signatureIdentity?.starchKey ?? null
  };
  const coreTokenKeys = Array.from(new Set([
    ...(queryIdentity?.coreTokens ?? []),
    ...identity.coreTokens,
    ...(signatureIdentity?.coreTokens ?? [])
  ])).slice(0, 12);
  const categoryPath = Array.from(new Set([
    best.mainIngredientKey,
    queryCuisineKey ?? best.cuisineKey,
    best.familyKey ?? best.canonicalDishKey,
    best.starchKey
  ].filter(Boolean))).join("/");

  return {
    categoryPath: categoryPath || null,
    categoryVersion: CATEGORY_VERSION,
    coreTokenKeys,
    queryCanonicalDishKey,
    queryCuisineKey,
    queryFamilyKey,
    queryMainIngredientKey,
    ...best
  };
}

export async function persistSharedRecipePhoto(entry: SharedRecipePhotoEntry) {
  if (!hasFirebaseAdminConfig()) return entry;
  if (entry.source !== "generated") {
    logger.info("Shared recipe photo cache skipped non-generated provider image", {
      signature: entry.signature,
      source: entry.source
    });
    return entry;
  }

  const persistedImageUrl = await persistSharedRecipeImageUrl(entry);
  if (!isDurableRecipeImageUrl(persistedImageUrl)) {
    throw new Error("Generated recipe image persistence did not return a durable HTTP URL.");
  }

  const nextEntry = {
    ...entry,
    imageUrl: persistedImageUrl
  };
  const categoryFields = buildRecipePhotoCacheCategoryFields({
    query: nextEntry.query,
    signature: nextEntry.signature
  });

  await getAdminDb()
    .collection(COLLECTION_NAME)
    .doc(entry.signature)
    .set(
      {
        imageUrl: nextEntry.imageUrl,
        imageAttributionName: nextEntry.imageAttributionName ?? null,
        imageAttributionUrl: nextEntry.imageAttributionUrl ?? null,
        model: nextEntry.model ?? null,
        query: nextEntry.query,
        queryKey: normalizeRecipePhotoCacheLookupKey(nextEntry.query),
        signature: nextEntry.signature,
        signatureKey: normalizeRecipePhotoCacheLookupKey(nextEntry.signature),
        source: nextEntry.source,
        ...categoryFields,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  return nextEntry;
}

export async function persistSharedRecipePhotoAliases(entry: SharedRecipePhotoEntry, aliases: string[]) {
  const persisted = await persistSharedRecipePhoto(entry);

  if (!hasFirebaseAdminConfig() || !aliases.length) {
    return persisted;
  }

  const uniqueAliases = Array.from(new Set(aliases.filter((alias) => alias && alias !== entry.signature)));
  if (!uniqueAliases.length) {
    return persisted;
  }

  const db = getAdminDb();
  const writes = uniqueAliases.map((alias) =>
    {
      const categoryFields = buildRecipePhotoCacheCategoryFields({
        query: persisted.query,
        signature: alias
      });
      return db
        .collection(COLLECTION_NAME)
        .doc(alias)
        .set(
          {
            imageUrl: persisted.imageUrl,
            imageAttributionName: persisted.imageAttributionName ?? null,
            imageAttributionUrl: persisted.imageAttributionUrl ?? null,
            model: persisted.model ?? null,
            query: persisted.query,
            queryKey: normalizeRecipePhotoCacheLookupKey(persisted.query),
            signature: alias,
            signatureKey: normalizeRecipePhotoCacheLookupKey(alias),
            source: persisted.source,
            ...categoryFields,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
    }
  );

  await Promise.all(writes);
  return persisted;
}

export async function persistSharedRecipePhotoExactAliases(entry: SharedRecipePhotoEntry, aliases: string[]) {
  return persistSharedRecipePhotoAliases(entry, aliases);
}

async function persistSharedRecipeImageUrl(entry: SharedRecipePhotoEntry) {
  if (/^data:/i.test(entry.imageUrl)) {
    const parsed = parseDataUrl(entry.imageUrl);
    return uploadSharedRecipeImage(entry.signature, parsed.buffer, parsed.mimeType);
  }

  if (entry.source === "generated" && isTransientRecipeImageUrl(entry.imageUrl)) {
    const parsed = await fetchRemoteImage(entry.imageUrl);
    return uploadSharedRecipeImage(entry.signature, parsed.buffer, parsed.mimeType);
  }

  return entry.imageUrl;
}

async function uploadSharedRecipeImage(signature: string, buffer: Buffer, mimeType: string) {
  const bucket = getAdminStorageBucket();
  const extension = getImageExtension(mimeType);
  const objectPath = `recipe-photo-cache/${signature}.${extension}`;
  const downloadToken = randomUUID();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    contentType: mimeType,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken
      }
    },
    resumable: false
  });

  return buildFirebaseDownloadUrl(bucket, objectPath, downloadToken);
}

async function fetchRemoteImage(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Generated image download failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Generated image download returned ${contentType}.`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType
  };
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Generated image payload was not a supported data URL.");
  }

  return {
    buffer: Buffer.from(match[2], "base64"),
    mimeType: match[1]
  };
}

function getImageExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function buildFirebaseDownloadUrl(
  bucket: ReturnType<typeof getAdminStorageBucket>,
  objectPath: string,
  downloadToken: string
) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
}

function safeImageUrlHost(imageUrl: string) {
  try {
    return new URL(imageUrl).host;
  } catch {
    return "invalid";
  }
}

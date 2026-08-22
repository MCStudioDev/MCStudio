import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket, hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import { isDurableRecipeImageUrl, isTransientRecipeImageUrl } from "@/lib/recipeImageDurability";

export interface SharedRecipePhotoEntry {
  canonicalDishKey?: string;
  dietTags?: string[];
  familyKey?: string;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageUrl: string;
  mainIngredientKey?: string;
  model?: string;
  query: string;
  signature: string;
  source: "generated" | "google_search" | "pexels_search" | "unsplash_search" | "wikimedia";
}

type SharedRecipePhotoCandidate = {
  docId: string;
  entry: SharedRecipePhotoEntry;
  lookupIndex: number;
  raw: FirebaseFirestore.DocumentData;
};

const COLLECTION_NAME = "recipePhotoCache";
const CATEGORY_VERSION = 2;
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
  const rawImageUrl = String(data.imageUrl);
  const imageUrl = normalizeSharedRecipePhotoImageUrl(rawImageUrl);
  if (!isRenderableSharedRecipePhotoUrl(imageUrl)) {
    return null;
  }
  if (!isDurableRecipeImageUrl(imageUrl)) {
    logger.warn("Ignoring transient shared recipe photo cache URL", {
      signature: fallbackSignature,
      source,
      imageUrlHost: safeImageUrlHost(imageUrl)
    });
    return null;
  }

  const signature = typeof data.signature === "string" && data.signature.trim()
    ? data.signature.trim()
    : fallbackSignature;

  return {
    imageAttributionName: typeof data.imageAttributionName === "string" ? data.imageAttributionName : undefined,
    imageAttributionUrl: typeof data.imageAttributionUrl === "string" ? data.imageAttributionUrl : getPexelsPhotoPageUrl(rawImageUrl),
    imageUrl,
    canonicalDishKey: typeof data.canonicalDishKey === "string" ? data.canonicalDishKey : undefined,
    dietTags: Array.isArray(data.dietTags) ? data.dietTags.filter((value: unknown): value is string => typeof value === "string") : undefined,
    familyKey: typeof data.familyKey === "string" ? data.familyKey : undefined,
    mainIngredientKey: typeof data.mainIngredientKey === "string" ? data.mainIngredientKey : undefined,
    model: typeof data.model === "string" ? data.model : undefined,
    query: typeof data.query === "string" ? data.query : "",
    signature,
    source
  };
}

export async function getSharedRecipePhotoBySignatures(signatures: string[]) {
  if (!hasFirebaseAdminConfig()) return null;

  const db = getAdminDb();
  const lookupSignatures = normalizeCacheLookupCandidates(signatures).slice(0, 16);
  if (!lookupSignatures.length) return null;

  const snapshots = await db.getAll(
    ...lookupSignatures.map((signature) => db.collection(COLLECTION_NAME).doc(signature))
  );
  const candidates = snapshots
    .map((snapshot, index) => {
      if (!snapshot.exists) return null;

      const raw = snapshot.data() ?? {};
      const entry = mapSharedRecipePhotoData(raw, snapshot.id);
      if (!entry) return null;

      return {
        docId: snapshot.id,
        entry,
        lookupIndex: index,
        raw
      } satisfies SharedRecipePhotoCandidate;
    })
    .filter((candidate): candidate is SharedRecipePhotoCandidate => Boolean(candidate));

  return selectBestSharedRecipePhotoCandidate(candidates)?.entry ?? null;
}

export async function getSharedRecipePhotoByQueryOrSignature(input: {
  queries?: string[];
  signatures?: string[];
}) {
  if (!hasFirebaseAdminConfig()) return null;

  const signatures = normalizeCacheLookupCandidates(input.signatures ?? []);
  const queries = normalizeCacheLookupCandidates(input.queries ?? []);
  const db = getAdminDb();

  const directDocCandidates = Array.from(new Set([...signatures, ...queries]))
    .filter(isValidFirestoreDocumentIdSegment)
    .slice(0, 16);
  const directCandidates = (
    await Promise.all(
      directDocCandidates.map(async (candidate, index) => {
        const docSnap = await db.collection(COLLECTION_NAME).doc(candidate).get();
        if (!docSnap.exists) return null;

        const raw = docSnap.data() ?? {};
        const entry = mapSharedRecipePhotoData(raw, docSnap.id);
        if (!entry) return null;

        return {
          docId: docSnap.id,
          entry,
          lookupIndex: index,
          raw
        } satisfies SharedRecipePhotoCandidate;
      })
    )
  ).filter((candidate): candidate is SharedRecipePhotoCandidate => Boolean(candidate));

  const fieldMatches = await Promise.all([
    getSharedRecipePhotoCandidateByFieldValues("signature", signatures),
    getSharedRecipePhotoCandidateByFieldValues("query", queries),
    getSharedRecipePhotoCandidateByFieldValues("queryKey", queries.map(normalizeRecipePhotoCacheLookupKey)),
    getSharedRecipePhotoCandidateByFieldValues("signatureKey", signatures.map(normalizeRecipePhotoCacheLookupKey))
  ]);
  const candidates: SharedRecipePhotoCandidate[] = [
    ...directCandidates,
    ...fieldMatches.filter((candidate): candidate is SharedRecipePhotoCandidate => Boolean(candidate))
  ];

  const bestCandidate = selectBestSharedRecipePhotoCandidate(candidates);
  if (bestCandidate) return bestCandidate.entry;
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
  const candidates: SharedRecipePhotoCandidate[] = [];
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

    for (const [docIndex, docSnap] of snapshot.docs.entries()) {
      const raw = docSnap.data();
      const entry = mapSharedRecipePhotoData(raw, docSnap.id);
      if (entry) {
        candidates.push({
          docId: docSnap.id,
          entry,
          lookupIndex: index + docIndex,
          raw
        });
      }
    }
  }

  return selectBestSharedRecipePhotoCandidate(candidates)?.entry ?? null;
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
  canonicalDishKeys?: Array<string | null | undefined>;
  cookingMethodKeys?: Array<string | null | undefined>;
  cuisineKeys?: Array<string | null | undefined>;
  excludeImageUrls?: string[];
  familyKeys?: Array<string | null | undefined>;
  ingredientTexts?: string[];
  mainIngredientKeys: Array<string | null | undefined>;
  mealTypeKeys?: Array<string | null | undefined>;
  requestTexts?: string[];
  sauceKeys?: Array<string | null | undefined>;
  starchKeys?: Array<string | null | undefined>;
}) {
  if (!hasFirebaseAdminConfig()) return null;

  const mainIngredientKeys = normalizeRecipePhotoCategoryKeys(input.mainIngredientKeys).slice(0, 8);
  const canonicalDishKeys = normalizeRecipePhotoCategoryKeys(input.canonicalDishKeys ?? []).slice(0, 8);
  const cookingMethodKeys = normalizeRecipePhotoCategoryKeys(input.cookingMethodKeys ?? []).slice(0, 6);
  const mealTypeKeys = normalizeRecipePhotoCategoryKeys(input.mealTypeKeys ?? []).slice(0, 8);
  const sauceKeys = normalizeRecipePhotoCategoryKeys(input.sauceKeys ?? []).slice(0, 6);
  const starchKeys = normalizeRecipePhotoCategoryKeys(input.starchKeys ?? []).slice(0, 6);

  const excluded = new Set((input.excludeImageUrls ?? []).filter(Boolean));
  const familyKeys = new Set(normalizeRecipePhotoCategoryKeys(input.familyKeys ?? []));
  const cuisineKeys = new Set(normalizeRecipePhotoCategoryKeys(input.cuisineKeys ?? []));
  const canonicalDishKeySet = new Set(canonicalDishKeys);
  const cookingMethodKeySet = new Set(cookingMethodKeys);
  const mealTypeKeySet = new Set(mealTypeKeys);
  const sauceKeySet = new Set(sauceKeys);
  const starchKeySet = new Set(starchKeys);
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
  const lookupPairs: Array<{ field: string; key: string }> = [
    ...mainIngredientKeys.flatMap((key) => [
      { field: "mainIngredientKey", key },
      { field: "queryMainIngredientKey", key }
    ]),
    ...canonicalDishKeys.flatMap((key) => [
      { field: "canonicalDishKey", key },
      { field: "queryCanonicalDishKey", key }
    ]),
    ...Array.from(familyKeys).flatMap((key) => [
      { field: "familyKey", key },
      { field: "queryFamilyKey", key }
    ]),
    ...starchKeys.map((key) => ({ field: "starchKey", key })),
    ...sauceKeys.map((key) => ({ field: "sauceKey", key })),
    ...cookingMethodKeys.map((key) => ({ field: "cookingMethodKey", key })),
    ...mealTypeKeys.map((key) => ({ field: "mealTypeKey", key }))
  ];
  const snapshots = await Promise.all(
    lookupPairs.slice(0, 8).map(({ field, key }) => getRecipePhotoCacheCategorySnapshot(field, key))
  );
  const docsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();
  snapshots.forEach((snapshot) => {
    snapshot?.docs.forEach((docSnap) => docsById.set(docSnap.id, docSnap));
  });
  if (docsById.size === 0 || !lookupPairs.length) return null;

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
    );

  const minimumScore = ingredientTokens.size ? 24 : 18;
  const scoredCandidates = candidates
    .map((candidate) => {
      const matchScore = scoreSharedRecipePhotoCategoryMatch(
        candidate.raw,
        candidate.docId,
        canonicalDishKeySet,
        cookingMethodKeySet,
        familyKeys,
        cuisineKeys,
        mealTypeKeySet,
        requestKeys,
        requestTokens,
        ingredientTokens,
        mainIngredientKeys,
        sauceKeySet,
        starchKeySet
      );
      return {
        ...candidate,
        matchScore,
        score: matchScore + getSharedRecipePhotoUpdatedUrlScore(candidate.raw, candidate.entry)
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      compareSharedRecipePhotoCandidateFreshness(left, right) ||
      left.docId.localeCompare(right.docId)
    );
  const eligible = requestTokens.size > 1
    ? scoredCandidates.filter((candidate) => candidate.matchScore >= minimumScore)
    : scoredCandidates;
  if (!eligible.length) return null;

  const topScore = eligible[0]?.matchScore ?? 0;
  const rotationFloor = topScore >= 90 ? topScore - 8 : Math.max(minimumScore, topScore - 25);
  const rotationPool = eligible
    .filter((candidate) => candidate.matchScore >= rotationFloor)
    .slice(0, topScore >= 90 ? 6 : 18);
  const best = selectRotatedSharedRecipePhotoCategoryCandidate(rotationPool.length ? rotationPool : eligible, [
    ...Array.from(requestKeys),
    ...Array.from(requestTokens),
    ...Array.from(ingredientTokens),
    ...canonicalDishKeys,
    ...mainIngredientKeys,
    ...Array.from(familyKeys),
    ...mealTypeKeys,
    ...starchKeys,
    ...sauceKeys,
    ...cookingMethodKeys,
    ...Array.from(cuisineKeys)
  ]);
  if (!best) return null;

  return best.entry;
}

function selectRotatedSharedRecipePhotoCategoryCandidate<T extends { docId: string; entry: SharedRecipePhotoEntry }>(
  candidates: T[],
  rotationKeys: string[]
) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const rotationSeed = rotationKeys
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .join("|");
  if (!rotationSeed) return candidates[0];

  return candidates[stableRecipePhotoCacheHash(rotationSeed) % candidates.length];
}

function stableRecipePhotoCacheHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isValidFirestoreDocumentIdSegment(value: string) {
  const normalized = value.trim();
  return Boolean(
    normalized &&
    normalized !== "." &&
    normalized !== ".." &&
    !normalized.includes("/") &&
    normalized.length <= 500
  );
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
  canonicalDishKeys: Set<string>,
  cookingMethodKeys: Set<string>,
  familyKeys: Set<string>,
  cuisineKeys: Set<string>,
  mealTypeKeys: Set<string>,
  requestKeys: Set<string>,
  requestTokens: Set<string>,
  ingredientTokens: Set<string>,
  mainIngredientKeys: string[],
  sauceKeys: Set<string>,
  starchKeys: Set<string>
) {
  let score = 0;
  if (typeof data.canonicalDishKey === "string" && canonicalDishKeys.has(data.canonicalDishKey.toLowerCase())) score += 72;
  if (typeof data.queryCanonicalDishKey === "string" && canonicalDishKeys.has(data.queryCanonicalDishKey.toLowerCase())) score += 78;
  if (typeof data.mainIngredientKey === "string" && mainIngredientKeys.includes(data.mainIngredientKey.toLowerCase())) score += 35;
  if (typeof data.queryMainIngredientKey === "string" && mainIngredientKeys.includes(data.queryMainIngredientKey.toLowerCase())) score += 38;
  if (typeof data.familyKey === "string" && familyKeys.has(data.familyKey.toLowerCase())) score += 50;
  if (typeof data.queryFamilyKey === "string" && familyKeys.has(data.queryFamilyKey.toLowerCase())) score += 45;
  if (typeof data.cuisineKey === "string" && cuisineKeys.has(data.cuisineKey.toLowerCase())) score += 20;
  if (typeof data.queryCuisineKey === "string" && cuisineKeys.has(data.queryCuisineKey.toLowerCase())) score += 18;
  if (typeof data.mealTypeKey === "string" && mealTypeKeys.has(data.mealTypeKey.toLowerCase())) score += 24;
  if (typeof data.starchKey === "string" && starchKeys.has(data.starchKey.toLowerCase())) score += 16;
  if (typeof data.sauceKey === "string" && sauceKeys.has(data.sauceKey.toLowerCase())) score += 14;
  if (typeof data.cookingMethodKey === "string" && cookingMethodKeys.has(data.cookingMethodKey.toLowerCase())) score += 12;

  const cacheText = normalizeRecipePhotoCacheLookupKey(
    [
      data.query,
      data.signature,
      data.queryKey,
      data.signatureKey,
      data.canonicalDishKey,
      data.queryCanonicalDishKey,
      data.mainIngredientKey,
      data.queryMainIngredientKey,
      data.familyKey,
      data.queryFamilyKey,
      data.cuisineKey,
      data.queryCuisineKey,
      data.mealTypeKey,
      data.starchKey,
      data.sauceKey,
      data.cookingMethodKey,
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

function normalizeRecipePhotoCategoryKeys(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value))
    )
  );
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
  const normalized = source.trim().toLowerCase();
  const aliased = normalized === "pexels"
    ? "pexels_search"
    : normalized === "unsplash"
      ? "unsplash_search"
      : normalized === "google"
        ? "google_search"
        : normalized;
  return SHARED_RECIPE_PHOTO_SOURCES.has(aliased as SharedRecipePhotoEntry["source"])
    ? aliased as SharedRecipePhotoEntry["source"]
    : null;
}

async function getSharedRecipePhotoCandidateByFieldValues(field: string, values: string[]) {
  if (!hasFirebaseAdminConfig()) return null;

  const lookupCandidates = normalizeCacheLookupCandidates(values).slice(0, 40);
  if (!lookupCandidates.length) return null;

  const db = getAdminDb();
  const chunkStarts = Array.from(
    { length: Math.ceil(lookupCandidates.length / 10) },
    (_, index) => index * 10
  );
  const snapshots = await Promise.all(
    chunkStarts.map(async (index) => {
      const chunk = lookupCandidates.slice(index, index + 10);
      try {
        const snapshot = await db
          .collection(COLLECTION_NAME)
          .where(field, "in", chunk)
          .limit(10)
          .get();
        return { index, snapshot };
      } catch (error) {
        logger.warn("Shared generated recipe photo field lookup failed", {
          field,
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }
    })
  );

  const matches: SharedRecipePhotoCandidate[] = [];
  for (const result of snapshots) {
    if (!result) continue;
    const { index, snapshot } = result;
    try {
      for (const [docIndex, docSnap] of snapshot.docs.entries()) {
        const raw = docSnap.data();
        const entry = mapSharedRecipePhotoData(raw, docSnap.id);
        if (entry) {
          matches.push({
            docId: docSnap.id,
            entry,
            lookupIndex: index + docIndex,
            raw
          });
        }
      }
    } catch (error) {
      logger.warn("Shared generated recipe photo field match mapping failed", {
        field,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return selectBestSharedRecipePhotoCandidate(matches);
}

function selectBestSharedRecipePhotoCandidate(candidates: SharedRecipePhotoCandidate[]) {
  return [...candidates].sort((left, right) =>
    compareSharedRecipePhotoCandidateFreshness(left, right) ||
    left.lookupIndex - right.lookupIndex ||
    left.docId.localeCompare(right.docId)
  )[0] ?? null;
}

function compareSharedRecipePhotoCandidateFreshness(
  left: Pick<SharedRecipePhotoCandidate, "docId" | "entry" | "raw">,
  right: Pick<SharedRecipePhotoCandidate, "docId" | "entry" | "raw">
) {
  return (
    getSharedRecipePhotoCacheSourcePriority(right.entry) -
      getSharedRecipePhotoCacheSourcePriority(left.entry) ||
    getSharedRecipePhotoUpdatedUrlPriority(right.raw, right.entry) -
      getSharedRecipePhotoUpdatedUrlPriority(left.raw, left.entry) ||
    getSharedRecipePhotoUpdatedAtMillis(right.raw) - getSharedRecipePhotoUpdatedAtMillis(left.raw)
  );
}

function getSharedRecipePhotoUpdatedUrlScore(data: FirebaseFirestore.DocumentData, entry: SharedRecipePhotoEntry) {
  let score = getSharedRecipePhotoCacheSourcePriority(entry) * 12;
  if (getSharedRecipePhotoUpdatedAtMillis(data) > 0) score += 18;
  if (isSharedRecipePhotoDirectPexelsImageUrl(entry.imageUrl)) score += 16;
  if (isSharedRecipePhotoCacheStorageUrl(entry.imageUrl)) score += 14;
  return score;
}

function getSharedRecipePhotoUpdatedUrlPriority(data: FirebaseFirestore.DocumentData, entry: SharedRecipePhotoEntry) {
  let priority = getSharedRecipePhotoCacheSourcePriority(entry);
  if (getSharedRecipePhotoUpdatedAtMillis(data) > 0) priority += 2;
  if (isSharedRecipePhotoDirectPexelsImageUrl(entry.imageUrl)) priority += 2;
  if (isSharedRecipePhotoCacheStorageUrl(entry.imageUrl)) priority += 1;
  return priority;
}

function getSharedRecipePhotoCacheSourcePriority(entry: Pick<SharedRecipePhotoEntry, "source">) {
  switch (entry.source) {
    case "pexels_search":
      return 5;
    case "generated":
      return 4;
    case "google_search":
      return 3;
    case "unsplash_search":
      return 2;
    case "wikimedia":
      return 1;
    default:
      return 0;
  }
}

function getSharedRecipePhotoUpdatedAtMillis(data: FirebaseFirestore.DocumentData) {
  return Math.max(
    getTimestampMillis(data.imageUrlUpdatedAt),
    getTimestampMillis(data.urlUpdatedAt),
    getTimestampMillis(data.photoUpdatedAt),
    getTimestampMillis(data.updatedAt)
  );
}

function getTimestampMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "object") {
    const timestampLike = value as {
      seconds?: unknown;
      toDate?: unknown;
      toMillis?: unknown;
    };
    if (typeof timestampLike.toMillis === "function") {
      const millis = timestampLike.toMillis();
      return typeof millis === "number" && Number.isFinite(millis) ? millis : 0;
    }
    if (typeof timestampLike.toDate === "function") {
      const date = timestampLike.toDate();
      return date instanceof Date ? date.getTime() : 0;
    }
    if (typeof timestampLike.seconds === "number" && Number.isFinite(timestampLike.seconds)) {
      return timestampLike.seconds * 1000;
    }
  }
  return 0;
}

function isSharedRecipePhotoCacheStorageUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return decodedPath.includes("/recipe-photo-cache/");
  } catch {
    return /recipe-photo-cache(?:%2f|\/)/i.test(imageUrl);
  }
}

function isSharedRecipePhotoDirectPexelsImageUrl(imageUrl: string) {
  try {
    return new URL(imageUrl).hostname.toLowerCase() === "images.pexels.com";
  } catch {
    return false;
  }
}

function normalizeSharedRecipePhotoImageUrl(imageUrl: string) {
  return convertPexelsPhotoPageUrlToImageUrl(imageUrl) ?? imageUrl;
}

function convertPexelsPhotoPageUrlToImageUrl(imageUrl: string) {
  const photoId = getPexelsPhotoPageId(imageUrl);
  if (!photoId) return null;
  return `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=1200&h=900&fit=crop`;
}

function getPexelsPhotoPageId(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "www.pexels.com" && host !== "pexels.com") return null;

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts[0] !== "photo") return null;

    const slug = pathParts[pathParts.length - 1] ?? "";
    const match = slug.match(/(\d+)$/);
    return match?.[1] ?? null;
  } catch {
    const match = imageUrl.match(/pexels\.com\/photo\/[^/?#]*?(\d+)(?:[/?#]|$)/i);
    return match?.[1] ?? null;
  }
}

function getPexelsPhotoPageUrl(imageUrl: string) {
  return getPexelsPhotoPageId(imageUrl) ? imageUrl : undefined;
}

function isRenderableSharedRecipePhotoUrl(imageUrl: string) {
  if (!isDurableRecipeImageUrl(imageUrl)) return false;

  try {
    const url = new URL(imageUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com") return true;
    if (host === "images.pexels.com" || host === "images.unsplash.com" || host === "upload.wikimedia.org") return true;

    // Provider landing pages like https://www.pexels.com/photo/... are HTML,
    // not image bytes. They cause card backgrounds to stay blank even though a
    // cache row was found.
    if ((host === "www.pexels.com" || host === "pexels.com") && path.startsWith("/photo/")) return false;
    if ((host === "www.unsplash.com" || host === "unsplash.com") && path.startsWith("/photos/")) return false;

    return /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url.href);
  } catch {
    return /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(imageUrl);
  }
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
        dietTags: nextEntry.dietTags ?? [],
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
            dietTags: persisted.dietTags ?? [],
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

import { z } from "zod";
import { findUnsplashRecipePhoto, isUnsplashRecipePhotoSearchConfigured } from "@/lib/unsplashRecipePhotoSearch";
import { findPexelsRecipePhoto, isPexelsRecipePhotoSearchConfigured } from "@/lib/pexelsRecipePhotoSearch";
import { generateRecipeImageWithReplicate, getReplicateImageModel, isReplicateConfigured } from "@/lib/replicateRecipeImage";
import { buildRecipePhotoIdentity, isStrictRecipePhotoIdentity, normalizeRecipePhotoQuery } from "@/lib/recipePhotoIdentity";
import { findFreeRecipePhoto } from "@/lib/freeRecipePhotos";
import { getAllDishes } from "@/lib/cuisineCatalogs/completeCatalogs";
import {
  getSharedRecipePhotoByExactAliases,
  getSharedRecipePhotoBySignatures,
  persistSharedRecipePhoto,
  persistSharedRecipePhotoExactAliases,
  type SharedRecipePhotoEntry
} from "@/lib/sharedRecipePhotoCache";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit,
  hasRecipeImageAccess
} from "@/services/authService";
import { logger } from "@/lib/logger";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import {
  translateIngredientToEnglish,
  translateRecipeTitleToEnglish
} from "@/lib/arabicRecipeLocalization";
import {
  buildRecipePhotoExactAliases,
  normalizeExactRecipePhotoHints
} from "@/lib/recipePhotoExactIdentity";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  query: z.string().min(3)
});

type CachedRecipePhoto = {
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource: "api" | "cache" | "search" | "unsplash" | "wikimedia";
  imageUrl: string;
  source: "generated" | "google_search" | "pexels_search" | "unsplash_search" | "wikimedia";
  model?: string;
  signature: string;
};

type CachedRecipePhotoFailure = {
  error: string;
  expiresAt: number;
  retryAfterSeconds?: number;
  source: "unavailable";
  status: number;
};

type RecipePhotoLookupResult =
  | {
      consumeFreeCredit: boolean;
      ok: true;
      photo: CachedRecipePhoto;
    }
  | {
      failure: Omit<CachedRecipePhotoFailure, "expiresAt"> & { cacheTtlMs: number };
      ok: false;
    };

type ProviderRecipePhotoCandidate = {
  attributionName?: string;
  attributionUrl?: string;
  imageSource: "search" | "unsplash" | "wikimedia";
  imageUrl: string;
  matchedQuery: string;
  model: "pexels_search" | "unsplash_search" | "wikimedia_lookup";
  score: number;
  signature: string;
  source: "pexels_search" | "unsplash_search" | "wikimedia";
  weightedScore: number;
};

const recipePhotoCache = new Map<string, CachedRecipePhoto>();
const recipePhotoFailureCache = new Map<string, CachedRecipePhotoFailure>();
const inFlightRecipePhotoLookups = new Map<string, Promise<RecipePhotoLookupResult>>();
const recentRecipePhotoSelections = new Map<string, { expiresAt: number; signature: string }>();
const MAX_RECIPE_PHOTO_CACHE_ITEMS = 120;
const MAX_RECIPE_PHOTO_FAILURE_CACHE_ITEMS = 120;
const STRICT_NO_MATCH_TTL_MS = 30 * 60 * 1000;
const RECENT_SELECTION_TTL_MS = 30 * 60 * 1000;
const PREMIUM_REPLICATE_RETRY_TTL_MS = 3 * 1000;
const PREMIUM_REPLICATE_RETRY_AFTER_SECONDS = 2;
const WIKIMEDIA_ENABLED = true;
const STRICT_RECIPE_PHOTO_CACHE_VERSION = "strict-v4";
const MIN_ACCEPTED_PROVIDER_SCORE = {
  wikimedia: 12,
  pexels_search: 11,
  unsplash_search: 11
} as const;
const WIKIMEDIA_FAMILY_ALLOWLIST = new Set([
  ...getAllDishes().map((dish) => dish.id),
  "cilbir",
  "shakshuka",
  "mujadara",
  "koshary",
  "besara",
  "balila",
  "fasolia",
  "loubia-bzeit",
  "kafta"
]);

export async function GET(request: Request) {
  let accessCheck: Awaited<ReturnType<typeof canUseApiFeature>>;
  try {
    accessCheck = await canUseApiFeature(request, "recipe_image");
  } catch (error) {
    return accessErrorResponse(error);
  }
  const rl = applyRateLimit({
    uid: accessCheck.access.uid,
    feature: "recipe_photo",
    isPremium: hasRecipeImageAccess(accessCheck.access),
    bypass: accessCheck.access.isAdmin
  });
  if (!rl.decision.allowed) {
    return rateLimitedResponse(rl.decision, rl.config);
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    query: searchParams.get("query")
  });

  if (!parsed.success) {
    return Response.json(
      { error: "A recipe photo query is required." },
      { headers: buildRecipePhotoResponseHeaders("failure"), status: 400 }
    );
  }

  const rawQueryCandidates = [
    parsed.data.query,
    ...searchParams.getAll("alt")
  ];
  const exactNameHints = normalizeExactRecipePhotoHints([
    ...searchParams.getAll("exact"),
    ...searchParams.getAll("exactName"),
    ...searchParams.getAll("mealName"),
    ...searchParams.getAll("englishName"),
    ...searchParams.getAll("arabicName"),
    ...searchParams.getAll("dishName")
  ]);
  const arabicDishNameHints = extractArabicDishNameHints(rawQueryCandidates);
  const queryCandidates = normalizeRecipePhotoQueries(rawQueryCandidates);
  const replicateQueryCandidates = normalizeRecipePhotoQueries([
    ...exactNameHints,
    ...rawQueryCandidates
  ]);
  const ingredientHints = normalizeRecipePhotoIngredientHints(searchParams.getAll("ingredient"));
  const explicitlyExcludedImageUrls = normalizeExcludedRecipePhotoUrls(searchParams.getAll("exclude"));
  const cacheOnly = searchParams.get("cacheOnly") === "1" || searchParams.get("cacheOnly") === "true";
  const exactAliasCandidates = buildRecipePhotoExactAliases({
    cuisine: searchParams.get("cuisine") ?? undefined,
    names: exactNameHints
  });
  const query = queryCandidates[0] ?? parsed.data.query.trim();
  const identities = queryCandidates.map((candidate) => buildRecipePhotoIdentity(candidate));
  const replicateIdentities = replicateQueryCandidates.map((candidate) => buildRecipePhotoIdentity(candidate));
  const identity = identities[0] ?? buildRecipePhotoIdentity(query);
  const strictVisualRequest =
    identities.some(isStrictVisualIdentity) ||
    replicateIdentities.some(isStrictVisualIdentity) ||
    isStrictVisualIdentity(identity);
  const useReplicateGeneration = hasRecipeImageAccess(accessCheck.access);
  const selectedReplicateQuery = useReplicateGeneration
    ? selectReplicateRecipePhotoQuery(replicateQueryCandidates, replicateIdentities, ingredientHints)
    : null;
  const selectedReplicateSignature = selectedReplicateQuery ? buildGeneratedRecipePhotoSignature(selectedReplicateQuery) : null;
  const allowProviderPhotoSearch = accessCheck.allowed || !useReplicateGeneration;
  const generatedAliasCandidates = buildGeneratedRecipePhotoCacheAliasCandidates([...replicateIdentities, ...identities]);
  const signatureCandidates = useReplicateGeneration
    ? Array.from(new Set([...(selectedReplicateSignature ? [selectedReplicateSignature] : []), ...generatedAliasCandidates]))
    : Array.from(new Set(identities.map((entry) => entry.signature)));
  const exactCacheLookupCandidates = Array.from(
    new Set(
      useReplicateGeneration
        ? exactAliasCandidates
        : [
            ...generatedAliasCandidates,
            ...exactAliasCandidates,
            ...buildLegacyExactRecipePhotoCacheCandidates(queryCandidates, identities)
          ]
    )
  );
  const imageMode = useReplicateGeneration ? "generated" : allowProviderPhotoSearch ? "search" : "disabled";
  const forceUnsplashFirst =
    !useReplicateGeneration && allowProviderPhotoSearch && isUnsplashRecipePhotoSearchConfigured();
  const premiumFailureScope =
    useReplicateGeneration && ingredientHints.length
      ? `::ingredients:${ingredientHints.join("|")}`
      : "";
  const generatedRequestScope = useReplicateGeneration
    ? buildGeneratedRecipePhotoRequestScope({
        exactAliasCandidates,
        ingredientHints,
        replicateQueryCandidates
      })
    : "";
  const failureCacheKeyBase = getRecipePhotoFailureCacheKey(
    `${selectedReplicateSignature ?? (queryCandidates.join("||") || identity.signature)}${premiumFailureScope}${generatedRequestScope}`,
    imageMode
  );
  const failureCacheKey =
    explicitlyExcludedImageUrls.size > 0
      ? `${failureCacheKeyBase}::exclude:${Array.from(explicitlyExcludedImageUrls).sort().join("|")}`
      : failureCacheKeyBase;

  const exactCached = getRecipePhotoCacheBySignatures(exactCacheLookupCandidates);
  if (
    exactCached &&
    !explicitlyExcludedImageUrls.has(exactCached.imageUrl) &&
    canUseCachedRecipePhotoForVisualRequest(exactCached, strictVisualRequest) &&
    (!accessCheck.allowed || !isRecipePhotoRecentlyUsedForDifferentSignature(exactCached.imageUrl, exactCacheLookupCandidates))
  ) {
    await persistExactAliasesForLegacyPhoto(exactCached, exactAliasCandidates);
    rememberRecipePhotoSelection(exactCached.imageUrl, exactCached.signature);
    logger.info("Recipe photo served from exact memory cache", {
      source: exactCached.source,
      query,
      imageMode,
      exactAliasCount: exactAliasCandidates.length,
      exactLookupCount: exactCacheLookupCandidates.length,
      signature: exactCached.signature
    });

    return Response.json(
      {
        ...exactCached,
        imageSource: "cache",
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const sharedExactCached = await getSharedRecipePhotoByExactAliases(exactCacheLookupCandidates);
  if (
    sharedExactCached &&
    !explicitlyExcludedImageUrls.has(sharedExactCached.imageUrl) &&
    canUseSharedRecipePhotoForVisualRequest(sharedExactCached, strictVisualRequest) &&
    (WIKIMEDIA_ENABLED || sharedExactCached.source !== "wikimedia") &&
    (!accessCheck.allowed || !isRecipePhotoRecentlyUsedForDifferentSignature(sharedExactCached.imageUrl, exactCacheLookupCandidates))
  ) {
    const sharedPhoto = {
      imageAttributionName: sharedExactCached.imageAttributionName,
      imageAttributionUrl: sharedExactCached.imageAttributionUrl,
      imageSource: "cache" as const,
      imageUrl: sharedExactCached.imageUrl,
      model: sharedExactCached.model,
      signature: sharedExactCached.signature,
      source: sharedExactCached.source
    } satisfies CachedRecipePhoto;
    await persistExactAliasesForLegacyPhoto(sharedPhoto, exactAliasCandidates);
    setRecipePhotoCacheAliases(exactAliasCandidates, sharedPhoto);
    rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature);

    logger.info("Recipe photo served from exact shared cache", {
      source: sharedPhoto.source,
      query,
      imageMode,
      exactAliasCount: exactAliasCandidates.length,
      exactLookupCount: exactCacheLookupCandidates.length,
      signature: sharedPhoto.signature
    });

    return Response.json(
      {
        ...sharedPhoto,
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const cached =
    forceUnsplashFirst || useReplicateGeneration
      ? null
      : getRecipePhotoCacheBySignatures(signatureCandidates);
  if (
    cached &&
    !explicitlyExcludedImageUrls.has(cached.imageUrl) &&
    canUseCachedRecipePhotoForVisualRequest(cached, strictVisualRequest) &&
    (!useReplicateGeneration || cached.source === "generated") &&
    (!accessCheck.allowed || !isRecipePhotoRecentlyUsedForDifferentSignature(cached.imageUrl, signatureCandidates))
  ) {
    rememberRecipePhotoSelection(cached.imageUrl, cached.signature);
    logger.info("Recipe photo served", {
      source: cached.source,
      query,
      cached: true,
      model: cached.model,
      imageMode,
      signature: identity.signature
    });

    return Response.json(
      {
        ...cached,
        imageSource: "cache",
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const sharedCached =
    forceUnsplashFirst || useReplicateGeneration
      ? null
      : await getSharedRecipePhotoBySignatures(signatureCandidates);
  if (
    sharedCached &&
    !explicitlyExcludedImageUrls.has(sharedCached.imageUrl) &&
    canUseSharedRecipePhotoForVisualRequest(sharedCached, strictVisualRequest) &&
    (!useReplicateGeneration || sharedCached.source === "generated") &&
    (WIKIMEDIA_ENABLED || sharedCached.source !== "wikimedia") &&
    (!accessCheck.allowed || !isRecipePhotoRecentlyUsedForDifferentSignature(sharedCached.imageUrl, signatureCandidates))
  ) {
    const sharedPhoto = {
      imageAttributionName: sharedCached.imageAttributionName,
      imageAttributionUrl: sharedCached.imageAttributionUrl,
      imageSource: "cache" as const,
      imageUrl: sharedCached.imageUrl,
      model: sharedCached.model,
      signature: sharedCached.signature,
      source: sharedCached.source
    } satisfies CachedRecipePhoto;
    setRecipePhotoCacheAliases(signatureCandidates, sharedPhoto);
    rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature);

    logger.info("Recipe photo served", {
      source: sharedPhoto.source,
      query,
      cached: true,
      model: sharedPhoto.model,
      imageMode,
      sharedCache: true,
      signature: identity.signature
    });

    return Response.json(
      {
        ...sharedPhoto,
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  if (cacheOnly) {
    return Response.json(
      {
        access: accessPayload(accessCheck.access),
        error: "No cached generated recipe photo matched this exact recipe.",
        source: "unavailable"
      },
      { headers: buildRecipePhotoResponseHeaders("failure"), status: 404 }
    );
  }

  const cachedFailure = getRecipePhotoFailure(failureCacheKey);
  if (cachedFailure) {
    logger.info("Recipe photo request skipped", {
      source: cachedFailure.source,
      query,
      status: cachedFailure.status,
      cachedFailure: true,
      imageMode,
      signature: identity.signature
    });

    return buildRecipePhotoFailureResponse(cachedFailure, accessCheck.access);
  }

  try {
    const joinedLookup = inFlightRecipePhotoLookups.get(failureCacheKey);
    if (joinedLookup) {
      logger.info("Recipe photo request joined in-flight lookup", {
        query,
        imageMode,
        signature: identity.signature
      });

      const result = await joinedLookup;
      return buildRecipePhotoLookupResponse(result, accessCheck.access);
    }

    const lookupPromise = performRecipePhotoLookup({
      accessAllowed: allowProviderPhotoSearch,
      failureCacheKey,
      imageMode,
      identities,
      ingredientHints,
      arabicDishNameHints,
      exactAliasCandidates,
      generatedAliasCandidates,
      explicitlyExcludedImageUrls,
      query,
      queryCandidates,
      replicateQueryCandidates,
      replicateIdentities,
      exactRecipeNameHint: selectExactRecipePhotoNameHint(exactNameHints),
      signatureCandidates,
      useReplicateGeneration,
      reason: accessCheck.reason
    }).finally(() => {
      inFlightRecipePhotoLookups.delete(failureCacheKey);
    });

    inFlightRecipePhotoLookups.set(failureCacheKey, lookupPromise);

    const result = await lookupPromise;
    return buildRecipePhotoLookupResponse(result, accessCheck.access);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to look up a recipe photo.";
    logger.error("Recipe photo generation failed", error, {
      query,
      signature: identity.signature
    });

    return Response.json(
      { error: message },
      { headers: buildRecipePhotoResponseHeaders("failure"), status: 500 }
    );
  }
}

function getRecipePhotoSuccessCacheKey(signature: string) {
  return `success:${signature}`;
}

function getRecipePhotoFailureCacheKey(signature: string, imageMode: "generated" | "search" | "disabled") {
  return `${imageMode}:${signature}`;
}

function buildGeneratedRecipePhotoRequestScope({
  exactAliasCandidates,
  ingredientHints,
  replicateQueryCandidates
}: {
  exactAliasCandidates: string[];
  ingredientHints: string[];
  replicateQueryCandidates: string[];
}) {
  const scope = [
    exactAliasCandidates.slice(0, 8).join("|"),
    replicateQueryCandidates.slice(0, 5).map(normalizeRecipePhotoQuery).join("|"),
    ingredientHints.slice(0, 8).map(normalizeRecipePhotoQuery).join("|")
  ]
    .filter(Boolean)
    .join("::");

  return scope ? `::request:${hashRecipePhotoRequestScope(scope)}` : "";
}

function hashRecipePhotoRequestScope(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function canUseCachedRecipePhotoForVisualRequest(entry: CachedRecipePhoto, strictVisualRequest: boolean) {
  if (entry.source !== "generated") return false;
  if (!strictVisualRequest) return true;
  return entry.source === "generated" && entry.signature.includes(STRICT_RECIPE_PHOTO_CACHE_VERSION);
}

function canUseSharedRecipePhotoForVisualRequest(entry: SharedRecipePhotoEntry, strictVisualRequest: boolean) {
  if (entry.source !== "generated") return false;
  if (!strictVisualRequest) return true;
  return entry.source === "generated" && entry.signature.includes(STRICT_RECIPE_PHOTO_CACHE_VERSION);
}

function normalizeRecipePhotoQueries(queries: string[]) {
  return Array.from(
    new Set(
      queries
        .map((value) => normalizeRecipePhotoTextToEnglish(value))
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 5);
}

function normalizeExcludedRecipePhotoUrls(values: string[]) {
  return new Set(
    values
      .map((value) => value.trim())
      .filter((value) => /^https?:\/\//i.test(value))
      .slice(0, 8)
  );
}

function extractArabicDishNameHints(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().replace(/\s+/g, " "))
        .filter((value) => /[\u0600-\u06FF]/.test(value))
    )
  ).slice(0, 3);
}

function normalizeRecipePhotoIngredientHints(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => translateIngredientToEnglish(value).trim().toLowerCase())
        .filter((value) => value.length >= 2)
    )
  ).slice(0, 10);
}

function normalizeRecipePhotoTextToEnglish(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const translated = /[\u0600-\u06FF]/.test(trimmed)
    ? translateRecipeTitleToEnglish(trimmed)
    : trimmed;
  return translated
    .replace(/[\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function setRecipePhotoCache(key: string, value: CachedRecipePhoto) {
  if (!isDurableRecipeImageUrl(value.imageUrl)) {
    logger.warn("Skipped transient or invalid recipe photo memory cache entry", {
      key,
      signature: value.signature,
      source: value.source
    });
    return;
  }

  if (recipePhotoCache.size >= MAX_RECIPE_PHOTO_CACHE_ITEMS) {
    const oldestKey = recipePhotoCache.keys().next().value;
    if (oldestKey) recipePhotoCache.delete(oldestKey);
  }

  recipePhotoCache.set(key, value);
}

function setRecipePhotoCacheAliases(signatures: string[], value: CachedRecipePhoto) {
  for (const signature of signatures) {
    setRecipePhotoCache(getRecipePhotoSuccessCacheKey(signature), {
      ...value,
      signature
    });
  }
}

function getRecipePhotoCacheBySignatures(signatures: string[]) {
  for (const signature of signatures) {
    const key = getRecipePhotoSuccessCacheKey(signature);
    const cached = recipePhotoCache.get(key);
    if (cached) {
      if (!isDurableRecipeImageUrl(cached.imageUrl)) {
        recipePhotoCache.delete(key);
        logger.warn("Dropped transient or invalid recipe photo from memory cache", {
          signature,
          source: cached.source
        });
        continue;
      }
      return cached;
    }
  }

  return null;
}

function getRecipePhotoFailure(key: string) {
  const cachedFailure = recipePhotoFailureCache.get(key);
  if (!cachedFailure) return null;

  if (cachedFailure.expiresAt <= Date.now()) {
    recipePhotoFailureCache.delete(key);
    return null;
  }

  return cachedFailure;
}

function setRecipePhotoFailureCache(
  key: string,
  value: Omit<CachedRecipePhotoFailure, "expiresAt"> & { cacheTtlMs: number }
) {
  if (recipePhotoFailureCache.size >= MAX_RECIPE_PHOTO_FAILURE_CACHE_ITEMS) {
    const oldestKey = recipePhotoFailureCache.keys().next().value;
    if (oldestKey) recipePhotoFailureCache.delete(oldestKey);
  }

  recipePhotoFailureCache.set(key, {
    error: value.error,
    expiresAt: Date.now() + value.cacheTtlMs,
    retryAfterSeconds: value.retryAfterSeconds,
    source: value.source,
    status: value.status
  });
}

async function performRecipePhotoLookup({
  accessAllowed,
  failureCacheKey,
  imageMode,
  identities,
  ingredientHints,
  arabicDishNameHints,
  exactAliasCandidates,
  generatedAliasCandidates,
  explicitlyExcludedImageUrls,
  query,
  queryCandidates,
  replicateQueryCandidates,
  replicateIdentities,
  exactRecipeNameHint,
  signatureCandidates,
  useReplicateGeneration,
  reason
}: {
  accessAllowed: boolean;
  failureCacheKey: string;
  imageMode: "generated" | "search" | "disabled";
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>;
  ingredientHints: string[];
  arabicDishNameHints: string[];
  exactAliasCandidates: string[];
  generatedAliasCandidates: string[];
  explicitlyExcludedImageUrls: Set<string>;
  query: string;
  queryCandidates: string[];
  replicateQueryCandidates: string[];
  replicateIdentities: Array<ReturnType<typeof buildRecipePhotoIdentity>>;
  exactRecipeNameHint?: string;
  signatureCandidates: string[];
  useReplicateGeneration: boolean;
  reason?: string | null;
}): Promise<RecipePhotoLookupResult> {
  const excludedUrls = new Set([
    ...getRecentlyUsedRecipeImageUrls([...generatedAliasCandidates, ...exactAliasCandidates, ...signatureCandidates]),
    ...explicitlyExcludedImageUrls
  ]);
  const baseIdentity = identities[0] ?? buildRecipePhotoIdentity(query);
  let bestMatch: ProviderRecipePhotoCandidate | null = null;
  let replicateFallbackReason: string | null = null;
  const preferWikimediaFirst = Boolean(baseIdentity.canonicalDishKey);

  if (isStrictVisualIdentity(baseIdentity) && !useReplicateGeneration) {
    const failure = createRecipePhotoFailure(
      "No faithful generated image is available for this strict visual recipe.",
      404,
      STRICT_NO_MATCH_TTL_MS
    );
    setRecipePhotoFailureCache(failureCacheKey, failure);
    return { failure, ok: false };
  }

  if (useReplicateGeneration) {
    if (!isReplicateConfigured()) {
      logger.warn("Premium Replicate recipe image generation is not configured; falling back to provider search", {
        query,
        signature: baseIdentity.signature
      });
      replicateFallbackReason = "replicate_not_configured";
    } else {
      const replicateQuery = selectReplicateRecipePhotoQuery(replicateQueryCandidates, replicateIdentities, ingredientHints);
      if (!replicateQuery) {
        logger.warn("No strong Replicate image prompt was available; falling back to provider search", {
          query,
          signature: baseIdentity.signature
        });
        replicateFallbackReason = "replicate_prompt_unavailable";
      } else {
        const replicateCacheSignature = buildGeneratedRecipePhotoSignature(replicateQuery);
        const generatedCacheAliases = Array.from(new Set([...generatedAliasCandidates, ...exactAliasCandidates]));

        try {
          const generatedImage = await generateRecipeImageWithReplicate(replicateQuery, ingredientHints, {
            alternateDishNames: arabicDishNameHints,
            exactRecipeName: exactRecipeNameHint
          });

          if (generatedImage) {
            const selectedPhoto = {
              imageSource: "api" as const,
              imageUrl: generatedImage.imageUrl,
              model: generatedImage.model ?? getReplicateImageModel(),
              signature: replicateCacheSignature,
              source: "generated" as const
            } satisfies CachedRecipePhoto;

            try {
              const persistedGeneratedPhoto = await persistSharedRecipePhoto(
                {
                  imageUrl: selectedPhoto.imageUrl,
                  model: selectedPhoto.model,
                  query: replicateQuery,
                  signature: replicateCacheSignature,
                  source: selectedPhoto.source
                }
              );
              selectedPhoto.imageUrl = persistedGeneratedPhoto.imageUrl;

              const generatedSelectionSignatures = exactAliasCandidates.length
                ? exactAliasCandidates
                : [selectedPhoto.signature];
              const isDuplicateGeneratedImage =
                excludedUrls.has(selectedPhoto.imageUrl) ||
                isRecipePhotoRecentlyUsedForDifferentSignature(selectedPhoto.imageUrl, generatedSelectionSignatures);
              if (isDuplicateGeneratedImage) {
                logger.warn("Replicate returned an image already excluded for this request; falling back", {
                  query,
                  replicateQuery,
                  signature: replicateCacheSignature
                });
                replicateFallbackReason = "replicate_duplicate_result";
              } else {
                await persistSharedRecipePhotoExactAliases(persistedGeneratedPhoto, generatedCacheAliases);
              }
            } catch (error) {
              logger.warn("Replicate recipe photo exact cache persistence failed; returning retryable premium image failure", {
                query,
                replicateQuery,
                exactAliasCount: generatedCacheAliases.length,
                errorMessage: error instanceof Error ? error.message : String(error)
              });
              replicateFallbackReason = "replicate_persistence_failed";
            }

            if (!replicateFallbackReason) {
              setRecipePhotoCacheAliases([replicateCacheSignature, ...generatedCacheAliases], selectedPhoto);
              rememberRecipePhotoSelection(
                selectedPhoto.imageUrl,
                exactAliasCandidates[0] ?? selectedPhoto.signature
              );
              logger.info("Recipe photo served", {
                source: selectedPhoto.source,
                model: selectedPhoto.model,
                query,
                replicateQuery,
                imageMode,
                reason,
                exactAliasCount: generatedCacheAliases.length,
                uniqueImage: true,
                signature: replicateCacheSignature
              });

              return {
                consumeFreeCredit: false,
                ok: true,
                photo: selectedPhoto
              };
            }
          }

          logger.warn("Replicate did not return a usable unique image; falling back to provider search", {
            query,
            replicateQuery,
            signature: replicateCacheSignature
          });
          replicateFallbackReason = replicateFallbackReason ?? "replicate_unusable_result";
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const status = /\b429\b|rate.?limit/i.test(errorMessage) ? 429 : 503;
          logger.warn("Replicate recipe image generation failed; falling back to provider search", {
            query,
            replicateQuery,
            signature: replicateCacheSignature,
            errorMessage
          });
          replicateFallbackReason = status === 429 ? "replicate_rate_limited" : "replicate_failed";
        }
      }
    }
  }

  if (preferWikimediaFirst && WIKIMEDIA_ENABLED) {
    for (const [index, candidateQuery] of queryCandidates.entries()) {
      const candidateIdentity = identities[index] ?? buildRecipePhotoIdentity(candidateQuery);
      const queryPriorityAdjustment = getRecipePhotoQueryPriorityAdjustment(baseIdentity, candidateIdentity, index);
      if (!shouldTryWikimediaRecipePhoto(candidateIdentity, index)) continue;
      const knownDishPhoto = await findFreeRecipePhoto(candidateQuery);
      if (knownDishPhoto && !excludedUrls.has(knownDishPhoto.imageUrl)) {
        bestMatch = chooseBetterRecipePhoto(bestMatch, {
          attributionName: undefined,
          attributionUrl: undefined,
          imageSource: "wikimedia",
          imageUrl: knownDishPhoto.imageUrl,
          matchedQuery: candidateQuery,
          model: "wikimedia_lookup",
          score: 18,
          signature: candidateIdentity.signature,
          source: knownDishPhoto.source,
          weightedScore: 18 + 0.6 + queryPriorityAdjustment
        });
      }
    }
  }

  if (accessAllowed && isUnsplashRecipePhotoSearchConfigured()) {
    const unsplashResults = await Promise.allSettled(queryCandidates.map(async (candidateQuery, index) => {
      const candidateIdentity = identities[index] ?? buildRecipePhotoIdentity(candidateQuery);
      const queryPriorityAdjustment = getRecipePhotoQueryPriorityAdjustment(baseIdentity, candidateIdentity, index);
      const searchedPhoto = await findUnsplashRecipePhoto(candidateQuery, { excludeUrls: excludedUrls });
      if (searchedPhoto) {
        return {
          attributionName: searchedPhoto.attributionName,
          attributionUrl: searchedPhoto.attributionUrl,
          imageSource: "unsplash",
          imageUrl: searchedPhoto.imageUrl,
          matchedQuery: searchedPhoto.matchedQuery || candidateQuery,
          model: "unsplash_search",
          score: searchedPhoto.score,
          signature: candidateIdentity.signature,
          source: searchedPhoto.source,
          weightedScore: searchedPhoto.score + 0.2 + queryPriorityAdjustment
        } satisfies ProviderRecipePhotoCandidate;
      }
      return null;
    }));
    for (const result of unsplashResults) {
      if (result.status === "fulfilled" && result.value) {
        bestMatch = chooseBetterRecipePhoto(bestMatch, result.value);
      }
    }
  }

  if (!(bestMatch && meetsRecipePhotoConfidenceThreshold(bestMatch)) && accessAllowed && isPexelsRecipePhotoSearchConfigured()) {
    const pexelsResults = await Promise.allSettled(queryCandidates.map(async (candidateQuery, index) => {
      const candidateIdentity = identities[index] ?? buildRecipePhotoIdentity(candidateQuery);
      const queryPriorityAdjustment = getRecipePhotoQueryPriorityAdjustment(baseIdentity, candidateIdentity, index);
      const searchedPhoto = await findPexelsRecipePhoto(candidateQuery, { excludeUrls: excludedUrls });
      if (searchedPhoto) {
        return {
          imageSource: "search",
          imageUrl: searchedPhoto.imageUrl,
          matchedQuery: searchedPhoto.matchedQuery || candidateQuery,
          model: "pexels_search",
          score: searchedPhoto.score,
          signature: candidateIdentity.signature,
          source: searchedPhoto.source,
          weightedScore: searchedPhoto.score + queryPriorityAdjustment
        } satisfies ProviderRecipePhotoCandidate;
      }
      return null;
    }));
    for (const result of pexelsResults) {
      if (result.status === "fulfilled" && result.value) {
        bestMatch = chooseBetterRecipePhoto(bestMatch, result.value);
      }
    }
  }

  if (!(bestMatch && meetsRecipePhotoConfidenceThreshold(bestMatch)) && !preferWikimediaFirst && WIKIMEDIA_ENABLED) {
    for (const [index, candidateQuery] of queryCandidates.entries()) {
      const candidateIdentity = identities[index] ?? buildRecipePhotoIdentity(candidateQuery);
      const queryPriorityAdjustment = getRecipePhotoQueryPriorityAdjustment(baseIdentity, candidateIdentity, index);
      if (!shouldTryWikimediaRecipePhoto(candidateIdentity, index)) continue;
      const knownDishPhoto = await findFreeRecipePhoto(candidateQuery);
      if (knownDishPhoto && !excludedUrls.has(knownDishPhoto.imageUrl)) {
        bestMatch = chooseBetterRecipePhoto(bestMatch, {
          attributionName: undefined,
          attributionUrl: undefined,
          imageSource: "wikimedia",
          imageUrl: knownDishPhoto.imageUrl,
          matchedQuery: candidateQuery,
          model: "wikimedia_lookup",
          score: 18,
          signature: candidateIdentity.signature,
          source: knownDishPhoto.source,
          weightedScore: 18.5 + queryPriorityAdjustment
        });
      }
    }
  }

  if (bestMatch && meetsRecipePhotoConfidenceThreshold(bestMatch)) {
    const selectedPhoto = {
      imageAttributionName: bestMatch.attributionName,
      imageAttributionUrl: bestMatch.attributionUrl,
      imageSource: bestMatch.imageSource,
      imageUrl: bestMatch.imageUrl,
      model: bestMatch.model,
      signature: bestMatch.signature,
      source: bestMatch.source
    } satisfies CachedRecipePhoto;

    rememberRecipePhotoSelection(selectedPhoto.imageUrl, bestMatch.signature);
    logger.info("Recipe photo served", {
      source: selectedPhoto.source,
      query,
      matchedQuery: bestMatch.matchedQuery,
      imageUrl: selectedPhoto.imageUrl,
      imageMode,
      reason,
      replicateFallbackReason,
      score: bestMatch.score,
      cached: false,
      cachePolicy: "replicate_generated_only",
      signature: bestMatch.signature
    });

    return {
      consumeFreeCredit: false,
      ok: true,
      photo: selectedPhoto
    };
  }

  const noMatchFailure = useReplicateGeneration
    ? createRecipePhotoFailure(
        replicateFallbackReason
          ? "Replicate was unavailable and no strong backup recipe photo matched yet. Retrying with generated and backup sources shortly."
          : "Premium recipe image generation is still working. Retrying with generated and backup sources shortly.",
        503,
        PREMIUM_REPLICATE_RETRY_TTL_MS,
        PREMIUM_REPLICATE_RETRY_AFTER_SECONDS
      )
    : createRecipePhotoFailure(
        "No strong plated recipe photo was found from cache, Unsplash, or Pexels search.",
        404,
        STRICT_NO_MATCH_TTL_MS
      );

  setRecipePhotoFailureCache(failureCacheKey, noMatchFailure);
  logger.info("Recipe photo served", {
    source: "unavailable",
    query,
    queryCandidates,
    imageMode,
    reason,
    replicateFallbackReason,
    signature: identities[0]?.signature ?? "unknown"
  });

  return {
    failure: noMatchFailure,
    ok: false
  };
}

async function buildRecipePhotoLookupResponse(
  result: RecipePhotoLookupResult,
  access: Awaited<ReturnType<typeof canUseApiFeature>>["access"]
) {
  if (!result.ok) {
    return buildRecipePhotoFailureResponse(result.failure, access);
  }

  const nextAccess = result.consumeFreeCredit ? await consumeFreeAiCredit(access, "recipe_image") : access;
  logger.info("Recipe photo served", {
    source: result.photo.source,
    model: result.photo.model,
    cached: false,
    signature: result.photo.signature
  });

  return Response.json(
    {
      ...result.photo,
      access: accessPayload(nextAccess)
    },
    { headers: buildRecipePhotoResponseHeaders("success") }
  );
}

function buildRecipePhotoFailureResponse(
  failure: Omit<CachedRecipePhotoFailure, "expiresAt">,
  access: Awaited<ReturnType<typeof canUseApiFeature>>["access"]
) {
  const headers = new Headers(buildRecipePhotoResponseHeaders("failure"));
  if (failure.retryAfterSeconds) {
    headers.set("Retry-After", String(failure.retryAfterSeconds));
  }

  return Response.json(
    {
      error: failure.error,
      imageUrl: "",
      source: failure.source,
      access: accessPayload(access)
    },
    { headers, status: failure.status }
  );
}

function createRecipePhotoFailure(error: string, status: number, cacheTtlMs: number, retryAfterSeconds?: number) {
  return {
    cacheTtlMs,
    error,
    retryAfterSeconds,
    source: "unavailable" as const,
    status
  };
}

function buildRecipePhotoResponseHeaders(result: "success" | "failure") {
  return {
    "Cache-Control": result === "success"
      ? "private, max-age=300, stale-while-revalidate=86400"
      : "private, max-age=60"
  };
}

function chooseBetterRecipePhoto(
  current: ProviderRecipePhotoCandidate | null,
  candidate: ProviderRecipePhotoCandidate
) {
  if (!current) return candidate;
  if (candidate.weightedScore > current.weightedScore) return candidate;
  if (candidate.weightedScore === current.weightedScore && candidate.source === "unsplash_search") return candidate;
  return current;
}

function buildGeneratedRecipePhotoSignature(query: string) {
  const normalized = normalizeRecipePhotoQuery(query)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, "-")
    .slice(0, 96);
  const identity = buildRecipePhotoIdentity(query);
  const strictPrefix = isStrictVisualIdentity(identity) ? `${STRICT_RECIPE_PHOTO_CACHE_VERSION}:` : "";

  return `generated:${strictPrefix}${normalized || "food"}`;
}

function buildLegacyExactRecipePhotoCacheCandidates(
  queryCandidates: string[],
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>
) {
  const candidates: string[] = [];

  for (const [index, query] of queryCandidates.entries()) {
    const identity = identities[index] ?? buildRecipePhotoIdentity(query);
    if (!isStrongLegacyExactRecipePhotoIdentity(identity)) continue;

    candidates.push(identity.signature);
    candidates.push(buildGeneratedRecipePhotoSignature(query));

    if (identity.canonicalDishKey) {
      candidates.push(`generated:${identity.canonicalDishKey}`);
      candidates.push(`${identity.canonicalDishKey}|${identity.cuisineKey ?? "general"}`);
    }

    if (identity.familyKey && identity.familyKey === identity.canonicalDishKey) {
      candidates.push(`generated:${identity.familyKey}`);
    }
  }

  return Array.from(new Set(candidates)).slice(0, 12);
}

function buildGeneratedRecipePhotoCacheAliasCandidates(
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>
) {
  const candidates: string[] = [];

  for (const identity of identities) {
    if (identity.canonicalDishKey) {
      candidates.push(`generated:${STRICT_RECIPE_PHOTO_CACHE_VERSION}:${identity.canonicalDishKey}`);
      candidates.push(
        `generated:${STRICT_RECIPE_PHOTO_CACHE_VERSION}:${identity.canonicalDishKey}|${identity.cuisineKey ?? "general"}`
      );
    }

    // Generated images must stay tied to a specific card/dish identity. Broad
    // family aliases caused different cards such as kofta, hawawshi, and pide
    // to reuse the same ground-meat image.
  }

  return Array.from(new Set(candidates)).slice(0, 16);
}

function selectExactRecipePhotoNameHint(exactNameHints: string[]) {
  return exactNameHints.find((hint) => /[a-z]/i.test(hint)) ?? exactNameHints[0];
}

function isStrongLegacyExactRecipePhotoIdentity(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  if (identity.canonicalDishKey) return true;
  if (identity.familyKey && identity.cuisineKey && identity.cuisineKey !== "general") return true;
  return false;
}

async function persistExactAliasesForLegacyPhoto(photo: CachedRecipePhoto, exactAliasCandidates: string[]) {
  if (!exactAliasCandidates.length) return;
  if (photo.source !== "generated") return;

  try {
    await persistSharedRecipePhotoExactAliases(
      {
        imageAttributionName: photo.imageAttributionName,
        imageAttributionUrl: photo.imageAttributionUrl,
        imageUrl: photo.imageUrl,
        model: photo.model,
        query: photo.signature,
        signature: photo.signature,
        source: photo.source
      },
      exactAliasCandidates
    );
  } catch (error) {
    logger.warn("Exact recipe photo alias backfill failed; serving cached image anyway", {
      exactAliasCount: exactAliasCandidates.length,
      signature: photo.signature,
      source: photo.source,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}

function selectReplicateRecipePhotoQuery(
  queryCandidates: string[],
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>,
  ingredientHints: string[]
) {
  const scored = queryCandidates
    .map((candidateQuery, index) => {
      const identity = identities[index] ?? buildRecipePhotoIdentity(candidateQuery);
      return {
        candidateQuery,
        identity,
        score: scoreReplicateRecipePhotoQuery(candidateQuery, identity)
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best || best.score < 10) {
    return buildFallbackReplicateRecipePhotoQuery(identities, ingredientHints);
  }

  if (isGenericReplicateRecipePhotoQuery(best.candidateQuery, best.identity)) {
    return buildFallbackReplicateRecipePhotoQuery(identities, ingredientHints);
  }

  return best.candidateQuery;
}

function scoreReplicateRecipePhotoQuery(
  candidateQuery: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>
) {
  const normalizedQuery = candidateQuery.trim().toLowerCase();
  if (!normalizedQuery) return -100;
  if (isGenericReplicateRecipePhotoQuery(candidateQuery, identity)) return -100;

  let score = 0;
  if (identity.canonicalDishKey) score += 30;
  if (identity.familyKey) score += 20;
  if (identity.mainIngredientKey) score += 14;
  if (identity.starchKey) score += 10;
  if (identity.sauceKey) score += 8;
  if (identity.cuisineKey && identity.cuisineKey !== "general") score += 8;
  if (identity.cookingMethodKey) score += 4;
  const tokenCount = identity.cleanQuery.split(/\s+/).filter(Boolean).length;
  if (tokenCount >= 2) score += 4;
  if (tokenCount >= 3) score += 6;
  if (!/\bfood\b/i.test(normalizedQuery)) score += 8;
  if (/\b(egyptian|turkish|italian|mediterranean|asian|american|middle eastern)\b/i.test(normalizedQuery)) {
    score += 3;
  }
  if (/\btraditional\b/i.test(normalizedQuery)) score -= 12;
  if (/\bfood\b/i.test(normalizedQuery)) score -= 14;

  return score;
}

function isGenericReplicateRecipePhotoQuery(
  candidateQuery: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>
) {
  const normalizedQuery = candidateQuery.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (/^(food|meal|dish|recipe|plate)$/i.test(normalizedQuery)) return true;
  if (identity.signature === "meal|general|general|general|general") return true;
  if (/^\w+\s+food$/i.test(normalizedQuery)) return true;
  if (/^\w+\s+traditional$/i.test(normalizedQuery)) return true;
  if (/^(traditional|generic)\s+\w+$/i.test(normalizedQuery)) return true;
  if (/^(food|generic food|traditional food)$/i.test(normalizedQuery)) return true;

  const tokenCount = identity.cleanQuery.split(/\s+/).filter(Boolean).length;
  const hasDishSignals = Boolean(
    identity.canonicalDishKey ||
      identity.familyKey ||
      identity.mainIngredientKey ||
      identity.starchKey ||
      identity.sauceKey ||
      identity.cookingMethodKey
  );

  if (!hasDishSignals && tokenCount < 3) return true;
  if (!identity.canonicalDishKey && /\bfood\b/i.test(normalizedQuery) && !identity.mainIngredientKey && !identity.starchKey) {
    return true;
  }

  return false;
}

function buildFallbackReplicateRecipePhotoQuery(
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>,
  ingredientHints: string[]
) {
  const bestIdentity =
    identities.find(
      (identity) =>
        identity.canonicalDishKey ||
        identity.familyKey ||
        identity.mainIngredientKey ||
        identity.starchKey ||
        identity.sauceKey ||
        identity.cookingMethodKey
    ) ?? identities[0];

  const normalizedIngredients = Array.from(
    new Set(
      ingredientHints
        .map((ingredient) => normalizeRecipePhotoQuery(ingredient))
        .filter((ingredient) => ingredient.length >= 3)
        .filter((ingredient) => !/^(food|meal|dish|recipe|plate|traditional)$/i.test(ingredient))
    )
  ).slice(0, 3);

  const fallbackCandidates = [
    normalizeRecipePhotoQuery(
      [
        bestIdentity?.canonicalDishKey?.replace(/-/g, " "),
        bestIdentity?.cuisineKey,
        ...normalizedIngredients.slice(0, 2)
      ]
        .filter(Boolean)
        .join(" ")
    ),
    normalizeRecipePhotoQuery(
      [
        bestIdentity?.familyKey?.replace(/-/g, " "),
        bestIdentity?.mainIngredientKey,
        bestIdentity?.starchKey,
        ...normalizedIngredients.slice(0, 1)
      ]
        .filter(Boolean)
        .join(" ")
    ),
    normalizeRecipePhotoQuery(
      [
        bestIdentity?.cuisineKey,
        bestIdentity?.mainIngredientKey,
        bestIdentity?.sauceKey,
        bestIdentity?.starchKey,
        ...normalizedIngredients.slice(0, 1)
      ]
        .filter(Boolean)
        .join(" ")
    ),
    normalizeRecipePhotoQuery(
      [
        bestIdentity?.mainIngredientKey,
        bestIdentity?.starchKey,
        ...normalizedIngredients.slice(0, 2)
      ]
        .filter(Boolean)
        .join(" ")
    )
  ];

  return (
    fallbackCandidates.find((candidate) => {
      if (!candidate || candidate === "food") return false;
      return !isGenericReplicateRecipePhotoQuery(candidate, buildRecipePhotoIdentity(candidate));
    }) ?? null
  );
}

function getRecipePhotoQueryPriorityAdjustment(
  baseIdentity: ReturnType<typeof buildRecipePhotoIdentity>,
  queryIdentity: ReturnType<typeof buildRecipePhotoIdentity>,
  index: number
) {
  let adjustment = Math.max(0, 1.8 - index * 0.45);

  if (baseIdentity.mainIngredientKey && queryIdentity.mainIngredientKey) {
    adjustment += baseIdentity.mainIngredientKey === queryIdentity.mainIngredientKey ? 1.4 : -6;
  }

  if (baseIdentity.sauceKey && queryIdentity.sauceKey) {
    adjustment += baseIdentity.sauceKey === queryIdentity.sauceKey ? 1.1 : -5;
  }

  if (baseIdentity.starchKey && queryIdentity.starchKey) {
    adjustment += baseIdentity.starchKey === queryIdentity.starchKey ? 0.9 : -3.5;
  }

  if (/\bmussel|mussels\b/i.test(baseIdentity.cleanQuery) && /\bshrimp|prawn\b/i.test(queryIdentity.cleanQuery)) {
    adjustment -= 7;
  }

  if (/\btahini|sesame sauce\b/i.test(baseIdentity.cleanQuery) && /\b(pasta|spaghetti|linguine|marinara|pomodoro|red sauce)\b/i.test(queryIdentity.cleanQuery)) {
    adjustment -= 7;
  }

  return adjustment;
}

function getRecentlyUsedRecipeImageUrls(signatureCandidates: string[]) {
  const now = Date.now();
  const allowedSignatures = new Set(signatureCandidates);
  const excluded = new Set<string>();

  for (const [imageUrl, entry] of recentRecipePhotoSelections.entries()) {
    if (entry.expiresAt <= now) {
      recentRecipePhotoSelections.delete(imageUrl);
      continue;
    }

    if (!allowedSignatures.has(entry.signature)) {
      excluded.add(imageUrl);
    }
  }

  return excluded;
}

function rememberRecipePhotoSelection(imageUrl: string, signature: string) {
  if (!isDurableRecipeImageUrl(imageUrl)) return;
  recentRecipePhotoSelections.set(imageUrl, {
    expiresAt: Date.now() + RECENT_SELECTION_TTL_MS,
    signature
  });
}

function isRecipePhotoRecentlyUsedForDifferentSignature(imageUrl: string, signatureCandidates: string[]) {
  const existing = recentRecipePhotoSelections.get(imageUrl);
  if (!existing) return false;
  if (existing.expiresAt <= Date.now()) {
    recentRecipePhotoSelections.delete(imageUrl);
    return false;
  }

  return !signatureCandidates.includes(existing.signature);
}

function meetsRecipePhotoConfidenceThreshold(candidate: ProviderRecipePhotoCandidate) {
  return candidate.score >= MIN_ACCEPTED_PROVIDER_SCORE[candidate.source];
}

function isStrictVisualIdentity(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  if (isStrictRecipePhotoIdentity(identity)) return true;

  const source = [
    identity.cleanQuery,
    identity.canonicalDishKey,
    identity.familyKey,
    identity.mainIngredientKey,
    identity.mealTypeKey,
    identity.starchKey
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\b(liver|kebda|kibda|ciger|cigeri|fish|seafood|shrimp|prawn|mussel|mussels|clam|clams|calamari|squid|tuna|salmon|sayadeya|sayadieh|sayadiah|samak|singari|sengari|bori|bouri)\b/.test(source) ||
    /\b(ground|minced|mince)\s+(beef|meat|lamb|veal|protein)\b|\b(beef|meat|lamb|veal)\s+(ground|minced|mince)\b|\bground\s+meat\b|\bminced\s+meat\b|\b(kofta|kafta|kofte|kefta|adana|lahmacun|lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen|kiymali\s+pide|hawawshi)\b|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646|\u0623\u0636\u0646\u0629|\u0627\u062f\u0646\u0629|(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?|\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?/iu.test(source)
  );
}

function shouldTryWikimediaRecipePhoto(identity: ReturnType<typeof buildRecipePhotoIdentity>, index: number) {
  if (index > 1) return false;
  if (identity.canonicalDishKey) return true;
  return Boolean(identity.familyKey && WIKIMEDIA_FAMILY_ALLOWLIST.has(identity.familyKey));
}

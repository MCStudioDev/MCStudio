import { z } from "zod";
import { findUnsplashRecipePhoto, isUnsplashRecipePhotoSearchConfigured } from "@/lib/unsplashRecipePhotoSearch";
import { findPexelsRecipePhoto, isPexelsRecipePhotoSearchConfigured } from "@/lib/pexelsRecipePhotoSearch";
import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import {
  getSharedRecipePhotoBySignatures,
  persistSharedRecipePhotoAliases
} from "@/lib/sharedRecipePhotoCache";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  query: z.string().min(3)
});

type CachedRecipePhoto = {
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource: "cache" | "search" | "unsplash" | "wikimedia";
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

const recipePhotoCache = new Map<string, CachedRecipePhoto>();
const recipePhotoFailureCache = new Map<string, CachedRecipePhotoFailure>();
const inFlightRecipePhotoLookups = new Map<string, Promise<RecipePhotoLookupResult>>();
const MAX_RECIPE_PHOTO_CACHE_ITEMS = 120;
const MAX_RECIPE_PHOTO_FAILURE_CACHE_ITEMS = 120;
const STRICT_NO_MATCH_TTL_MS = 30 * 60 * 1000;
const WIKIMEDIA_ENABLED = false;

export async function GET(request: Request) {
  let accessCheck: Awaited<ReturnType<typeof canUseApiFeature>>;
  try {
    accessCheck = await canUseApiFeature(request, "recipe_image");
  } catch (error) {
    return accessErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    query: searchParams.get("query")
  });

  if (!parsed.success) {
    return Response.json({ error: "A recipe photo query is required." }, { status: 400 });
  }

  const queryCandidates = normalizeRecipePhotoQueries([
    parsed.data.query,
    ...searchParams.getAll("alt")
  ]);
  const query = queryCandidates[0] ?? parsed.data.query.trim();
  const identities = queryCandidates.map((candidate) => buildRecipePhotoIdentity(candidate));
  const identity = identities[0] ?? buildRecipePhotoIdentity(query);
  const signatureCandidates = Array.from(
    new Set(identities.flatMap((entry) => [entry.signature, ...entry.alternateSignatures]))
  );
  const imageMode = accessCheck.allowed ? "search" : "disabled";
  const failureCacheKey = getRecipePhotoFailureCacheKey(queryCandidates.join("||") || identity.signature, imageMode);

  const cached = getRecipePhotoCacheBySignatures(signatureCandidates);
  if (cached) {
    console.info("Recipe photo served", {
      source: cached.source,
      query,
      cached: true,
      model: cached.model,
      imageMode,
      signature: identity.signature
    });

    return Response.json({
      ...cached,
      imageSource: "cache",
      access: accessPayload(accessCheck.access)
    });
  }

  const sharedCached = await getSharedRecipePhotoBySignatures(signatureCandidates);
  if (sharedCached && (WIKIMEDIA_ENABLED || sharedCached.source !== "wikimedia")) {
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

    console.info("Recipe photo served", {
      source: sharedPhoto.source,
      query,
      cached: true,
      model: sharedPhoto.model,
      imageMode,
      sharedCache: true,
      signature: identity.signature
    });

    return Response.json({
      ...sharedPhoto,
      access: accessPayload(accessCheck.access)
    });
  }

  const cachedFailure = getRecipePhotoFailure(failureCacheKey);
  if (cachedFailure) {
    console.info("Recipe photo request skipped", {
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
      console.info("Recipe photo request joined in-flight lookup", {
        query,
        imageMode,
        signature: identity.signature
      });

      const result = await joinedLookup;
      return buildRecipePhotoLookupResponse(result, accessCheck.access);
    }

    const lookupPromise = performRecipePhotoLookup({
      accessAllowed: accessCheck.allowed,
      failureCacheKey,
      imageMode,
      identities,
      query,
      queryCandidates,
      reason: accessCheck.reason
    }).finally(() => {
      inFlightRecipePhotoLookups.delete(failureCacheKey);
    });

    inFlightRecipePhotoLookups.set(failureCacheKey, lookupPromise);

    const result = await lookupPromise;
    return buildRecipePhotoLookupResponse(result, accessCheck.access);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to look up a recipe photo.";
    console.error("Recipe photo generation failed", {
      query,
      message,
      signature: identity.signature
    });

    return Response.json({ error: message }, { status: 500 });
  }
}

function getRecipePhotoSuccessCacheKey(signature: string) {
  return `success:${signature}`;
}

function getRecipePhotoFailureCacheKey(signature: string, imageMode: "search" | "disabled") {
  return `${imageMode}:${signature}`;
}

function normalizeRecipePhotoQueries(queries: string[]) {
  return Array.from(
    new Set(
      queries
        .map((value) => value.trim().replace(/\s+/g, " "))
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 5);
}

function setRecipePhotoCache(key: string, value: CachedRecipePhoto) {
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
    const cached = recipePhotoCache.get(getRecipePhotoSuccessCacheKey(signature));
    if (cached) {
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
  query,
  queryCandidates,
  reason
}: {
  accessAllowed: boolean;
  failureCacheKey: string;
  imageMode: "search" | "disabled";
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>;
  query: string;
  queryCandidates: string[];
  reason?: string | null;
}): Promise<RecipePhotoLookupResult> {
  for (const [index, candidateQuery] of queryCandidates.entries()) {
    const candidateIdentity = identities[index] ?? buildRecipePhotoIdentity(candidateQuery);
    const alternateSignatures = identities
      .flatMap((entry) => [entry.signature, ...entry.alternateSignatures])
      .filter((signature) => signature !== candidateIdentity.signature);

    if (accessAllowed && isUnsplashRecipePhotoSearchConfigured()) {
      const searchedPhoto = await findUnsplashRecipePhoto(candidateQuery);
      if (searchedPhoto) {
        const persistedSearchPhoto = await persistSharedRecipePhotoAliases(
          {
            imageAttributionName: searchedPhoto.attributionName,
            imageAttributionUrl: searchedPhoto.attributionUrl,
            imageUrl: searchedPhoto.imageUrl,
            query: candidateQuery,
            signature: candidateIdentity.signature,
            source: searchedPhoto.source
          },
          alternateSignatures
        );
        const unsplashPhoto = {
          imageAttributionName: persistedSearchPhoto.imageAttributionName,
          imageAttributionUrl: persistedSearchPhoto.imageAttributionUrl,
          imageSource: "unsplash" as const,
          imageUrl: persistedSearchPhoto.imageUrl,
          model: "unsplash_search",
          signature: candidateIdentity.signature,
          source: persistedSearchPhoto.source
        } satisfies CachedRecipePhoto;

        setRecipePhotoCacheAliases([candidateIdentity.signature, ...alternateSignatures], unsplashPhoto);
        console.info("Recipe photo served", {
          source: unsplashPhoto.source,
          query,
          matchedQuery: candidateQuery,
          imageUrl: unsplashPhoto.imageUrl,
          imageMode,
          reason,
          signature: candidateIdentity.signature
        });

        return {
          consumeFreeCredit: false,
          ok: true,
          photo: unsplashPhoto
        };
      }
    }

    if (accessAllowed && isPexelsRecipePhotoSearchConfigured()) {
      const searchedPhoto = await findPexelsRecipePhoto(candidateQuery);
      if (searchedPhoto) {
        const persistedSearchPhoto = await persistSharedRecipePhotoAliases(
          {
            ...searchedPhoto,
            query: candidateQuery,
            signature: candidateIdentity.signature
          },
          alternateSignatures
        );
        const pexelsPhoto = {
          imageAttributionName: persistedSearchPhoto.imageAttributionName,
          imageAttributionUrl: persistedSearchPhoto.imageAttributionUrl,
          imageSource: "search" as const,
          imageUrl: persistedSearchPhoto.imageUrl,
          model: "pexels_search",
          signature: candidateIdentity.signature,
          source: persistedSearchPhoto.source
        } satisfies CachedRecipePhoto;

        setRecipePhotoCacheAliases([candidateIdentity.signature, ...alternateSignatures], pexelsPhoto);
        console.info("Recipe photo served", {
          source: pexelsPhoto.source,
          query,
          matchedQuery: candidateQuery,
          imageUrl: pexelsPhoto.imageUrl,
          imageMode,
          reason,
          signature: candidateIdentity.signature
        });

        return {
          consumeFreeCredit: false,
          ok: true,
          photo: pexelsPhoto
        };
      }
    }

  }

  const noMatchFailure = createRecipePhotoFailure(
    "No exact recipe photo was found from cache, Unsplash, or Pexels search.",
    404,
    STRICT_NO_MATCH_TTL_MS
  );

  setRecipePhotoFailureCache(failureCacheKey, noMatchFailure);
  console.info("Recipe photo served", {
    source: "unavailable",
    query,
    queryCandidates,
    imageMode,
    reason,
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
  console.info("Recipe photo served", {
    source: result.photo.source,
    model: result.photo.model,
    cached: false,
    signature: result.photo.signature
  });

  return Response.json({
    ...result.photo,
    access: accessPayload(nextAccess)
  });
}

function buildRecipePhotoFailureResponse(
  failure: Omit<CachedRecipePhotoFailure, "expiresAt">,
  access: Awaited<ReturnType<typeof canUseApiFeature>>["access"]
) {
  const headers = new Headers();
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

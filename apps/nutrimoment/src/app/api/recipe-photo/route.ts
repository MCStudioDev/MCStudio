import { z } from "zod";
import { generateRecipeImageWithReplicate, getReplicateImageModel, isReplicateConfigured } from "@/lib/replicateRecipeImage";
import {
  buildGeneratedRecipePhotoCacheQuery,
  buildGeneratedRecipePhotoStorageSlug,
  buildRecipePhotoIdentity,
  isStrictRecipePhotoIdentity,
  normalizeRecipePhotoQuery,
  type RecipePhotoIdentityOverride
} from "@/lib/recipePhotoIdentity";
import { toIdentityKey } from "@/lib/photoIdentityBuilders";
import {
  getSharedGeneratedRecipePhotoByQueries,
  getSharedRecipePhotoByApproximateCategory,
  getSharedRecipePhotoByExactAliases,
  getSharedRecipePhotoByQueryOrSignature,
  getSharedRecipePhotoBySignatures,
  persistSharedRecipePhoto,
  persistSharedRecipePhotoExactAliases,
  type SharedRecipePhotoEntry
} from "@/lib/sharedRecipePhotoCache";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiActionImageGrant,
  consumeFreeAiCredit,
  hasFreeAiActionImageGrantForKey,
  hasGeneratedRecipeImageAccess
} from "@/services/authService";
import { logger } from "@/lib/logger";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import {
  isReplicateGenerationAllowedForUser,
  recordReplicateGeneration
} from "@/services/replicateCostCapService";
import {
  translateIngredientToEnglish,
  translateRecipeTitleToEnglish
} from "@/lib/arabicRecipeLocalization";
import {
  buildRecipePhotoExactAliases,
  normalizeExactRecipePhotoHints
} from "@/lib/recipePhotoExactIdentity";
import { isDurableRecipeImageUrl, isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";
import { isKnownWeakRecipeProviderImageUrl } from "@/lib/recipeImageQuality";
import {
  isApproximateRecipePhotoCacheCompatible,
  isExactGeneratedRecipePhotoQueryMatch,
  isGeneratedRecipePhotoCachePayloadConsistent,
  isGeneratedRecipePhotoUrlCompatibleWithQueries
} from "@/services/recipePhotoCacheCompatibility";
import {
  buildRecipePhotoReuseKeyCandidates,
  buildRecipePhotoReuseKeyFromQuery
} from "@/lib/recipePhotoReuse";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import {
  inferRecipePhotoDietIds,
  isRecipePhotoDietCompatible,
  normalizeRecipePhotoDietIds,
  scopeRecipePhotoAliasesForDiet
} from "@/services/recipePhotoDietCompatibility";
import {
  linkGeneratedPhotoToSharedRecipes,
  resolveAndLinkSharedRecipePhotoById
} from "@/services/sharedRecipePhotoLinkService";
import type { RecipeImageSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  query: z.string().min(3)
});

type CachedRecipePhoto = {
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource: RecipeImageSource;
  imageUrl: string;
  source: "generated";
  model?: string;
  query?: string;
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
const recentRecipePhotoSelections = new Map<string, { expiresAt: number; reuseKey: string; signature: string }>();
const MAX_RECIPE_PHOTO_CACHE_ITEMS = 120;
const MAX_RECIPE_PHOTO_FAILURE_CACHE_ITEMS = 120;
const STRICT_NO_MATCH_TTL_MS = 30 * 60 * 1000;
const RECENT_SELECTION_TTL_MS = 30 * 60 * 1000;
const PREMIUM_REPLICATE_RETRY_TTL_MS = 3 * 1000;
const PREMIUM_REPLICATE_RETRY_AFTER_SECONDS = 2;
const FIRESTORE_RECIPE_PHOTO_CACHE_ONLY = false;
const STRICT_RECIPE_PHOTO_CACHE_VERSION = "strict-v7";
const STRICT_RECIPE_PHOTO_CACHE_PATTERN = /(?:^|:)strict-v\d+(?=:)/i;

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
    isPremium: hasGeneratedRecipeImageAccess(accessCheck.access),
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
  const activeDiets = normalizeRecipePhotoDietIds([
    ...searchParams.getAll("diet"),
    ...inferRecipePhotoDietIds([...rawQueryCandidates, ...exactNameHints])
  ]);
  const arabicDishNameHints = extractArabicDishNameHints(rawQueryCandidates);
  const exactRecipeNameHint = selectExactRecipePhotoNameHint(exactNameHints);
  const ingredientHints = normalizeRecipePhotoIngredientHints(searchParams.getAll("ingredient"));
  const detailedCacheQueryCandidates = buildRecipePhotoQueryCandidates({
    cuisine: searchParams.get("cuisine") ?? undefined,
    imageSearchIndex: parsed.data.query,
    imageSearchIndices: rawQueryCandidates,
    ingredients: ingredientHints,
    name: exactRecipeNameHint ?? parsed.data.query
  });
  const queryCandidates = normalizeRecipePhotoQueries([
    ...detailedCacheQueryCandidates,
    ...rawQueryCandidates
  ]);
  const replicateQueryCandidates = addDietContextToRecipePhotoQueries(normalizeRecipePhotoQueries([
    ...exactNameHints,
    ...detailedCacheQueryCandidates,
    ...rawQueryCandidates
  ]), activeDiets);
  const explicitlyExcludedImageUrls = normalizeExcludedRecipePhotoUrls(searchParams.getAll("exclude"));
  const cacheOnly = searchParams.get("cacheOnly") === "1" || searchParams.get("cacheOnly") === "true";
  const actionGrantId = normalizeAiActionGrantId(searchParams.get("actionGrant"));
  const sourceRecipeId = normalizeSharedRecipeId(searchParams.get("sourceRecipeId"));
  const strictIdentity = searchParams.get("strictIdentity") === "1" || searchParams.get("strictIdentity") === "true";
  const baseUnscopedExactAliasCandidates = buildRecipePhotoExactAliases({
    cuisine: searchParams.get("cuisine") ?? undefined,
    names: exactNameHints
  });
  const photoIdentityOverride = buildPhotoIdentityOverrideFromSearchParams(searchParams);
  const query = queryCandidates[0] ?? parsed.data.query.trim();
  const identities = queryCandidates.map((candidate) => buildRecipePhotoIdentity(candidate, photoIdentityOverride));
  const replicateIdentities = replicateQueryCandidates.map((candidate) => buildRecipePhotoIdentity(candidate, photoIdentityOverride));
  const canonicalAliasCandidates = Array.from(new Set(
    [...identities, ...replicateIdentities]
      .map((entry) => entry.canonicalDishKey)
      .filter((value): value is string => Boolean(value))
      .map((value) => `exact:canonical:${value}`)
  ));
  const unscopedExactAliasCandidates = Array.from(new Set([
    ...baseUnscopedExactAliasCandidates,
    ...canonicalAliasCandidates
  ])).slice(0, 16);
  const exactAliasCandidates = scopeRecipePhotoAliasesForDiet(unscopedExactAliasCandidates, activeDiets);
  const reuseKeyCandidates = buildRecipePhotoReuseKeyCandidates([
    ...queryCandidates,
    ...replicateQueryCandidates,
    ...exactNameHints
  ]);
  const identity = identities[0] ?? buildRecipePhotoIdentity(query, photoIdentityOverride);
  const strictVisualRequest =
    identities.some(isStrictVisualIdentity) ||
    replicateIdentities.some(isStrictVisualIdentity) ||
    isStrictVisualIdentity(identity);
  const liverVisualRequest = isLiverRecipePhotoRequest([
    ...queryCandidates,
    ...replicateQueryCandidates,
    ...exactNameHints,
    ...ingredientHints
  ]);

  const hasNativeGenerationTier = hasGeneratedRecipeImageAccess(accessCheck.access);
  const hasActionGenerationGrant = !hasNativeGenerationTier &&
    await hasFreeAiActionImageGrantForKey(accessCheck.access, actionGrantId, identity.signature).catch((error) => {
      logger.warn("Free AI action photo grant lookup failed", {
        uid: accessCheck.access.uid,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      return false;
    });
  const hasGenerationTier = !FIRESTORE_RECIPE_PHOTO_CACHE_ONLY &&
    (hasNativeGenerationTier || hasActionGenerationGrant);
  let replicateCapDecision: Awaited<ReturnType<typeof isReplicateGenerationAllowedForUser>> | null = null;
  if (hasGenerationTier) {
    replicateCapDecision = await isReplicateGenerationAllowedForUser(accessCheck.access);
    if (!replicateCapDecision.allowed) {
      logger.warn("Replicate cost cap denied generation; downgrading this request to search mode", {
        uid: accessCheck.access.uid,
        reason: replicateCapDecision.reason,
        dailyLimit: replicateCapDecision.dailyLimit,
        dailyUsed: replicateCapDecision.dailyUsed,
        query
      });
    }
  }
  const useReplicateGeneration = !FIRESTORE_RECIPE_PHOTO_CACHE_ONLY && hasGenerationTier && (replicateCapDecision?.allowed ?? false);
  const replicateDailyLimit = replicateCapDecision?.dailyLimit ?? 0;
  const selectedReplicateQuery = useReplicateGeneration
    ? selectReplicateRecipePhotoQuery(replicateQueryCandidates, replicateIdentities, ingredientHints)
    : null;
  const selectedReplicateSignature = selectedReplicateQuery
    ? scopeRecipePhotoAliasesForDiet(
        [buildGeneratedRecipePhotoSignature(selectedReplicateQuery, photoIdentityOverride, exactRecipeNameHint)],
        activeDiets
      )[0]
    : null;
  const generatedAliasCandidates = scopeRecipePhotoAliasesForDiet(
    buildGeneratedRecipePhotoCacheAliasCandidates([...replicateIdentities, ...identities]),
    activeDiets
  );
  const signatureCandidates = useReplicateGeneration
    ? Array.from(new Set([...(selectedReplicateSignature ? [selectedReplicateSignature] : []), ...generatedAliasCandidates]))
    : Array.from(new Set([...identities.map((entry) => entry.signature), ...generatedAliasCandidates]));
  const exactCacheLookupCandidates = Array.from(
    new Set(
      useReplicateGeneration
        ? exactAliasCandidates
        : [
            ...exactAliasCandidates,
            ...unscopedExactAliasCandidates,
            ...buildLegacyExactRecipePhotoCacheCandidates(queryCandidates, identities)
          ]
    )
  );
  const imageMode = useReplicateGeneration ? "generated" : "disabled";
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
    `${selectedReplicateSignature ?? (queryCandidates.join("||") || identity.signature)}${premiumFailureScope}${generatedRequestScope}${activeDiets.length ? `::diet:${activeDiets.join("|")}` : ""}`,
    imageMode
  );
  const failureCacheKey =
    explicitlyExcludedImageUrls.size > 0
      ? `${failureCacheKeyBase}::exclude:${Array.from(explicitlyExcludedImageUrls).sort().join("|")}`
      : failureCacheKeyBase;

  const recipeScopedV2Photo = sourceRecipeId
    ? await resolveAndLinkSharedRecipePhotoById({
        diets: activeDiets,
        excludeImageUrls: Array.from(explicitlyExcludedImageUrls),
        sourceRecipeId
      }).catch((error) => {
        logger.warn("V2 recipe photo lookup failed", {
          errorMessage: error instanceof Error ? error.message : String(error),
          sourceRecipeId
        });
        return null;
      })
    : null;
  if (recipeScopedV2Photo) {
    const scopedPhoto = buildCachedRecipePhotoFromShared(recipeScopedV2Photo);
    return Response.json(
      { ...scopedPhoto, access: accessPayload(accessCheck.access) },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const exactCached = sourceRecipeId ? null : getRecipePhotoCacheBySignatures(exactCacheLookupCandidates);
  if (
    exactCached &&
    (!cacheOnly || isReusableCachedRecipePhoto(exactCached)) &&
    !explicitlyExcludedImageUrls.has(exactCached.imageUrl) &&
    !isKnownWeakRecipeProviderImageUrl(exactCached.imageUrl) &&
    (!liverVisualRequest || exactCached.source === "generated") &&
    canUseCachedRecipePhotoForVisualRequest(exactCached, strictVisualRequest, useReplicateGeneration) &&
    canUseGeneratedRecipePhotoCacheForRequest(exactCached, {
      exactNameHints,
      queryCandidates,
      replicateQueryCandidates,
      selectedReplicateQuery
    }) &&
    isRecipePhotoDietCompatible(exactCached, { diets: activeDiets }) &&
    (!isRecipePhotoRecentlyUsedForDifferentSignature(exactCached.imageUrl, exactCacheLookupCandidates, reuseKeyCandidates))
  ) {
    void persistExactAliasesForLegacyPhoto(exactCached, exactAliasCandidates);
    rememberRecipePhotoSelection(exactCached.imageUrl, exactCached.signature, getRecipePhotoReuseKeyForEntry(exactCached, reuseKeyCandidates));
    logger.info("Recipe photo served from exact memory cache", {
      source: exactCached.source,
      query,
      imageMode,
      exactAliasCount: exactAliasCandidates.length,
      exactLookupCount: exactCacheLookupCandidates.length,
      signature: exactCached.signature
    });
    await linkCachedPhotoToPublishedRecipeBundle(exactCached, {
      cuisine: searchParams.get("cuisine") ?? undefined,
      diets: activeDiets,
      exactNames: exactNameHints,
      query,
      sourceRecipeId
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

  const sharedExactCached = sourceRecipeId ? null : await getSharedRecipePhotoByExactAliases(exactCacheLookupCandidates, {
    excludeImageUrls: Array.from(explicitlyExcludedImageUrls),
    reusableOnly: cacheOnly
  });
  if (
    sharedExactCached &&
    !explicitlyExcludedImageUrls.has(sharedExactCached.imageUrl) &&
    !isKnownWeakRecipeProviderImageUrl(sharedExactCached.imageUrl) &&
    canUseSharedRecipePhotoForVisualRequest(sharedExactCached, strictVisualRequest, useReplicateGeneration) &&
    canUseGeneratedRecipePhotoCacheForRequest(sharedExactCached, {
      exactNameHints,
      queryCandidates,
      replicateQueryCandidates,
      selectedReplicateQuery
    }) &&
    isRecipePhotoDietCompatible(sharedExactCached, { diets: activeDiets }) &&
    sharedExactCached.source === "generated" &&
    (!isRecipePhotoRecentlyUsedForDifferentSignature(sharedExactCached.imageUrl, exactCacheLookupCandidates, reuseKeyCandidates))
  ) {
    const sharedPhoto = buildCachedRecipePhotoFromShared(sharedExactCached);
    await persistExactAliasesForLegacyPhoto(sharedPhoto, exactAliasCandidates);
    setRecipePhotoCacheAliases(exactAliasCandidates, sharedPhoto);
    rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature, getRecipePhotoReuseKeyForEntry(sharedPhoto, reuseKeyCandidates));

    logger.info("Recipe photo served from exact shared cache", {
      source: sharedPhoto.source,
      query,
      imageMode,
      exactAliasCount: exactAliasCandidates.length,
      exactLookupCount: exactCacheLookupCandidates.length,
      signature: sharedPhoto.signature
    });
    await linkCachedPhotoToPublishedRecipeBundle(sharedPhoto, {
      cuisine: searchParams.get("cuisine") ?? undefined,
      diets: activeDiets,
      exactNames: exactNameHints,
      query,
      sourceRecipeId
    });

    return Response.json(
      {
        ...sharedPhoto,
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const sharedQueryOrSignatureCached = sourceRecipeId ? null : await getSharedRecipePhotoByQueryOrSignature({
    excludeImageUrls: Array.from(explicitlyExcludedImageUrls),
    queries: [
      ...replicateQueryCandidates,
      ...queryCandidates,
      ...exactNameHints
    ],
    reusableOnly: cacheOnly,
    signatures: [
      ...exactCacheLookupCandidates,
      ...signatureCandidates
    ]
  });
  if (
    sharedQueryOrSignatureCached &&
    !explicitlyExcludedImageUrls.has(sharedQueryOrSignatureCached.imageUrl) &&
    !isKnownWeakRecipeProviderImageUrl(sharedQueryOrSignatureCached.imageUrl) &&
    canUseSharedRecipePhotoForVisualRequest(sharedQueryOrSignatureCached, strictVisualRequest, useReplicateGeneration) &&
    canUseGeneratedRecipePhotoCacheForRequest(sharedQueryOrSignatureCached, {
      exactNameHints,
      queryCandidates,
      replicateQueryCandidates,
      selectedReplicateQuery
    }) &&
    isRecipePhotoDietCompatible(sharedQueryOrSignatureCached, { diets: activeDiets }) &&
    (!isRecipePhotoRecentlyUsedForDifferentSignature(
      sharedQueryOrSignatureCached.imageUrl,
      [sharedQueryOrSignatureCached.signature, ...signatureCandidates, ...exactCacheLookupCandidates],
      reuseKeyCandidates
    ))
  ) {
    const sharedPhoto = buildCachedRecipePhotoFromShared(sharedQueryOrSignatureCached);
    setRecipePhotoCacheAliases([sharedPhoto.signature, ...exactCacheLookupCandidates, ...signatureCandidates], sharedPhoto);
    rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature, getRecipePhotoReuseKeyForEntry(sharedPhoto, reuseKeyCandidates));

    logger.info("Recipe photo served from shared query/signature cache", {
      source: sharedPhoto.source,
      query,
      cached: true,
      model: sharedPhoto.model,
      imageMode,
      sharedCache: true,
      signature: sharedPhoto.signature
    });
    await linkCachedPhotoToPublishedRecipeBundle(sharedPhoto, {
      cuisine: searchParams.get("cuisine") ?? undefined,
      diets: activeDiets,
      exactNames: exactNameHints,
      query,
      sourceRecipeId
    });

    return Response.json(
      {
        ...sharedPhoto,
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const sharedCached = sourceRecipeId ? null : await getSharedRecipePhotoBySignatures(signatureCandidates, {
    excludeImageUrls: Array.from(explicitlyExcludedImageUrls),
    reusableOnly: cacheOnly
  });
  if (
    sharedCached &&
    !explicitlyExcludedImageUrls.has(sharedCached.imageUrl) &&
    !isKnownWeakRecipeProviderImageUrl(sharedCached.imageUrl) &&
    canUseSharedRecipePhotoForVisualRequest(sharedCached, strictVisualRequest, useReplicateGeneration) &&
    canUseGeneratedRecipePhotoCacheForRequest(sharedCached, {
      exactNameHints,
      queryCandidates,
      replicateQueryCandidates,
      selectedReplicateQuery
    }) &&
    isRecipePhotoDietCompatible(sharedCached, { diets: activeDiets }) &&
    sharedCached.source === "generated" &&
    (!isRecipePhotoRecentlyUsedForDifferentSignature(sharedCached.imageUrl, signatureCandidates, reuseKeyCandidates))
  ) {
    const sharedPhoto = buildCachedRecipePhotoFromShared(sharedCached);
    setRecipePhotoCacheAliases(signatureCandidates, sharedPhoto);
    rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature, getRecipePhotoReuseKeyForEntry(sharedPhoto, reuseKeyCandidates));

    logger.info("Recipe photo served from shared cache", {
      source: sharedPhoto.source,
      query,
      cached: true,
      model: sharedPhoto.model,
      imageMode,
      sharedCache: true,
      signature: identity.signature
    });
    await linkCachedPhotoToPublishedRecipeBundle(sharedPhoto, {
      cuisine: searchParams.get("cuisine") ?? undefined,
      diets: activeDiets,
      exactNames: exactNameHints,
      query,
      sourceRecipeId
    });

    return Response.json(
      {
        ...sharedPhoto,
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const sharedQueryCached = sourceRecipeId ? null : await getSharedGeneratedRecipePhotoByQueries([
    ...replicateQueryCandidates,
    ...queryCandidates,
    ...exactNameHints
  ]);
  if (
    sharedQueryCached &&
    !explicitlyExcludedImageUrls.has(sharedQueryCached.imageUrl) &&
    !isKnownWeakRecipeProviderImageUrl(sharedQueryCached.imageUrl) &&
    canUseSharedRecipePhotoForVisualRequest(sharedQueryCached, strictVisualRequest, useReplicateGeneration) &&
    canUseGeneratedRecipePhotoCacheForRequest(sharedQueryCached, {
      exactNameHints,
      queryCandidates,
      replicateQueryCandidates,
      selectedReplicateQuery
    }) &&
    isRecipePhotoDietCompatible(sharedQueryCached, { diets: activeDiets }) &&
    (!isRecipePhotoRecentlyUsedForDifferentSignature(sharedQueryCached.imageUrl, signatureCandidates, reuseKeyCandidates))
  ) {
    const sharedPhoto = buildCachedRecipePhotoFromShared(sharedQueryCached);
    setRecipePhotoCacheAliases([sharedPhoto.signature, ...signatureCandidates], sharedPhoto);
    rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature, getRecipePhotoReuseKeyForEntry(sharedPhoto, reuseKeyCandidates));

    logger.info("Recipe photo served from shared generated query cache", {
      source: sharedPhoto.source,
      query,
      cached: true,
      model: sharedPhoto.model,
      imageMode,
      sharedCache: true,
      signature: sharedPhoto.signature
    });
    await linkCachedPhotoToPublishedRecipeBundle(sharedPhoto, {
      cuisine: searchParams.get("cuisine") ?? undefined,
      diets: activeDiets,
      exactNames: exactNameHints,
      query,
      sourceRecipeId
    });

    return Response.json(
      {
        ...sharedPhoto,
        access: accessPayload(accessCheck.access)
      },
      { headers: buildRecipePhotoResponseHeaders("success") }
    );
  }

  const approximateMainIngredientKeys = buildApproximateRecipePhotoMainIngredientKeys(
    [...identities, ...replicateIdentities],
    ingredientHints,
    liverVisualRequest
  );
  const approximateCategoryIdentities = [...identities, ...replicateIdentities];
  const hasApproximateRecipePhotoCategoryLookup =
    approximateMainIngredientKeys.length > 0 ||
    approximateCategoryIdentities.some(hasRecipePhotoCategoryLookupKey);
  if (!sourceRecipeId && !strictIdentity && !useReplicateGeneration && hasApproximateRecipePhotoCategoryLookup) {
    const approximateCached = await getSharedRecipePhotoByApproximateCategory({
      allowProviderPhotos: !cacheOnly,
      canonicalDishKeys: [...identities, ...replicateIdentities].map((entry) => entry.canonicalDishKey),
      cookingMethodKeys: [...identities, ...replicateIdentities].map((entry) => entry.cookingMethodKey),
      cuisineKeys: [...identities, ...replicateIdentities].map((entry) => entry.cuisineKey),
      excludeImageUrls: Array.from(explicitlyExcludedImageUrls),
      familyKeys: [...identities, ...replicateIdentities].map((entry) => entry.familyKey),
      ingredientTexts: ingredientHints,
      mainIngredientKeys: approximateMainIngredientKeys,
      mealTypeKeys: [...identities, ...replicateIdentities].map((entry) => entry.mealTypeKey),
      requestTexts: [
        ...queryCandidates,
        ...replicateQueryCandidates,
        ...exactNameHints,
        ...ingredientHints,
        ...signatureCandidates
      ],
      sauceKeys: [...identities, ...replicateIdentities].map((entry) => entry.sauceKey),
      starchKeys: [...identities, ...replicateIdentities].map((entry) => entry.starchKey)
    });
    if (
      approximateCached &&
      !explicitlyExcludedImageUrls.has(approximateCached.imageUrl) &&
      !isKnownWeakRecipeProviderImageUrl(approximateCached.imageUrl) &&
      canUseSharedRecipePhotoForVisualRequest(approximateCached, strictVisualRequest, useReplicateGeneration) &&
      canUseApproximateSharedRecipePhotoForRequest(approximateCached, queryCandidates, exactNameHints) &&
      isRecipePhotoDietCompatible(approximateCached, { diets: activeDiets }) &&
      approximateCached.source === "generated" &&
      (!isRecipePhotoRecentlyUsedForDifferentSignature(
        approximateCached.imageUrl,
        [approximateCached.signature, ...signatureCandidates, ...exactCacheLookupCandidates],
        reuseKeyCandidates
      ))
    ) {
      const sharedPhoto = buildCachedRecipePhotoFromShared(approximateCached);
      setRecipePhotoCacheAliases([sharedPhoto.signature, ...signatureCandidates], sharedPhoto);
      rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature, getRecipePhotoReuseKeyForEntry(sharedPhoto, reuseKeyCandidates));

      logger.info("Recipe photo served from approximate shared cache", {
        source: sharedPhoto.source,
        query,
        cached: true,
        imageMode,
        mainIngredientKeys: approximateMainIngredientKeys,
        sharedCache: true,
        signature: sharedPhoto.signature
      });
      await linkCachedPhotoToPublishedRecipeBundle(sharedPhoto, {
        cuisine: searchParams.get("cuisine") ?? undefined,
        diets: activeDiets,
        exactNames: exactNameHints,
        query,
        sourceRecipeId
      });

      return Response.json(
        {
          ...sharedPhoto,
          access: accessPayload(accessCheck.access)
        },
        { headers: buildRecipePhotoResponseHeaders("success") }
      );
    }
  }

  if (cacheOnly) {
    return Response.json(
      {
        access: accessPayload(accessCheck.access),
        error: "No cached recipe photo matched this exact or canonical recipe.",
        source: "unavailable"
      },
      { headers: buildRecipePhotoResponseHeaders("failure"), status: 404 }
    );
  }

  if (!sourceRecipeId && !strictIdentity && useReplicateGeneration && hasApproximateRecipePhotoCategoryLookup) {
    const categoryCached = await getSharedRecipePhotoByApproximateCategory({
      canonicalDishKeys: [...identities, ...replicateIdentities].map((entry) => entry.canonicalDishKey),
      cookingMethodKeys: [...identities, ...replicateIdentities].map((entry) => entry.cookingMethodKey),
      cuisineKeys: [...identities, ...replicateIdentities].map((entry) => entry.cuisineKey),
      excludeImageUrls: Array.from(explicitlyExcludedImageUrls),
      familyKeys: [...identities, ...replicateIdentities].map((entry) => entry.familyKey),
      ingredientTexts: ingredientHints,
      mainIngredientKeys: approximateMainIngredientKeys,
      mealTypeKeys: [...identities, ...replicateIdentities].map((entry) => entry.mealTypeKey),
      requestTexts: [
        ...queryCandidates,
        ...replicateQueryCandidates,
        ...exactNameHints,
        ...ingredientHints
      ],
      sauceKeys: [...identities, ...replicateIdentities].map((entry) => entry.sauceKey),
      starchKeys: [...identities, ...replicateIdentities].map((entry) => entry.starchKey)
    });
    if (
      categoryCached &&
      !explicitlyExcludedImageUrls.has(categoryCached.imageUrl) &&
      !isKnownWeakRecipeProviderImageUrl(categoryCached.imageUrl) &&
      canUseSharedRecipePhotoForVisualRequest(categoryCached, strictVisualRequest, useReplicateGeneration) &&
      canUseApproximateSharedRecipePhotoForRequest(categoryCached, queryCandidates, exactNameHints) &&
      isRecipePhotoDietCompatible(categoryCached, { diets: activeDiets }) &&
      (!isRecipePhotoRecentlyUsedForDifferentSignature(
        categoryCached.imageUrl,
        [categoryCached.signature, ...signatureCandidates, ...exactCacheLookupCandidates],
        reuseKeyCandidates
      ))
    ) {
      const sharedPhoto = buildCachedRecipePhotoFromShared(categoryCached);
      setRecipePhotoCacheAliases([sharedPhoto.signature, ...signatureCandidates], sharedPhoto);
      rememberRecipePhotoSelection(sharedPhoto.imageUrl, sharedPhoto.signature, getRecipePhotoReuseKeyForEntry(sharedPhoto, reuseKeyCandidates));

      logger.info("Recipe photo served from shared generated category cache", {
        source: sharedPhoto.source,
        query,
        cached: true,
        imageMode,
        mainIngredientKeys: approximateMainIngredientKeys,
        sharedCache: true,
        signature: sharedPhoto.signature
      });
      await linkCachedPhotoToPublishedRecipeBundle(sharedPhoto, {
        cuisine: searchParams.get("cuisine") ?? undefined,
        diets: activeDiets,
        exactNames: exactNameHints,
        query,
        sourceRecipeId
      });

      return Response.json(
        {
          ...sharedPhoto,
          access: accessPayload(accessCheck.access)
        },
        { headers: buildRecipePhotoResponseHeaders("success") }
      );
    }
  }

  const cached =
    sourceRecipeId || useReplicateGeneration
      ? null
      : getRecipePhotoCacheBySignatures(signatureCandidates);
  if (
    cached &&
    !explicitlyExcludedImageUrls.has(cached.imageUrl) &&
    !isKnownWeakRecipeProviderImageUrl(cached.imageUrl) &&
    (!liverVisualRequest || cached.source === "generated") &&
    canUseCachedRecipePhotoForVisualRequest(cached, strictVisualRequest, useReplicateGeneration) &&
    (!useReplicateGeneration || cached.source === "generated") &&
    canUseGeneratedRecipePhotoCacheForRequest(cached, {
      exactNameHints,
      queryCandidates,
      replicateQueryCandidates,
      selectedReplicateQuery
    }) &&
    isRecipePhotoDietCompatible(cached, { diets: activeDiets }) &&
    (!isRecipePhotoRecentlyUsedForDifferentSignature(cached.imageUrl, signatureCandidates, reuseKeyCandidates))
  ) {
    rememberRecipePhotoSelection(cached.imageUrl, cached.signature, getRecipePhotoReuseKeyForEntry(cached, reuseKeyCandidates));
    logger.info("Recipe photo served", {
      source: cached.source,
      query,
      cached: true,
      model: cached.model,
      imageMode,
      signature: identity.signature
    });
    await linkCachedPhotoToPublishedRecipeBundle(cached, {
      cuisine: searchParams.get("cuisine") ?? undefined,
      diets: activeDiets,
      exactNames: exactNameHints,
      query,
      sourceRecipeId
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

  if (FIRESTORE_RECIPE_PHOTO_CACHE_ONLY) {
    return Response.json(
      {
        access: accessPayload(accessCheck.access),
        error: FIRESTORE_RECIPE_PHOTO_CACHE_ONLY
          ? "No compatible Firestore recipe photo cache entry matched this recipe."
          : "No cached recipe photo matched this exact recipe.",
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

    if (
      useReplicateGeneration &&
      !hasNativeGenerationTier &&
      !await consumeFreeAiActionImageGrant(accessCheck.access, actionGrantId, identity.signature)
    ) {
      return buildRecipePhotoFailureResponse(
        createRecipePhotoFailure(
          "This AI action's included image allowance is exhausted.",
          402,
          60 * 1000,
          60
        ),
        accessCheck.access
      );
    }

    const lookupPromise = performRecipePhotoLookup({
      failureCacheKey,
      imageMode,
      identities,
      ingredientHints,
      arabicDishNameHints,
      exactAliasCandidates,
      exactNameHints,
      generatedAliasCandidates,
      explicitlyExcludedImageUrls,
      query,
      queryCandidates,
      replicateQueryCandidates,
      replicateIdentities,
      photoIdentityOverride,
      exactRecipeNameHint,
      reuseKeyCandidates,
      signatureCandidates,
      useReplicateGeneration,
      reason: accessCheck.reason,
      requestedCuisine: searchParams.get("cuisine") ?? undefined,
      sourceRecipeId,
      activeDiets
    }).finally(() => {
      inFlightRecipePhotoLookups.delete(failureCacheKey);
    });

    inFlightRecipePhotoLookups.set(failureCacheKey, lookupPromise);

    const result = await lookupPromise;
    // Fire-and-forget: only bump the daily counter when this request paid for
    // a fresh Replicate generation. Cache hits do not consume budget.
    if (
      useReplicateGeneration &&
      result.ok &&
      result.photo.imageSource === "replicate" &&
      result.photo.source === "generated"
    ) {
      void recordReplicateGeneration(accessCheck.access, replicateDailyLimit);
    }
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

function canUseCachedRecipePhotoForVisualRequest(
  entry: CachedRecipePhoto,
  strictVisualRequest: boolean,
  useReplicateGeneration: boolean
) {
  void useReplicateGeneration;
  if (entry.source !== "generated") return true;
  if (!isDurableRecipeImageUrl(entry.imageUrl)) return false;
  if (!strictVisualRequest) return true;
  return hasStrictGeneratedRecipePhotoSignature(entry.signature, entry.imageUrl) || !isReplicateGeneratedRecipeImageUrl(entry.imageUrl);
}

function canUseSharedRecipePhotoForVisualRequest(
  entry: SharedRecipePhotoEntry,
  strictVisualRequest: boolean,
  useReplicateGeneration: boolean
) {
  void useReplicateGeneration;
  if (entry.source !== "generated") return true;
  if (!isDurableRecipeImageUrl(entry.imageUrl)) return false;
  if (!strictVisualRequest) return true;
  return hasStrictGeneratedRecipePhotoSignature(entry.signature, entry.imageUrl) || !isReplicateGeneratedRecipeImageUrl(entry.imageUrl);
}

function canUseGeneratedRecipePhotoCacheForRequest(
  entry: Pick<CachedRecipePhoto | SharedRecipePhotoEntry, "imageUrl" | "query" | "signature" | "source">,
  {
    exactNameHints,
    queryCandidates,
    replicateQueryCandidates,
    selectedReplicateQuery
  }: {
    exactNameHints: string[];
    queryCandidates: string[];
    replicateQueryCandidates: string[];
    selectedReplicateQuery: string | null;
  }
) {
  if (isUntrustedSharedProviderPhoto(entry.source, entry.imageUrl)) return false;
  if (!isGeneratedRecipePhotoUrlCompatibleWithQueries(
    entry.imageUrl,
    exactNameHints.length ? exactNameHints : queryCandidates
  )) return false;
  if (!isRecipePhotoCacheEntryCompatibleWithRequestMainIngredient(entry, queryCandidates)) return false;
  if (isChickenRecipePhotoRequest(queryCandidates) && !isChickenRecipePhotoCacheEntry(entry)) return false;
  if (isShrimpRecipePhotoRequest(queryCandidates) && !isShrimpRecipePhotoCacheEntry(entry)) return false;
  if (entry.source !== "generated") return true;
  if (!isGeneratedRecipePhotoCachePayloadConsistent(entry)) return false;
  if (!isDurableRecipeImageUrl(entry.imageUrl)) return false;

  const cachedQuery = normalizeGeneratedCacheQuery(entry.query || getGeneratedRecipePhotoUrlSignature(entry.imageUrl) || entry.signature);
  if (!cachedQuery) return false;
  const hasStrictGeneratedSignature = hasStrictGeneratedRecipePhotoSignature(entry.signature, entry.imageUrl);

  const requestQueries = normalizeRecipePhotoQueries([
    ...(selectedReplicateQuery ? [selectedReplicateQuery] : []),
    ...replicateQueryCandidates,
    ...exactNameHints
  ]);
  if (isExactGeneratedRecipePhotoQueryMatch(cachedQuery, requestQueries)) {
    if (isGeneratedCacheQueryCompatibleWithTrustedRequest(cachedQuery, queryCandidates)) return true;
  }
  if (hasGeneratedRecipePhotoCacheTextConflict(cachedQuery, queryCandidates)) return false;
  if (!hasStrictGeneratedSignature) return false;

  const cachedIdentity = buildRecipePhotoIdentity(cachedQuery);
  if (isWeakGeneratedRecipePhotoCacheQuery(cachedQuery, cachedIdentity)) {
    return false;
  }

  const trustedQueries = normalizeRecipePhotoQueries(queryCandidates).length ? queryCandidates : requestQueries;
  return trustedQueries
    .map((candidate) => buildRecipePhotoIdentity(candidate))
    .some((candidateIdentity) =>
      areGeneratedRecipePhotoIdentitiesCompatible(cachedIdentity, candidateIdentity) &&
      Boolean(
        cachedIdentity.canonicalDishKey &&
          candidateIdentity.canonicalDishKey &&
          cachedIdentity.canonicalDishKey === candidateIdentity.canonicalDishKey
      )
  );
}

function isUntrustedSharedProviderPhoto(source: string, imageUrl: string) {
  if (source !== "generated") return true;
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    return host !== "firebasestorage.googleapis.com" && host !== "storage.googleapis.com";
  } catch {
    return true;
  }
}

function canUseApproximateSharedRecipePhotoForRequest(
  entry: SharedRecipePhotoEntry,
  queryCandidates: string[],
  exactNameHints: string[]
) {
  if (isUntrustedSharedProviderPhoto(entry.source, entry.imageUrl)) return false;
  if (!isGeneratedRecipePhotoUrlCompatibleWithQueries(
    entry.imageUrl,
    exactNameHints.length ? exactNameHints : queryCandidates
  )) return false;
  if (!isRecipePhotoCacheEntryCompatibleWithRequestMainIngredient(entry, queryCandidates)) return false;
  if (isChickenRecipePhotoRequest(queryCandidates) && !isChickenRecipePhotoCacheEntry(entry)) return false;
  if (isShrimpRecipePhotoRequest(queryCandidates) && !isShrimpRecipePhotoCacheEntry(entry)) return false;
  if (!isApproximateRecipePhotoCacheCompatible(entry, queryCandidates)) return false;
  if (entry.source !== "generated") return true;
  if (!isDurableRecipeImageUrl(entry.imageUrl)) return false;

  const cachedQuery = normalizeGeneratedCacheQuery(entry.query || getGeneratedRecipePhotoUrlSignature(entry.imageUrl) || entry.signature);
  if (!cachedQuery) return false;
  return !hasGeneratedRecipePhotoCacheTextConflict(cachedQuery, queryCandidates);
}

function isRecipePhotoCacheEntryCompatibleWithRequestMainIngredient(
  entry: Pick<CachedRecipePhoto | SharedRecipePhotoEntry, "query" | "signature">,
  queryCandidates: string[]
) {
  const requestedKeys = collectRecipePhotoMainIngredientKeys(queryCandidates);
  if (!requestedKeys.size) return true;

  if (isRecipePhotoCacheEntryCompatibleByNamedPlate(entry, queryCandidates)) return true;

  const cacheKeys = collectRecipePhotoMainIngredientKeys([entry.query, entry.signature]);
  if (!cacheKeys.size) return false;

  for (const requestedKey of requestedKeys) {
    if (cacheKeys.has(requestedKey)) return true;
    if (requestedKey === "seafood" && (cacheKeys.has("fish") || cacheKeys.has("shrimp"))) return true;
    if ((requestedKey === "fish" || requestedKey === "shrimp") && cacheKeys.has("seafood")) return true;
    if (requestedKey === "bean" && (cacheKeys.has("chickpea") || cacheKeys.has("lentil"))) return true;
  }

  return false;
}

function isRecipePhotoCacheEntryCompatibleByNamedPlate(
  entry: Pick<CachedRecipePhoto | SharedRecipePhotoEntry, "query" | "signature">,
  queryCandidates: string[]
) {
  const requestIdentities = queryCandidates.map((value) => buildRecipePhotoIdentity(value));
  const cacheIdentities = [entry.query, entry.signature]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => buildRecipePhotoIdentity(value));

  return cacheIdentities.some((cacheIdentity) =>
    requestIdentities.some((requestIdentity) => {
      if (
        cacheIdentity.canonicalDishKey &&
        requestIdentity.canonicalDishKey &&
        cacheIdentity.canonicalDishKey === requestIdentity.canonicalDishKey
      ) {
        return true;
      }
      return Boolean(
        cacheIdentity.familyKey &&
          requestIdentity.familyKey &&
          cacheIdentity.familyKey === requestIdentity.familyKey &&
          (!cacheIdentity.mainIngredientKey ||
            !requestIdentity.mainIngredientKey ||
            cacheIdentity.mainIngredientKey === requestIdentity.mainIngredientKey)
      );
    })
  );
}

function collectRecipePhotoMainIngredientKeys(values: Array<string | null | undefined>) {
  const keys = new Set<string>();
  for (const value of values) {
    if (!value?.trim()) continue;
    const identity = buildRecipePhotoIdentity(value);
    if (identity.mainIngredientKey && !isGenericRecipePhotoMainIngredientKey(identity.mainIngredientKey)) {
      keys.add(identity.mainIngredientKey);
    }
  }
  return keys;
}

function isGenericRecipePhotoMainIngredientKey(value: string) {
  return value === "general" || value === "food" || value === "meal";
}

function isChickenRecipePhotoRequest(values: string[]) {
  return values.some((value) =>
    /(?:\b(?:chicken|hen|poultry|farakh|farkh|pollo|tavuk|gai|murgh)\b|\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e|\u0641\u0631\u062e(?:\u0629)?)/iu.test(value)
  );
}

function isChickenRecipePhotoCacheEntry(entry: Pick<CachedRecipePhoto | SharedRecipePhotoEntry, "query" | "signature">) {
  const text = [entry.query, entry.signature].filter(Boolean).join(" ").toLowerCase();
  if (!isChickenRecipePhotoRequest([text])) return false;
  return !/(?:\b(?:kofta|kafta|kofte|kefta|meatball|meatballs|beef|lamb|meat|kebab|shrimp|prawn|fish|salmon|tilapia|anchovy|hamsi|pescado|samke|black\s+bean|bean\s+taco|chile\s+relleno)\b|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0644\u062d\u0645|\u0633\u0645\u0643|\u062c\u0645\u0628\u0631\u064a)/iu.test(text);
}

function isShrimpRecipePhotoRequest(values: string[]) {
  return values.some((value) =>
    /(?:\b(?:shrimp|prawn|goong|gamberi|camarones)\b|\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646|\u0642\u0631\u064a\u062f\u0633)/iu.test(value)
  );
}

function isShrimpRecipePhotoCacheEntry(entry: Pick<CachedRecipePhoto | SharedRecipePhotoEntry, "query" | "signature">) {
  const text = [entry.query, entry.signature].filter(Boolean).join(" ").toLowerCase();
  if (!isShrimpRecipePhotoRequest([text])) return false;
  return !/(?:\b(?:kofta|kafta|kofte|kefta|meatball|meatballs|beef|lamb|meat|kebab|fish|salmon|tilapia|anchovy|hamsi|pescado|samke)\b|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0644\u062d\u0645|\u0633\u0645\u0643)/iu.test(text);
}

function isGeneratedCacheQueryCompatibleWithTrustedRequest(cachedQuery: string, queryCandidates: string[]) {
  const trustedQueries = normalizeRecipePhotoQueries(queryCandidates);
  if (!trustedQueries.length) return true;

  const cachedIdentity = buildRecipePhotoIdentity(cachedQuery);
  return trustedQueries
    .map((candidate) => buildRecipePhotoIdentity(candidate))
    .some((candidateIdentity) => areGeneratedRecipePhotoIdentitiesCompatible(cachedIdentity, candidateIdentity));
}

function hasGeneratedRecipePhotoCacheTextConflict(cachedQuery: string, queryCandidates: string[]) {
  const trustedText = normalizeRecipePhotoQueries(queryCandidates).join(" ");
  if (!trustedText) return false;

  const trustedHasLiver = isLiverRecipePhotoRequest([trustedText]);
  const cachedHasLiver = isLiverRecipePhotoRequest([cachedQuery]);
  if (trustedHasLiver && !cachedHasLiver) return true;

  const trustedHasSoup = /\b(soup|broth)\b/i.test(trustedText);
  const cachedHasKofta = /\b(kafta|kofta|kofte|kefta|meatballs?)\b/i.test(cachedQuery);
  if (trustedHasSoup && cachedHasKofta) return true;

  return false;
}

function isLiverRecipePhotoRequest(values: string[]) {
  return values.some((value) =>
    /\b(liver|kebda|kibda|ciger|cigeri|kaleji|higado|fegato)\b|\u0643\u0628\u062f(?:\u0629|\u0647)?/iu.test(value)
  );
}

function buildApproximateRecipePhotoMainIngredientKeys(
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>,
  ingredientHints: string[],
  liverVisualRequest: boolean
) {
  const hintIdentities = ingredientHints.map((ingredient) => buildRecipePhotoIdentity(ingredient));
  return Array.from(
    new Set(
      [
        liverVisualRequest ? "liver" : null,
        ...identities.map((identity) => identity.mainIngredientKey),
        ...hintIdentities.map((identity) => identity.mainIngredientKey)
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value && value !== "general" && value !== "food" && value !== "meal")
    )
  ).slice(0, 6);
}

function hasRecipePhotoCategoryLookupKey(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  return Boolean(
    identity.canonicalDishKey ||
      identity.familyKey ||
      identity.mealTypeKey ||
      identity.starchKey ||
      identity.sauceKey ||
      identity.cookingMethodKey
  );
}

function areGeneratedRecipePhotoIdentitiesCompatible(
  cachedIdentity: ReturnType<typeof buildRecipePhotoIdentity>,
  requestIdentity: ReturnType<typeof buildRecipePhotoIdentity>
) {
  if (
    cachedIdentity.canonicalDishKey &&
    requestIdentity.canonicalDishKey &&
    cachedIdentity.canonicalDishKey !== requestIdentity.canonicalDishKey
  ) {
    return false;
  }

  if (
    cachedIdentity.mainIngredientKey &&
    requestIdentity.mainIngredientKey &&
    cachedIdentity.mainIngredientKey !== requestIdentity.mainIngredientKey
  ) {
    return false;
  }

  if (
    cachedIdentity.familyKey &&
    requestIdentity.familyKey &&
    cachedIdentity.familyKey !== requestIdentity.familyKey &&
    (isStrictGeneratedPhotoFamilyKey(cachedIdentity.familyKey) ||
      isStrictGeneratedPhotoFamilyKey(requestIdentity.familyKey))
  ) {
    return false;
  }

  if (
    cachedIdentity.mealTypeKey &&
    requestIdentity.mealTypeKey &&
    cachedIdentity.mealTypeKey !== requestIdentity.mealTypeKey &&
    (isStrictGeneratedPhotoMealType(cachedIdentity.mealTypeKey) ||
      isStrictGeneratedPhotoMealType(requestIdentity.mealTypeKey))
  ) {
    return false;
  }

  return true;
}

function isStrictGeneratedPhotoFamilyKey(value: string) {
  return /^(kafta|kofta|shawarma|hawawshi|pasta|soup|stew|sandwich)$/i.test(value);
}

function isStrictGeneratedPhotoMealType(value: string) {
  return /^(kofta|soup|stew|sandwich|pasta|salad|bowl)$/i.test(value);
}

function hasStrictGeneratedRecipePhotoSignature(signature: string, imageUrl: string) {
  return (
    isStrictGeneratedRecipePhotoSignature(signature) ||
    isStrictGeneratedRecipePhotoSignature(getGeneratedRecipePhotoUrlSignature(imageUrl))
  );
}
function isStrictGeneratedRecipePhotoSignature(value: string | undefined | null) {
  return Boolean(value && STRICT_RECIPE_PHOTO_CACHE_PATTERN.test(value));
}

function getGeneratedRecipePhotoUrlSignature(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    const decodedPath = safeDecodeURIComponent(url.pathname);
    const match = decodedPath.match(/\/recipe-photo-cache\/([^/?#]+?)\.(?:jpg|jpeg|png|webp)$/i);
    return match?.[1] ?? "";
  } catch {
    const decoded = safeDecodeURIComponent(imageUrl);
    const match = decoded.match(/\/recipe-photo-cache\/([^/?#]+?)\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i);
    return match?.[1] ?? "";
  }
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeGeneratedCacheQuery(value: string) {
  const stripped = value
    .replace(/^generated:(?:strict-v\d+:)?/i, "")
    .replace(/^exact:(?:ar|en):/i, "")
    .replace(/^exact:cuisine:[^:]+:/i, "")
    .replace(/[-_]+/g, " ")
    .trim();

  return normalizeRecipePhotoQuery(normalizeRecipePhotoTextToEnglish(stripped));
}

function isWeakGeneratedRecipePhotoCacheQuery(
  cachedQuery: string,
  cachedIdentity: ReturnType<typeof buildRecipePhotoIdentity>
) {
  if (/^(dish|meal|food|recipe|plate)\b/i.test(cachedQuery)) return true;
  if (/^(skillet|soup|stew|bowl|plate)(?:\s+\1)?(?:\s+plate)?$/i.test(cachedQuery)) return true;

  const hasStrongDishSignal = Boolean(
    cachedIdentity.canonicalDishKey ||
      cachedIdentity.familyKey ||
      cachedIdentity.mainIngredientKey ||
      cachedIdentity.starchKey
  );

  return !hasStrongDishSignal;
}

function buildPhotoIdentityOverrideFromSearchParams(searchParams: URLSearchParams): RecipePhotoIdentityOverride | undefined {
  const dishSlug = toIdentityKey(searchParams.get("photoSlug") ?? undefined);
  if (!dishSlug) return undefined;

  const override: RecipePhotoIdentityOverride = { dishSlug };
  const cuisineKey = toIdentityKey(searchParams.get("photoCuisineKey") ?? undefined);
  if (cuisineKey) override.cuisineKey = cuisineKey;
  const protein = toIdentityKey(searchParams.get("photoProtein") ?? undefined);
  if (protein) override.protein = protein;
  const starch = toIdentityKey(searchParams.get("photoStarch") ?? undefined);
  if (starch) override.starch = starch;
  const sauce = toIdentityKey(searchParams.get("photoSauce") ?? undefined);
  if (sauce) override.sauce = sauce;
  const method = toIdentityKey(searchParams.get("photoMethod") ?? undefined);
  if (method) override.method = method;
  return override;
}

function normalizeRecipePhotoQueries(queries: string[]) {
  return Array.from(
    new Set(
      queries
        .map((value) => normalizeRecipePhotoTextToEnglish(value))
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 8);
}

function addDietContextToRecipePhotoQueries(queries: string[], diets: string[]) {
  if (!diets.length) return queries;
  const dietLabel = diets.join(" ");
  return normalizeRecipePhotoQueries(queries.map((query) => `${dietLabel} ${query}`));
}

function normalizeExcludedRecipePhotoUrls(values: string[]) {
  return new Set(
    values
      .map((value) => value.trim())
      .filter((value) => /^https?:\/\//i.test(value))
      .slice(0, 20)
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
      signature: value.source === "generated" ? value.signature : signature
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
  activeDiets,
  failureCacheKey,
  imageMode,
  identities,
  ingredientHints,
  arabicDishNameHints,
  exactAliasCandidates,
  exactNameHints,
  generatedAliasCandidates,
  explicitlyExcludedImageUrls,
  query,
  queryCandidates,
  replicateQueryCandidates,
  replicateIdentities,
  photoIdentityOverride,
  exactRecipeNameHint,
  reuseKeyCandidates,
  signatureCandidates,
  useReplicateGeneration,
  reason,
  requestedCuisine,
  sourceRecipeId
}: {
  activeDiets: string[];
  failureCacheKey: string;
  imageMode: "generated" | "disabled";
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>;
  ingredientHints: string[];
  arabicDishNameHints: string[];
  exactAliasCandidates: string[];
  exactNameHints: string[];
  generatedAliasCandidates: string[];
  explicitlyExcludedImageUrls: Set<string>;
  query: string;
  queryCandidates: string[];
  replicateQueryCandidates: string[];
  replicateIdentities: Array<ReturnType<typeof buildRecipePhotoIdentity>>;
  photoIdentityOverride?: RecipePhotoIdentityOverride;
  exactRecipeNameHint?: string;
  reuseKeyCandidates: string[];
  signatureCandidates: string[];
  useReplicateGeneration: boolean;
  reason?: string | null;
  requestedCuisine?: string;
  sourceRecipeId?: string;
}): Promise<RecipePhotoLookupResult> {
  const excludedUrls = new Set([
    ...getRecentlyUsedRecipeImageUrls([...generatedAliasCandidates, ...exactAliasCandidates, ...signatureCandidates], reuseKeyCandidates),
    ...explicitlyExcludedImageUrls
  ]);
  const baseIdentity = identities[0] ?? buildRecipePhotoIdentity(query);
  let replicateFallbackReason: string | null = null;

  if (useReplicateGeneration) {
    if (!isReplicateConfigured()) {
      logger.warn("Premium Replicate recipe image generation is not configured; provider fallback is disabled", {
        query,
        signature: baseIdentity.signature
      });
      replicateFallbackReason = "replicate_not_configured";
    } else {
      const replicateQuery = selectReplicateRecipePhotoQuery(replicateQueryCandidates, replicateIdentities, ingredientHints);
      if (!replicateQuery) {
        logger.warn("No strong Replicate image prompt was available; provider fallback is disabled", {
          query,
          signature: baseIdentity.signature
        });
        replicateFallbackReason = "replicate_prompt_unavailable";
      } else {
        const replicateCacheSignature = scopeRecipePhotoAliasesForDiet(
          [buildGeneratedRecipePhotoSignature(replicateQuery, photoIdentityOverride, exactRecipeNameHint)],
          activeDiets
        )[0];
        const generatedCacheAliases = Array.from(new Set([...generatedAliasCandidates, ...exactAliasCandidates]));

        try {
          const generatedImage = await generateRecipeImageWithReplicate(replicateQuery, ingredientHints, {
            alternateDishNames: arabicDishNameHints,
            exactRecipeName: exactRecipeNameHint
          });

          if (generatedImage) {
            const generatedCacheQuery = buildGeneratedRecipePhotoCacheQuery(exactRecipeNameHint, replicateQuery);
            const selectedPhoto = {
              imageSource: "replicate" as const,
              imageUrl: generatedImage.imageUrl,
              model: generatedImage.model ?? getReplicateImageModel(),
              query: generatedCacheQuery,
              signature: replicateCacheSignature,
              source: "generated" as const
            } satisfies CachedRecipePhoto;

            try {
              const persistedGeneratedPhoto = await persistSharedRecipePhoto(
                {
                  imageUrl: selectedPhoto.imageUrl,
                  model: selectedPhoto.model,
                  query: generatedCacheQuery,
                  signature: replicateCacheSignature,
                  source: selectedPhoto.source,
                  dietTags: activeDiets
                },
                sourceRecipeId
                  ? {
                      objectPathPrefix: `shared-recipes-v2/${sourceRecipeId}/photo`,
                      skipCacheDocument: true
                    }
                  : undefined
              );
              selectedPhoto.imageUrl = persistedGeneratedPhoto.imageUrl;

              const generatedSelectionSignatures = exactAliasCandidates.length
                ? exactAliasCandidates
                : [selectedPhoto.signature];
              const isDuplicateGeneratedImage =
                excludedUrls.has(selectedPhoto.imageUrl) ||
                isRecipePhotoRecentlyUsedForDifferentSignature(selectedPhoto.imageUrl, generatedSelectionSignatures, reuseKeyCandidates);
              if (isDuplicateGeneratedImage) {
                logger.warn("Replicate returned an image already excluded for this request; provider fallback is disabled", {
                  query,
                  replicateQuery,
                  signature: replicateCacheSignature
                });
                replicateFallbackReason = "replicate_duplicate_result";
              } else {
                if (!sourceRecipeId) {
                  await persistSharedRecipePhotoExactAliases(persistedGeneratedPhoto, generatedCacheAliases);
                }
                await linkGeneratedPhotoToSharedRecipes({
                  cuisine: requestedCuisine,
                  diets: activeDiets,
                  exactNames: exactNameHints.length ? exactNameHints : [exactRecipeNameHint, query].filter((value): value is string => Boolean(value)),
                  imageUrl: persistedGeneratedPhoto.imageUrl,
                  query: replicateQuery,
                  signature: replicateCacheSignature,
                  sourceRecipeId
                }).catch((error) => {
                  logger.warn("Generated photo shared-recipe linking failed", {
                    errorMessage: error instanceof Error ? error.message : String(error),
                    query: replicateQuery,
                    signature: replicateCacheSignature
                  });
                });
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
                exactAliasCandidates[0] ?? selectedPhoto.signature,
                buildRecipePhotoReuseKeyFromQuery(replicateQuery) || reuseKeyCandidates[0] || selectedPhoto.signature
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

          logger.warn("Replicate did not return a usable unique image; provider fallback is disabled", {
            query,
            replicateQuery,
            signature: replicateCacheSignature
          });
          replicateFallbackReason = replicateFallbackReason ?? "replicate_unusable_result";
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const status = /\b429\b|rate.?limit/i.test(errorMessage) ? 429 : 503;
          logger.warn("Replicate recipe image generation failed; provider fallback is disabled", {
            query,
            replicateQuery,
            signature: replicateCacheSignature,
            errorMessage
          });
          replicateFallbackReason = status === 429 ? "replicate_rate_limited" : "replicate_failed";
        }
      }
    }

    const noReplicateFailure = createRecipePhotoFailure(
      replicateFallbackReason
        ? "Replicate image generation is temporarily unavailable. Retrying generated images shortly."
        : "Premium recipe image generation is still working. Retrying generated images shortly.",
      503,
      PREMIUM_REPLICATE_RETRY_TTL_MS,
      PREMIUM_REPLICATE_RETRY_AFTER_SECONDS
    );
    setRecipePhotoFailureCache(failureCacheKey, noReplicateFailure);
    return {
      failure: noReplicateFailure,
      ok: false
    };
  }

  const noMatchFailure = createRecipePhotoFailure(
    "No Replicate-generated photo is available in the shared recipe pool yet.",
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

function normalizeAiActionGrantId(value: string | null) {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  return normalized || undefined;
}

function buildCachedRecipePhotoFromShared(entry: SharedRecipePhotoEntry) {
  if (entry.source !== "generated") {
    throw new Error("Only Replicate-generated shared recipe photos are supported.");
  }
  return {
    imageAttributionName: entry.imageAttributionName,
    imageAttributionUrl: entry.imageAttributionUrl,
    imageSource: "cache" as const,
    imageUrl: entry.imageUrl,
    model: entry.model,
    query: entry.query,
    signature: entry.signature,
    source: "generated" as const
  } satisfies CachedRecipePhoto;
}

function isReusableCachedRecipePhoto(photo: CachedRecipePhoto) {
  return photo.source === "generated";
}

function normalizeSharedRecipeId(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized.startsWith("shared-") &&
    normalized.length <= 500 &&
    !normalized.includes("/")
    ? normalized
    : undefined;
}

async function linkCachedPhotoToPublishedRecipeBundle(
  photo: CachedRecipePhoto,
  input: {
    cuisine?: string;
    diets: string[];
    exactNames: string[];
    query: string;
    sourceRecipeId?: string;
  }
) {
  if (photo.source !== "generated" || !input.exactNames.length) return;
  const storageSignature = getGeneratedRecipePhotoUrlSignature(photo.imageUrl);

  await linkGeneratedPhotoToSharedRecipes({
    attributionName: photo.imageAttributionName,
    attributionUrl: photo.imageAttributionUrl,
    cuisine: input.cuisine,
    diets: input.diets,
    exactNames: input.exactNames,
    imageUrl: photo.imageUrl,
    query: photo.query ?? input.query,
    signature: storageSignature || photo.signature,
    sourceRecipeId: input.sourceRecipeId
  }).catch((error) => {
    logger.warn("Cached generated photo shared-recipe linking failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
      query: input.query,
      signature: storageSignature || photo.signature
    });
  });
}

function buildGeneratedRecipePhotoSignature(
  query: string,
  override?: RecipePhotoIdentityOverride,
  exactRecipeName?: string
) {
  const identity = buildRecipePhotoIdentity(query, override);
  return buildGeneratedRecipePhotoSignatureForIdentity(identity, query, exactRecipeName);
}

function buildGeneratedRecipePhotoSignatureForIdentity(
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  fallbackQuery: string,
  exactRecipeName?: string
) {
  const normalized = buildGeneratedRecipePhotoStorageSlug(
    exactRecipeName,
    identity.canonicalDishKey?.replace(/-/g, " ") || fallbackQuery
  );
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
    candidates.push(buildGeneratedRecipePhotoSignatureForIdentity(identity, query));

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
  if (photo.source === "generated") return;

  try {
    await persistSharedRecipePhotoExactAliases(
      {
        imageAttributionName: photo.imageAttributionName,
        imageAttributionUrl: photo.imageAttributionUrl,
        imageUrl: photo.imageUrl,
        model: photo.model,
        query: photo.query ?? photo.signature,
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

function getRecentlyUsedRecipeImageUrls(signatureCandidates: string[], reuseKeyCandidates: string[]) {
  const now = Date.now();
  const allowedSignatures = new Set(signatureCandidates);
  const allowedReuseKeys = new Set(reuseKeyCandidates);
  const excluded = new Set<string>();

  for (const [imageUrl, entry] of recentRecipePhotoSelections.entries()) {
    if (entry.expiresAt <= now) {
      recentRecipePhotoSelections.delete(imageUrl);
      continue;
    }

    if (!allowedSignatures.has(entry.signature) && !allowedReuseKeys.has(entry.reuseKey)) {
      excluded.add(imageUrl);
    }
  }

  return excluded;
}

function rememberRecipePhotoSelection(imageUrl: string, signature: string, reuseKey: string) {
  if (!isDurableRecipeImageUrl(imageUrl)) return;
  recentRecipePhotoSelections.set(imageUrl, {
    expiresAt: Date.now() + RECENT_SELECTION_TTL_MS,
    reuseKey,
    signature
  });
}

function isRecipePhotoRecentlyUsedForDifferentSignature(imageUrl: string, signatureCandidates: string[], reuseKeyCandidates: string[]) {
  const existing = recentRecipePhotoSelections.get(imageUrl);
  if (!existing) return false;
  if (existing.expiresAt <= Date.now()) {
    recentRecipePhotoSelections.delete(imageUrl);
    return false;
  }

  return !signatureCandidates.includes(existing.signature) && !reuseKeyCandidates.includes(existing.reuseKey);
}

function getRecipePhotoReuseKeyForEntry(
  entry: Pick<CachedRecipePhoto | SharedRecipePhotoEntry, "query" | "signature">,
  fallbackReuseKeys: string[]
) {
  return buildRecipePhotoReuseKeyFromQuery(entry.query || entry.signature) || fallbackReuseKeys[0] || entry.signature;
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

"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type KeyboardEvent } from "react";
import { ChefHat, ChevronDown, Plus, RotateCcw, Sparkles } from "lucide-react";
import { hasRecipeImageLookupAccess, useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import { isKnownWeakRecipeProviderImageUrl } from "@/lib/recipeImageQuality";
import { buildRecipePhotoReuseKeyFromQuery } from "@/lib/recipePhotoReuse";
import { getCuisinePlaceholderPalette as getDictionaryCuisinePlaceholderPalette } from "@/food/FoodDictionary";
import type { PhotoIdentity, RecipeImageSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const recipePhotoSuccessCache = new Map<
  string,
  { imageAttributionName?: string; imageAttributionUrl?: string; imageSource?: RecipeImageSource; imageUrl: string }
>();
const recipePhotoFailureCache = new Map<string, number>();
const inFlightRecipePhotoRequests = new Map<
  string,
  Promise<{
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    imageSource?: RecipeImageSource;
    imageUrl?: string;
    retryAfterSeconds?: number;
  }>
>();
const recentRecipePhotoSelections = new Map<string, { expiresAt: number; queryKey: string; reuseKey: string }>();
const DEFAULT_RECIPE_PHOTO_FAILURE_TTL_MS = 10 * 60 * 1000;
const RECENT_RECIPE_PHOTO_SELECTION_TTL_MS = 10 * 60 * 1000;
const PREMIUM_RECIPE_PHOTO_MAX_RETRY_DELAY_MS = 18 * 1000;

export interface MealRevealSection {
  title: string;
  items: string[];
  tone?: "have" | "need" | "steps";
}

interface MealRevealStat {
  label: string;
  value: string | number | undefined;
}

interface MealRevealCardProps {
  disableAutoImageLookup?: boolean;
  deferImageLookup?: boolean;
  trustProvidedImage?: boolean;
  imageLookupVersion?: number;
  name: string;
  imageUrl?: string;
  imageSource?: RecipeImageSource;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageLoading?: boolean;
  imageError?: boolean;
  imagePlaceholder?: {
    label: string;
    tone: string;
  };
  imageQuery?: string | string[];
  imageExactNames?: string[];
  imageCuisine?: string;
  imagePhotoIdentity?: PhotoIdentity;
  imagePromptIngredients?: string[];
  recipeSource?: "external_source" | "generated" | "local_database";
  recipeSourceUrl?: string;
  onImageResolved?: (payload: {
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    imageSource?: RecipeImageSource;
    imageUrl: string;
  }) => void | Promise<void>;
  eyebrow?: string;
  visualMatchLabel?: string;
  summary?: string;
  previewLabel?: string;
  previewItems?: string[];
  stats?: MealRevealStat[];
  sections?: MealRevealSection[];
  className?: string;
}

export function MealRevealCard({
  disableAutoImageLookup = false,
  deferImageLookup = false,
  trustProvidedImage = false,
  imageLookupVersion = 0,
  name,
  imageSource,
  imageUrl,
  imageLoading,
  imageError,
  imagePlaceholder,
  imageQuery,
  imageExactNames,
  imageCuisine,
  imagePhotoIdentity,
  imagePromptIngredients,
  recipeSource,
  recipeSourceUrl,
  onImageResolved,
  eyebrow,
  visualMatchLabel,
  summary,
  previewLabel,
  previewItems,
  stats = [],
  sections = [],
  className
}: MealRevealCardProps) {
  const { t, rtl } = useApp();
  const { access, getAuthHeaders, loading: authLoading, refreshAccess, user } = useAuth();
  const hasGeneratedImageAccess = hasRecipeImageLookupAccess(access);
  const bypassClientCache = false;
  const cardRef = useRef<HTMLElement | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const premiumRetryCountsRef = useRef<Map<string, number>>(new Map());
  const [lookupActivated, setLookupActivated] = useState(false);
  const [lookupRetryToken, setLookupRetryToken] = useState(0);
  const [manualImageLookupRequested, setManualImageLookupRequested] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const [lookupState, setLookupState] = useState<{
    failed: boolean;
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    image: string;
    imageSource?: RecipeImageSource;
    loading: boolean;
    queryKey: string;
    retrying: boolean;
  }>({
    failed: false,
    imageAttributionName: undefined,
    imageAttributionUrl: undefined,
    image: "",
    imageSource: undefined,
    loading: false,
    queryKey: "",
    retrying: false
  });

  const queryCandidates = useMemo(() => normalizeRecipePhotoQueries(imageQuery), [imageQuery]);
  const primaryQuery = queryCandidates[0] ?? "";
  const exactNamesForLookup = useMemo(
    () => (imageExactNames?.length ? imageExactNames : [name]).map(normalizeRecipePhotoParam).filter(Boolean),
    [imageExactNames, name]
  );
  const queryKey = [
    queryCandidates.join(" || "),
    exactNamesForLookup.join(" || "),
    normalizeRecipePhotoParam(imageCuisine),
    normalizeRecipePhotoParam(imagePhotoIdentity?.dish_slug)
  ]
    .filter(Boolean)
    .join(" ## ");
  const reuseKey = buildRecipePhotoReuseKeyFromQuery(primaryQuery || queryKey);
  const isFailedImageUrl = useCallback(
    (candidate?: string) => Boolean(candidate && failedImageUrls.has(candidate)),
    [failedImageUrls]
  );

  useEffect(() => {
    if (!imageLookupVersion || !queryKey) return;
    premiumRetryCountsRef.current.delete(queryKey);
    const timeout = globalThis.setTimeout(() => {
      setLookupState((current) => {
        if (current.queryKey !== queryKey || (!current.failed && !current.retrying)) return current;
        return {
          failed: false,
          imageAttributionName: undefined,
          imageAttributionUrl: undefined,
          image: "",
          imageSource: undefined,
          loading: false,
          queryKey,
          retrying: false
        };
      });
      setLookupActivated(true);
      setLookupRetryToken((value) => value + 1);
    }, 0);
    return () => globalThis.clearTimeout(timeout);
  }, [imageLookupVersion, queryKey]);
  const cachedImageEntry = !bypassClientCache && queryKey ? recipePhotoSuccessCache.get(queryKey) : undefined;
  const cachedImage =
    isUsableRecipeCardImageUrl(cachedImageEntry?.imageUrl) &&
    !isFailedImageUrl(cachedImageEntry.imageUrl) &&
    !isRecipePhotoRecentlyAssignedToDifferentQuery(cachedImageEntry.imageUrl, queryKey, reuseKey)
      ? cachedImageEntry.imageUrl
      : "";
  const cachedFailure = !hasGeneratedImageAccess && !bypassClientCache && queryKey ? isRecipePhotoFailureCached(queryKey) : false;
  const lookedUpImage =
    lookupState.queryKey === queryKey &&
    isUsableRecipeCardImageUrl(lookupState.image) &&
    !isFailedImageUrl(lookupState.image)
      ? lookupState.image
      : "";
  const lookupFailed = lookupState.queryKey === queryKey ? lookupState.failed : false;
  const lookupLoading = lookupState.queryKey === queryKey ? lookupState.loading : false;
  const lookupRetrying = lookupState.queryKey === queryKey ? lookupState.retrying : false;
  const internetProvidedImage =
    isUsableRecipeCardImageUrl(imageUrl) &&
    !isFailedImageUrl(imageUrl) &&
    shouldTrustProvidedRecipeImage({
      imageUrl,
      imagePhotoIdentity,
      imageQuery: queryCandidates,
      imageSource,
      name,
      trustProvidedImage
    })
      ? imageUrl
      : undefined;
  const effectiveProvidedImage = internetProvidedImage;
  const resolvedImage = effectiveProvidedImage || lookedUpImage || cachedImage;
  const resolvedImageSource = effectiveProvidedImage
    ? imageSource
    : lookedUpImage
      ? lookupState.imageSource
      : cachedImage
        ? cachedImageEntry?.imageSource
        : undefined;
  const lookupEnabled = !deferImageLookup || lookupActivated;
  const effectiveImageLoading =
    !resolvedImage && Boolean(lookupLoading || lookupRetrying || (imageLoading && !lookupFailed && !cachedFailure));
  const showNoExactPhoto = !resolvedImage && !effectiveImageLoading && (imageError || lookupFailed || cachedFailure);
  const excludedImageUrls = useMemo(
    () => Array.from(new Set([...getRecentlyAssignedRecipePhotoUrls(queryKey, reuseKey), ...failedImageUrls])),
    [failedImageUrls, queryKey, reuseKey]
  );
  const placeholderStyle = useMemo(
    () => buildRecipePlaceholderStyle(primaryQuery || imagePlaceholder?.label || name, imagePlaceholder?.tone || imageCuisine),
    [imageCuisine, imagePlaceholder?.label, imagePlaceholder?.tone, name, primaryQuery]
  );
  const visibleStats = useMemo(
    () => stats.filter((stat) => stat.value !== undefined && stat.value !== ""),
    [stats]
  );
  const headlineStats = useMemo(() => visibleStats.slice(0, 2), [visibleStats]);
  const detailSections = useMemo(() => sections.filter((section) => section.items.length), [sections]);
  const derivedPreviewItems = useMemo(() => {
    if (previewItems?.length) return previewItems.slice(0, 5);
    return detailSections
      .filter((section) => section.tone !== "steps")
      .flatMap((section) => section.items)
      .slice(0, 5);
  }, [detailSections, previewItems]);
  const cardSummary = summary ?? derivedPreviewItems.slice(0, 2).join(" / ");
  const resolvedPreviewLabel = previewLabel ?? t("ingredientSnapshot");
  const detailId = useMemo(() => `meal-details-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, [name]);
  const handleImageLoadError = useCallback(
    (failedUrl: string) => {
      if (!failedUrl) return;
      setFailedImageUrls((current) => {
        if (current.has(failedUrl)) return current;
        const next = new Set(current);
        next.add(failedUrl);
        return next;
      });
      if (!bypassClientCache && queryKey) {
        recipePhotoSuccessCache.delete(queryKey);
      }
    },
    [bypassClientCache, queryKey, setFailedImageUrls]
  );

  const handleRetryImageLookup = useCallback(() => {
    if (retryTimeoutRef.current) {
      globalThis.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (queryKey) {
      recipePhotoFailureCache.delete(queryKey);
      recipePhotoSuccessCache.delete(queryKey);
      premiumRetryCountsRef.current.delete(queryKey);
    }

    setFailedImageUrls(new Set());
    setLookupState({
      failed: false,
      imageAttributionName: undefined,
      imageAttributionUrl: undefined,
      image: "",
      imageSource: undefined,
      loading: false,
      queryKey,
      retrying: false
    });
    setManualImageLookupRequested(true);
    setLookupActivated(true);
    setLookupRetryToken((value) => value + 1);
  }, [
    queryKey,
    setFailedImageUrls,
    setLookupActivated,
    setLookupRetryToken,
    setLookupState,
    setManualImageLookupRequested
  ]);

  useEffect(() => {
    if (!queryKey || !resolvedImage) return;
    rememberRecentRecipePhotoSelection(resolvedImage, queryKey, reuseKey);
  }, [queryKey, resolvedImage, reuseKey]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        globalThis.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!deferImageLookup || lookupActivated) return;
    const card = cardRef.current;
    if (!card) return;

    if (!("IntersectionObserver" in window)) {
      const timeout = globalThis.setTimeout(() => setLookupActivated(true), 0);
      return () => globalThis.clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setLookupActivated(true);
        observer.disconnect();
      },
      { rootMargin: "720px 0px" }
    );

    observer.observe(card);
    return () => observer.disconnect();
  }, [deferImageLookup, lookupActivated]);

  useEffect(() => {
    if (disableAutoImageLookup && !manualImageLookupRequested) return;
    if (authLoading) return;
    if (!lookupEnabled) return;
    if (imageLoading && hasGeneratedImageAccess) return;
    if (effectiveProvidedImage || !queryKey || !primaryQuery || lookedUpImage || lookupFailed) return;
    if (!user) return;

    let cancelled = false;
    const now = Date.now();
    const failedUntil = recipePhotoFailureCache.get(queryKey);

    if (!bypassClientCache && cachedImage) {
      return;
    }

    if (!bypassClientCache && failedUntil && failedUntil > now) {
      return;
    }

    const loadingStateTimeout = globalThis.setTimeout(() => {
      if (cancelled) return;
      setLookupState({
        failed: false,
        imageAttributionName: undefined,
        imageAttributionUrl: undefined,
        image: "",
        imageSource: undefined,
        loading: true,
        queryKey,
        retrying: false
      });
    }, 0);
    const existingRequest = inFlightRecipePhotoRequests.get(queryKey);
    const request =
      existingRequest ??
      getAuthHeaders()
        .then((headers) =>
          fetch(buildRecipePhotoRequestUrl(queryCandidates, imagePromptIngredients ?? [], excludedImageUrls, {
            cuisine: imageCuisine,
            exactNames: exactNamesForLookup,
            photoIdentity: imagePhotoIdentity
          }), {
            headers
          })
        )
        .then(async (response) => {
          const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "0") || undefined;
          const data = (await response.json().catch(() => null)) as
            | {
                imageAttributionName?: string;
                imageAttributionUrl?: string;
                imageSource?: RecipeImageSource;
                imageUrl?: string;
              }
            | null;

          if (response.ok && isUsableRecipeCardImageUrl(data?.imageUrl)) {
            return {
              imageAttributionName: data.imageAttributionName,
              imageAttributionUrl: data.imageAttributionUrl,
              imageSource: data.imageSource,
              imageUrl: data.imageUrl,
              retryAfterSeconds
            };
          }

          throw new Error(String(retryAfterSeconds ?? 0));
        })
        .finally(() => {
          inFlightRecipePhotoRequests.delete(queryKey);
        });

    inFlightRecipePhotoRequests.set(queryKey, request);

    request
      .then((data) => {
        if (cancelled || !data.imageUrl) return;

        if (!bypassClientCache) {
          recipePhotoSuccessCache.set(queryKey, {
            imageAttributionName: data.imageAttributionName,
            imageAttributionUrl: data.imageAttributionUrl,
            imageSource: data.imageSource,
            imageUrl: data.imageUrl
          });
          recipePhotoFailureCache.delete(queryKey);
        }
        rememberRecentRecipePhotoSelection(data.imageUrl, queryKey, reuseKey);
        setLookupState({
          failed: false,
          imageAttributionName: data.imageAttributionName,
          imageAttributionUrl: data.imageAttributionUrl,
          image: data.imageUrl,
          imageSource: data.imageSource,
          loading: false,
          queryKey,
          retrying: false
        });
        premiumRetryCountsRef.current.delete(queryKey);
        setManualImageLookupRequested(false);
        void onImageResolved?.({
          imageAttributionName: data.imageAttributionName,
          imageAttributionUrl: data.imageAttributionUrl,
          imageSource: data.imageSource,
          imageUrl: data.imageUrl
        });
        void refreshAccess();
      })
      .catch((error) => {
        if (cancelled) return;

        const retryAfterSeconds = Number(error instanceof Error ? error.message : "0") || 0;
        const retryUntil = now + (retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : DEFAULT_RECIPE_PHOTO_FAILURE_TTL_MS);
        const premiumRetryCount = premiumRetryCountsRef.current.get(queryKey) ?? 0;
        if (hasGeneratedImageAccess) {
          premiumRetryCountsRef.current.set(queryKey, premiumRetryCount + 1);
          setLookupState({
            failed: false,
            imageAttributionName: undefined,
            imageAttributionUrl: undefined,
            image: "",
            imageSource: undefined,
            loading: false,
            queryKey,
            retrying: true
          });
          if (retryTimeoutRef.current) {
            globalThis.clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = globalThis.setTimeout(
            () => setLookupRetryToken((value) => value + 1),
            Math.min(
              retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 5000 + Math.min(premiumRetryCount, 4) * 2500,
              PREMIUM_RECIPE_PHOTO_MAX_RETRY_DELAY_MS
            )
          );
          return;
        }
        if (!bypassClientCache && !hasGeneratedImageAccess) {
          recipePhotoFailureCache.set(queryKey, retryUntil);
        }
        setLookupState({
          failed: true,
          imageAttributionName: undefined,
          imageAttributionUrl: undefined,
          image: "",
          imageSource: undefined,
          loading: false,
          queryKey,
          retrying: false
        });
        setManualImageLookupRequested(false);
      });

    return () => {
      cancelled = true;
      globalThis.clearTimeout(loadingStateTimeout);
    };
  }, [
    hasGeneratedImageAccess,
    authLoading,
    bypassClientCache,
    cachedImage,
    disableAutoImageLookup,
    effectiveProvidedImage,
    getAuthHeaders,
    imageLoading,
    imageCuisine,
    imagePhotoIdentity,
    exactNamesForLookup,
    imagePromptIngredients,
    lookupEnabled,
    lookupFailed,
    lookupRetryToken,
    manualImageLookupRequested,
    lookedUpImage,
    onImageResolved,
    primaryQuery,
    excludedImageUrls,
    queryCandidates,
    queryKey,
    refreshAccess,
    reuseKey,
    user
  ]);

  const handleSurfaceClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select")) return;
    setLookupActivated(true);
    toggleRecipeDetails();
  };

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "BUTTON" || target?.tagName === "A") return;
    event.preventDefault();
    setLookupActivated(true);
    toggleRecipeDetails();
  };

  const toggleRecipeDetails = () => {
    setIsOpen((value) => {
      const nextValue = !value;
      setIsFlipped(nextValue);
      return nextValue;
    });
  };

  const openRecipeDetails = () => {
    setLookupActivated(true);
    setIsOpen(true);
    setIsFlipped(true);
  };

  return (
    <article
      ref={cardRef}
      tabIndex={0}
      onFocusCapture={() => {
        setLookupActivated(true);
        setIsFlipped(true);
      }}
      onMouseEnter={() => setLookupActivated(true)}
      onTouchStart={() => setLookupActivated(true)}
      onKeyDown={handleSurfaceKeyDown}
      className={cn(
        "focus-ring theme-recipe-card group relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#041411] shadow-soft transition-ui hover:-translate-y-1 hover:shadow-xl",
        className
      )}
    >
      <div className="relative">
        <div
          dir="ltr"
          className="relative h-[34rem] [perspective:1600px] sm:h-[27rem] lg:h-[25rem]"
          onClick={handleSurfaceClick}
        >
          <div
            className={cn(
              "relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] [-webkit-transform-style:preserve-3d] md:group-hover:[transform:rotateY(180deg)] md:group-focus-within:[transform:rotateY(180deg)]",
              (isFlipped || isOpen) && "[transform:rotateY(180deg)]"
            )}
          >
            <div
              className={cn(
                "absolute inset-0 [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(0deg)]",
                (isFlipped || isOpen) && "pointer-events-none"
              )}
              dir={rtl ? "rtl" : "ltr"}
            >
              <RecipeFrontFace
                eyebrow={eyebrow}
                visualMatchLabel={visualMatchLabel}
                name={name}
                summary={cardSummary}
                headlineStats={headlineStats}
                resolvedImage={resolvedImage}
                imageLoading={effectiveImageLoading}
                hasGeneratedImageAccess={hasGeneratedImageAccess}
                showNoExactPhoto={showNoExactPhoto}
                placeholderStyle={placeholderStyle}
                onImageLoadError={handleImageLoadError}
                onOpenRecipe={openRecipeDetails}
                onRetryImageLookup={handleRetryImageLookup}
                provenance={{ imageSource: resolvedImageSource, recipeSource, recipeSourceUrl }}
              />
            </div>

            <div
              className="absolute inset-0 [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)]"
              dir={rtl ? "rtl" : "ltr"}
            >
              <RecipeBackFace
                eyebrow={eyebrow}
                name={name}
                previewLabel={resolvedPreviewLabel}
                previewItems={derivedPreviewItems}
                isOpen={isOpen}
                onToggleOpen={toggleRecipeDetails}
              />
            </div>
          </div>
        </div>

        <div
          id={detailId}
          className={cn(
            "theme-recipe-detail overflow-hidden border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,17,15,0.98)_0%,rgba(7,27,22,0.98)_100%)] transition-[max-height,opacity] duration-300",
            isOpen ? "max-h-[180rem] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="space-y-5 p-5">
            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-4">
              {eyebrow ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{eyebrow}</p>
              ) : null}
              <h4 className="mt-1 text-xl font-display font-bold leading-tight text-white">{name}</h4>
            </div>

            <div className="space-y-4">
              {detailSections.map((section) => (
                <div key={section.title} className="space-y-3">
              <p className="theme-recipe-detail-heading text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{section.title}</p>
                  {section.tone === "steps" ? (
                    <div className="space-y-2">
                      {section.items.map((item, index) => (
                        <div
                          key={`${section.title}-${index}-${item}`}
                          className="theme-recipe-detail-copy flex gap-2 rounded-[1.2rem] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/88"
                        >
                          <span className="shrink-0 text-cyan-200">{index + 1}.</span>
                          <span className="min-w-0 flex-1 break-words">{item}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {section.items.map((item, index) => (
                        <span
                          key={`${section.title}-${index}-${item}`}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-semibold",
                            section.tone === "have" && "border border-emerald-200/20 bg-emerald-300/14 text-emerald-50",
                            section.tone === "need" && "border border-amber-200/18 bg-amber-200/14 text-amber-50",
                            !section.tone && "theme-recipe-chip border border-white/10 bg-white/[0.05] text-white/88"
                          )}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function RecipeFrontFace({
  eyebrow,
  visualMatchLabel,
  name,
  summary,
  headlineStats,
  resolvedImage,
  imageLoading,
  hasGeneratedImageAccess,
  showNoExactPhoto,
  placeholderStyle,
  onImageLoadError,
  onOpenRecipe,
  onRetryImageLookup,
  provenance
}: {
  eyebrow?: string;
  visualMatchLabel?: string;
  name: string;
  summary: string;
  headlineStats: MealRevealStat[];
  resolvedImage?: string;
  imageLoading?: boolean;
  hasGeneratedImageAccess: boolean;
  showNoExactPhoto: boolean;
  placeholderStyle: CSSProperties;
  onImageLoadError: (failedUrl: string) => void;
  onOpenRecipe: () => void;
  onRetryImageLookup: () => void;
  provenance: {
    imageSource?: RecipeImageSource;
    recipeSource?: "external_source" | "generated" | "local_database";
    recipeSourceUrl?: string;
  };
}) {
  const { t, rtl } = useApp();
  const noImageState = !resolvedImage;
  const loadingTitle = hasGeneratedImageAccess ? t("generatingRecipeImage") : t("findingPhoto");
  const loadingHint = hasGeneratedImageAccess ? t("recipeImageLoadingHint") : t("hideWeakMatches");

  return (
    <div className="relative h-full overflow-hidden">
      {resolvedImage ? (
        <Image
          src={resolvedImage}
          alt={name}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-[transform,filter] duration-500 group-hover:scale-105 group-hover:brightness-75 group-focus-within:scale-105 group-focus-within:brightness-75"
          unoptimized
          onError={() => onImageLoadError(resolvedImage)}
        />
      ) : (
        <div
          className={cn("absolute inset-0", imageLoading && "motion-safe:animate-pulse")}
          style={placeholderStyle}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-[#040c0a] via-[#040c0a]/36 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/30 to-transparent" />
      <RecipeProvenanceBadge {...provenance} rtl={rtl} />

      {noImageState ? (
        <div className="absolute inset-0 z-10 flex flex-col justify-between gap-3 px-4 pb-3 pt-12 sm:px-5 sm:pb-4 sm:pt-14">
          <div className="flex justify-center">
            <div className="w-full max-w-[13rem] rounded-[1.6rem] border border-white/12 bg-[#f5fffc]/8 p-3 text-center text-white/86 backdrop-blur-md sm:max-w-[14rem] sm:p-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-white/10 text-cyan-100 shadow-[0_18px_40px_rgba(3,18,16,0.28)] sm:h-14 sm:w-14">
                <ChefHat className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/18 bg-cyan-300/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                {imageLoading ? t("findingPhoto") : t("curatedFallback")}
              </div>
              <p className="mt-2 text-xs font-semibold text-white sm:text-sm">
                {imageLoading ? loadingTitle : t("awaitingPlatedMatch")}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/62 sm:text-xs">
                {imageLoading ? loadingHint : t("hideWeakMatches")}
              </p>
              {showNoExactPhoto && !imageLoading ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRetryImageLookup();
                  }}
                  className="focus-ring mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-white/14 bg-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.18]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("retryPhoto")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-white/10 bg-[rgba(4,12,10,0.82)] p-3 backdrop-blur-md sm:p-4">
            <div className="space-y-2">
              {eyebrow ? (
                <p className="theme-recipe-front-eyebrow text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/82">{eyebrow}</p>
              ) : null}
              <h3 className="theme-recipe-front-title line-clamp-2 break-words text-[1.15rem] font-display font-bold leading-tight drop-shadow-sm sm:line-clamp-3 sm:text-[1.45rem]">{name}</h3>
              {summary ? <p className="theme-recipe-front-summary line-clamp-2 max-w-xl text-xs leading-relaxed text-white/74 sm:text-sm">{summary}</p> : null}
            </div>

            {headlineStats.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {headlineStats.map((stat) => (
                  <div
                    key={`headline-${stat.label}-${stat.value}`}
                    className="theme-recipe-front-stat inline-flex items-baseline gap-1 rounded-full border border-white/10 bg-white/12 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur-md"
                  >
                    <span className="theme-recipe-front-stat-value text-white">{stat.value}</span>
                    <span className="theme-recipe-front-stat-label text-[10px] uppercase tracking-[0.14em] text-white/70">{stat.label}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenRecipe();
              }}
              className="focus-ring theme-recipe-front-badge mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88 backdrop-blur-md transition hover:bg-white/[0.18]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t("viewRecipe")}
            </button>
          </div>
        </div>
      ) : null}

      {imageLoading ? (
        <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-[#f5fffc]/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#07201a]">
          {t("findingPhoto")}
        </div>
      ) : null}

      {visualMatchLabel ? (
          <div className="theme-recipe-match-pill absolute right-4 top-4 max-w-[11rem] rounded-full border border-cyan-200/35 bg-cyan-300/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#06201b] shadow-[0_12px_30px_rgba(60,255,230,0.2)] backdrop-blur-md">
          {visualMatchLabel}
        </div>
      ) : null}

      {showNoExactPhoto ? (
        <div className={cn(
          "absolute rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800",
          visualMatchLabel ? "right-4 top-14" : "right-4 top-4"
        )}>
          {t("noExactPhoto")}
        </div>
      ) : null}

      {!noImageState ? (
        <div className="theme-recipe-front absolute inset-x-0 bottom-0 space-y-3 p-4 text-white sm:space-y-4 sm:p-5">
          <div className="space-y-2">
            {eyebrow ? (
              <p className="theme-recipe-front-eyebrow text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/82">{eyebrow}</p>
            ) : null}
            <h3 className="theme-recipe-front-title line-clamp-3 break-words text-[1.45rem] font-display font-bold leading-tight drop-shadow-sm sm:text-2xl">{name}</h3>
            {summary ? <p className="theme-recipe-front-summary line-clamp-2 max-w-xl text-xs leading-relaxed text-white/74 sm:text-sm">{summary}</p> : null}
          </div>

          {headlineStats.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {headlineStats.map((stat) => (
                <div
                  key={`headline-${stat.label}-${stat.value}`}
                  className="theme-recipe-front-stat inline-flex items-baseline gap-1 rounded-full border border-white/10 bg-white/12 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur-md"
                >
                  <span className="theme-recipe-front-stat-value text-white">{stat.value}</span>
                  <span className="theme-recipe-front-stat-label text-[10px] uppercase tracking-[0.14em] text-white/70">{stat.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRecipe();
            }}
            className="focus-ring theme-recipe-front-badge inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88 backdrop-blur-md transition hover:bg-white/[0.18]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("viewRecipe")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RecipeProvenanceBadge({
  imageSource,
  recipeSource,
  recipeSourceUrl,
  rtl
}: {
  imageSource?: RecipeImageSource;
  recipeSource?: "external_source" | "generated" | "local_database";
  recipeSourceUrl?: string;
  rtl: boolean;
}) {
  let recipeLabel = recipeSource === "local_database"
    ? (rtl ? "الوصفة: المكتبة" : "Recipe: Library")
    : recipeSource === "external_source"
      ? (rtl ? "الوصفة: مصدر موثوق" : "Recipe: Trusted source")
      : recipeSource === "generated"
        ? (rtl ? "الوصفة: Gemini" : "Recipe: Gemini")
        : (rtl ? "الوصفة: غير محدد" : "Recipe: Unknown");
  if (rtl) {
    recipeLabel = recipeSource === "local_database"
      ? "الوصفة: المكتبة"
      : recipeSource === "external_source"
        ? "الوصفة: مصدر موثوق"
        : recipeSource === "generated"
          ? "الوصفة: Gemini"
          : "الوصفة: غير محدد";
  }

  const imageLabels: Record<RecipeImageSource, string> = {
    api: rtl ? "الصورة: مزود الصور" : "Photo: Image service",
    cache: rtl ? "الصورة: الذاكرة المشتركة" : "Photo: Shared cache",
    pexels: "Photo: Pexels",
    replicate: "Photo: Replicate",
    search: rtl ? "الصورة: بحث الصور" : "Photo: Image search",
    shared_pool: rtl ? "الصورة: الذاكرة المشتركة" : "Photo: Shared pool",
    unsplash: "Photo: Unsplash",
    wikimedia: "Photo: Wikimedia"
  };
  const imageLabel = imageSource ? imageLabels[imageSource] : (rtl ? "الصورة: قيد المطابقة" : "Photo: Matching");
  const hasExternalRecipeSource = recipeSource === "external_source" && Boolean(recipeSourceUrl);
  const displayImageLabel = rtl && imageSource
    ? {
        api: "الصورة: مزود الصور",
        cache: "الصورة: الذاكرة المشتركة",
        pexels: "الصورة: Pexels",
        replicate: "الصورة: Replicate",
        search: "الصورة: بحث الصور",
        shared_pool: "الصورة: التجمع المشترك",
        unsplash: "الصورة: Unsplash",
        wikimedia: "الصورة: Wikimedia"
      }[imageSource]
    : rtl
      ? "الصورة: قيد المطابقة"
      : imageSource === "api"
        ? "Photo: Replicate"
        : imageLabel;

  return (
    <div className="absolute left-4 top-4 z-20 max-w-[11rem] rounded-md border border-white/15 bg-[#061b17]/85 px-2.5 py-2 text-[9px] font-semibold leading-tight text-white/88 shadow-lg backdrop-blur-md">
      <p className="truncate">{rtl ? getArabicRecipeSourceLabel(recipeSource) : recipeLabel}</p>
      <p className="mt-1 truncate text-cyan-100/90">{rtl ? getArabicImageSourceLabel(imageSource) : displayImageLabel}</p>
      {hasExternalRecipeSource ? <span className="sr-only">{recipeSourceUrl}</span> : null}
    </div>
  );
}

function getArabicRecipeSourceLabel(recipeSource?: "external_source" | "generated" | "local_database") {
  const prefix = "\u0627\u0644\u0648\u0635\u0641\u0629: ";

  if (recipeSource === "local_database") return `${prefix}\u0627\u0644\u0645\u0643\u062a\u0628\u0629`;
  if (recipeSource === "external_source") return `${prefix}\u0645\u0635\u062f\u0631 \u0645\u0648\u062b\u0648\u0642`;
  if (recipeSource === "generated") return `${prefix}Gemini`;
  return `${prefix}\u063a\u064a\u0631 \u0645\u062d\u062f\u062f`;
}

function getArabicImageSourceLabel(imageSource?: RecipeImageSource) {
  const prefix = "\u0627\u0644\u0635\u0648\u0631\u0629: ";
  const labels: Record<RecipeImageSource, string> = {
    api: "Replicate",
    cache: "\u0627\u0644\u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0645\u0634\u062a\u0631\u0643\u0629",
    pexels: "Pexels",
    replicate: "Replicate",
    search: "\u0628\u062d\u062b \u0627\u0644\u0635\u0648\u0631",
    shared_pool: "\u0627\u0644\u062a\u062c\u0645\u0639 \u0627\u0644\u0645\u0634\u062a\u0631\u0643",
    unsplash: "Unsplash",
    wikimedia: "Wikimedia"
  };

  return imageSource ? `${prefix}${labels[imageSource]}` : `${prefix}\u0642\u064a\u062f \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629`;
}

function RecipeBackFace({
  eyebrow,
  name,
  previewLabel,
  previewItems,
  isOpen,
  onToggleOpen
}: {
  eyebrow?: string;
  name: string;
  previewLabel: string;
  previewItems: string[];
  isOpen: boolean;
  onToggleOpen: () => void;
}) {
  const { t } = useApp();

  return (
    <div className="theme-recipe-back relative flex h-full flex-col justify-between overflow-y-auto bg-[linear-gradient(180deg,#081d19_0%,#071310_55%,#061a25_100%)] p-5 text-white scrollbar-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(84,255,209,0.2),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(102,196,255,0.18),transparent_26%)]" />

      <div className="relative z-10 space-y-4">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{eyebrow}</p>
          ) : null}
          <h3 className="line-clamp-3 break-words text-[1.55rem] font-display font-bold leading-tight sm:text-2xl">{name}</h3>
          <p className="text-sm leading-relaxed text-white/70">{previewLabel}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {previewItems.length ? (
            previewItems.map((item, index) => (
              <span
                key={`preview-${index}-${item}`}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/88"
              >
                {item}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/70">
              {t("fullRecipeDetails")}
            </span>
          )}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {isOpen ? t("clickAgainClose") : t("clickCardPlus")}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleOpen();
          }}
          className="focus-ring theme-recipe-cta inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.09] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.14]"
        >
          <Plus className={cn("h-4 w-4 transition-transform", isOpen && "rotate-45")} />
          {isOpen ? t("hideRecipe") : t("showRecipe")}
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>
    </div>
  );
}

function normalizeRecipePhotoQueries(query?: string | string[]) {
  const values = Array.isArray(query) ? query : query ? [query] : [];
  return Array.from(
    new Set(
      values
        .map((value) => normalizeRecipePhotoParam(value).toLowerCase().replace(/\s+/g, " "))
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 5);
}

function buildRecipePhotoRequestUrl(
  queries: string[],
  ingredients: string[] = [],
  excludeUrls: string[] = [],
  exactContext: { cuisine?: string; exactNames?: string[]; photoIdentity?: PhotoIdentity } = {}
) {
  const params = new URLSearchParams();
  queries.forEach((query, index) => {
    if (index === 0) {
      params.set("query", query);
    } else {
      params.append("alt", query);
    }
  });
  ingredients
    .map(normalizeRecipePhotoParam)
    .filter(Boolean)
    .slice(0, 10)
    .forEach((ingredient) => params.append("ingredient", ingredient));
  exactContext.exactNames
    ?.map(normalizeRecipePhotoParam)
    .filter(Boolean)
    .slice(0, 8)
    .forEach((name) => params.append("exact", name));
  const cuisine = normalizeRecipePhotoParam(exactContext.cuisine);
  if (cuisine) {
    params.set("cuisine", cuisine);
  }
  appendPhotoIdentityParams(params, exactContext.photoIdentity);
  excludeUrls.slice(0, 20).forEach((url) => params.append("exclude", url));

  return `/api/recipe-photo?${params.toString()}`;
}

function appendPhotoIdentityParams(params: URLSearchParams, identity: PhotoIdentity | undefined) {
  const photoSlug = normalizeRecipePhotoParam(identity?.dish_slug);
  if (!photoSlug) return;
  params.set("photoSlug", photoSlug);
  const photoCuisineKey = normalizeRecipePhotoParam(identity?.cuisine_key);
  const photoProtein = normalizeRecipePhotoParam(identity?.protein);
  const photoStarch = normalizeRecipePhotoParam(identity?.starch);
  const photoSauce = normalizeRecipePhotoParam(identity?.sauce);
  const photoMethod = normalizeRecipePhotoParam(identity?.method);
  if (photoCuisineKey) params.set("photoCuisineKey", photoCuisineKey);
  if (photoProtein) params.set("photoProtein", photoProtein);
  if (photoStarch) params.set("photoStarch", photoStarch);
  if (photoSauce) params.set("photoSauce", photoSauce);
  if (photoMethod) params.set("photoMethod", photoMethod);
}

function normalizeRecipePhotoParam(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildRecipePlaceholderStyle(seed: string, tone?: string): CSSProperties {
  const hash = hashRecipeSeed(seed || "recipe");
  const palette = getDictionaryCuisinePlaceholderPalette(tone);
  const hueA = palette?.[0] ?? hash % 360;
  const hueB = palette?.[1] ?? (hueA + 62) % 360;
  const hueC = palette?.[2] ?? (hueA + 190) % 360;

  return {
    background: [
      `radial-gradient(circle at 22% 18%, hsla(${hueB}, 78%, 68%, 0.44), transparent 28%)`,
      `radial-gradient(circle at 78% 22%, hsla(${hueC}, 76%, 64%, 0.32), transparent 25%)`,
      `radial-gradient(circle at 50% 78%, hsla(${hueA}, 80%, 70%, 0.20), transparent 34%)`,
      `linear-gradient(135deg, hsl(${hueA}, 48%, 15%), hsl(${hueB}, 44%, 10%) 58%, hsl(${hueC}, 46%, 15%))`
    ].join(", ")
  };
}

function hashRecipeSeed(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function isInternetImageUrl(imageUrl?: string): imageUrl is string {
  return isDurableRecipeImageUrl(imageUrl);
}

function isUsableRecipeCardImageUrl(imageUrl: string | undefined): imageUrl is string {
  if (!isInternetImageUrl(imageUrl)) return false;
  // Accept any durable non-weak image for display regardless of access tier.
  // Premium Replicate generation is orchestrated by MealPlanTab; this gate
  // only controls what the card renders — not what triggers generation.
  return !isKnownWeakRecipeProviderImageUrl(imageUrl);
}

function shouldTrustProvidedRecipeImage({
  imageUrl,
  imagePhotoIdentity,
  imageQuery,
  imageSource,
  name,
  trustProvidedImage
}: {
  imageUrl: string;
  imagePhotoIdentity?: PhotoIdentity;
  imageQuery: string[];
  imageSource?: RecipeImageSource;
  name: string;
  trustProvidedImage: boolean;
}) {
  if (trustProvidedImage) return true;

  if (imageSource === "api") {
    return doesGeneratedImageSlugMatchCard({
      imageUrl,
      imagePhotoIdentity,
      imageQuery,
      name
    });
  }

  // Provider/search/cache images are not strong enough to preserve across
  // scan/history merges. They must be revalidated for the current exact query
  // so cards do not inherit a nice-looking but unrelated food photo.
  return false;
}

function doesGeneratedImageSlugMatchCard({
  imageUrl,
  imagePhotoIdentity,
  imageQuery,
  name
}: {
  imageUrl: string;
  imagePhotoIdentity?: PhotoIdentity;
  imageQuery: string[];
  name: string;
}) {
  const generatedSlug = extractGeneratedImageSlug(imageUrl);
  if (!generatedSlug) return true;

  const candidates = [
    name,
    imagePhotoIdentity?.english_name,
    imagePhotoIdentity?.dish_slug,
    ...imageQuery
  ]
    .filter(Boolean)
    .map((value) => normalizeGeneratedImageSlug(String(value)))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  if (!candidates.length) return false;

  return candidates.some((candidate) => {
    if (candidate === generatedSlug) return true;
    if (candidate.length >= 10 && generatedSlug.includes(candidate)) return true;
    return generatedSlug.length >= 10 && candidate.includes(generatedSlug);
  });
}

function extractGeneratedImageSlug(imageUrl: string) {
  const decodedUrl = safeDecodeURIComponent(imageUrl);
  const match =
    decodedUrl.match(/generated(?::strict-v\d+)?:([^/?#]+?)(?:\.jpg|[?#]|$)/i) ??
    decodedUrl.match(/recipe-photo-cache\/([^/?#]+?)(?:\.jpg|[?#]|$)/i);

  return normalizeGeneratedImageSlug(match?.[1] ?? "");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeGeneratedImageSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/\.(?:jpe?g|png|webp)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRecipePhotoFailureCached(queryKey: string) {
  const failedUntil = recipePhotoFailureCache.get(queryKey);
  if (!failedUntil) return false;

  if (failedUntil <= Date.now()) {
    recipePhotoFailureCache.delete(queryKey);
    return false;
  }

  return true;
}

function getRecentlyAssignedRecipePhotoUrls(queryKey: string, reuseKey: string) {
  const now = Date.now();
  const excluded = new Set<string>();

  for (const [imageUrl, entry] of recentRecipePhotoSelections.entries()) {
    if (entry.expiresAt <= now) {
      recentRecipePhotoSelections.delete(imageUrl);
      continue;
    }

    if (entry.queryKey !== queryKey && entry.reuseKey !== reuseKey) {
      excluded.add(imageUrl);
    }
  }

  return Array.from(excluded);
}

function rememberRecentRecipePhotoSelection(imageUrl: string, queryKey: string, reuseKey: string) {
  if (!isInternetImageUrl(imageUrl) || !queryKey) return;
  recentRecipePhotoSelections.set(imageUrl, {
    expiresAt: Date.now() + RECENT_RECIPE_PHOTO_SELECTION_TTL_MS,
    queryKey,
    reuseKey
  });
}

function isRecipePhotoRecentlyAssignedToDifferentQuery(imageUrl: string, queryKey: string, reuseKey: string) {
  const existing = recentRecipePhotoSelections.get(imageUrl);
  if (!existing) return false;
  if (existing.expiresAt <= Date.now()) {
    recentRecipePhotoSelections.delete(imageUrl);
    return false;
  }

  return existing.queryKey !== queryKey && existing.reuseKey !== reuseKey;
}

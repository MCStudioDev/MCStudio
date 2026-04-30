"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type MouseEvent, type KeyboardEvent } from "react";
import { ChefHat, ChevronDown, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import type { RecipeImageSource } from "@/lib/types";
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
const recentRecipePhotoSelections = new Map<string, { expiresAt: number; queryKey: string }>();
const DEFAULT_RECIPE_PHOTO_FAILURE_TTL_MS = 10 * 60 * 1000;
const RECENT_RECIPE_PHOTO_SELECTION_TTL_MS = 10 * 60 * 1000;

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
  deferImageLookup?: boolean;
  name: string;
  imageUrl?: string;
  imageSource?: RecipeImageSource;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageLoading?: boolean;
  imageError?: boolean;
  imageQuery?: string | string[];
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
  deferImageLookup = false,
  name,
  imageUrl,
  imageSource,
  imageAttributionName,
  imageAttributionUrl,
  imageLoading,
  imageError,
  imageQuery,
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
  const { t } = useApp();
  const { getAuthHeaders, loading: authLoading, refreshAccess, user } = useAuth();
  const [lookupActivated, setLookupActivated] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [lookupState, setLookupState] = useState<{
    failed: boolean;
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    image: string;
    imageSource?: RecipeImageSource;
    queryKey: string;
  }>({
    failed: false,
    imageAttributionName: undefined,
    imageAttributionUrl: undefined,
    image: "",
    imageSource: undefined,
    queryKey: ""
  });

  const queryCandidates = useMemo(() => normalizeRecipePhotoQueries(imageQuery), [imageQuery]);
  const primaryQuery = queryCandidates[0] ?? "";
  const queryKey = queryCandidates.join(" || ");
  const cachedImageEntry = queryKey ? recipePhotoSuccessCache.get(queryKey) : undefined;
  const cachedImage =
    isInternetImageUrl(cachedImageEntry?.imageUrl) &&
    !isRecipePhotoRecentlyAssignedToDifferentQuery(cachedImageEntry.imageUrl, queryKey)
      ? cachedImageEntry.imageUrl
      : "";
  const cachedFailure = queryKey ? isRecipePhotoFailureCached(queryKey) : false;
  const lookedUpImage =
    lookupState.queryKey === queryKey && isInternetImageUrl(lookupState.image) ? lookupState.image : "";
  const lookedUpSource = lookupState.queryKey === queryKey ? lookupState.imageSource : undefined;
  const lookedUpAttributionName = lookupState.queryKey === queryKey ? lookupState.imageAttributionName : undefined;
  const lookedUpAttributionUrl = lookupState.queryKey === queryKey ? lookupState.imageAttributionUrl : undefined;
  const lookupFailed = lookupState.queryKey === queryKey ? lookupState.failed : false;
  const internetProvidedImage = isInternetImageUrl(imageUrl) ? imageUrl : undefined;
  const shouldRefreshProvidedImage = internetProvidedImage
    ? Boolean(queryKey) && isRecipePhotoRecentlyAssignedToDifferentQuery(internetProvidedImage, queryKey)
    : false;
  const effectiveProvidedImage = shouldRefreshProvidedImage ? "" : internetProvidedImage;
  const resolvedImage = effectiveProvidedImage || lookedUpImage || cachedImage;
  const resolvedSource =
    (shouldRefreshProvidedImage ? undefined : imageSource) ||
    lookedUpSource ||
    cachedImageEntry?.imageSource ||
    inferImageSource(effectiveProvidedImage);
  const resolvedAttributionName =
    (shouldRefreshProvidedImage ? undefined : imageAttributionName) ||
    lookedUpAttributionName ||
    cachedImageEntry?.imageAttributionName;
  const resolvedAttributionUrl =
    (shouldRefreshProvidedImage ? undefined : imageAttributionUrl) ||
    lookedUpAttributionUrl ||
    cachedImageEntry?.imageAttributionUrl;
  const lookupEnabled = !deferImageLookup || lookupActivated;
  const showNoExactPhoto = !resolvedImage && (imageError || lookupFailed || cachedFailure);
  const excludedImageUrls = useMemo(() => getRecentlyAssignedRecipePhotoUrls(queryKey), [queryKey]);
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

  useEffect(() => {
    if (!queryKey || !resolvedImage) return;
    rememberRecentRecipePhotoSelection(resolvedImage, queryKey);
  }, [queryKey, resolvedImage]);

  useEffect(() => {
    if (authLoading) return;
    if (!lookupEnabled) return;
    if (effectiveProvidedImage || !queryKey || !primaryQuery || lookedUpImage || lookupFailed) return;
    if (!user) return;

    let cancelled = false;
    const now = Date.now();
    const failedUntil = recipePhotoFailureCache.get(queryKey);

    if (cachedImage) {
      return;
    }

    if (failedUntil && failedUntil > now) {
      return;
    }

    const existingRequest = inFlightRecipePhotoRequests.get(queryKey);
    const request =
      existingRequest ??
      getAuthHeaders()
        .then((headers) =>
          fetch(buildRecipePhotoRequestUrl(queryCandidates, excludedImageUrls), {
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

          if (response.ok && isInternetImageUrl(data?.imageUrl)) {
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

        recipePhotoSuccessCache.set(queryKey, {
          imageAttributionName: data.imageAttributionName,
          imageAttributionUrl: data.imageAttributionUrl,
          imageSource: data.imageSource,
          imageUrl: data.imageUrl
        });
        recipePhotoFailureCache.delete(queryKey);
        rememberRecentRecipePhotoSelection(data.imageUrl, queryKey);
        setLookupState({
          failed: false,
          imageAttributionName: data.imageAttributionName,
          imageAttributionUrl: data.imageAttributionUrl,
          image: data.imageUrl,
          imageSource: data.imageSource,
          queryKey
        });
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
        recipePhotoFailureCache.set(queryKey, retryUntil);
        setLookupState({
          failed: true,
          imageAttributionName: undefined,
          imageAttributionUrl: undefined,
          image: "",
          imageSource: undefined,
          queryKey
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    cachedImage,
    effectiveProvidedImage,
    getAuthHeaders,
    lookupEnabled,
    lookupFailed,
    lookedUpImage,
    onImageResolved,
    primaryQuery,
    excludedImageUrls,
    queryCandidates,
    queryKey,
    refreshAccess,
    user
  ]);

  const handleSurfaceClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select")) return;
    setLookupActivated(true);
    setIsOpen((value) => {
      const nextValue = !value;
      setIsFlipped(nextValue);
      return nextValue;
    });
  };

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "BUTTON" || target?.tagName === "A") return;
    event.preventDefault();
    setLookupActivated(true);
    setIsOpen((value) => {
      const nextValue = !value;
      setIsFlipped(nextValue);
      return nextValue;
    });
  };

  return (
    <article
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
          className="relative h-[24rem] [perspective:1600px] sm:h-[25rem]"
          onClick={handleSurfaceClick}
        >
          <div
            className={cn(
              "relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] md:group-hover:[transform:rotateY(180deg)] md:group-focus-within:[transform:rotateY(180deg)]",
              (isFlipped || isOpen) && "[transform:rotateY(180deg)]"
            )}
          >
            <div className="absolute inset-0 [backface-visibility:hidden]">
              <RecipeFrontFace
                eyebrow={eyebrow}
                visualMatchLabel={visualMatchLabel}
                name={name}
                summary={cardSummary}
                headlineStats={headlineStats}
                resolvedImage={resolvedImage}
                resolvedSource={resolvedSource}
                imageLoading={imageLoading}
                showNoExactPhoto={showNoExactPhoto}
              />
            </div>

            <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <RecipeBackFace
                eyebrow={eyebrow}
                name={name}
                previewLabel={resolvedPreviewLabel}
                previewItems={derivedPreviewItems}
                isOpen={isOpen}
                onToggleOpen={() =>
                  setIsOpen((value) => {
                    const nextValue = !value;
                    setIsFlipped(nextValue);
                    return nextValue;
                  })
                }
              />
            </div>
          </div>
        </div>

        {resolvedSource === "unsplash" && resolvedAttributionName && resolvedAttributionUrl ? (
          <div className="theme-recipe-attribution border-t border-white/8 bg-[#071714]/86 px-5 py-3 text-[11px] text-white/65">
            Photo by{" "}
            <a
              href={resolvedAttributionUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/35 underline-offset-2 hover:text-white"
            >
              {resolvedAttributionName}
            </a>{" "}
            on{" "}
            <a
              href="https://unsplash.com/?utm_source=nutrimoment&utm_medium=referral"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/35 underline-offset-2 hover:text-white"
            >
              Unsplash
            </a>
          </div>
        ) : null}

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
                          className="theme-recipe-detail-copy rounded-[1.2rem] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/88"
                        >
                          <span className="mr-2 text-cyan-200">{index + 1}.</span>
                          {item}
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
  resolvedSource,
  imageLoading,
  showNoExactPhoto
}: {
  eyebrow?: string;
  visualMatchLabel?: string;
  name: string;
  summary: string;
  headlineStats: MealRevealStat[];
  resolvedImage?: string;
  resolvedSource?: RecipeImageSource;
  imageLoading?: boolean;
  showNoExactPhoto: boolean;
}) {
  const { t } = useApp();

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
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(73,247,189,0.38),transparent_30%),radial-gradient(circle_at_78%_18%,rgba(97,196,255,0.24),transparent_24%),linear-gradient(135deg,#0b201c,#061311_58%,#05293a)]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-[#040c0a] via-[#040c0a]/36 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/30 to-transparent" />

      {!resolvedImage ? (
        <div className="absolute inset-x-0 top-[4.8rem] flex justify-center px-5">
          <div className="w-full max-w-[15rem] rounded-[1.8rem] border border-white/12 bg-[#f5fffc]/8 p-5 text-center text-white/86 backdrop-blur-md">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-white/10 text-cyan-100 shadow-[0_18px_40px_rgba(3,18,16,0.28)]">
              <ChefHat className="h-8 w-8" />
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/18 bg-cyan-300/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              {t("curatedFallback")}
            </div>
            <p className="mt-3 text-sm font-semibold text-white">{t("awaitingPlatedMatch")}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/62">
              {t("hideWeakMatches")}
            </p>
          </div>
        </div>
      ) : null}

      {imageLoading ? (
        <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-[#f5fffc]/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#07201a]">
          {t("findingPhoto")}
        </div>
      ) : null}

      {resolvedSource ? (
        resolvedSource === "search" ? (
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noreferrer"
            className="theme-recipe-source-pill absolute left-4 top-4 rounded-full bg-stone-950/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {formatImageSourceLabel(resolvedSource)}
          </a>
        ) : resolvedSource === "unsplash" ? (
          <a
            href="https://unsplash.com/?utm_source=nutrimoment&utm_medium=referral"
            target="_blank"
            rel="noreferrer"
            className="theme-recipe-source-pill absolute left-4 top-4 rounded-full bg-stone-950/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {formatImageSourceLabel(resolvedSource)}
          </a>
        ) : (
          <div className="theme-recipe-source-pill absolute left-4 top-4 rounded-full bg-stone-950/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md">
            {formatImageSourceLabel(resolvedSource)}
          </div>
        )
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

      <div className="theme-recipe-front absolute inset-x-0 bottom-0 space-y-4 p-5 text-white">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="theme-recipe-front-eyebrow text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/82">{eyebrow}</p>
          ) : null}
          <h3 className="theme-recipe-front-title text-2xl font-display font-bold leading-tight drop-shadow-sm">{name}</h3>
          {summary ? <p className="theme-recipe-front-summary max-w-xl text-sm leading-relaxed text-white/74">{summary}</p> : null}
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

        <div className="theme-recipe-front-badge inline-flex items-center rounded-full border border-white/10 bg-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur-md">
          {t("hoverPreview")}
        </div>
      </div>
    </div>
  );
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
          <h3 className="text-2xl font-display font-bold leading-tight">{name}</h3>
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
        .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 5);
}

function buildRecipePhotoRequestUrl(queries: string[], excludeUrls: string[] = []) {
  const params = new URLSearchParams();
  queries.forEach((query, index) => {
    if (index === 0) {
      params.set("query", query);
    } else {
      params.append("alt", query);
    }
  });
  excludeUrls.slice(0, 8).forEach((url) => params.append("exclude", url));

  return `/api/recipe-photo?${params.toString()}`;
}

function isInternetImageUrl(imageUrl?: string): imageUrl is string {
  return Boolean(imageUrl && /^https?:\/\//i.test(imageUrl));
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

function getRecentlyAssignedRecipePhotoUrls(queryKey: string) {
  const now = Date.now();
  const excluded = new Set<string>();

  for (const [imageUrl, entry] of recentRecipePhotoSelections.entries()) {
    if (entry.expiresAt <= now) {
      recentRecipePhotoSelections.delete(imageUrl);
      continue;
    }

    if (entry.queryKey !== queryKey) {
      excluded.add(imageUrl);
    }
  }

  return Array.from(excluded);
}

function rememberRecentRecipePhotoSelection(imageUrl: string, queryKey: string) {
  if (!isInternetImageUrl(imageUrl) || !queryKey) return;
  recentRecipePhotoSelections.set(imageUrl, {
    expiresAt: Date.now() + RECENT_RECIPE_PHOTO_SELECTION_TTL_MS,
    queryKey
  });
}

function isRecipePhotoRecentlyAssignedToDifferentQuery(imageUrl: string, queryKey: string) {
  const existing = recentRecipePhotoSelections.get(imageUrl);
  if (!existing) return false;
  if (existing.expiresAt <= Date.now()) {
    recentRecipePhotoSelections.delete(imageUrl);
    return false;
  }

  return existing.queryKey !== queryKey;
}

function formatImageSourceLabel(source: RecipeImageSource) {
  switch (source) {
    case "api":
      return "Gemini";
    case "cache":
      return "Cache";
    case "search":
      return "Pexels";
    case "unsplash":
      return "Unsplash";
    case "wikimedia":
      return "Wikimedia";
    default:
      return "Photo";
  }
}

function inferImageSource(imageUrl?: string): RecipeImageSource | undefined {
  if (!imageUrl) return undefined;
  if (/upload\.wikimedia\.org/i.test(imageUrl)) return "wikimedia";
  if (/images\.unsplash\.com|unsplash\.com/i.test(imageUrl)) return "unsplash";
  if (/images\.pexels\.com|pexels\.com/i.test(imageUrl)) return "search";
  if (/firebasestorage\.googleapis\.com|firebasestorage\.app/i.test(imageUrl)) return "cache";
  return undefined;
}

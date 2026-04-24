"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type MouseEvent, type KeyboardEvent } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
const DEFAULT_RECIPE_PHOTO_FAILURE_TTL_MS = 10 * 60 * 1000;

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
  summary,
  previewLabel = "Ingredient snapshot",
  previewItems,
  stats = [],
  sections = [],
  className
}: MealRevealCardProps) {
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
  const cachedImage = cachedImageEntry?.imageUrl ?? "";
  const cachedFailure = queryKey ? isRecipePhotoFailureCached(queryKey) : false;
  const lookedUpImage = lookupState.queryKey === queryKey ? lookupState.image : "";
  const lookedUpSource = lookupState.queryKey === queryKey ? lookupState.imageSource : undefined;
  const lookedUpAttributionName = lookupState.queryKey === queryKey ? lookupState.imageAttributionName : undefined;
  const lookedUpAttributionUrl = lookupState.queryKey === queryKey ? lookupState.imageAttributionUrl : undefined;
  const lookupFailed = lookupState.queryKey === queryKey ? lookupState.failed : false;
  const resolvedImage = imageUrl || lookedUpImage || cachedImage;
  const resolvedSource = imageSource || lookedUpSource || cachedImageEntry?.imageSource || inferImageSource(imageUrl);
  const resolvedAttributionName =
    imageAttributionName || lookedUpAttributionName || cachedImageEntry?.imageAttributionName;
  const resolvedAttributionUrl =
    imageAttributionUrl || lookedUpAttributionUrl || cachedImageEntry?.imageAttributionUrl;
  const lookupEnabled = !deferImageLookup || lookupActivated;
  const showNoExactPhoto = !resolvedImage && (imageError || lookupFailed || cachedFailure);
  const visibleStats = useMemo(
    () => stats.filter((stat) => stat.value !== undefined && stat.value !== ""),
    [stats]
  );
  const headlineStats = useMemo(() => visibleStats.slice(0, 2), [visibleStats]);
  const detailStats = useMemo(() => visibleStats.slice(0, 4), [visibleStats]);
  const detailSections = useMemo(() => sections.filter((section) => section.items.length), [sections]);
  const derivedPreviewItems = useMemo(() => {
    if (previewItems?.length) return previewItems.slice(0, 5);
    return detailSections
      .filter((section) => section.tone !== "steps")
      .flatMap((section) => section.items)
      .slice(0, 5);
  }, [detailSections, previewItems]);
  const cardSummary = summary ?? derivedPreviewItems.slice(0, 2).join(" / ");
  const detailId = useMemo(() => `meal-details-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, [name]);

  useEffect(() => {
    if (authLoading) return;
    if (!lookupEnabled) return;
    if (imageUrl || !queryKey || !primaryQuery || lookedUpImage || lookupFailed) return;
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
          fetch(buildRecipePhotoRequestUrl(queryCandidates), {
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

          if (response.ok && data?.imageUrl) {
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
    getAuthHeaders,
    imageUrl,
    lookupEnabled,
    lookupFailed,
    lookedUpImage,
    onImageResolved,
    primaryQuery,
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
        "focus-ring group relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#041411] shadow-soft transition-ui hover:-translate-y-1 hover:shadow-xl",
        className
      )}
    >
      <div className="relative">
        <div
          className="relative h-[23rem] [perspective:1600px] sm:h-[24rem]"
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
                previewLabel={previewLabel}
                previewItems={derivedPreviewItems}
                detailStats={detailStats}
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
          <div className="border-t border-white/8 bg-[#071714]/86 px-5 py-3 text-[11px] text-white/65">
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
            "overflow-hidden border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,17,15,0.98)_0%,rgba(7,27,22,0.98)_100%)] transition-[max-height,opacity] duration-300",
            isOpen ? "max-h-[48rem] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="space-y-5 p-5">
            {detailStats.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {detailStats.map((stat) => (
                  <div
                    key={`detail-${stat.label}-${stat.value}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">{stat.label}</p>
                    <p className="mt-1 text-lg font-semibold text-white tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-4">
              {detailSections.map((section) => (
                <div key={section.title} className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{section.title}</p>
                  {section.tone === "steps" ? (
                    <div className="space-y-2">
                      {section.items.map((item, index) => (
                        <div
                          key={`${section.title}-${index}-${item}`}
                          className="rounded-[1.2rem] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/88"
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
                            !section.tone && "border border-white/10 bg-white/[0.05] text-white/88"
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
  name,
  summary,
  headlineStats,
  resolvedImage,
  resolvedSource,
  imageLoading,
  showNoExactPhoto
}: {
  eyebrow?: string;
  name: string;
  summary: string;
  headlineStats: MealRevealStat[];
  resolvedImage?: string;
  resolvedSource?: RecipeImageSource;
  imageLoading?: boolean;
  showNoExactPhoto: boolean;
}) {
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

      {imageLoading ? (
        <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-[#f5fffc]/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#07201a]">
          Finding photo
        </div>
      ) : null}

      {resolvedSource ? (
        resolvedSource === "search" ? (
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noreferrer"
            className="absolute left-4 top-4 rounded-full bg-stone-950/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {formatImageSourceLabel(resolvedSource)}
          </a>
        ) : resolvedSource === "unsplash" ? (
          <a
            href="https://unsplash.com/?utm_source=nutrimoment&utm_medium=referral"
            target="_blank"
            rel="noreferrer"
            className="absolute left-4 top-4 rounded-full bg-stone-950/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {formatImageSourceLabel(resolvedSource)}
          </a>
        ) : (
          <div className="absolute left-4 top-4 rounded-full bg-stone-950/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md">
            {formatImageSourceLabel(resolvedSource)}
          </div>
        )
      ) : null}

      {showNoExactPhoto ? (
        <div className="absolute right-4 top-4 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
          No exact photo
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 space-y-4 p-5 text-white">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/82">{eyebrow}</p>
          ) : null}
          <h3 className="text-2xl font-display font-bold leading-tight drop-shadow-sm">{name}</h3>
          {summary ? <p className="max-w-xl text-sm leading-relaxed text-white/74">{summary}</p> : null}
        </div>

        {headlineStats.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {headlineStats.map((stat) => (
              <div
                key={`headline-${stat.label}-${stat.value}`}
                className="inline-flex items-baseline gap-1 rounded-full border border-white/10 bg-white/12 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur-md"
              >
                <span className="text-white">{stat.value}</span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/70">{stat.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur-md">
          Hover for preview, click for full recipe
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
  detailStats,
  isOpen,
  onToggleOpen
}: {
  eyebrow?: string;
  name: string;
  previewLabel: string;
  previewItems: string[];
  detailStats: MealRevealStat[];
  isOpen: boolean;
  onToggleOpen: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-[linear-gradient(180deg,#081d19_0%,#071310_55%,#061a25_100%)] p-5 text-white">
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
              Full recipe details available inside
            </span>
          )}
        </div>

        {detailStats.length ? (
          <div className="grid grid-cols-2 gap-2">
            {detailStats.map((stat) => (
              <div key={`preview-stat-${stat.label}-${stat.value}`} className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">{stat.label}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {isOpen ? "Click card again to close" : "Click card or use plus"}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleOpen();
          }}
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.09] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.14]"
        >
          <Plus className={cn("h-4 w-4 transition-transform", isOpen && "rotate-45")} />
          {isOpen ? "Hide recipe" : "Show recipe"}
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

function buildRecipePhotoRequestUrl(queries: string[]) {
  const params = new URLSearchParams();
  queries.forEach((query, index) => {
    if (index === 0) {
      params.set("query", query);
    } else {
      params.append("alt", query);
    }
  });

  return `/api/recipe-photo?${params.toString()}`;
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
  if (/^data:/i.test(imageUrl)) return "api";
  if (/images\.unsplash\.com|unsplash\.com/i.test(imageUrl)) return "unsplash";
  if (/images\.pexels\.com|pexels\.com/i.test(imageUrl)) return "search";
  if (/firebasestorage\.googleapis\.com|firebasestorage\.app/i.test(imageUrl)) return "cache";
  return undefined;
}

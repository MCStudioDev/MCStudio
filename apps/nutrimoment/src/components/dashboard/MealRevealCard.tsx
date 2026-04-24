"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { RecipeImageSource } from "@/lib/types";

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
  stats?: Array<{ label: string; value: string | number | undefined }>;
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
  stats = [],
  sections = [],
  className
}: MealRevealCardProps) {
  const { getAuthHeaders, loading: authLoading, refreshAccess, user } = useAuth();
  const [lookupActivated, setLookupActivated] = useState(false);
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
    imageQuery,
    imageUrl,
    lookedUpImage,
    lookupFailed,
    lookupEnabled,
    onImageResolved,
    primaryQuery,
    queryCandidates,
    queryKey,
    refreshAccess,
    user
  ]);

  const visibleStats = useMemo(
    () => stats.filter((stat) => stat.value !== undefined && stat.value !== ""),
    [stats]
  );
  const headlineStats = useMemo(() => visibleStats.slice(0, 2), [visibleStats]);
  const detailStats = useMemo(() => visibleStats.slice(2, 4), [visibleStats]);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <article
      tabIndex={0}
      onFocusCapture={() => setLookupActivated(true)}
      onMouseEnter={() => setLookupActivated(true)}
      onTouchStart={() => setLookupActivated(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setIsOpen((value) => !value);
        }
      }}
      className={cn(
        "focus-ring group relative overflow-hidden rounded-[1.5rem] border border-white/70 bg-stone-950 shadow-soft transition-ui hover:-translate-y-1 hover:shadow-xl",
        className
      )}
    >
      <div className="relative min-h-[21rem]">
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
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.45),transparent_32%),linear-gradient(135deg,#134e4a,#1c1917_62%,#78350f)]" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/45 to-transparent" />

        {imageLoading ? (
          <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-700">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">{eyebrow}</p>
            ) : null}
            <h3 className="text-2xl font-display font-bold leading-tight drop-shadow-sm">{name}</h3>
          </div>

          {headlineStats.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {headlineStats.map((stat) => (
                <div
                  key={`headline-${stat.label}-${stat.value}`}
                  className="inline-flex items-baseline gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur-md"
                >
                  <span className="text-white">{stat.value}</span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/70">{stat.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div
            id={`meal-details-${name.replace(/\s+/g, "-")}`}
            className={cn(
              "space-y-4 overflow-hidden transition-[max-height,opacity] duration-300",
              isOpen ? "max-h-[28rem] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            {detailStats.length ? (
              <div className="grid grid-cols-2 gap-2">
                {detailStats.map((stat) => (
                  <div key={`detail-${stat.label}-${stat.value}`} className="rounded-2xl bg-white/14 px-3 py-2 backdrop-blur-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">{stat.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {sections
                .filter((section) => section.items.length)
                .map((section) => (
                  <div key={section.title} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{section.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {section.items.slice(0, section.tone === "steps" ? 6 : 12).map((item, index) => (
                        <span
                          key={`${section.title}-${index}-${item}`}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            section.tone === "have" && "bg-emerald-300/20 text-emerald-50",
                            section.tone === "need" && "bg-amber-200/20 text-amber-50",
                            section.tone === "steps" && "bg-white/12 text-white/90"
                          )}
                        >
                          {section.tone === "steps" ? `${index + 1}. ${item}` : item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsOpen((value) => !value);
              }}
              aria-expanded={isOpen}
              aria-controls={`meal-details-${name.replace(/\s+/g, "-")}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md transition hover:bg-white/25"
            >
              {isOpen ? "Hide" : "Details"}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", isOpen ? "rotate-180" : "rotate-0")}
                aria-hidden="true"
              />
            </button>
            {resolvedSource === "unsplash" && resolvedAttributionName && resolvedAttributionUrl ? (
              <p className="text-right text-[10px] font-medium normal-case tracking-normal text-white/70">
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
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
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

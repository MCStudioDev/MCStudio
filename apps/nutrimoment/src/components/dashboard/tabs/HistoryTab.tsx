"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { History, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { useApp } from "@/contexts/AppContext";
import { hasRecipeImageLookupAccess, useAuth } from "@/contexts/AuthContext";
import { useHistory } from "@/hooks/useHistory";
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { isUsableRecipeImageForAccess } from "@/lib/recipeImageQuality";
import { buildEnglishRecipePhotoContext, buildEnglishRecipePhotoIngredients } from "@/lib/recipePhotoLanguage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { buildRecipeDisplayName } from "@/lib/recipeDisplayNames";
import { containerVariants, itemVariants } from "@/lib/animations";
import { getCuisineDisplayLabel } from "@/lib/cuisines";
import { formatDate } from "@/lib/utils";
import type { Recipe, RecipeImageSource } from "@/lib/types";
import { canReuseRecipePhotoForDiet } from "@/services/recipePhotoReusePolicy";
import { EmptyState, SectionHero } from "./shared";

const HISTORY_INITIAL_ENTRY_COUNT = 6;
const HISTORY_LOAD_MORE_COUNT = 6;
const HISTORY_EAGER_IMAGE_COUNT = 3;
const HISTORY_IMAGE_CACHE_REPAIR_BATCH_SIZE = 30;
const HISTORY_PREMIUM_IMAGE_CONCURRENCY = 2;
const HISTORY_PREMIUM_IMAGE_TIMEOUT_MS = 70 * 1000;

type HistoryPhotoBatchResult = {
  error?: string;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource?: RecipeImageSource;
  imageUrl?: string;
  ok: boolean;
  status: number;
};

type ReusableHistoryImage = {
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource?: Recipe["image_source"];
  imageUrl: string;
};

export function HistoryTab() {
  const { t, setError, settings, health } = useApp();
  const { access, getAuthHeaders, user } = useAuth();
  const hasGeneratedImageAccess = hasRecipeImageLookupAccess(access);
  const { items, clear, removeEntry, loading, error: historyError, updateRecipeImage } = useHistory();
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleEntryCount, setVisibleEntryCount] = useState(HISTORY_INITIAL_ENTRY_COUNT);
  const cacheRepairKeysRef = useRef<Set<string>>(new Set());
  const [repairingPhotoKeys, setRepairingPhotoKeys] = useState<Set<string>>(() => new Set());
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);

  const handleClear = async () => {
    try {
      await clear();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear history";
      setError(message);
    }
  };

  useEffect(() => {
    if (historyError) {
      setError(`History could not sync. ${historyError.message}`);
    }
  }, [historyError, setError]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;

    return items.filter((entry) => {
      const haystack = [
        entry.title,
        entry.sessionType,
        formatDate(entry.timestamp),
        ...entry.recipes.flatMap((recipe) => [
          recipe.name,
          recipe.cuisine,
          recipe.image_search_index,
          ...(recipe.image_search_indices ?? []),
          ...(recipe.ingredients ?? []).map(getRecipeIngredientLabel),
          ...(recipe.missing_ingredients ?? []).map(getRecipeIngredientLabel),
          ...(recipe.steps ?? []).map((step) => (typeof step === "string" ? step : String(step)))
        ])
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [items, searchQuery]);
  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleEntryCount),
    [filteredItems, visibleEntryCount]
  );
  const hasMoreHistory = visibleEntryCount < filteredItems.length;

  useEffect(() => {
    setVisibleEntryCount(HISTORY_INITIAL_ENTRY_COUNT);
  }, [searchQuery]);

  useEffect(() => {
    if (!user || !visibleItems.length) return;

    const reusableImagesByKey = buildReusableHistoryImageIndex(
      items,
      hasGeneratedImageAccess,
      health.diets
    );
    const reusableMatches: Array<{
      entryId: string;
      image: ReusableHistoryImage;
      recipeIndex: number;
      repairKey: string;
    }> = [];
    const candidates = visibleItems.flatMap((entry) =>
      entry.recipes
        .map((recipe, recipeIndex) => {
          if (canReuseRecipePhotoForDiet(recipe, health.diets, hasGeneratedImageAccess)) return null;
          const repairKey = buildHistoryPhotoRepairKey(entry.id, recipeIndex, recipe, health.diets);
          if (cacheRepairKeysRef.current.has(repairKey)) return null;
          cacheRepairKeysRef.current.add(repairKey);

          const reusableImage = findReusableHistoryImage(recipe, reusableImagesByKey);
          if (reusableImage) {
            reusableMatches.push({
              entryId: entry.id,
              image: reusableImage,
              recipeIndex,
              repairKey
            });
            return null;
          }

          const queries = buildRecipePhotoQuery(recipe);
          return {
            entryId: entry.id,
            queryKey: repairKey,
            recipe,
            recipeIndex,
            queries
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    );

    if (!candidates.length && !reusableMatches.length) return;

    const repairKeys = [
      ...reusableMatches.map((match) => match.repairKey),
      ...candidates.map((candidate) => candidate.queryKey)
    ];
    setRepairingPhotoKeys((current) => new Set([...current, ...repairKeys]));

    const repairFromCache = async () => {
      try {
        const premiumGenerationCandidates: typeof candidates = [];
        for (const match of reusableMatches) {
          await updateRecipeImage(
            match.entryId,
            match.recipeIndex,
            match.image.imageUrl,
            false,
            match.image.imageSource,
            { name: match.image.imageAttributionName, url: match.image.imageAttributionUrl }
          );
        }

        for (let index = 0; index < candidates.length; index += HISTORY_IMAGE_CACHE_REPAIR_BATCH_SIZE) {
          const chunk = candidates.slice(index, index + HISTORY_IMAGE_CACHE_REPAIR_BATCH_SIZE);
          const response = await fetch("/api/recipe-photo/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
            body: JSON.stringify({
              items: chunk.map((candidate) => ({
                alt: candidate.queries.slice(1),
                cacheOnly: true,
                cuisine: buildRecipePhotoCuisine(candidate.recipe),
                diet: health.diets,
                exact: buildRecipePhotoExactNames(candidate.recipe),
                ingredient: buildRecipePhotoPromptIngredients(candidate.recipe).slice(0, 10),
                ...buildRecipePhotoIdentityBatchParams(candidate.recipe),
                query: candidate.queries[0] ?? candidate.recipe.name,
                queryKey: candidate.queryKey
              }))
            })
          });

          const payload = (await response.json().catch(() => ({ results: {} }))) as {
            results?: Record<string, HistoryPhotoBatchResult>;
          };

          for (const candidate of chunk) {
            const data = payload.results?.[candidate.queryKey];
            if (isReusableHistoryPhotoResponse(candidate.recipe, data, health.diets, hasGeneratedImageAccess)) {
              await updateRecipeImage(
                candidate.entryId,
                candidate.recipeIndex,
                data.imageUrl,
                false,
                data.imageSource,
                { name: data.imageAttributionName, url: data.imageAttributionUrl }
              );
            } else if (hasGeneratedImageAccess && candidate.entryId === visibleItems[0]?.id) {
              premiumGenerationCandidates.push(candidate);
            }
          }
        }

        await runHistoryPhotoTasks(
          premiumGenerationCandidates,
          HISTORY_PREMIUM_IMAGE_CONCURRENCY,
          async (candidate) => {
            const response = await fetch(buildHistoryRecipePhotoRequestUrl(candidate.recipe, health.diets), {
              headers: await getAuthHeaders(),
              signal: AbortSignal.timeout(HISTORY_PREMIUM_IMAGE_TIMEOUT_MS)
            });
            const data = (await response.json().catch(() => null)) as HistoryPhotoBatchResult | null;
            if (!response.ok || !isReusableHistoryPhotoResponse(candidate.recipe, data, health.diets, true)) return;
            await updateRecipeImage(
              candidate.entryId,
              candidate.recipeIndex,
              data.imageUrl,
              false,
              data.imageSource,
              { name: data.imageAttributionName, url: data.imageAttributionUrl }
            );
          }
        );
      } catch {
        candidates.forEach((candidate) => cacheRepairKeysRef.current.delete(candidate.queryKey));
      } finally {
        setRepairingPhotoKeys((current) => {
          const next = new Set(current);
          repairKeys.forEach((key) => next.delete(key));
          return next;
        });
      }
    };

    void repairFromCache();
  }, [getAuthHeaders, hasGeneratedImageAccess, health.diets, items, updateRecipeImage, user, visibleItems]);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("recipeHistory")}
        description={t("recipeHistoryDesc")}
        eyebrow={t("memoryLane")}
        chips={[t("savedChip"), t("revisitChip"), t("compareChip")]}
        icon={<History className="h-6 w-6" />}
        stats={[
          { label: t("sessionsStat"), value: `${items.length}` },
          { label: t("latestStat"), value: items[0] ? formatDate(items[0].timestamp) : t("noEntries") },
          { label: t("statusStat"), value: loading ? t("syncingStatus") : t("readyStatus") }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("recall")}</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              {t("historyAside")}
            </p>
          </div>
        }
      />

      {loading ? (
        <motion.div variants={itemVariants}>
          <Card className="theme-history-entry rounded-[2rem] space-y-4" aria-busy="true">
            <p className="text-sm font-semibold text-emerald-50/72">{t("loadingHistory")}</p>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-[1.7rem] border border-white/10 bg-white/[0.06]" />
              ))}
            </div>
          </Card>
        </motion.div>
      ) : historyError ? (
        <motion.div variants={itemVariants}>
          <Card className="theme-history-entry rounded-[2rem] space-y-3 border-emerald-100 bg-white text-[#173a31] shadow-[0_24px_70px_-42px_rgba(16,58,48,0.32)]">
            <p className="text-sm font-semibold text-[#173a31]">History is temporarily unavailable.</p>
            <p className="text-sm leading-relaxed text-[#4f6f66]">
              Please refresh the page or sign in again.
            </p>
          </Card>
        </motion.div>
      ) : items.length ? (
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">{t("searchHistory")}</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-50/45" aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("searchHistory")}
                className="focus-ring neo-input h-12 w-full rounded-2xl px-11 text-sm transition-ui"
              />
            </label>
            <Button
              variant="ghost"
              onClick={() =>
                setConfirmState({
                  title: t("clearHistoryTitle"),
                  description: t("clearHistoryDescription"),
                  confirmLabel: t("clearAll"),
                  action: handleClear
                })
              }
            >
              {t("clearAll")}
            </Button>
          </div>

          <div className="grid gap-4">
            {visibleItems.map((entry, entryIndex) => (
              <Card key={entry.id} className="theme-history-entry rounded-[2rem] space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="theme-history-entry-kicker text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                      {formatDate(entry.timestamp)}
                    </p>
                    <h3 className="theme-history-entry-title mt-2 text-2xl font-display font-bold text-white">
                      {entry.title ?? entry.recipes[0]?.name ?? t("savedRecipeSession")}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        title: t("removeHistoryTitle"),
                        description: t("removeHistoryDescription"),
                        confirmLabel: t("remove"),
                        action: () => removeEntry(entry.id)
                      })
                    }
                    aria-label={t("removeHistoryTitle")}
                    className="focus-ring rounded-2xl bg-red-50 p-3 text-red-600 transition-ui hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {entry.generationStatus === "pending" && !entry.recipes.length ? (
                  <div className="rounded-[1.4rem] border border-cyan-200/18 bg-cyan-300/10 px-4 py-5 text-sm font-semibold text-cyan-50">
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.2rem]" />
                    {entry.generationMessage ?? t("backgroundRecipesQueued")}
                  </div>
                ) : null}

                {entry.generationStatus === "failed" && !entry.recipes.length ? (
                  <div className="rounded-[1.4rem] border border-emerald-100 bg-white px-4 py-5 text-sm font-semibold text-[#173a31] shadow-[0_20px_55px_-36px_rgba(16,58,48,0.32)]">
                    {entry.generationMessage ?? t("backgroundRecipesFailed")}
                  </div>
                ) : null}

                {entry.recipes.length ? (
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
                    {entry.recipes.map((recipe, recipeIndex) => {
                      const repairKey = buildHistoryPhotoRepairKey(entry.id, recipeIndex, recipe, health.diets);
                      const imageLoading = repairingPhotoKeys.has(repairKey);
                      return (
                      <MealRevealCard
                      key={`${entry.id}-${recipe.id ?? recipeIndex}`}
                      disableAutoImageLookup
                      deferImageLookup={entryIndex !== 0 || recipeIndex >= HISTORY_EAGER_IMAGE_COUNT}
                      trustProvidedImage
                      eyebrow={getRecipeEyebrow(recipe, t)}
                      name={buildRecipeDisplayName(recipe, settings.uiLanguage)}
                      visualMatchLabel={recipe.visual_match_label}
                      summary={buildRecipeSummary(recipe, t, settings.uiLanguage)}
                      previewLabel={getRecipePreviewLabel(recipe, t)}
                      previewItems={buildRecipePreviewItems(recipe)}
                      imageUrl={getHistoryRecipeImageUrl(recipe, hasGeneratedImageAccess, health.diets)}
                      imageSource={recipe.image_source}
                      imageDiets={health.diets}
                      imageLoading={imageLoading}
                      imageError={
                        !imageLoading && !canReuseRecipePhotoForDiet(recipe, health.diets, hasGeneratedImageAccess)
                      }
                      recipeSource={recipe.recipe_source_type}
                      recipeSourceUrl={recipe.source_url}
                      imageAttributionName={recipe.image_attribution_name}
                      imageAttributionUrl={recipe.image_attribution_url}
                      imageQuery={buildRecipePhotoQuery(recipe)}
                      imageExactNames={buildRecipePhotoExactNames(recipe)}
                      imageCuisine={buildRecipePhotoCuisine(recipe)}
                      imagePhotoIdentity={recipe.photo_identity}
                      imagePromptIngredients={buildRecipePhotoPromptIngredients(recipe)}
                      onImageResolved={
                        user
                          ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                              const persistedImageUrl =
                                hasGeneratedImageAccess
                                  ? null
                                  : await persistRecipeImageForUser({
                                      uid: user.uid,
                                      imageUrl,
                                      query: serializeRecipePhotoQuery(buildRecipePhotoQuery(recipe))
                                    });
                              await updateRecipeImage(
                                entry.id,
                                recipeIndex,
                                persistedImageUrl || imageUrl,
                                false,
                                imageSource,
                                { name: imageAttributionName, url: imageAttributionUrl }
                              );
                            }
                          : undefined
                      }
                      stats={buildRecipeStats(recipe)}
                      sections={buildRecipeSections(recipe, t)}
                    />
                      );
                    })}
                  </div>
                ) : null}
              </Card>
            ))}
            {hasMoreHistory ? (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setVisibleEntryCount((current) => current + HISTORY_LOAD_MORE_COUNT)}
                >
                  {t("showMoreHistory")}
                </Button>
              </div>
            ) : null}
            {!filteredItems.length ? (
              <EmptyState title={t("noHistoryMatches")} description={t("noHistoryMatchesDesc")} />
            ) : null}
          </div>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants}>
          <EmptyState title={t("noHistory")} description={t("noHistoryDesc")} />
        </motion.div>
      )}
      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (!confirmState) return;
          try {
            await confirmState.action();
          } finally {
            setConfirmState(null);
          }
        }}
      />
    </motion.div>
  );
}

function getRecipeIngredientLabel(ingredient: unknown) {
  if (typeof ingredient === "string") return ingredient;

  if (ingredient && typeof ingredient === "object") {
    const maybeIngredient = ingredient as { name?: unknown; quantity?: unknown };
    const name = typeof maybeIngredient.name === "string" ? maybeIngredient.name : "";
    const quantity = typeof maybeIngredient.quantity === "string" ? maybeIngredient.quantity : "";

    return [name, quantity].filter(Boolean).join(" - ") || JSON.stringify(ingredient);
  }

  return String(ingredient);
}

function buildRecipePhotoQuery(recipe: Recipe) {
  const photoContext = buildEnglishRecipePhotoContext(recipe);
  return buildRecipePhotoQueryCandidates({
    cuisine: photoContext.cuisine,
    dishIntent: photoContext.dishIntent,
    imageSearchIndex: photoContext.imageSearchIndex,
    imageSearchIndices: photoContext.imageSearchIndices,
    ingredients: photoContext.ingredients,
    missingIngredients: photoContext.missingIngredients,
    name: photoContext.name
  });
}

function hasStrictRenderableImage(imageUrl: string | undefined, strictGeneratedOnly: boolean): imageUrl is string {
  return isUsableRecipeImageForAccess(imageUrl, strictGeneratedOnly);
}

function isReusableHistoryPhotoResponse(
  recipe: Recipe,
  data: HistoryPhotoBatchResult | null | undefined,
  diets: string[],
  hasGeneratedImageAccess: boolean
): data is HistoryPhotoBatchResult & { imageUrl: string } {
  if (!data?.ok || !hasStrictRenderableImage(data.imageUrl, hasGeneratedImageAccess)) return false;
  return canReuseRecipePhotoForDiet({
    ...recipe,
    image_source: data.imageSource,
    image_url: data.imageUrl
  }, diets, hasGeneratedImageAccess);
}

function buildHistoryRecipePhotoRequestUrl(recipe: Recipe, diets: string[]) {
  const queries = buildRecipePhotoQuery(recipe);
  const params = new URLSearchParams();
  params.set("query", queries[0] ?? recipe.name);
  queries.slice(1, 5).forEach((query) => params.append("alt", query));
  buildRecipePhotoExactNames(recipe).forEach((name) => params.append("exact", name));
  buildRecipePhotoPromptIngredients(recipe).slice(0, 10).forEach((ingredient) => params.append("ingredient", ingredient));
  diets.forEach((diet) => params.append("diet", diet));
  const cuisine = normalizeHistoryRecipePhotoParam(buildRecipePhotoCuisine(recipe));
  if (cuisine) params.set("cuisine", cuisine);

  Object.entries(buildRecipePhotoIdentityBatchParams(recipe)).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/api/recipe-photo?${params.toString()}`;
}

async function runHistoryPhotoTasks<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.allSettled(items.slice(index, index + concurrency).map(worker));
  }
}

function getHistoryRecipeImageUrl(recipe: Recipe, strictGeneratedOnly: boolean, diets: string[]) {
  return canReuseRecipePhotoForDiet(recipe, diets, strictGeneratedOnly) ? recipe.image_url : undefined;
}

function buildReusableHistoryImageIndex(
  items: Array<{ recipes: Recipe[] }>,
  strictGeneratedOnly: boolean,
  diets: string[]
) {
  const imagesByKey = new Map<string, ReusableHistoryImage>();

  for (const entry of items) {
    for (const recipe of entry.recipes) {
      if (!canReuseRecipePhotoForDiet(recipe, diets, strictGeneratedOnly)) continue;
      const image: ReusableHistoryImage = {
        imageAttributionName: recipe.image_attribution_name,
        imageAttributionUrl: recipe.image_attribution_url,
        imageSource: recipe.image_source,
        imageUrl: recipe.image_url!
      };

      for (const key of buildReusableHistoryRecipeKeys(recipe)) {
        if (!imagesByKey.has(key)) {
          imagesByKey.set(key, image);
        }
      }
    }
  }

  return imagesByKey;
}

function findReusableHistoryImage(recipe: Recipe, imagesByKey: Map<string, ReusableHistoryImage>) {
  for (const key of buildReusableHistoryRecipeKeys(recipe)) {
    const image = imagesByKey.get(key);
    if (image) return image;
  }
  return null;
}

function buildReusableHistoryRecipeKeys(recipe: Recipe) {
  return Array.from(
    new Set(
      buildRecipePhotoExactNames(recipe)
        .map(normalizeHistoryRecipeImageKey)
        .filter(Boolean)
    )
  );
}

function normalizeHistoryRecipeImageKey(value?: string) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildHistoryPhotoRepairKey(entryId: string, recipeIndex: number, recipe: Recipe, diets: string[]) {
  return [
    entryId,
    recipeIndex,
    diets.map((diet) => diet.trim().toLowerCase()).sort().join("+"),
    recipe.photo_identity?.dish_slug,
    buildRecipePhotoExactNames(recipe).join("||"),
    buildRecipePhotoQuery(recipe).join("||")
  ]
    .filter(Boolean)
    .join("##");
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
}

function buildRecipePhotoPromptIngredients(recipe: Recipe) {
  return buildEnglishRecipePhotoIngredients(recipe);
}

function buildRecipePhotoExactNames(recipe: Recipe) {
  return Array.from(
    new Set(
      [
        recipe.localized?.English?.name,
        recipe.localized?.Arabic?.name,
        recipe.name,
        recipe.dish_intent?.dish_name,
        recipe.localized?.English?.dish_intent?.dish_name,
        recipe.localized?.Arabic?.dish_intent?.dish_name,
        recipe.image_search_index,
        recipe.localized?.English?.image_search_index,
        recipe.localized?.Arabic?.image_search_index
      ]
        .map(normalizeHistoryRecipePhotoParam)
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 8);
}

function buildRecipePhotoCuisine(recipe: Recipe) {
  return recipe.localized?.English?.cuisine ?? recipe.cuisine;
}

function buildRecipePhotoIdentityBatchParams(recipe: Recipe) {
  const identity = recipe.photo_identity;
  const photoSlug = normalizeHistoryRecipePhotoParam(identity?.dish_slug);
  if (!photoSlug) return {};
  return {
    photoSlug,
    photoCuisineKey: normalizeHistoryRecipePhotoParam(identity?.cuisine_key) || undefined,
    photoProtein: normalizeHistoryRecipePhotoParam(identity?.protein) || undefined,
    photoStarch: normalizeHistoryRecipePhotoParam(identity?.starch) || undefined,
    photoSauce: normalizeHistoryRecipePhotoParam(identity?.sauce) || undefined,
    photoMethod: normalizeHistoryRecipePhotoParam(identity?.method) || undefined
  };
}

function normalizeHistoryRecipePhotoParam(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildRecipeStats(recipe: Recipe) {
  return [
    { label: "kcal", value: recipe.calories },
    { label: "protein", value: recipe.protein },
    { label: "carbs", value: recipe.carbs },
    { label: "fat", value: recipe.fat }
  ];
}

function buildRecipeSummary(recipe: Recipe, t: ReturnType<typeof useApp>["t"], language: string) {
  const isArabicRecipe = containsArabicText(`${recipe.name} ${recipe.cuisine}`);
  const cuisineLabel = getCuisineDisplayLabel(recipe.cuisine, language === "ar" || isArabicRecipe ? "ar" : language);
  const originLabel =
    recipe.recipe_origin === "exact_scan_match"
      ? t("exactScannedDish")
      : recipe.recipe_origin === "similar_ingredients"
        ? t("similarIngredients")
        : null;
  const dishStyle = formatRecipeDishStyle(recipe, isArabicRecipe);
  const preferenceHits = recipe.preference_hits?.length
    ? t("preferenceMatches").replace("{count}", String(recipe.preference_hits.length))
    : null;
  const scanExplanation =
    recipe.recipe_origin === "exact_scan_match" && recipe.scan_match_explanation
      ? recipe.scan_match_explanation
      : null;

  return [
    originLabel,
    cuisineLabel,
    dishStyle,
    formatRecipeMatchQuality(recipe.match_quality, isArabicRecipe),
    preferenceHits,
    scanExplanation
  ].filter(Boolean).join(" / ");
}

function formatRecipeDishStyle(recipe: Recipe, isArabicRecipe: boolean) {
  const mealType = recipe.dish_intent?.meal_type;
  const cookingMethod = recipe.dish_intent?.cooking_method;
  const genericCookingMethod = cookingMethod === "assembled";
  const values = [mealType, genericCookingMethod ? undefined : cookingMethod].filter(Boolean) as string[];
  if (!values.length) return null;
  if (!isArabicRecipe) return values.join(" ");

  const translated = values
    .map((value) => ARABIC_DISH_STYLE_LABELS[value.toLowerCase()] ?? "")
    .filter(Boolean);

  return translated.length ? translated.join(" ") : null;
}

function formatRecipeMatchQuality(matchQuality: Recipe["match_quality"], isArabicRecipe: boolean) {
  if (!matchQuality) return null;
  if (!isArabicRecipe) return matchQuality;
  return ARABIC_MATCH_QUALITY_LABELS[matchQuality] ?? null;
}

function containsArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

const ARABIC_DISH_STYLE_LABELS: Record<string, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  snack: "وجبة خفيفة",
  grilled: "مشوي",
  baked: "مخبوز",
  fried: "مقلي",
  "stir-fried": "سوتيه",
  simmered: "مطهو بهدوء",
  skillet: "في المقلاة"
};

const ARABIC_MATCH_QUALITY_LABELS: Record<NonNullable<Recipe["match_quality"]>, string> = {
  great: "مطابقة ممتازة",
  good: "مطابقة جيدة",
  possible: "مطابقة ممكنة",
  stretch: "مطابقة ضعيفة"
};

function buildRecipePreviewItems(recipe: Recipe) {
  return [...recipe.ingredients, ...recipe.missing_ingredients].map(getRecipeIngredientLabel).slice(0, 5);
}

function buildRecipeSections(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  return [
    {
      title: t("ingredientsYouHave"),
      tone: "have" as const,
      items: recipe.ingredients.map(getRecipeIngredientLabel)
    },
    {
      title: t("ingredientsYouNeed"),
      tone: "need" as const,
      items: recipe.missing_ingredients.map(getRecipeIngredientLabel)
    },
    {
      title: t("prepSteps"),
      tone: "steps" as const,
      items: recipe.steps
    }
  ];
}

function getRecipeEyebrow(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  if (recipe.recipe_origin === "exact_scan_match") return t("exactScannedDish");
  if (recipe.recipe_origin === "similar_ingredients") return t("similarIngredients");
  return undefined;
}

function getRecipePreviewLabel(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  if (recipe.recipe_origin === "exact_scan_match") {
    return t("exactRecipePreview");
  }

  if (recipe.recipe_origin === "similar_ingredients") {
    return t("similarRecipePreview");
  }

  return t("savedRecipePreview");
}

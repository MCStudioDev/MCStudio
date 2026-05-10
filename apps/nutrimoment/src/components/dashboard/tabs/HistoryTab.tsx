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
import { isDurableRecipeImageUrl, isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";
import { buildEnglishRecipePhotoContext, buildEnglishRecipePhotoIngredients } from "@/lib/recipePhotoLanguage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { buildRecipeDisplayName } from "@/lib/recipeDisplayNames";
import { containerVariants, itemVariants } from "@/lib/animations";
import { getCuisineDisplayLabel } from "@/lib/cuisines";
import { formatDate } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

const HISTORY_INITIAL_ENTRY_COUNT = 6;
const HISTORY_LOAD_MORE_COUNT = 6;
const HISTORY_EAGER_IMAGE_COUNT = 3;
const HISTORY_PREMIUM_IMAGE_REPAIR_DELAYS_MS = [18 * 1000, 60 * 1000, 5 * 60 * 1000] as const;
const HISTORY_IMAGE_CACHE_REPAIR_BATCH_SIZE = 30;

type HistoryPhotoBatchResult = {
  error?: string;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
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
  const { t, setError, settings } = useApp();
  const { access, getAuthHeaders, user } = useAuth();
  const hasGeneratedImageAccess = hasRecipeImageLookupAccess(access);
  const { items, clear, removeEntry, loading, updateRecipeImage } = useHistory();
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleEntryCount, setVisibleEntryCount] = useState(HISTORY_INITIAL_ENTRY_COUNT);
  const [imageRepairVersion, setImageRepairVersion] = useState(0);
  const [imageRepairAttempt, setImageRepairAttempt] = useState(0);
  const cacheRepairKeysRef = useRef<Set<string>>(new Set());
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
          ...(recipe.ingredients ?? []),
          ...(recipe.missing_ingredients ?? []),
          ...(recipe.steps ?? [])
        ])
      ]
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

  const visibleMissingPremiumImages = useMemo(() => {
    if (!hasGeneratedImageAccess) return 0;
    return visibleItems.reduce(
      (count, entry) =>
        count + entry.recipes.filter((recipe) => !hasStrictRenderableImage(recipe.image_url, true)).length,
      0
    );
  }, [hasGeneratedImageAccess, visibleItems]);

  useEffect(() => {
    setImageRepairAttempt(0);
  }, [visibleMissingPremiumImages]);

  useEffect(() => {
    if (!visibleMissingPremiumImages) return;
    const delay = HISTORY_PREMIUM_IMAGE_REPAIR_DELAYS_MS[imageRepairAttempt];
    if (delay == null) return;

    const timeout = globalThis.setTimeout(() => {
      setImageRepairVersion((value) => value + 1);
      setImageRepairAttempt((value) => value + 1);
    }, delay);
    return () => globalThis.clearTimeout(timeout);
  }, [imageRepairAttempt, visibleMissingPremiumImages]);

  useEffect(() => {
    if (!hasGeneratedImageAccess || !user || !visibleItems.length) return;

    const reusableImagesByKey = buildReusableHistoryImageIndex(items, hasGeneratedImageAccess);
    const reusableMatches: Array<{
      entryId: string;
      image: ReusableHistoryImage;
      recipeIndex: number;
    }> = [];
    const candidates = visibleItems.flatMap((entry) =>
      entry.recipes
        .map((recipe, recipeIndex) => {
          if (hasStrictRenderableImage(recipe.image_url, hasGeneratedImageAccess)) return null;
          const repairKey = buildHistoryPhotoRepairKey(entry.id, recipeIndex, recipe);
          if (cacheRepairKeysRef.current.has(repairKey)) return null;
          cacheRepairKeysRef.current.add(repairKey);

          const reusableImage = findReusableHistoryImage(recipe, reusableImagesByKey);
          if (reusableImage) {
            reusableMatches.push({
              entryId: entry.id,
              image: reusableImage,
              recipeIndex
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

    let cancelled = false;

    const repairFromCache = async () => {
      try {
        for (const match of reusableMatches) {
          if (cancelled) return;
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
                exact: buildRecipePhotoExactNames(candidate.recipe),
                ingredient: buildRecipePhotoPromptIngredients(candidate.recipe).slice(0, 10),
                query: candidate.queries[0] ?? candidate.recipe.name,
                queryKey: candidate.queryKey
              }))
            })
          });

          const payload = (await response.json().catch(() => ({ results: {} }))) as {
            results?: Record<string, HistoryPhotoBatchResult>;
          };
          if (cancelled) return;

          for (const candidate of chunk) {
            const data = payload.results?.[candidate.queryKey];
            if (data?.ok && hasRenderableImage(data.imageUrl)) {
              await updateRecipeImage(
                candidate.entryId,
                candidate.recipeIndex,
                data.imageUrl,
                false,
                data.imageSource,
                { name: data.imageAttributionName, url: data.imageAttributionUrl }
              );
            }
          }
        }
      } catch {
        candidates.forEach((candidate) => cacheRepairKeysRef.current.delete(candidate.queryKey));
      }
    };

    void repairFromCache();

    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, hasGeneratedImageAccess, items, updateRecipeImage, user, visibleItems]);

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
                  <div className="rounded-[1.4rem] border border-red-200/18 bg-red-400/10 px-4 py-5 text-sm font-semibold text-red-50">
                    {entry.generationMessage ?? t("backgroundRecipesFailed")}
                  </div>
                ) : null}

                {entry.recipes.length ? (
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
                    {entry.recipes.map((recipe, recipeIndex) => (
                    <MealRevealCard
                      key={`${entry.id}-${recipe.id ?? recipeIndex}`}
                      deferImageLookup={entryIndex !== 0 || recipeIndex >= HISTORY_EAGER_IMAGE_COUNT}
                      imageLookupVersion={imageRepairVersion}
                      eyebrow={getRecipeEyebrow(recipe, t)}
                      name={buildRecipeDisplayName(recipe, settings.uiLanguage)}
                      visualMatchLabel={recipe.visual_match_label}
                      summary={buildRecipeSummary(recipe, t, settings.uiLanguage)}
                      previewLabel={getRecipePreviewLabel(recipe, t)}
                      previewItems={buildRecipePreviewItems(recipe)}
                      imageUrl={getHistoryRecipeImageUrl(recipe, hasGeneratedImageAccess)}
                      imageSource={recipe.image_source}
                      imageAttributionName={recipe.image_attribution_name}
                      imageAttributionUrl={recipe.image_attribution_url}
                      imageQuery={buildRecipePhotoQuery(recipe)}
                      imageExactNames={buildRecipePhotoExactNames(recipe)}
                      imageCuisine={buildRecipePhotoCuisine(recipe)}
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
                    ))}
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

function hasRenderableImage(imageUrl?: string): imageUrl is string {
  return isDurableRecipeImageUrl(imageUrl);
}

function hasStrictRenderableImage(imageUrl: string | undefined, strictGeneratedOnly: boolean): imageUrl is string {
  if (!hasRenderableImage(imageUrl)) return false;
  return !strictGeneratedOnly || isReplicateGeneratedRecipeImageUrl(imageUrl);
}

function getHistoryRecipeImageUrl(recipe: Recipe, strictGeneratedOnly: boolean) {
  return hasStrictRenderableImage(recipe.image_url, strictGeneratedOnly) ? recipe.image_url : undefined;
}

function buildReusableHistoryImageIndex(items: Array<{ recipes: Recipe[] }>, strictGeneratedOnly: boolean) {
  const imagesByKey = new Map<string, ReusableHistoryImage>();

  for (const entry of items) {
    for (const recipe of entry.recipes) {
      if (!hasStrictRenderableImage(recipe.image_url, strictGeneratedOnly)) continue;
      const image: ReusableHistoryImage = {
        imageAttributionName: recipe.image_attribution_name,
        imageAttributionUrl: recipe.image_attribution_url,
        imageSource: recipe.image_source,
        imageUrl: recipe.image_url
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

function buildHistoryPhotoRepairKey(entryId: string, recipeIndex: number, recipe: Recipe) {
  return [
    entryId,
    recipeIndex,
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
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 8);
}

function buildRecipePhotoCuisine(recipe: Recipe) {
  return recipe.localized?.English?.cuisine ?? recipe.cuisine;
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

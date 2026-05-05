"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { History, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHistory } from "@/hooks/useHistory";
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { buildEnglishRecipePhotoContext, buildEnglishRecipePhotoIngredients } from "@/lib/recipePhotoLanguage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { containerVariants, itemVariants } from "@/lib/animations";
import { formatDate } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

export function HistoryTab() {
  const { t, setError } = useApp();
  const { access, user } = useAuth();
  const { items, clear, removeEntry, loading, updateRecipeImage } = useHistory();
  const [searchQuery, setSearchQuery] = useState("");
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
            {filteredItems.map((entry, entryIndex) => (
              <Card key={entry.id} className="theme-history-entry rounded-[2rem] space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="theme-history-entry-kicker text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                      {formatDate(entry.timestamp)}
                    </p>
                    <h3 className="theme-history-entry-title mt-2 text-2xl font-display font-bold text-white">
                      {entry.recipes[0]?.name ?? t("savedRecipeSession")}
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
                      deferImageLookup={access.tier === "premium" ? !(entryIndex === 0 && recipeIndex < 3) : false}
                      eyebrow={getRecipeEyebrow(recipe, t)}
                      name={recipe.name}
                      visualMatchLabel={recipe.visual_match_label}
                      summary={buildRecipeSummary(recipe, t)}
                      previewLabel={getRecipePreviewLabel(recipe, t)}
                      previewItems={buildRecipePreviewItems(recipe)}
                      imageUrl={recipe.image_url}
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
                                access.tier === "premium"
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

function buildRecipeSummary(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  const isArabicRecipe = containsArabicText(`${recipe.name} ${recipe.cuisine}`);
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
    recipe.cuisine,
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

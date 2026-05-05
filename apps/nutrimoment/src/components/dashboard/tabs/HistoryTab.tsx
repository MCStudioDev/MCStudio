"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { History, Trash2 } from "lucide-react";
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
          <Card className="theme-history-entry rounded-[2rem] text-sm text-emerald-50/58">{t("loadingHistory")}</Card>
        </motion.div>
      ) : items.length ? (
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex justify-end">
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
            {items.map((entry, entryIndex) => (
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

                <div className="grid gap-3 lg:grid-cols-3">
                  {entry.recipes.map((recipe, recipeIndex) => (
                    <MealRevealCard
                      key={`${entry.id}-${recipe.name}`}
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
                              const recipeIndex = entry.recipes.findIndex((candidate) => candidate.name === recipe.name);
                              if (recipeIndex >= 0) {
                                await updateRecipeImage(
                                  entry.id,
                                  recipeIndex,
                                  persistedImageUrl || imageUrl,
                                  false,
                                  imageSource,
                                  { name: imageAttributionName, url: imageAttributionUrl }
                                );
                              }
                            }
                          : undefined
                      }
                      stats={buildRecipeStats(recipe)}
                      sections={buildRecipeSections(recipe, t)}
                    />
                  ))}
                </div>
              </Card>
            ))}
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

function buildRecipeStats(recipe: Recipe) {
  return [
    { label: "kcal", value: recipe.calories },
    { label: "protein", value: recipe.protein },
    { label: "carbs", value: recipe.carbs },
    { label: "fat", value: recipe.fat }
  ];
}

function buildRecipeSummary(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  const originLabel =
    recipe.recipe_origin === "exact_scan_match"
      ? t("exactScannedDish")
      : recipe.recipe_origin === "similar_ingredients"
        ? t("similarIngredients")
        : null;
  const dishStyle = [recipe.dish_intent?.meal_type, recipe.dish_intent?.cooking_method].filter(Boolean).join(" ");
  const scanExplanation =
    recipe.recipe_origin === "exact_scan_match" && recipe.scan_match_explanation
      ? recipe.scan_match_explanation
      : null;

  return [originLabel, recipe.cuisine, dishStyle, recipe.match_quality, scanExplanation].filter(Boolean).join(" / ");
}

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

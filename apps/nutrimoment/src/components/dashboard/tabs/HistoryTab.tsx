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
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { containerVariants, itemVariants } from "@/lib/animations";
import { formatDate } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

export function HistoryTab() {
  const { t, setError } = useApp();
  const { user } = useAuth();
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
        eyebrow="Memory lane"
        chips={["Saved", "Revisit", "Compare"]}
        icon={<History className="h-6 w-6" />}
        stats={[
          { label: "Sessions", value: `${items.length}` },
          { label: "Latest", value: items[0] ? formatDate(items[0].timestamp) : "No entries" },
          { label: "Status", value: loading ? "Syncing" : "Ready" }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Recall</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              Return to past scans, compare recipe ideas, and keep your stronger matches easy to revisit.
            </p>
          </div>
        }
      />

      {loading ? (
        <motion.div variants={itemVariants}>
          <Card className="rounded-[2rem] text-sm text-emerald-50/58">Loading history...</Card>
        </motion.div>
      ) : items.length ? (
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() =>
                setConfirmState({
                  title: "Clear history?",
                  description: "This removes every saved recipe session from your history.",
                  confirmLabel: t("clearAll"),
                  action: handleClear
                })
              }
            >
              {t("clearAll")}
            </Button>
          </div>

          <div className="grid gap-4">
            {items.map((entry) => (
              <Card key={entry.id} className="rounded-[2rem] space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{formatDate(entry.timestamp)}</p>
                    <h3 className="mt-2 text-2xl font-display font-bold text-white">
                      {entry.recipes[0]?.name ?? "Saved recipe session"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        title: "Remove history entry?",
                        description: "This saved recipe session will be removed from your history.",
                        confirmLabel: "Remove",
                        action: () => removeEntry(entry.id)
                      })
                    }
                    aria-label="Remove history entry"
                    className="focus-ring rounded-2xl bg-red-50 p-3 text-red-600 transition-ui hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {entry.recipes.map((recipe) => (
                    <MealRevealCard
                      key={`${entry.id}-${recipe.name}`}
                      name={recipe.name}
                      summary={buildRecipeSummary(recipe)}
                      previewLabel="Saved recipe preview"
                      previewItems={buildRecipePreviewItems(recipe)}
                      imageUrl={recipe.image_url}
                      imageSource={recipe.image_source}
                      imageAttributionName={recipe.image_attribution_name}
                      imageAttributionUrl={recipe.image_attribution_url}
                      imageQuery={buildRecipePhotoQuery(recipe)}
                      onImageResolved={
                        user
                          ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                              const persistedImageUrl = await persistRecipeImageForUser({
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
  return buildRecipePhotoQueryCandidates({
    cuisine: recipe.cuisine,
    imageSearchIndex: recipe.image_search_index,
    imageSearchIndices: recipe.image_search_indices,
    ingredients: recipe.ingredients,
    missingIngredients: recipe.missing_ingredients,
    name: recipe.name
  });
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
}

function buildRecipeStats(recipe: Recipe) {
  return [
    { label: "kcal", value: recipe.calories },
    { label: "protein", value: recipe.protein },
    { label: "carbs", value: recipe.carbs },
    { label: "fat", value: recipe.fat }
  ];
}

function buildRecipeSummary(recipe: Recipe) {
  return [recipe.cuisine, recipe.match_quality].filter(Boolean).join(" / ");
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

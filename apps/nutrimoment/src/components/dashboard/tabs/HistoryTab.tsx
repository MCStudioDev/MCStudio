"use client";

import { motion } from "framer-motion";
import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import { containerVariants, itemVariants } from "@/lib/animations";
import { formatDate } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

export function HistoryTab() {
  const { t, setError } = useApp();
  const { items, clear, removeEntry, loading } = useHistory();

  const handleClear = async () => {
    const ok = typeof window !== "undefined" ? window.confirm("Clear all history? This cannot be undone.") : true;
    if (!ok) return;
    try {
      await clear();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear history";
      setError(message);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero title={t("recipeHistory")} description={t("recipeHistoryDesc")} icon={<History className="h-6 w-6" />} />

      {loading ? (
        <motion.div variants={itemVariants}>
          <Card className="rounded-[2rem] text-sm text-stone-500">Loading history…</Card>
        </motion.div>
      ) : items.length ? (
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClear}>
              {t("clearAll")}
            </Button>
          </div>

          <div className="grid gap-4">
            {items.map((entry) => (
              <Card key={entry.id} className="rounded-[2rem] space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{formatDate(entry.timestamp)}</p>
                    <h3 className="mt-2 text-2xl font-display font-bold text-stone-900">
                      {entry.recipes[0]?.name ?? "Saved recipe session"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const ok =
                        typeof window !== "undefined"
                          ? window.confirm("Remove this history entry?")
                          : true;
                      if (!ok) return;
                      void removeEntry(entry.id);
                    }}
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
                      imageUrl={recipe.image_url}
                      imageQuery={buildRecipePhotoQuery(recipe)}
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
  return [recipe.name, recipe.cuisine, "prepared food"]
    .filter(Boolean)
    .join(" ");
}

function buildRecipeStats(recipe: Recipe) {
  return [
    { label: "kcal", value: recipe.calories },
    { label: "protein", value: recipe.protein },
    { label: "carbs", value: recipe.carbs },
    { label: "fat", value: recipe.fat }
  ];
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

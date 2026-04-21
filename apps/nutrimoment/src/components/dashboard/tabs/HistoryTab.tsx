"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import { containerVariants, itemVariants } from "@/lib/animations";
import { formatDate } from "@/lib/utils";
import { EmptyState, SectionHero } from "./shared";

export function HistoryTab() {
  const { t, setError } = useApp();
  const { items, clear, removeEntry, loading } = useHistory();

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
      <SectionHero title={t("recipeHistory")} description={t("recipeHistoryDesc")} icon={<History className="h-6 w-6" />} />

      {loading ? (
        <motion.div variants={itemVariants}>
          <Card className="rounded-[2rem] text-sm text-stone-500">Loading history...</Card>
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
                    <p className="mt-2 text-sm text-stone-500">{entry.ingredients.join(", ")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="rounded-2xl bg-red-50 p-3 text-red-600 transition hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {entry.recipes.map((recipe) => (
                    <Card key={`${entry.id}-${recipe.name}`} variant="plain" className="rounded-[1.5rem] p-4 space-y-2">
                      {hasRenderableImage(recipe.image_url) ? (
                        <div className="overflow-hidden rounded-[1rem] bg-stone-100">
                          <Image
                            src={recipe.image_url ?? ""}
                            alt={recipe.name}
                            width={640}
                            height={360}
                            className="h-36 w-full object-cover"
                            unoptimized
                          />
                        </div>
                      ) : null}
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{recipe.cuisine}</p>
                      <h4 className="text-lg font-semibold text-stone-900">{recipe.name}</h4>
                      <p className="text-sm text-stone-500">
                        {recipe.calories} kcal • {recipe.cook_time}
                      </p>
                    </Card>
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

function hasRenderableImage(imageUrl?: string) {
  return Boolean(imageUrl && /^(https?:|data:)/.test(imageUrl));
}

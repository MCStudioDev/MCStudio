"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useApp } from "@/contexts/AppContext";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import type { MealPlanData } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function buildMealPlanPrompt({
  pantry,
  diets,
  conditions,
  recipeLanguage,
  preferredCuisine,
  calorieTarget
}: {
  pantry: string[];
  diets: string[];
  conditions: string[];
  recipeLanguage: string;
  preferredCuisine: string;
  calorieTarget: number;
}) {
  return [
    "Generate a 7-day meal plan as valid JSON.",
    `Pantry items: ${pantry.join(", ") || "none provided"}.`,
    `Dietary preferences: ${diets.join(", ") || "none"}.`,
    `Health conditions: ${conditions.join(", ") || "none"}.`,
    `Preferred cuisine: ${preferredCuisine}.`,
    `Recipe language: ${recipeLanguage}.`,
    `Daily calorie target: ${calorieTarget}.`,
    "Return an object with keys: plan and shoppingList.",
    "plan must be an array of 7 days.",
    "Each day must include breakfast, lunch, and dinner with name, calories, protein, carbs, and fat."
  ].join(" ");
}

export function MealPlanTab() {
  const { t, settings, health, setError } = useApp();
  const { items } = usePantry();
  const [mealPlan, setMealPlan] = useState<MealPlanData | null>(null);
  const [loading, setLoading] = useState(false);

  const generateMealPlan = async () => {
    setLoading(true);
    try {
      const prompt = buildMealPlanPrompt({
        pantry: items.map((item) => item.name),
        diets: health.diets,
        conditions: health.conditions,
        recipeLanguage: settings.recipeLanguage,
        preferredCuisine: settings.preferredCuisine,
        calorieTarget: settings.calorieTarget
      });

      const response = await fetch("/api/mealplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = (await response.json()) as { result?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate meal plan");
      }

      setMealPlan(safeJsonParse<MealPlanData | null>(data.result ?? "null", null));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate meal plan";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("mealPlanTitle")}
        description={t("mealPlanDesc")}
        icon={<CalendarDays className="h-6 w-6" />}
      />

      <motion.div variants={itemVariants} className="flex justify-start">
        <Button size="lg" loading={loading} onClick={generateMealPlan}>
          {loading ? t("craftingMenu") : mealPlan ? t("regeneratePlan") : t("generatePlan")}
        </Button>
      </motion.div>

      {mealPlan ? (
        <motion.div variants={itemVariants} className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="grid gap-4">
            {mealPlan.plan.map((day) => (
              <Card key={day.day} className="rounded-[2rem] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-display font-bold text-stone-900">{day.day}</h3>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {settings.preferredCuisine}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MealCard title={t("breakfast")} meal={day.breakfast} />
                  <MealCard title={t("lunch")} meal={day.lunch} />
                  <MealCard title={t("dinner")} meal={day.dinner} />
                </div>
              </Card>
            ))}
          </div>

          <Card className="rounded-[2rem] space-y-4 h-fit">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{t("shoppingList")}</p>
              <h3 className="mt-2 text-2xl font-display font-bold text-stone-900">{t("shoppingListDesc")}</h3>
            </div>
            <div className="space-y-2">
              {mealPlan.shoppingList.map((item) => (
                <div key={item} className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-stone-700">
                  {item}
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants}>
          <EmptyState title={t("noMealPlan")} description={t("noMealPlanDesc")} />
        </motion.div>
      )}
    </motion.div>
  );
}

function MealCard({
  title,
  meal
}: {
  title: string;
  meal: { name: string; calories: number; protein: string; carbs: string; fat: string };
}) {
  return (
    <Card variant="plain" className="rounded-[1.5rem] p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{title}</p>
      <h4 className="text-lg font-semibold text-stone-900">{meal.name}</h4>
      <p className="text-sm text-stone-500">{meal.calories} kcal</p>
      <p className="text-xs text-stone-500">
        {meal.protein} protein • {meal.carbs} carbs • {meal.fat} fat
      </p>
    </Card>
  );
}

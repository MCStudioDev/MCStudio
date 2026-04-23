"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ResultLegalNotice } from "@/components/legal/LegalNotice";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMealPlan } from "@/hooks/useMealPlan";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { normalizeMealPlanData, normalizeShoppingList } from "@/lib/mealPlan";
import { EmptyState, SectionHero } from "./shared";

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function MealPlanTab() {
  const { t, settings, health, setError } = useApp();
  const { access, getAuthHeaders, refreshAccess } = useAuth();
  const { items } = usePantry();
  const { mealPlan, loading: savedPlanLoading, error: mealPlanError, saveMealPlan } = useMealPlan();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mealPlanError) {
      setError(mealPlanError.message);
    }
  }, [mealPlanError, setError]);

  const generateMealPlan = async () => {
    if (access.tier !== "premium") {
      setError("Weekly meal plans are a premium feature. Free users can continue with manual pantry and offline recipe discovery.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/mealplan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          pantry: items.map((item) => item.name),
          pantryItems: items.map((item) => ({ name: item.name, quantity: item.quantity })),
          recipeLanguage: settings.recipeLanguage,
          preferredCuisine: settings.preferredCuisine,
          calorieTarget: settings.calorieTarget,
          diets: health.diets,
          conditions: health.conditions,
          allergens: health.allergens ?? []
        })
      });
      const data = (await response.json()) as { result?: string; error?: string; fallbackNotice?: string };
      await refreshAccess();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate meal plan");
      }
      if (data.fallbackNotice) {
        setError(data.fallbackNotice);
      }

      const nextMealPlan = normalizeMealPlanData(safeJsonParse<unknown>(data.result ?? "null", null));
      if (!nextMealPlan) {
        throw new Error("Meal plan response was empty");
      }

      await saveMealPlan(nextMealPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate meal plan";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const shoppingList = normalizeShoppingList(mealPlan?.shoppingList);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("mealPlanTitle")}
        description={t("mealPlanDesc")}
        icon={<CalendarDays className="h-6 w-6" />}
      />

      <motion.div variants={itemVariants} className="flex justify-start">
        <div className="space-y-3">
          {access.tier !== "premium" ? (
            <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              Weekly plans are premium because they use API-first planning across pantry, health, cuisine, and shopping-list quantities.
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              Premium weekly plans use API generation first and offline catalog recipes if the API is unavailable.
            </div>
          )}
          <Button size="lg" loading={loading || savedPlanLoading} onClick={generateMealPlan} disabled={access.tier !== "premium"}>
            {access.tier !== "premium" ? "Premium required" : loading ? t("craftingMenu") : mealPlan ? t("regeneratePlan") : t("generatePlan")}
          </Button>
        </div>
      </motion.div>

      {mealPlan ? (
        <motion.div variants={itemVariants} className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="grid gap-4">
            <ResultLegalNotice mode="mealplan" />
            {mealPlan.plan.map((day) => (
              <Card key={day.day} className="rounded-[2rem] space-y-4">
                <div>
                  <h3 className="text-2xl font-display font-bold text-stone-900">{day.day}</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MealPlanRevealCard title={t("breakfast")} meal={day.breakfast} />
                  <MealPlanRevealCard title={t("lunch")} meal={day.lunch} />
                  <MealPlanRevealCard title={t("dinner")} meal={day.dinner} />
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
              {shoppingList.length ? (
                shoppingList.map((item, index) => (
                  <div key={`shopping-${index}-${item}`} className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-stone-700">
                    {item}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-stone-500">
                  No extra shopping items needed.
                </div>
              )}
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

function MealPlanRevealCard({
  title,
  meal
}: {
  title: string;
  meal: { name: string; calories: number; protein: string; carbs: string; fat: string };
}) {
  return (
    <MealRevealCard
      name={meal.name}
      eyebrow={title}
      imageQuery={`${meal.name} food plated`}
      stats={[
        { label: "kcal", value: meal.calories },
        { label: "protein", value: meal.protein },
        { label: "carbs", value: meal.carbs },
        { label: "fat", value: meal.fat }
      ]}
      sections={[
        {
          title: "Macros",
          tone: "steps",
          items: [`${meal.protein} protein`, `${meal.carbs} carbs`, `${meal.fat} fat`]
        }
      ]}
      className="min-h-full"
    />
  );
}

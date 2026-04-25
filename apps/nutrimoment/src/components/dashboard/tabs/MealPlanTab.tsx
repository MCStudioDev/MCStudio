"use client";

import { useEffect, useMemo, useState } from "react";
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
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { normalizeMealPlanData, normalizeShoppingList } from "@/lib/mealPlan";
import { normalizePantryIngredientName } from "@/lib/pantryQuantity";
import type { MealPlanMeal } from "@/lib/types";
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
  const { access, getAuthHeaders, refreshAccess, user } = useAuth();
  const { items } = usePantry();
  const { mealPlan, loading: savedPlanLoading, error: mealPlanError, saveMealPlan, updateMealImage } = useMealPlan();
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
  const pantryKeys = useMemo(
    () => new Set(items.map((item) => normalizePantryIngredientName(item.name)).filter(Boolean)),
    [items]
  );

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("mealPlanTitle")}
        description={t("mealPlanDesc")}
        eyebrow={t("weeklyNutritionRhythm")}
        chips={[t("balancedChip"), t("pantryAwareChip"), t("visualChip")]}
        icon={<CalendarDays className="h-6 w-6" />}
        stats={[
          { label: t("planStatus"), value: mealPlan ? t("activeStatus") : t("notGeneratedStatus") },
          { label: t("shoppingStat"), value: shoppingList.length ? `${shoppingList.length} ${t("items")}` : t("minimalStatus") },
          { label: t("accessStat"), value: access.tier === "premium" ? t("premiumStatus") : t("upgradeStatus") }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("planningLane")}</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              {t("mealPlanAside")}
            </p>
          </div>
        }
      />

      <motion.div variants={itemVariants} className="flex justify-start">
        <div className="space-y-3">
          {access.tier !== "premium" ? (
            <div className="rounded-[1.5rem] border border-amber-200/16 bg-amber-400/10 px-5 py-4 text-sm text-amber-50/88">
              {t("freeMealPlanNotice")
                .replace("{remaining}", String(access.aiCreditsRemaining))
                .replace("{limit}", String(access.aiCreditsLimit))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-emerald-200/16 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-50/88">
              {t("premiumMealPlanNotice")}
            </div>
          )}
          <Button size="lg" loading={loading || savedPlanLoading} onClick={generateMealPlan} disabled={access.tier !== "premium"}>
            {access.tier !== "premium" ? t("premiumRequired") : loading ? t("craftingMenu") : mealPlan ? t("regeneratePlan") : t("generatePlan")}
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
                  <h3 className="text-2xl font-display font-bold text-white">{day.day}</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MealPlanRevealCard
                    title={t("breakfast")}
                    meal={day.breakfast}
                    pantryKeys={pantryKeys}
                    t={t}
                    onImageResolved={
                      user
                        ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                            const persistedImageUrl = await persistRecipeImageForUser({
                              uid: user.uid,
                              imageUrl,
                              query: serializeRecipePhotoQuery(buildMealPlanPhotoQuery(day.breakfast))
                            });
                            await updateMealImage(
                              indexOfDay(mealPlan.plan, day.day),
                              "breakfast",
                              persistedImageUrl || imageUrl,
                              imageSource,
                              { name: imageAttributionName, url: imageAttributionUrl }
                            );
                          }
                        : undefined
                    }
                  />
                  <MealPlanRevealCard
                    title={t("lunch")}
                    meal={day.lunch}
                    pantryKeys={pantryKeys}
                    t={t}
                    onImageResolved={
                      user
                        ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                            const persistedImageUrl = await persistRecipeImageForUser({
                              uid: user.uid,
                              imageUrl,
                              query: serializeRecipePhotoQuery(buildMealPlanPhotoQuery(day.lunch))
                            });
                            await updateMealImage(
                              indexOfDay(mealPlan.plan, day.day),
                              "lunch",
                              persistedImageUrl || imageUrl,
                              imageSource,
                              { name: imageAttributionName, url: imageAttributionUrl }
                            );
                          }
                        : undefined
                    }
                  />
                  <MealPlanRevealCard
                    title={t("dinner")}
                    meal={day.dinner}
                    pantryKeys={pantryKeys}
                    t={t}
                    onImageResolved={
                      user
                        ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                            const persistedImageUrl = await persistRecipeImageForUser({
                              uid: user.uid,
                              imageUrl,
                              query: serializeRecipePhotoQuery(buildMealPlanPhotoQuery(day.dinner))
                            });
                            await updateMealImage(
                              indexOfDay(mealPlan.plan, day.day),
                              "dinner",
                              persistedImageUrl || imageUrl,
                              imageSource,
                              { name: imageAttributionName, url: imageAttributionUrl }
                            );
                          }
                        : undefined
                    }
                  />
                </div>
              </Card>
            ))}
          </div>

          <Card className="rounded-[2rem] space-y-4 h-fit">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("shoppingList")}</p>
              <h3 className="mt-2 text-2xl font-display font-bold text-white">{t("shoppingListDesc")}</h3>
            </div>
            <div className="space-y-2">
              {shoppingList.length ? (
                shoppingList.map((item, index) => (
                  <div key={`shopping-${index}-${item}`} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-emerald-50/82">
                    {item}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-emerald-50/58">
                  {t("noExtraShoppingItems")}
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
  meal,
  pantryKeys,
  t,
  onImageResolved
}: {
  title: string;
  meal: MealPlanMeal;
  pantryKeys: Set<string>;
  t: ReturnType<typeof useApp>["t"];
  onImageResolved?: (payload: {
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
    imageUrl: string;
  }) => void | Promise<void>;
}) {
  const ingredients = meal.ingredients ?? [];
  const haveIngredients = ingredients.filter((ing) => pantryKeys.has(normalizePantryIngredientName(ing)));
  const needIngredients = ingredients.filter((ing) => !pantryKeys.has(normalizePantryIngredientName(ing)));

  const sections = [];
  if (haveIngredients.length) {
    sections.push({ title: t("inYourPantry"), tone: "have" as const, items: haveIngredients });
  }
  if (needIngredients.length) {
    sections.push({ title: t("toShop"), tone: "need" as const, items: needIngredients });
  }
  if (meal.steps?.length) {
    sections.push({ title: t("preparation"), tone: "steps" as const, items: meal.steps });
  }

  return (
    <MealRevealCard
      name={meal.name}
      eyebrow={title}
      summary={buildMealSummary(ingredients, haveIngredients, needIngredients, t)}
      previewLabel={t("pantryNutritionPreview")}
      previewItems={[...haveIngredients, ...needIngredients].slice(0, 5)}
      imageUrl={meal.image_url}
      imageSource={meal.image_source}
      imageAttributionName={meal.image_attribution_name}
      imageAttributionUrl={meal.image_attribution_url}
      imageQuery={buildMealPlanPhotoQuery(meal)}
      onImageResolved={onImageResolved}
      stats={[
        { label: "kcal", value: meal.calories },
        { label: "protein", value: meal.protein },
        { label: "carbs", value: meal.carbs },
        { label: "fat", value: meal.fat }
      ]}
      sections={sections}
      className="min-h-full"
    />
  );
}

function indexOfDay(plan: Array<{ day: string }>, day: string) {
  return plan.findIndex((entry) => entry.day === day);
}

function buildMealSummary(
  allIngredients: string[],
  haveIngredients: string[],
  needIngredients: string[],
  t: ReturnType<typeof useApp>["t"]
) {
  const total = allIngredients.length ? `${allIngredients.length} ${t("plannedIngredients")}` : t("pantryAwareMeal");
  const have = haveIngredients.length ? `${haveIngredients.length} ${t("onHand")}` : null;
  const need = needIngredients.length ? `${needIngredients.length} ${t("toShopSummary")}` : null;
  return [total, have, need].filter(Boolean).join(" / ");
}

function buildMealPlanPhotoQuery(meal: MealPlanMeal) {
  return buildRecipePhotoQueryCandidates({
    imageSearchIndex: meal.image_search_index,
    imageSearchIndices: meal.image_search_indices,
    ingredients: meal.ingredients,
    name: meal.name
  });
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
}

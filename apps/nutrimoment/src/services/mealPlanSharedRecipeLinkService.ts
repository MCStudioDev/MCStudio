import type { MealPlanData, MealPlanMeal } from "@/lib/types";

export interface MealPlanSharedRecipeLink {
  names: string[];
  sourceRecipeId: string;
}

export function attachSharedRecipeLinksToMealPlan(
  mealPlan: MealPlanData,
  links: MealPlanSharedRecipeLink[]
): MealPlanData {
  const linkByName = new Map<string, string>();
  links.forEach((link) => {
    link.names.forEach((name) => {
      const key = normalizeMealRecipeName(name);
      if (key && !linkByName.has(key)) linkByName.set(key, link.sourceRecipeId);
    });
  });

  const attach = (meal: MealPlanMeal): MealPlanMeal => {
    if (meal.source_recipe_id) return meal;
    const sourceRecipeId = getMealRecipeNames(meal)
      .map(normalizeMealRecipeName)
      .map((name) => linkByName.get(name))
      .find((value): value is string => Boolean(value));
    return sourceRecipeId ? { ...meal, source_recipe_id: sourceRecipeId } : meal;
  };

  return {
    ...mealPlan,
    plan: mealPlan.plan.map((day) => ({
      ...day,
      breakfast: attach(day.breakfast),
      lunch: attach(day.lunch),
      dinner: attach(day.dinner)
    }))
  };
}

function getMealRecipeNames(meal: MealPlanMeal) {
  return [
    meal.name,
    meal.photo_identity?.english_name,
    meal.photo_identity?.dish_slug
  ].filter((value): value is string => Boolean(value?.trim()));
}

function normalizeMealRecipeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

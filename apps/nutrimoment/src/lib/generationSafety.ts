import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { GenerationRestrictions } from "@/lib/profileSafety";

type RecipeInput = Parameters<typeof findRecipeDietViolation>[0];

export function filterSafeRecipeResponse(payload: Record<string, unknown>, context: GenerationRestrictions | null): Record<string, unknown> {
  const original = Array.isArray(payload.recipes) ? payload.recipes as RecipeInput[] : [];
  const recipes = context ? original.filter(recipe =>
    !findRecipeDietViolation(recipe, context) && !findRecipeHealthViolation(recipe, context.conditions)
  ) : [];
  if (!Array.isArray(payload.recipes) && !original.length) return payload;
  const removed = original.length - recipes.length;
  return {
    ...payload,
    recipes,
    result: JSON.stringify(recipes),
    returnedCount: recipes.length,
    ...(removed ? {
      generationStatus: recipes.length ? "PARTIAL_RESULTS" : "NO_RESULTS",
      message: "Some recipes could not be verified against your saved restrictions and were withheld.",
      backfilledCount: recipes.filter(recipe => (recipe as Record<string, unknown>).freshness_origin === "backfilled_recent").length,
      freshCount: recipes.filter(recipe => (recipe as Record<string, unknown>).freshness_origin !== "backfilled_recent").length
    } : {})
  };
}

export function assertSafeMealPlan(plan: { plan: Array<{ breakfast: RecipeInput; lunch: RecipeInput; dinner: RecipeInput }> }, context: GenerationRestrictions) {
  for (const day of plan.plan) {
    for (const meal of [day.breakfast, day.lunch, day.dinner]) {
      if (findRecipeDietViolation(meal, context) || findRecipeHealthViolation(meal, context.conditions)) {
        throw new Error("The final meal plan contains a meal that could not be verified against your saved restrictions.");
      }
    }
  }
}

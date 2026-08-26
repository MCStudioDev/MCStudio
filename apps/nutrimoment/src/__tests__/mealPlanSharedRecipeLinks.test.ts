import { describe, expect, it } from "vitest";
import type { MealPlanData } from "@/lib/types";
import { attachSharedRecipeLinksToMealPlan } from "@/services/mealPlanSharedRecipeLinkService";

function mealPlan(): MealPlanData {
  return {
    plan: [{
      day: "Monday",
      breakfast: meal("Ful Medames"),
      lunch: meal("Kofta Kebab"),
      dinner: { ...meal("Koshary"), source_recipe_id: "existing-v2-id" }
    }],
    shoppingList: []
  };
}

function meal(name: string) {
  return {
    name,
    calories: 400,
    protein: "20g",
    carbs: "40g",
    fat: "12g"
  };
}

describe("meal-plan V2 recipe links", () => {
  it("attaches exact normalized V2 recipe IDs to newly generated meals", () => {
    const linked = attachSharedRecipeLinksToMealPlan(mealPlan(), [
      { names: ["Kofta kebab"], sourceRecipeId: "kofta-v2" },
      { names: ["Ful Médames", "Ful Medames"], sourceRecipeId: "ful-v2" }
    ]);

    expect(linked.plan[0].breakfast.source_recipe_id).toBe("ful-v2");
    expect(linked.plan[0].lunch.source_recipe_id).toBe("kofta-v2");
    expect(linked.plan[0].dinner.source_recipe_id).toBe("existing-v2-id");
  });

  it("does not guess a V2 recipe ID from a partial title", () => {
    const linked = attachSharedRecipeLinksToMealPlan(mealPlan(), [
      { names: ["Stuffed Kofta"], sourceRecipeId: "stuffed-kofta-v2" }
    ]);

    expect(linked.plan[0].lunch.source_recipe_id).toBeUndefined();
  });
});

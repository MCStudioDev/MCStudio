import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { buildMealPlanData } from "@/services/mealPlanService";

describe("meal plan pantry ranking", () => {
  it("prefers recipes that use more pantry ingredients within each meal slot", () => {
    const recipes = [
      recipe("breakfast-away", "breakfast", ["oats", "berries"]),
      recipe("breakfast-pantry", "breakfast", ["rice", "tomato", "garlic"]),
      recipe("lunch-away", "lunch", ["quinoa", "cucumber"]),
      recipe("lunch-pantry", "lunch", ["rice", "chickpeas", "tomato"]),
      recipe("dinner-away", "dinner", ["pasta", "cheese"]),
      recipe("dinner-pantry", "dinner", ["chickpeas", "tomato", "garlic"])
    ];

    const plan = buildMealPlanData(recipes, [
      { name: "rice", quantity: "4 cup" },
      { name: "chickpeas", quantity: "4 cup" },
      { name: "tomato", quantity: "8 whole" },
      { name: "garlic", quantity: "10 clove" }
    ]);

    expect(plan.plan[0].breakfast.source_recipe_id).toBe("breakfast-pantry");
    expect(plan.plan[0].lunch.source_recipe_id).toBe("lunch-pantry");
    expect(plan.plan[0].dinner.source_recipe_id).toBe("dinner-pantry");
  });
});

function recipe(id: string, mealType: RecipeCatalogDoc["mealType"], ingredients: string[]): RecipeCatalogDoc {
  return {
    id,
    title: id,
    slug: id,
    description: id,
    ingredients: ingredients.map((canonical) => ({ canonical, name: canonical, required: true, quantity: 1, unit: "cup" })),
    ingredientCanonicals: ingredients,
    requiredCanonicals: ingredients,
    optionalCanonicals: [],
    dietTags: ["vegan"],
    allergenTags: [],
    mealType,
    cuisine: "Mediterranean",
    prepMinutes: 10,
    cookMinutes: 20,
    totalMinutes: 30,
    difficulty: "easy",
    calories: 450,
    protein: 18,
    carbs: 62,
    fat: 14,
    calorieBand: "medium",
    servings: 1,
    steps: ["Cook for 20 minutes."],
    image: { storagePath: "" },
    searchTokens: [id, ...ingredients],
    popularityScore: 50,
    qualityScore: 80,
    isActive: true,
    createdAt: 1,
    updatedAt: 1
  };
}

import { describe, expect, it } from "vitest";
import { buildRecipeDiscoveryPlan } from "../services/recipePipeline/recipeDiscoveryPlan";

describe("RecipeDiscoveryPlan", () => {
  it("creates dish intent, cuisine, and technique context before recipe search", () => {
    const plan = buildRecipeDiscoveryPlan({
      normalizedIngredients: ["chicken", "bell pepper", "bread", "onion", "yogurt"],
      preferredCuisine: "Egyptian"
    });

    expect(plan.dishIntents).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuisine: "egyptian", dishFamily: "chicken molokhia with rice" })
    ]));
    expect(plan.predictedCuisines[0]).toEqual(expect.objectContaining({ cuisine: "egyptian" }));
    expect(plan.predictedTechniques).toContain("braise");
  });
});

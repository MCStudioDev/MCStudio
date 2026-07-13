import { describe, expect, it } from "vitest";
import { ensureDetailedRecipeSteps } from "../lib/recipeStepDetails";
import type { Recipe } from "../lib/types";

describe("recipe step details", () => {
  it("uses long simmer timing for beef stew instead of generic skillet timing", () => {
    const recipe = ensureDetailedRecipeSteps(recipeFixture({
      name: "Classic Beef Stew",
      ingredients: ["steak", "onion"],
      missing_ingredients: ["broth", "carrot"],
      steps: []
    }));

    const steps = recipe.steps.join(" ");
    expect(steps).toMatch(/60 to 90 minutes|long simmer/i);
    expect(steps).not.toMatch(/Add steak first and cook for 4 to 6 minutes/i);
  });

  it("keeps shrimp stew timing short and adds seafood near the end", () => {
    const recipe = ensureDetailedRecipeSteps(recipeFixture({
      name: "Shrimp Tomato Stew",
      ingredients: ["shrimp", "tomato"],
      missing_ingredients: ["garlic"],
      steps: []
    }));

    const steps = recipe.steps.join(" ");
    expect(steps).toMatch(/final 4 to 7 minutes/i);
    expect(steps).toMatch(/seafood should go in near the end/i);
  });
});

function recipeFixture(overrides: Partial<Recipe>): Recipe {
  return {
    name: "Simple Recipe",
    cuisine: "Global",
    ingredients: [],
    missing_ingredients: [],
    steps: [],
    calories: 400,
    protein: "30g",
    carbs: "30g",
    fat: "12g",
    cook_time: "25 mins",
    difficulty: "Easy",
    ...overrides
  };
}

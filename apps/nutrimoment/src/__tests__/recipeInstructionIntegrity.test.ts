import { describe, expect, it } from "vitest";
import { ensureRecipeInstructionIntegrity } from "../lib/recipeInstructionIntegrity";
import type { Recipe } from "../lib/types";

describe("recipe instruction integrity", () => {
  it("adds title ingredients to missing ingredients and steps when AI omits them", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Ginger Spinach Chicken Skillet",
      ingredients: ["chicken", "olive oil"],
      missing_ingredients: ["onion"],
      steps: ["Cook the chicken until done."]
    }));

    expect(recipe.missing_ingredients).toEqual(expect.arrayContaining(["ginger", "spinach"]));
    expect(recipe.steps.join(" ")).toMatch(/\bginger\b/i);
    expect(recipe.steps.join(" ")).toMatch(/\bspinach\b/i);
  });

  it("does not duplicate named ingredients that are already listed and used", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Ginger Spinach Chicken Skillet",
      ingredients: ["chicken", "ginger", "spinach"],
      missing_ingredients: [],
      steps: ["Cook the chicken with ginger, then fold in spinach."]
    }));

    expect(recipe.ingredients.filter((ingredient) => ingredient === "ginger")).toHaveLength(1);
    expect(recipe.ingredients.filter((ingredient) => ingredient === "spinach")).toHaveLength(1);
    expect(recipe.missing_ingredients).not.toContain("ginger");
    expect(recipe.missing_ingredients).not.toContain("spinach");
  });

  it("repairs Arabic title ingredients with Arabic missing ingredients and steps", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "دجاج بالزنجبيل والسبانخ",
      ingredients: ["دجاج"],
      missing_ingredients: [],
      steps: ["اطه الدجاج حتى ينضج."]
    }));

    expect(recipe.missing_ingredients).toEqual(expect.arrayContaining(["زنجبيل", "سبانخ"]));
    expect(recipe.steps.join(" ")).toMatch(/زنجبيل/u);
    expect(recipe.steps.join(" ")).toMatch(/سبانخ/u);
  });

  it("adds breading ingredients and breading steps when a title promises breaded chicken", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Breaded Chicken Cutlets",
      ingredients: ["chicken", "olive oil"],
      missing_ingredients: [],
      steps: ["Cook the chicken in a skillet until done."]
    }));

    expect(recipe.missing_ingredients).toContain("breadcrumbs");
    expect(recipe.steps.join(" ")).toMatch(/\bcoat\b|\bbreading\b|\bbreadcrumbs\b/i);
  });

  it("does not duplicate breading support when panko and coating steps already exist", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Panko-Crusted Chicken",
      ingredients: ["chicken", "panko", "olive oil"],
      missing_ingredients: [],
      steps: ["Coat the chicken in panko and bake until crisp."]
    }));

    expect(recipe.missing_ingredients).not.toContain("breadcrumbs");
    expect(recipe.steps.filter((step) => /panko|breadcrumb|coat/i.test(step))).toHaveLength(1);
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

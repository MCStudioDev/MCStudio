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

  it("repairs tandoori dish promises for non-chicken ingredients", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Tandoori Shrimp",
      ingredients: ["shrimp"],
      missing_ingredients: [],
      steps: ["Cook the shrimp in a skillet until pink."]
    }));

    expect(recipe.missing_ingredients).toEqual(expect.arrayContaining([
      "yogurt",
      "ginger",
      "garlic",
      "lemon",
      "tandoori spices"
    ]));
    expect(recipe.steps.join(" ")).toMatch(/\byogurt\b/i);
    expect(recipe.steps.join(" ")).toMatch(/\btandoori spices\b/i);
    expect(recipe.steps.join(" ")).toMatch(/\bmain ingredient\b/i);
    expect(recipe.steps.join(" ")).not.toMatch(/\bmarinate the chicken\b/i);
  });

  it("adds mincing and shaping detail when kofta is made from intact steak", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Grilled Steak Kofta",
      ingredients: ["steak", "onion"],
      missing_ingredients: ["parsley"],
      steps: ["Bake the steak mixture in a pan for 8 minutes."]
    }));

    const steps = recipe.steps.join(" ");
    expect(recipe.missing_ingredients).toContain("coarsely ground meat");
    expect(steps).toMatch(/\bmince\b|\bcoarsely\b|\bfood processor\b/i);
    expect(steps).toMatch(/\bgrill\b|\bbroiler\b|\bgrill pan\b/i);
    expect(steps).toMatch(/do not use baking in a pan as the primary cooking method/i);
  });

  it("repairs short generic timing for slow meat stew families", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Beef Tomato Stew",
      ingredients: ["beef", "tomato"],
      missing_ingredients: [],
      steps: [
        "Heat oil for 1 minute.",
        "Add beef and cook for 4 to 6 minutes.",
        "Add tomato and serve."
      ]
    }));

    const steps = recipe.steps.join(" ");
    expect(recipe.missing_ingredients).toContain("broth or tomato cooking liquid");
    expect(steps).toMatch(/60 to 120 minutes/i);
    expect(steps).toMatch(/fork-tender/i);
  });

  it("repairs missing creamy sauce logic for creamy vegetable plates", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Creamy Mushroom Zucchini",
      ingredients: ["mushrooms", "zucchini"],
      missing_ingredients: [],
      steps: ["Saute the vegetables for 5 minutes."]
    }));

    expect(recipe.missing_ingredients).toContain("milk or yogurt for creamy sauce");
    expect(recipe.steps.join(" ")).toMatch(/creamy|dairy|glossy/i);
  });

  it("repairs stuffed vegetable plates with filling and hollowing steps", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Stuffed Bell Peppers",
      ingredients: ["bell pepper", "rice"],
      missing_ingredients: [],
      steps: ["Cook everything together for 10 minutes."]
    }));

    expect(recipe.steps.join(" ")).toMatch(/hollow|filling|stuff/i);
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

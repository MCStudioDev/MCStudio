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

  it("replaces generic filler steps with a real shawarma workflow", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "Chicken Shawarma",
      ingredients: ["chicken"],
      missing_ingredients: ["cucumber"],
      steps: [
        "Prep for Chicken Shawarma: measure 1 serving of chicken and 1 serving of cucumber; keep salt and pepper nearby so each addition is ready before cooking.",
        "Warm the main pan over medium heat for 2 minutes, then add 1 tsp oil.",
        "Add chicken first and cook for 4 to 6 minutes.",
        "Add cucumber with 2 tbsp water, then cook for 3 to 5 minutes."
      ]
    }));

    const steps = recipe.steps.join(" ");
    expect(recipe.missing_ingredients).toEqual(expect.arrayContaining([
      "yogurt",
      "vinegar",
      "lemon",
      "garlic",
      "shawarma spices",
      "flatbread"
    ]));
    expect(steps).toMatch(/\bmarinade\b|\bmarinate\b|\byogurt\b/i);
    expect(steps).toMatch(/\bvery high heat\b/i);
    expect(steps).toMatch(/\bwrap\b|\bpita\b/i);
    expect(steps).not.toMatch(/\bmeasure 1 serving\b/i);
    expect(steps).not.toMatch(/\b2 tbsp water\b/i);
  });

  it("repairs Arabic shawarma with marinade, hot pan, vegetables, and bread assembly", () => {
    const recipe = ensureRecipeInstructionIntegrity(recipeFixture({
      name: "\u062f\u062c\u0627\u062c \u0637\u0628\u0642 \u0634\u0627\u0648\u0631\u0645\u0627",
      ingredients: ["\u0641\u0631\u0627\u062e"],
      missing_ingredients: ["\u062e\u064a\u0627\u0631"],
      steps: [
        "\u062d\u0636\u0631 \u062f\u062c\u0627\u062c \u0637\u0628\u0642 \u0634\u0627\u0648\u0631\u0645\u0627: \u062c\u0647\u0632 \u0641\u0631\u0627\u062e \u0648\u062e\u064a\u0627\u0631 \u0648\u0636\u0639 \u062e\u064a\u0627\u0631 \u0628\u062c\u0627\u0646\u0628\u0643 \u0642\u0628\u0644 \u0628\u062f\u0621 \u0627\u0644\u0637\u0628\u062e.",
        "\u0633\u062e\u0646 \u0627\u0644\u0645\u0642\u0644\u0627\u0629 \u0639\u0644\u0649 \u0646\u0627\u0631 \u0645\u062a\u0648\u0633\u0637\u0629.",
        "\u0623\u0636\u0641 \u0641\u0631\u0627\u062e \u0648\u0627\u0637\u0647\u0647 4 \u0625\u0644\u0649 6 \u062f\u0642\u0627\u0626\u0642.",
        "\u0623\u0636\u0641 \u062e\u064a\u0627\u0631 \u0645\u0639 \u0645\u0644\u0639\u0642\u062a\u064a\u0646 \u0643\u0628\u064a\u0631\u062a\u064a\u0646 \u0645\u0646 \u0627\u0644\u0645\u0627\u0621."
      ]
    }));

    const steps = recipe.steps.join(" ");
    expect(recipe.missing_ingredients).toEqual(expect.arrayContaining([
      "\u0632\u0628\u0627\u062f\u064a",
      "\u062e\u0644",
      "\u0628\u0647\u0627\u0631\u0627\u062a \u0634\u0627\u0648\u0631\u0645\u0627",
      "\u062e\u0628\u0632 \u0634\u0627\u0648\u0631\u0645\u0627 \u0623\u0648 \u062e\u0628\u0632 \u0633\u0648\u0631\u064a"
    ]));
    expect(steps).toMatch(/\u0627\u0644\u062a\u062a\u0628\u064a\u0644\u0629|\u062a\u062a\u0628\u064a\u0644/u);
    expect(steps).toMatch(/\u0646\u0627\u0631 \u0639\u0627\u0644\u064a\u0629/u);
    expect(steps).toMatch(/\u062e\u0628\u0632|\u062b\u0648\u0645\u064a\u0629|\u0637\u062d\u064a\u0646\u0629/u);
    expect(steps).not.toMatch(/\u0645\u0644\u0639\u0642\u062a\u064a\u0646 \u0643\u0628\u064a\u0631\u062a\u064a\u0646 \u0645\u0646 \u0627\u0644\u0645\u0627\u0621/u);
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

import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import {
  calculateRecipeSimilarity,
  enforceRecipeDiversity
} from "../services/recipeDiversityValidator";

const baseRecipe: Recipe = {
  name: "Chicken Parmesan",
  cuisine: "Italian",
  dish_intent: {
    dish_name: "Chicken Parmesan",
    cuisine: "Italian",
    cooking_method: "baked",
    visual_keywords: ["chicken", "tomato", "cheese"],
    exclude_keywords: []
  },
  ingredients: ["2 pieces chicken breast", "1 cup tomato sauce", "1 cup mozzarella"],
  missing_ingredients: [],
  steps: [
    "Bake the chicken with tomato sauce.",
    "Top the chicken with mozzarella and bake until bubbling."
  ],
  calories: 540,
  protein: "44g",
  carbs: "28g",
  fat: "24g",
  cook_time: "35 minutes",
  difficulty: "Easy"
};

function recipe(overrides: Partial<Recipe>): Recipe {
  return { ...baseRecipe, ...overrides };
}

describe("recipe diversity validator", () => {
  it("rejects recipes above the similarity threshold", () => {
    const duplicate = recipe({
      name: "Baked Chicken Parmesan",
      steps: [
        "Bake the chicken with tomato sauce.",
        "Top the chicken with mozzarella and bake until bubbling."
      ]
    });
    const shawarma = recipe({
      name: "Chicken Shawarma Plate",
      cuisine: "Middle Eastern",
      dish_intent: {
        dish_name: "Chicken Shawarma Plate",
        cuisine: "Middle Eastern",
        cooking_method: "grilled",
        visual_keywords: ["chicken", "shawarma"],
        exclude_keywords: []
      },
      ingredients: ["2 pieces chicken thighs", "1 cup yogurt", "1 tbsp shawarma spice"],
      steps: [
        "Marinate the chicken with yogurt and shawarma spice.",
        "Grill the chicken and serve it with vegetables."
      ]
    });

    expect(calculateRecipeSimilarity(baseRecipe, duplicate).total).toBeGreaterThan(0.75);
    expect(enforceRecipeDiversity([baseRecipe, duplicate, shawarma], { limit: 3 })).toEqual([
      baseRecipe,
      shawarma
    ]);
  });

  it("prefers cuisine and cooking-method variety when alternatives exist", () => {
    const skillet = recipe({
      name: "Chicken Tomato Skillet",
      dish_intent: {
        dish_name: "Chicken Tomato Skillet",
        cuisine: "Italian",
        cooking_method: "sauteed",
        visual_keywords: ["chicken", "tomato"],
        exclude_keywords: []
      }
    });
    const teriyaki = recipe({
      name: "Chicken Teriyaki Bowl",
      cuisine: "Japanese",
      dish_intent: {
        dish_name: "Chicken Teriyaki Bowl",
        cuisine: "Japanese",
        cooking_method: "sauteed",
        visual_keywords: ["chicken", "teriyaki"],
        exclude_keywords: []
      },
      ingredients: ["2 pieces chicken thigh", "1 cup rice", "2 tbsp teriyaki sauce"],
      steps: ["Cook the rice.", "Saute the chicken with teriyaki sauce."]
    });

    const selected = enforceRecipeDiversity([baseRecipe, skillet, teriyaki], { limit: 2 });

    expect(selected.map((item) => item.name)).toEqual(["Chicken Parmesan", "Chicken Teriyaki Bowl"]);
  });

  it("caps repeated baked, creamy, and tomato-based cards when filling large sets", () => {
    const candidates = [
      recipe({ name: "Baked Tomato Chicken", cuisine: "Italian" }),
      recipe({ name: "Baked Creamy Chicken", cuisine: "American", ingredients: ["2 pieces chicken", "1 cup cream"] }),
      recipe({ name: "Roasted Tomato Chicken", cuisine: "Greek" }),
      recipe({ name: "Chicken Shawarma", cuisine: "Middle Eastern", dish_intent: { ...baseRecipe.dish_intent!, cooking_method: "grilled" } }),
      recipe({ name: "Chicken Teriyaki", cuisine: "Japanese", dish_intent: { ...baseRecipe.dish_intent!, cooking_method: "sauteed" } }),
      recipe({ name: "Butter Chicken", cuisine: "Indian", dish_intent: { ...baseRecipe.dish_intent!, cooking_method: "stewed" } })
    ];

    const selected = enforceRecipeDiversity(candidates, {
      limit: 5,
      targets: {
        maxBaked: 2,
        maxCreamy: 2,
        maxTomatoBased: 2,
        minimumCookingMethods: 4,
        minimumCuisines: 3
      }
    });

    expect(selected.filter((item) => /baked|roasted/i.test(item.name)).length).toBeLessThanOrEqual(2);
    expect(new Set(selected.map((item) => item.cuisine)).size).toBeGreaterThanOrEqual(3);
  });
});

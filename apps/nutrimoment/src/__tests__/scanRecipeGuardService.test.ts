import { describe, expect, it } from "vitest";
import { repairScanRecipesWithGuard } from "../services/scanRecipeGuardService";
import type { Recipe } from "../lib/types";

describe("scan recipe guard service", () => {
  it("reorders and rejects recipes without inventing cards to reach the requested count", () => {
    const sourceRecipes = [
      recipe("Chicken Tandoori", "Indian", [
        "Score the chicken pieces so the marinade reaches the meat.",
        "Mix yogurt, lemon juice, ginger-garlic paste, oil, and tandoori spices.",
        "Coat the chicken and marinate in the refrigerator for 2 hours.",
        "Roast on a rack at 200 C until charred at the edges and cooked through."
      ]),
      recipe("Chicken Cacciatore", "Italian", [
        "Cut the chicken into serving pieces and season it with pepper.",
        "Brown the chicken in olive oil, then remove it from the pan.",
        "Cook onion and tomato until saucy, return the chicken, and simmer until tender."
      ])
    ];

    const repaired = repairScanRecipesWithGuard(sourceRecipes, {
      allergens: [],
      calorieTarget: 2000,
      conditions: [],
      diets: [],
      inputIngredients: ["chicken"],
      preferredCuisine: "Any",
      recipeCount: 10,
      recipeLanguage: "English",
      scoringIngredients: ["chicken"]
    });

    expect(repaired).toHaveLength(2);
    expect(repaired.map((item) => item.name)).toEqual(["Chicken Tandoori", "Chicken Cacciatore"]);
    expect(repaired.flatMap((item) => item.steps).join(" ")).not.toMatch(/Prep the scanned ingredients|Cook the main ingredient with garlic/i);
  });

  it("keeps a source recipe's real method unchanged while applying ownership checks", () => {
    const repaired = repairScanRecipesWithGuard([
      recipe("Chicken Shawarma", "Middle Eastern", [
        "Slice the chicken breast into thin strips.",
        "Marinate the strips with yogurt, lemon, garlic, and shawarma spices for 2 hours.",
        "Sear the chicken in a very hot pan until browned and cooked through.",
        "Fill warm flatbread with the chicken, pickles, and garlic sauce."
      ])
    ], {
      allergens: [],
      calorieTarget: 2000,
      conditions: [],
      diets: [],
      inputIngredients: ["chicken", "bread"],
      preferredCuisine: "Middle Eastern",
      recipeCount: 10,
      recipeLanguage: "English",
      scoringIngredients: ["chicken", "bread"]
    });

    expect(repaired).toHaveLength(1);
    expect(repaired[0].steps).toContain("Slice the chicken breast into thin strips.");
    expect(repaired[0].steps).toContain("Marinate the strips with yogurt, lemon, garlic, and shawarma spices for 2 hours.");
  });
});

function recipe(name: string, cuisine: string, steps: string[]): Recipe {
  return {
    name,
    cuisine,
    recipe_source_type: "local_database",
    ingredients: ["chicken"],
    missing_ingredients: ["yogurt", "lemon", "garlic"],
    steps,
    calories: 520,
    protein: "42g",
    carbs: "38g",
    fat: "18g",
    cook_time: "45 mins",
    difficulty: "Medium"
  };
}

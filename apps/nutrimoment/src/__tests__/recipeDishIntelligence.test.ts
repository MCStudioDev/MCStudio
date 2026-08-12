import { describe, expect, it } from "vitest";
import { enrichRecipeWithDishIntent } from "../lib/recipeDishIntelligence";

describe("recipe dish intelligence", () => {
  it("does not relabel a sourced recipe from overlapping pantry ingredients", () => {
    const recipe = enrichRecipeWithDishIntent(
      {
        name: "Irish Stew",
        cuisine: "Global",
        recipe_source_type: "local_database",
        ingredients: ["beef", "onion", "tomato", "bread"],
        missing_ingredients: ["potato"],
        steps: ["Brown the beef.", "Simmer with the vegetables until tender."],
        calories: 520,
        protein: "34g",
        carbs: "42g",
        fat: "22g",
        cook_time: "90 mins",
        difficulty: "Medium"
      },
      {
        availableIngredients: ["ground beef", "chicken breast", "baladi bread", "onion", "tomato"],
        preferredCuisine: "Egyptian"
      }
    );

    expect(recipe.name).toBe("Irish Stew");
    expect(recipe.cuisine).toBe("Global");
    expect(recipe.dish_intent?.dish_name).toBe("Irish Stew");
    expect(recipe.dish_intent?.cuisine).toBe("Global");
  });
});

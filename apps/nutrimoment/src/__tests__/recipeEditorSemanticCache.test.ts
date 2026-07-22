import { describe, expect, it, vi } from "vitest";
import { buildRecipeEditorCacheKey, getOrCreateRecipeEditorCache } from "../services/recipeEditorSemanticCache";
import type { Recipe } from "../lib/types";

const sourceRecipe = {
  id: "chicken-cacciatore",
  title: "Chicken Cacciatore",
  cuisine: "Italian",
  ingredients: ["chicken", "tomatoes"],
  steps: ["Brown chicken.", "Simmer chicken with tomatoes."],
  matchedIngredients: ["chicken"]
};

describe("recipe editor semantic cache key", () => {
  it("is stable for equivalent normalized requests", () => {
    const left = buildRecipeEditorCacheKey({
      sourceRecipe,
      recipeLanguage: "Arabic",
      preferredCuisine: "Italian",
      availableIngredients: [{ name: "Chicken", quantity: "500g" }],
      diets: ["highProtein", "lowFat"],
      conditions: ["diabetes", "cholesterol"],
      allergens: [],
      excludedIngredients: ["Onion"]
    });
    const right = buildRecipeEditorCacheKey({
      sourceRecipe,
      recipeLanguage: " arabic ",
      preferredCuisine: "italian",
      availableIngredients: [{ name: " chicken ", quantity: "500g" }],
      diets: ["lowfat", "highprotein"],
      conditions: ["cholesterol", "diabetes"],
      allergens: [],
      excludedIngredients: [" onion "]
    });

    expect(left).toBe(right);
  });

  it("changes when an edit-relevant restriction changes", () => {
    const base = {
      sourceRecipe,
      recipeLanguage: "English",
      preferredCuisine: "Italian",
      availableIngredients: [{ name: "chicken" }],
      diets: [],
      conditions: [],
      allergens: [],
      excludedIngredients: []
    };

    expect(buildRecipeEditorCacheKey(base)).not.toBe(buildRecipeEditorCacheKey({
      ...base,
      excludedIngredients: ["onion"]
    }));
  });

  it("reuses the completed edit without invoking Gemini's generator again", async () => {
    const input = {
      sourceRecipe: { ...sourceRecipe, id: "semantic-cache-memory-test" },
      recipeLanguage: "English",
      preferredCuisine: "Italian",
      availableIngredients: [{ name: "chicken" }],
      diets: ["highProtein"],
      conditions: [],
      allergens: [],
      excludedIngredients: []
    };
    const recipe: Recipe = {
      name: "Chicken Cacciatore",
      cuisine: "Italian",
      ingredients: ["chicken", "tomatoes"],
      missing_ingredients: [],
      steps: ["Brown chicken.", "Simmer chicken with tomatoes."],
      calories: 520,
      protein: "40g",
      carbs: "28g",
      fat: "20g",
      cook_time: "30 minutes",
      difficulty: "Easy"
    };
    const generate = vi.fn(async () => recipe);

    const first = await getOrCreateRecipeEditorCache(input, generate);
    const second = await getOrCreateRecipeEditorCache(input, generate);

    expect(first.origin).toBe("generated");
    expect(second.origin).toBe("memory");
    expect(second.recipe).toEqual(recipe);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildRecipeEditorCacheKey,
  getOrCreateRecipeEditorCache,
  getRecipeEditorCache,
  setRecipeEditorCache
} from "../services/recipeEditorSemanticCache";
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

  it("reuses a complete edit across pantry ownership changes", () => {
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

    expect(buildRecipeEditorCacheKey(base)).toBe(buildRecipeEditorCacheKey({
      ...base,
      availableIngredients: [{ name: "tomatoes" }, { name: "chicken", quantity: "500 g" }]
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

  it("supports explicit batch cache reads and writes", async () => {
    const input = {
      sourceRecipe: { ...sourceRecipe, id: "semantic-cache-batch-test" },
      recipeLanguage: "English",
      preferredCuisine: "Any",
      availableIngredients: [],
      diets: [],
      conditions: [],
      allergens: [],
      excludedIngredients: []
    };
    const recipe: Recipe = {
      name: "Chicken Cacciatore",
      cuisine: "Italian",
      ingredients: ["500 g chicken", "2 cups tomatoes"],
      missing_ingredients: [],
      steps: ["Brown the chicken.", "Simmer with tomatoes."],
      calories: 520,
      protein: "40g",
      carbs: "28g",
      fat: "20g",
      cook_time: "30 minutes",
      difficulty: "Easy"
    };

    expect(await getRecipeEditorCache(input)).toBeNull();
    await setRecipeEditorCache(input, recipe);
    expect((await getRecipeEditorCache(input))?.recipe).toEqual(recipe);
  });
});

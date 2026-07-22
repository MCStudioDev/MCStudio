import { describe, expect, it, vi } from "vitest";
import { RecipeGenerationStatus } from "../lib/RecipeGenerationStatus";
import { getCuisineCatalogV2RecipeDocs } from "../data/offline/cuisineCatalogV2Recipes";

vi.mock("../services/userRecipeCacheService", () => ({
  getWarmSharedRecipeCacheSnapshot: () => [],
  listSharedCachedRecipes: () => Promise.resolve([]),
  listSharedCachedRecipesForIngredients: () => Promise.resolve([]),
  listUserCachedRecipes: () => Promise.resolve([]),
  primeFullSharedRecipeCache: () => undefined
}));

describe("recipe search service", () => {
  it("includes cuisine catalog V2 dishes in the deterministic recipe pool", () => {
    const recipes = getCuisineCatalogV2RecipeDocs();

    expect(recipes.some((recipe) =>
      recipe.title.toLowerCase() === "hawawshi" &&
      recipe.requiredCanonicals.includes("ground meat")
    )).toBe(true);
  });

  it("finds diverse dataset recipes for Arabic ground meat input", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    const result = await searchCatalogRecipes({
      ingredients: ["\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645"],
      preferredCuisine: "Any",
      calorieTarget: 1650,
      maxResults: 10,
      recipeLanguage: "Arabic",
      uid: "test-user"
    });

    expect(result.generationStatus).toBe(RecipeGenerationStatus.SUCCESS_DATASET);
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result.recipes.some((recipe) => recipe.matched_required_count > 0)).toBe(true);
    expect(new Set(result.recipes.map((recipe) => recipe.cuisine)).size).toBeGreaterThan(1);
  });
});

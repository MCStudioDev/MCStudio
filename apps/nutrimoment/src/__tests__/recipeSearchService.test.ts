import { describe, expect, it, vi } from "vitest";
import { RecipeGenerationStatus } from "../lib/RecipeGenerationStatus";
import { getCuisineCatalogV2RecipeDocs } from "../data/offline/cuisineCatalogV2Recipes";
import { RecipeAcceptanceEngine } from "../services/recipeAcceptanceEngine";
import { RecipeQualityGate } from "../services/recipeQualityGate";

vi.mock("../services/userRecipeCacheService", () => ({
  getWarmSharedRecipeCacheSnapshot: () => [],
  listSharedCachedRecipes: () => Promise.resolve([]),
  listSharedCachedRecipesForIngredients: () => Promise.resolve([]),
  listUserCachedRecipes: () => Promise.resolve([]),
  primeFullSharedRecipeCache: () => undefined
}));

vi.mock("../data/offline/firestoreRecipeReferenceCatalog", () => ({
  listFirestoreReferenceCatalogRecipes: () => Promise.resolve([])
}));

vi.mock("../data/offline/realSourceRecipeArtifacts", () => ({
  getRealSourceArtifactRecipes: () => []
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

  it("returns accepted Arabic recipes for colloquial chicken input", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");
    const qualityGate = new RecipeQualityGate();
    const acceptanceEngine = new RecipeAcceptanceEngine();

    const result = await searchCatalogRecipes({
      ingredients: ["\u0641\u0631\u0627\u062e"],
      preferredCuisine: "Any",
      calorieTarget: 1650,
      maxResults: 10,
      recipeLanguage: "Arabic",
      uid: "test-user"
    });

    const acceptedRecipes = result.recipes.filter((recipe) => {
      const quality = qualityGate.validate(recipe, "Arabic");
      return acceptanceEngine.evaluate(recipe, {
        imageReady: Boolean(recipe.image_url),
        qualityGate: quality,
        recipeLanguage: "Arabic"
      }).accepted;
    });

    expect(result.generationStatus).toBe(RecipeGenerationStatus.SUCCESS_DATASET);
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(acceptedRecipes.length).toBe(result.recipes.length);
  });

  it("treats lowercase any cuisine as a broad dataset search", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    const result = await searchCatalogRecipes({
      ingredients: ["\u0641\u0631\u0627\u062e"],
      preferredCuisine: "any",
      calorieTarget: 1650,
      maxResults: 10,
      recipeLanguage: "Arabic",
      uid: "test-user"
    });

    expect(result.generationStatus).toBe(RecipeGenerationStatus.SUCCESS_DATASET);
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result.recipes.some((recipe) => recipe.matched_required_count > 0)).toBe(true);
  });

  it("returns accepted Arabic dataset recipes for common pantry inputs with local coverage", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");
    const qualityGate = new RecipeQualityGate();
    const acceptanceEngine = new RecipeAcceptanceEngine();

    for (const ingredient of [
      "\u0644\u062d\u0645\u0647 \u0645\u0641\u0631\u0648\u0645\u0647",
      "\u0641\u0631\u0627\u062e",
      "\u0644\u062d\u0645\u0647 \u0627\u0648 \u0633\u062a\u064a\u0643",
      "\u0628\u062a\u0646\u062c\u0627\u0646",
      "\u0637\u0645\u0627\u0637\u0645",
      "\u0643\u0648\u0633\u0629",
      "\u0645\u0643\u0631\u0648\u0646\u0629",
      "\u0639\u064a\u0634",
      "\u0639\u062f\u0633"
    ]) {
      const result = await searchCatalogRecipes({
        ingredients: [ingredient],
        preferredCuisine: "Any",
        calorieTarget: 1650,
        maxResults: 10,
        recipeLanguage: "Arabic",
        uid: "test-user"
      });
      const acceptedRecipes = result.recipes.filter((recipe) => {
        const quality = qualityGate.validate(recipe, "Arabic");
        return acceptanceEngine.evaluate(recipe, {
          imageReady: Boolean(recipe.image_url),
          qualityGate: quality,
          recipeLanguage: "Arabic"
        }).accepted;
      });

      expect(result.recipes.length, ingredient).toBeGreaterThan(0);
      expect(acceptedRecipes.length, ingredient).toBeGreaterThan(0);
    }
  });

  it("never returns an empty dataset result for highest-frequency ingredients", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    for (const ingredient of ["chicken", "beef", "rice", "egg", "tomato", "potato", "onion"]) {
      const result = await searchCatalogRecipes({
        ingredients: [ingredient],
        preferredCuisine: "Any",
        calorieTarget: 1650,
        maxResults: 5,
        recipeLanguage: "English",
        uid: "test-user"
      });

      expect(result.generationStatus, ingredient).toBe(RecipeGenerationStatus.SUCCESS_DATASET);
      expect(result.recipes.length, ingredient).toBeGreaterThan(0);
      expect(result.recipes.some((recipe) => recipe.matched_required_count > 0), ingredient).toBe(true);
    }
  });

  it("does not fill an egg-and-vegetable search with unrequested animal proteins", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    const result = await searchCatalogRecipes({
      ingredients: ["bell pepper", "yellow bell pepper", "tomato", "cucumber", "lemon", "egg", "banana", "water", "juice"],
      preferredCuisine: "Any",
      calorieTarget: 2000,
      maxResults: 10,
      recipeLanguage: "English",
      uid: "test-user"
    });
    const returnedText = result.recipes
      .flatMap((recipe) => [recipe.name, recipe.dish_identity ?? "", ...recipe.ingredients])
      .join(" ")
      .toLowerCase();

    expect(returnedText).not.toMatch(/\b(chicken|beef|lamb|pork|fish|grouper|salmon|tuna|shrimp|prawn)\b/);
  });
});

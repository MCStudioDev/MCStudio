import { describe, expect, it, vi } from "vitest";
import { RecipeGenerationStatus } from "../lib/RecipeGenerationStatus";
import { getCuisineCatalogV2RecipeDocs } from "../data/offline/cuisineCatalogV2Recipes";
import { RecipeAcceptanceEngine } from "../services/recipeAcceptanceEngine";
import { RecipeQualityGate } from "../services/recipeQualityGate";

vi.mock("../services/userRecipeCacheService", () => ({
  getWarmSharedRecipeCacheSnapshot: () => [],
  listSharedCachedRecipes: () => Promise.resolve([]),
  listSharedCachedRecipesForIngredients: () => Promise.resolve([{
    id: "shared-vegan-rice-bowl",
    title: "Chickpea Rice Bowl",
    slug: "chickpea-rice-bowl",
    description: "A complete plant-based rice bowl.",
    ingredients: [
      { name: "rice", canonical: "rice", quantity: 1, unit: "cup", required: true },
      { name: "chickpeas", canonical: "chickpeas", quantity: 1, unit: "cup", required: true },
      { name: "tomato", canonical: "tomato", quantity: 1, unit: "cup", required: false }
    ],
    ingredientCanonicals: ["rice", "chickpeas", "tomato"],
    requiredCanonicals: ["rice", "chickpeas"],
    optionalCanonicals: ["tomato"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    allergenTags: [],
    mealType: "dinner",
    cuisine: "Mediterranean",
    prepMinutes: 10,
    cookMinutes: 25,
    totalMinutes: 35,
    difficulty: "easy",
    calories: 480,
    protein: 16,
    carbs: 78,
    fat: 10,
    calorieBand: "301_500",
    servings: 2,
    steps: [
      "Rinse the rice under cool water until the water runs clear, then drain it thoroughly and place it in a medium saucepan with two cups of water.",
      "Bring the saucepan to a boil over high heat, reduce to low heat, cover, and simmer the rice for 18 minutes until the grains are tender.",
      "Dice the tomato while the rice cooks, then drain and rinse the chickpeas so every component is ready before assembly.",
      "Heat the chickpeas and diced tomato in a skillet over medium heat for 5 minutes, stirring and seasoning until the tomato softens.",
      "Fluff the cooked rice with a fork, divide it between two bowls, and spoon the warm chickpea and tomato mixture over the top."
    ],
    image: { storagePath: "recipes/shared-vegan-rice-bowl.jpg" },
    source: { provider: "NutriMoment shared pool", url: "https://example.com/chickpea-rice-bowl" },
    searchTokens: ["rice", "chickpeas", "vegan rice bowl"],
    popularityScore: 80,
    qualityScore: 92,
    qualityStatus: "verified",
    isActive: true,
    createdAt: 1,
    updatedAt: 1
  }]),
  listUserCachedRecipes: () => Promise.resolve([]),
  primeFullSharedRecipeCache: () => undefined
}));

vi.mock("../data/offline/firestoreRecipeReferenceCatalog", () => ({
  listFirestoreReferenceCatalogRecipes: () => Promise.resolve([])
}));

describe("recipe search service", () => {
  it("includes cuisine catalog V2 dishes in the deterministic recipe pool", () => {
    const recipes = getCuisineCatalogV2RecipeDocs();

    expect(recipes.some((recipe) =>
      recipe.title.toLowerCase() === "hawawshi" &&
      recipe.requiredCanonicals.includes("ground meat")
    )).toBe(true);
  });

  it("does not expose cuisine dish intents as production recipe candidates", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    const result = await searchCatalogRecipes({
      ingredients: ["chicken"],
      preferredCuisine: "Any",
      maxResults: 10,
      recipeLanguage: "English",
      uid: "test-user"
    });

    expect(result.candidateRecipes.some((recipe) => recipe.id.startsWith("catalog-v2-"))).toBe(false);
    expect(result.candidateRecipes.every((recipe) =>
      recipe.qualityStatus === "golden" || recipe.qualityStatus === "verified"
    )).toBe(true);
  });

  it("finds verified source recipes for Arabic ground meat input", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    const result = await searchCatalogRecipes({
      ingredients: ["\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645"],
      preferredCuisine: "Any",
      calorieTarget: 1650,
      maxResults: 10,
      recipeLanguage: "English",
      uid: "test-user"
    });

    expect(result.generationStatus).toBe(RecipeGenerationStatus.SUCCESS_DATASET);
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result.recipes.some((recipe) => recipe.matched_required_count > 0)).toBe(true);
    expect(result.candidateRecipes.every((recipe) =>
      recipe.qualityStatus === "golden" || recipe.qualityStatus === "verified"
    )).toBe(true);
  });

  it("returns accepted source recipes for colloquial Arabic chicken input", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");
    const qualityGate = new RecipeQualityGate();
    const acceptanceEngine = new RecipeAcceptanceEngine();

    const result = await searchCatalogRecipes({
      ingredients: ["\u0641\u0631\u0627\u062e"],
      preferredCuisine: "Any",
      calorieTarget: 1650,
      maxResults: 10,
      recipeLanguage: "English",
      uid: "test-user"
    });

    const acceptedRecipes = result.recipes.filter((recipe) => {
      const quality = qualityGate.validate(recipe, "English");
      return acceptanceEngine.evaluate(recipe, {
        imageReady: Boolean(recipe.image_url),
        qualityGate: quality,
        recipeLanguage: "English"
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
      recipeLanguage: "English",
      uid: "test-user"
    });

    expect(result.generationStatus).toBe(RecipeGenerationStatus.SUCCESS_DATASET);
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result.recipes.some((recipe) => recipe.matched_required_count > 0)).toBe(true);
  });

  it("never restores quarantined dish intents to fill unsupported pantry searches", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    for (const ingredient of [
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
        recipeLanguage: "English",
        uid: "test-user"
      });

      expect(result.candidateRecipes.some((recipe) => recipe.id.startsWith("catalog-v2-")), ingredient).toBe(false);
      expect(result.candidateRecipes.every((recipe) =>
        recipe.qualityStatus === "golden" || recipe.qualityStatus === "verified"
      ), ingredient).toBe(true);
    }
  });

  it("returns trusted coverage and falls back to compatible shared-pool recipes", async () => {
    const { searchCatalogRecipes } = await import("../services/recipeSearchService");

    for (const ingredient of ["chicken", "beef"]) {
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

    const sharedPoolFallback = await searchCatalogRecipes({
      ingredients: ["rice"],
      preferredCuisine: "Any",
      maxMissingIngredients: 3,
      maxResults: 5,
      recipeLanguage: "English",
      uid: "test-user",
      forceSharedCacheRead: true
    });
    const fallbackText = sharedPoolFallback.recipes
      .flatMap((recipe) => [recipe.name, recipe.dish_identity ?? "", ...recipe.ingredients])
      .join(" ")
      .toLowerCase();

    expect(sharedPoolFallback.recipes.length).toBeGreaterThan(0);
    expect(sharedPoolFallback.recipes.some((recipe) => recipe.missing_ingredients.length > 0)).toBe(true);
    expect(fallbackText).not.toMatch(/\b(chicken|beef|lamb|pork|fish|salmon|tuna|shrimp|prawn)\b/);
    expect(sharedPoolFallback.candidateRecipes.every((recipe) =>
      recipe.qualityStatus === "golden" || recipe.qualityStatus === "verified"
    )).toBe(true);
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

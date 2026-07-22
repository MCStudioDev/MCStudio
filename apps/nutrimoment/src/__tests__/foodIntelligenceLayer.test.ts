import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import { CuisineClassifier } from "../food/CuisineClassifier";
import { getCuisineProfile } from "../food/CuisineProfiles";
import { IngredientGraph } from "../food/IngredientGraph";
import { IngredientNormalizer } from "../food/IngredientNormalizer";
import { RecipeScorer } from "../food/RecipeScorer";

const baseRecipe: RecipeCatalogDoc = {
  id: "base",
  title: "Base Recipe",
  slug: "base-recipe",
  description: "",
  ingredients: [],
  ingredientCanonicals: [],
  requiredCanonicals: [],
  optionalCanonicals: [],
  dietTags: [],
  allergenTags: [],
  mealType: "dinner",
  cuisine: "Global",
  prepMinutes: 10,
  cookMinutes: 20,
  totalMinutes: 30,
  difficulty: "easy",
  calories: 400,
  protein: 25,
  carbs: 30,
  fat: 15,
  calorieBand: "301_500",
  servings: 2,
  steps: ["Cook and serve."],
  image: { storagePath: "" },
  searchTokens: [],
  popularityScore: 50,
  qualityScore: 50
};

describe("food intelligence layer", () => {
  it("normalizes and expands ingredient inputs", () => {
    const normalizer = new IngredientNormalizer();

    expect(normalizer.normalize([" Ground-Beef!! "])).toEqual([
      { raw: " Ground-Beef!! ", normalized: "ground beef" }
    ]);
    expect(normalizer.expand(["ground beef"])).toContain("ground meat");
  });

  it("routes ingredients through cuisine candidates", () => {
    const graph = new IngredientGraph();
    const cuisines = graph.possibleCuisines(["ground beef"]);

    expect(cuisines).toEqual(expect.arrayContaining(["egyptian", "turkish", "mexican", "italian"]));
    expect(graph.cuisineRoutes(["chicken"], "egyptian")[0]?.dishFamilies.length).toBeGreaterThan(0);
  });

  it("predicts cuisine confidence and gates low-confidence inference", () => {
    const classifier = new CuisineClassifier(80);
    const confident = classifier.predict({
      title: "Chicken Cacciatore",
      ingredients: ["chicken", "tomato sauce", "basil", "oregano"],
      directions: ["Braise the chicken in sauce."]
    });
    const generic = classifier.predict({
      title: "Quick Chicken",
      ingredients: ["chicken", "salt"],
      directions: ["Cook until done."]
    });

    expect(confident.cuisine).toBe("Italian");
    expect(classifier.shouldUseGenerativeInference(confident)).toBe(false);
    expect(classifier.shouldUseGenerativeInference(generic)).toBe(true);
  });

  it("scores recipes using ingredient and cuisine signals", () => {
    const recipes: RecipeCatalogDoc[] = [
      {
        ...baseRecipe,
        id: "hawawshi",
        title: "Egyptian Hawawshi",
        slug: "egyptian-hawawshi",
        cuisine: "Egyptian",
        ingredientCanonicals: ["ground beef", "bread", "onion"],
        requiredCanonicals: ["ground beef"],
        optionalCanonicals: ["bread", "onion"],
        searchTokens: ["hawawshi", "ground beef"]
      },
      {
        ...baseRecipe,
        id: "salad",
        title: "Cucumber Salad",
        slug: "cucumber-salad",
        cuisine: "Global",
        ingredientCanonicals: ["cucumber"],
        requiredCanonicals: ["cucumber"],
        optionalCanonicals: [],
        searchTokens: ["cucumber"]
      }
    ];

    const ranked = new RecipeScorer().score({
      recipes,
      ingredients: ["ground beef"],
      preferredCuisine: "Egyptian"
    });

    expect(ranked[0]?.recipeId).toBe("hawawshi");
  });

  it("exposes cuisine profiles through the production profile module", () => {
    expect(getCuisineProfile("Masri")?.id).toBe("egyptian");
  });
});

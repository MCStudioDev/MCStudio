import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import { CuisineClassifier } from "../food/CuisineClassifier";
import { getCuisineProfile } from "../food/CuisineProfiles";
import { enrichRecipeDatasetRecord } from "../food/DatasetEnrichment";
import { FOOD_DICTIONARY, getCuisinePlaceholderPalette } from "../food/FoodDictionary";
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
      expect.objectContaining({
        raw: " Ground-Beef!! ",
        id: "ground_beef",
        normalized: "ground_beef",
        canonicalEnglishName: "ground beef"
      })
    ]);
    expect(normalizer.expand(["\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645"])).toEqual(expect.arrayContaining([
      "ground beef",
      "ground chuck",
      "ground round",
      "hamburger",
      "ground meat"
    ]));
    const weightedAliases = new Map(normalizer.expandAliases(["ground beef"]).map((alias) => [alias.term, alias.weight]));
    expect(weightedAliases.get("ground beef")).toBe(100);
    expect(weightedAliases.get("ground meat")).toBe(96);
    expect(weightedAliases.get("ground chuck")).toBe(94);
    expect(weightedAliases.get("ground round")).toBe(92);
  });

  it("uses the shared food dictionary for high-frequency aliases", () => {
    const groundBeef = FOOD_DICTIONARY.ingredients.find((ingredient) => ingredient.id === "ground_beef");

    expect(groundBeef?.aliases).toEqual(expect.arrayContaining(["ground chuck", "ground round"]));
    expect(getCuisinePlaceholderPalette("Egyptian")).toEqual([168, 42, 205]);
  });

  it("normalizes common Arabic pantry words through the shared dictionary", () => {
    const normalizer = new IngredientNormalizer();
    const cases: Array<[string, string]> = [
      ["\u0644\u062d\u0645\u0647 \u0645\u0641\u0631\u0648\u0645\u0647", "ground_beef"],
      ["\u0643\u0628\u062f\u0647", "liver"],
      ["\u0641\u0631\u0627\u062e", "chicken"],
      ["\u0633\u062a\u064a\u0643", "beef"],
      ["\u0633\u0645\u0643", "fish"],
      ["\u062c\u0645\u0628\u0631\u064a", "shrimp"],
      ["\u062c\u0628\u0646", "cheese"],
      ["\u0644\u0628\u0646", "milk"],
      ["\u0632\u0628\u0627\u062f\u064a", "yogurt"],
      ["\u0633\u0628\u0627\u0646\u062e", "spinach"],
      ["\u0628\u062a\u0646\u062c\u0627\u0646", "eggplant"],
      ["\u0637\u0645\u0627\u0637\u0645", "tomato"],
      ["\u062c\u0632\u0631", "carrot"],
      ["\u0628\u0633\u0644\u0647", "peas"],
      ["\u062e\u0633", "lettuce"],
      ["\u0645\u0643\u0631\u0648\u0646\u0629", "pasta"],
      ["\u0639\u064a\u0634", "bread"],
      ["\u0639\u062f\u0633", "lentils"],
      ["\u0645\u0648\u0632", "banana"],
      ["\u062a\u0641\u0627\u062d", "apple"],
      ["\u0628\u0631\u062a\u0642\u0627\u0644", "orange"]
    ];

    for (const [input, expectedId] of cases) {
      expect(normalizer.normalizeOne(input)?.id, input).toBe(expectedId);
    }
  });

  it("routes ingredients through cuisine candidates", () => {
    const graph = new IngredientGraph();
    const cuisines = graph.possibleCuisines(["ground beef"]);
    const plan = graph.smartExpansionPlan(["ground beef"]);

    expect(cuisines).toEqual(expect.arrayContaining(["egyptian", "turkish", "mexican", "italian"]));
    expect(plan.dishFamilies.length).toBeGreaterThan(0);
    expect(plan.cuisines).toEqual(expect.arrayContaining(["egyptian", "turkish"]));
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

  it("enriches dataset records with cuisine, technique, and ingredient metadata", () => {
    const enriched = enrichRecipeDatasetRecord({
      ...baseRecipe,
      title: "Chicken Parmesan",
      cuisine: "Italian",
      ingredients: [
        { canonical: "chicken", name: "Chicken Breast", quantity: 2, unit: "breasts", optional: false },
        { canonical: "tomato sauce", name: "Tomato Sauce", quantity: 1, unit: "cup", optional: false }
      ],
      steps: ["Bread the chicken.", "Bake the chicken with tomato sauce until bubbling."]
    });

    expect(enriched.predictedCuisine).toBe("Italian");
    expect(enriched.techniques).toEqual(expect.arrayContaining(["Bake", "Bread"]));
    expect(enriched.ingredientIds).toContain("chicken");
    expect(enriched.dishFamily).toBe("Chicken Parmesan");
  });

  it("matches recipe ingredients through weighted aliases instead of exact strings", () => {
    const recipes: RecipeCatalogDoc[] = [
      {
        ...baseRecipe,
        id: "chuck",
        title: "Ground Chuck Chili",
        slug: "ground-chuck-chili",
        cuisine: "American",
        ingredientCanonicals: ["ground chuck", "tomato", "onion"],
        requiredCanonicals: ["ground chuck"],
        optionalCanonicals: ["tomato", "onion"],
        searchTokens: ["ground chuck"]
      },
      {
        ...baseRecipe,
        id: "plain",
        title: "Plain Cucumber",
        slug: "plain-cucumber",
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
      preferredCuisine: "Any"
    });

    expect(ranked[0]?.recipeId).toBe("chuck");
    expect(ranked[0]?.matchedRequiredCount).toBe(1);
  });

  it("exposes cuisine profiles through the production profile module", () => {
    expect(getCuisineProfile("Masri")?.id).toBe("egyptian");
  });
});

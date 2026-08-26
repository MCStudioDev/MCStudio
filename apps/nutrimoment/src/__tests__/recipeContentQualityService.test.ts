import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import {
  RECIPE_CONTENT_VERSION,
  classifyRecipeContentQuality,
  selectDiscoverableRecipeCatalog
} from "../services/recipeContentQualityService";
import {
  isDiscoverableRecipeReferenceDoc,
  mapReferenceDocToCatalogDoc
} from "../data/offline/firestoreRecipeReferenceCatalog";
import type { RecipeReferenceDoc } from "../lib/recipeReferenceTypes";

function recipe(overrides: Partial<RecipeCatalogDoc> = {}): RecipeCatalogDoc {
  return {
    id: "reference-chicken-shawarma",
    title: "Chicken Shawarma",
    slug: "chicken-shawarma",
    description: "Chicken shawarma prepared from a source recipe.",
    ingredients: [
      { name: "500 g chicken breast, cut into thin strips", canonical: "chicken", quantity: 500, unit: "g", required: true },
      { name: "1/2 cup yogurt", canonical: "yogurt", quantity: 0.5, unit: "cup", required: true },
      { name: "1 onion, thinly sliced", canonical: "onion", quantity: 1, unit: "piece", required: false },
      { name: "1 bell pepper, thinly sliced", canonical: "bell pepper", quantity: 1, unit: "piece", required: false },
      { name: "2 garlic cloves, minced", canonical: "garlic", quantity: 2, unit: "cloves", required: false }
    ],
    ingredientCanonicals: ["chicken", "yogurt", "onion", "bell pepper", "garlic"],
    requiredCanonicals: ["chicken", "yogurt"],
    optionalCanonicals: ["onion", "bell pepper", "garlic"],
    dietTags: ["high-protein"],
    allergenTags: ["dairy"],
    mealType: "dinner",
    cuisine: "Middle Eastern",
    prepMinutes: 20,
    cookMinutes: 15,
    totalMinutes: 35,
    difficulty: "medium",
    calories: 520,
    protein: 42,
    carbs: 38,
    fat: 18,
    calorieBand: "501_700",
    servings: 4,
    steps: [
      "Slice the chicken breast across the grain into thin, even strips about 1 cm wide.",
      "Whisk the yogurt with the minced garlic, lemon juice, paprika, cumin, and black pepper, then coat the chicken and refrigerate for at least 30 minutes.",
      "Heat a wide skillet over medium-high heat until hot, add the marinated chicken in one layer, and sear for 6 to 8 minutes until browned and the center reaches 74 C.",
      "Add the sliced onion and bell pepper and cook for 2 to 3 minutes so they soften while retaining a little bite.",
      "Rest the chicken for 3 minutes, then fill warm flatbread with the chicken and vegetables and serve immediately."
    ],
    image: { storagePath: "", sourceQuery: "chicken shawarma finished plate" },
    source: {
      provider: "trusted-cookbook",
      url: "https://example.com/chicken-shawarma"
    },
    searchTokens: ["chicken", "shawarma"],
    popularityScore: 80,
    qualityScore: 90,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe("recipe content quality policy", () => {
  it("promotes a detailed source-backed recipe to verified", () => {
    const result = classifyRecipeContentQuality(recipe());

    expect(result.status).toBe("verified");
    expect(result.eligibleForDiscovery).toBe(true);
    expect(result.contentVersion).toBe(RECIPE_CONTENT_VERSION);
    expect(result.reasons).toEqual([]);
  });

  it("promotes the curated trusted collection to golden", () => {
    const result = classifyRecipeContentQuality(recipe({ id: "trusted-source-middle-eastern-chicken-shawarma" }));

    expect(result.status).toBe("golden");
    expect(result.eligibleForDiscovery).toBe(true);
  });

  it("blocks source-backed non-food formulas", () => {
    const result = classifyRecipeContentQuality(recipe({ title: "Play Doh" }));

    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("non_food_recipe");
  });

  it("keeps cuisine catalog dish definitions out of recipe discovery", () => {
    const result = classifyRecipeContentQuality(recipe({
      id: "catalog-v2-middleEastern-chicken-shawarma",
      source: { provider: "cuisine-catalog-v2" },
      steps: [
        "Prepare the main ingredients for Chicken Shawarma: chicken, yogurt.",
        "Add supporting flavors such as onion and garlic, adjusting to taste.",
        "Cook until the ingredients are tender and the flavors match the traditional Chicken Shawarma profile.",
        "Serve warm with a balanced portion size."
      ]
    }));

    expect(result.status).toBe("dish_intent");
    expect(result.eligibleForDiscovery).toBe(false);
    expect(result.reasons).toContain("dish_intent_not_complete_recipe");
  });

  it("quarantines source-backed recipes with naive generic instructions", () => {
    const result = classifyRecipeContentQuality(recipe({
      steps: ["Combine all ingredients.", "Cook until done.", "Serve warm."]
    }));

    expect(result.status).toBe("probation");
    expect(result.eligibleForDiscovery).toBe(false);
    expect(result.reasons).toContain("generic_instruction_language");
    expect(result.reasons).toContain("insufficient_instruction_detail");
  });

  it("quarantines a recipe whose named cooking method contradicts its steps", () => {
    const result = classifyRecipeContentQuality(recipe({
      title: "Grilled Chicken",
      steps: [
        "Slice the chicken into even pieces and season it with garlic, paprika, salt, and pepper.",
        "Preheat the oven to 190 C and arrange the chicken in a covered baking dish.",
        "Bake the chicken for 25 minutes until it reaches 74 C in the center.",
        "Rest the baked chicken for 5 minutes before serving it with the vegetables."
      ]
    }));

    expect(result.status).toBe("probation");
    expect(result.reasons).toContain("title_method_mismatch:grill");
  });

  it("quarantines a recipe when named title ingredients are absent", () => {
    const result = classifyRecipeContentQuality(recipe({
      title: "Ginger Spinach Chicken",
      ingredientCanonicals: ["chicken", "yogurt", "onion", "bell pepper", "garlic"],
      requiredCanonicals: ["chicken", "yogurt"]
    }));

    expect(result.status).toBe("probation");
    expect(result.reasons).toContain("title_ingredient_missing:ginger");
    expect(result.reasons).toContain("title_ingredient_missing:spinach");
  });

  it("quarantines recipes whose ingredient amounts are mostly placeholders", () => {
    const result = classifyRecipeContentQuality(recipe({
      ingredients: recipe().ingredients.map((ingredient) => ({
        ...ingredient,
        quantity: 0,
        unit: ""
      }))
    }));

    expect(result.status).toBe("probation");
    expect(result.reasons).toContain("insufficient_ingredient_quantities");
  });

  it("blocks unsafe cooking instructions", () => {
    const result = classifyRecipeContentQuality(recipe({
      steps: [
        "Slice the chicken into strips.",
        "Mix it with yogurt and garlic.",
        "Serve the chicken raw with warm bread."
      ]
    }));

    expect(result.status).toBe("blocked");
    expect(result.eligibleForDiscovery).toBe(false);
    expect(result.reasons).toContain("unsafe_cooking_instruction");
  });

  it("returns only golden and verified recipes from a mixed legacy pool", () => {
    const verified = recipe();
    const golden = recipe({ id: "trusted-source-middle-eastern-chicken-shawarma" });
    const generic = recipe({
      id: "legacy-generated-chicken",
      source: { provider: "generated-cache" },
      steps: ["Heat a pan.", "Add chicken.", "Cook until done.", "Serve warm."]
    });
    const dishIntent = recipe({
      id: "catalog-v2-middleEastern-shawarma",
      source: { provider: "cuisine-catalog-v2" }
    });

    const selected = selectDiscoverableRecipeCatalog([verified, golden, generic, dishIntent]);

    expect(selected.map((item) => item.id)).toEqual([verified.id, golden.id]);
    expect(selected.every((item) => item.contentVersion === RECIPE_CONTENT_VERSION)).toBe(true);
    expect(selected.map((item) => item.qualityStatus)).toEqual(["verified", "golden"]);
  });

  it("promotes only complete source records from the legacy RecipeNLG pool", () => {
    const reference: RecipeReferenceDoc = {
      id: "recipenlg-shawarma",
      title: "Chicken Shawarma",
      cuisine: "Middle Eastern",
      ingredients: recipe().ingredients.map((ingredient) => ingredient.name),
      ingredientCanonicals: recipe().ingredientCanonicals,
      mainIngredients: recipe().requiredCanonicals,
      directions: recipe().steps,
      publishStatus: "ready",
      searchTokens: ["chicken", "shawarma"],
      source: { provider: "recipenlg", url: "https://example.com/shawarma" },
      qualityScore: 90,
      createdAt: 0,
      updatedAt: 0
    };

    expect(isDiscoverableRecipeReferenceDoc(reference)).toBe(true);
    expect(isDiscoverableRecipeReferenceDoc({
      ...reference,
      id: "recipenlg-generic",
      directions: ["Combine all ingredients.", "Cook until done.", "Serve warm."]
    })).toBe(false);
    expect(isDiscoverableRecipeReferenceDoc({
      ...reference,
      publishStatus: "needs_review"
    })).toBe(false);
    expect(isDiscoverableRecipeReferenceDoc({
      ...reference,
      id: "recipenlg-missing-amounts",
      ingredients: ["chicken breast", "yogurt", "onion", "bell pepper", "garlic"]
    })).toBe(false);
  });

  it("does not turn reference aliases into extra recipe ingredients", () => {
    const reference = {
      id: "recipenlg-pasta-salad",
      title: "Greek-Style Pasta Salad",
      ingredients: [
        "8 oz. penne or other tubular pasta",
        "3 medium tomatoes, diced",
        "1 cucumber, chopped"
      ],
      ingredientCanonicals: [
        "penne or other tubular pasta",
        "pasta",
        "macaroni",
        "spaghetti",
        "tomato",
        "tomatos",
        "cucumber",
        "cucumbers"
      ],
      mainIngredients: ["pasta", "macaroni", "spaghetti", "tomato"],
      directions: [
        "Boil the pasta in a large pot for 10 minutes until tender, then drain it well.",
        "Dice the tomatoes and chop the cucumber into even bite-size pieces.",
        "Mix the pasta, tomatoes, and cucumber in a bowl and serve chilled."
      ],
      cuisine: "Mediterranean",
      mealType: "lunch",
      cookingMethod: "boiled",
      difficulty: "easy",
      techniques: ["boiling"],
      tags: ["salad"],
      commonAllergens: ["wheat"],
      publishStatus: "ready",
      searchTokens: ["pasta", "macaroni", "spaghetti", "tomato"],
      source: { provider: "recipenlg", url: "https://example.com/pasta-salad" },
      qualityScore: 90,
      createdAt: 0,
      updatedAt: 0
    } as RecipeReferenceDoc;

    const mapped = mapReferenceDocToCatalogDoc(reference);

    expect(mapped.ingredientCanonicals).toEqual([
      "penne or other tubular pasta",
      "tomato",
      "cucumber"
    ]);
    expect(mapped.ingredientLookupCanonicals).toEqual(expect.arrayContaining([
      "penne or other tubular pasta",
      "pasta",
      "macaroni",
      "spaghetti",
      "tomato",
      "cucumber"
    ]));
    expect(mapped.requiredCanonicals).toEqual([
      "penne or other tubular pasta",
      "tomato"
    ]);
  });
});

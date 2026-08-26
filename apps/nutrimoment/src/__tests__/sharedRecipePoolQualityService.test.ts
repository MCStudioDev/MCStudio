import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import {
  auditSharedRecipePoolDocument,
  isSharedRecipeDiscoverable,
  isSharedRecipePublishable,
  resolveSharedRecipeQualityMode,
  SHARED_RECIPE_VALIDATOR_HASH
} from "../services/sharedRecipePoolQualityService";
import { RECIPE_CONTENT_VERSION } from "../services/recipeContentQualityService";

function recipe(overrides: Partial<RecipeCatalogDoc> = {}): RecipeCatalogDoc {
  return {
    id: "shared-chicken-shawarma",
    title: "Chicken Shawarma",
    slug: "chicken-shawarma",
    description: "Source-backed chicken shawarma.",
    ingredients: [
      { name: "500 g chicken breast", canonical: "chicken", quantity: 500, unit: "g", required: true },
      { name: "1/2 cup yogurt", canonical: "yogurt", quantity: 0.5, unit: "cup", required: true },
      { name: "1 onion", canonical: "onion", quantity: 1, unit: "piece", required: false }
    ],
    ingredientCanonicals: ["chicken", "yogurt", "onion"],
    requiredCanonicals: ["chicken", "yogurt"],
    optionalCanonicals: ["onion"],
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
      "Slice the chicken across the grain and coat it with yogurt, garlic, cumin, and pepper.",
      "Heat a wide skillet over medium-high heat and sear the chicken for 6 to 8 minutes until it reaches 74 C.",
      "Add the sliced onion for 3 minutes, rest the chicken, then assemble it in warm flatbread."
    ],
    image: { storagePath: "", sourceQuery: "chicken shawarma" },
    source: { provider: "trusted-cookbook", url: "https://example.com/shawarma" },
    searchTokens: ["chicken", "shawarma"],
    popularityScore: 80,
    qualityScore: 90,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe("shared recipe pool quality migration", () => {
  it("stamps a valid document with current validator metadata", () => {
    const result = auditSharedRecipePoolDocument(recipe(), 123456);

    expect(result.action).toBe("update");
    expect(result.document).toMatchObject({
      contentVersion: RECIPE_CONTENT_VERSION,
      qualityStatus: "verified",
      qualityReasons: [],
      validatedAt: 123456,
      validatorHash: SHARED_RECIPE_VALIDATOR_HASH
    });
    expect(result.document.isActive).toBe(true);
  });

  it("derives global diet and allergen tags from recipe facts, not user labels", () => {
    const result = auditSharedRecipePoolDocument(recipe({
      dietTags: ["vegan", "gluten-free"],
      allergenTags: []
    }), 123456);

    expect(result.document.dietTags).toContain("high-protein");
    expect(result.document.dietTags).not.toContain("vegan");
    expect(result.document.allergenTags).toContain("dairy");
  });

  it("does not label processed-meat recipes vegetarian or vegan", () => {
    const result = auditSharedRecipePoolDocument(recipe({
      ingredients: [
        { name: "4 strips bacon", canonical: "bacon", quantity: 4, unit: "strips", required: true },
        { name: "2 cups beans", canonical: "beans", quantity: 2, unit: "cups", required: true }
      ],
      ingredientCanonicals: ["bacon", "beans"],
      requiredCanonicals: ["bacon", "beans"],
      optionalCanonicals: [],
      steps: [
        "Slice the bacon into small pieces and rinse and drain the beans before heating the skillet.",
        "Brown the bacon in a skillet over medium heat for 6 to 8 minutes until crisp, then drain excess fat.",
        "Stir in the beans and simmer over low heat for 10 minutes until hot, then serve immediately."
      ]
    }), 123456);

    expect(result.document.dietTags).not.toContain("vegetarian");
    expect(result.document.dietTags).not.toContain("vegan");
  });

  it("uses title and step evidence when imported ingredient metadata omits meat", () => {
    const result = auditSharedRecipePoolDocument(recipe({
      title: "Sausage and Tomato Pasta",
      ingredients: [
        { name: "2 cups pasta", canonical: "pasta", quantity: 2, unit: "cups", required: true },
        { name: "1 cup tomato", canonical: "tomato", quantity: 1, unit: "cup", required: true }
      ],
      ingredientCanonicals: ["pasta", "tomato"],
      requiredCanonicals: ["pasta", "tomato"],
      optionalCanonicals: [],
      steps: [
        "Slice the sausage and dice the tomato while a large pot of water comes to a boil.",
        "Boil the pasta for 9 minutes until al dente, then drain it and reserve a little cooking water.",
        "Brown the sausage in a skillet over medium heat for 8 minutes, add the tomato, and toss with the pasta until hot."
      ]
    }), 123456);

    expect(result.document.dietTags).not.toContain("vegetarian");
    expect(result.document.dietTags).not.toContain("vegan");
  });

  it("quarantines unsafe content without deleting or deactivating the document", () => {
    const unsafe = recipe({
      steps: [
        "Slice the chicken into strips.",
        "Mix the chicken with yogurt and onion.",
        "Serve the chicken raw in warm flatbread."
      ]
    });

    const result = auditSharedRecipePoolDocument(unsafe, 123456);

    expect(result.action).toBe("update");
    expect(result.document.qualityStatus).toBe("blocked");
    expect(result.document.qualityReasons).toContain("unsafe_cooking_instruction");
    expect(result.document.isActive).toBe(true);
  });

  it("rebuilds stale derived identity metadata while preserving recipe content", () => {
    const english = {
      name: "Samak bil Forn",
      dish_identity: "Samak bil Forn",
      cuisine: "Egyptian",
      ingredients: ["1 lb fish", "1 cup rice", "1 onion"],
      missing_ingredients: ["1 tsp cumin"],
      steps: ["Brown the onion for 10 minutes.", "Bake the fish and rice for 25 minutes."],
      calories: 500,
      protein: "35g",
      carbs: "50g",
      fat: "14g",
      cook_time: "35 minutes",
      difficulty: "Medium",
      dish_intent: {
        dish_name: "Sayadeya",
        cuisine: "Egyptian",
        cooking_method: "baked",
        visual_keywords: ["Sayadeya fish rice"],
        exclude_keywords: []
      },
      image_search_index: "Sayadeya fish rice"
    };
    const source = recipe({
      id: "shared-samak-bil-forn",
      title: "Samak bil Forn",
      cuisine: "Egyptian",
      steps: english.steps,
      localized: { English: english }
    });

    const result = auditSharedRecipePoolDocument(source, 123456);
    const migratedEnglish = result.document.localized?.English;

    expect(migratedEnglish?.ingredients).toEqual(english.ingredients);
    expect(migratedEnglish?.steps).toEqual(english.steps);
    expect(migratedEnglish?.dish_intent?.dish_name).toBe("Samak bil Forn");
    expect(migratedEnglish?.image_search_indices?.join(" ")).not.toMatch(/sayadeya/i);
  });

  it("supports observe, gate, and strict rollout modes", () => {
    const legacy = recipe();
    const blocked = recipe({ qualityStatus: "blocked", qualityReasons: ["unsafe_cooking_instruction"] });
    const verified = auditSharedRecipePoolDocument(recipe(), 123456).document;
    const probation = auditSharedRecipePoolDocument(recipe({
      steps: ["Combine all ingredients.", "Cook until done.", "Serve warm."]
    }), 123456).document;

    expect(isSharedRecipeDiscoverable(legacy, "observe")).toBe(true);
    expect(isSharedRecipeDiscoverable(legacy, "gate")).toBe(true);
    expect(isSharedRecipeDiscoverable(legacy, "strict")).toBe(false);
    expect(isSharedRecipeDiscoverable(blocked, "observe")).toBe(false);
    expect(isSharedRecipeDiscoverable(probation, "gate")).toBe(false);
    expect(isSharedRecipeDiscoverable(verified, "strict")).toBe(true);
  });

  it("uses strict reads by default while preserving explicit rollout overrides", () => {
    expect(resolveSharedRecipeQualityMode(undefined)).toBe("strict");
    expect(resolveSharedRecipeQualityMode("observe")).toBe("observe");
    expect(resolveSharedRecipeQualityMode("gate")).toBe("gate");
  });

  it("quarantines legacy user-history provenance from the global pool", () => {
    const result = auditSharedRecipePoolDocument(recipe({
      source: {
        provider: "shared-backfill",
        url: "https://example.com/shawarma"
      }
    }), 123456);

    expect(result.document.qualityStatus).toBe("probation");
    expect(result.document.qualityReasons).toContain("untrusted_shared_pool_provenance");
    expect(isSharedRecipePublishable(result.document)).toBe(false);
  });

  it("publishes only strictly validated source recipes", () => {
    const verified = auditSharedRecipePoolDocument(recipe(), 123456).document;
    const legacy = recipe();

    expect(isSharedRecipePublishable(verified)).toBe(true);
    expect(isSharedRecipePublishable(legacy)).toBe(false);
  });
});

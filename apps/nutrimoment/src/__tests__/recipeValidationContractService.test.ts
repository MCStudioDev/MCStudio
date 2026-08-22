import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import { auditSharedRecipePoolDocument, isSharedRecipePublishable } from "../services/sharedRecipePoolQualityService";
import { partitionRecipeCatalogByQuality } from "../services/recipeContentQualityService";
import {
  buildSharedRecipeIdentityKey,
  buildSharedRecipeIdFromIdentity,
  createPremiumRecipeValidationReceipt,
  hasCurrentPremiumValidationReceipt,
  shouldReplaceSharedRecipeVersion
} from "../services/recipeValidationContractService";

function recipe(overrides: Partial<RecipeCatalogDoc> = {}): RecipeCatalogDoc {
  return {
    id: "premium-koshary",
    title: "Classic Egyptian Koshary",
    slug: "classic-egyptian-koshary",
    description: "Rice, lentils, pasta, chickpeas, tomato sauce, and crisp onion.",
    ingredients: [
      { name: "1 cup rice", canonical: "rice", quantity: 1, unit: "cup", required: true },
      { name: "1 cup lentils", canonical: "lentils", quantity: 1, unit: "cup", required: true },
      { name: "1 cup tomato sauce", canonical: "tomato sauce", quantity: 1, unit: "cup", required: false }
    ],
    ingredientCanonicals: ["rice", "lentils", "tomato sauce"],
    requiredCanonicals: ["rice", "lentils"],
    optionalCanonicals: ["tomato sauce"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    allergenTags: [],
    mealType: "dinner",
    cuisine: "Egyptian",
    prepMinutes: 20,
    cookMinutes: 35,
    totalMinutes: 55,
    difficulty: "medium",
    calories: 520,
    protein: 19,
    carbs: 92,
    fat: 9,
    calorieBand: "501_700",
    servings: 4,
    steps: [
      "Rinse the rice and lentils, then simmer them in separate pots until tender.",
      "Boil the pasta for 9 minutes and simmer the tomato sauce for 10 minutes.",
      "Layer the rice, lentils, pasta, sauce, and chickpeas, then finish with crisp onion."
    ],
    image: { storagePath: "", sourceQuery: "classic egyptian koshary" },
    source: { provider: "premium-validated" },
    searchTokens: ["koshary", "egyptian", "rice"],
    popularityScore: 65,
    qualityScore: 70,
    isActive: true,
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  };
}

function premiumValidatedRecipe(overrides: Partial<RecipeCatalogDoc> = {}) {
  const source = recipe(overrides);
  const receipt = createPremiumRecipeValidationReceipt(source, {
    acceptanceScore: 88,
    acceptanceReasons: ["quality_score:88"],
    acceptedAt: 123456
  });
  if (!receipt) throw new Error("Expected a Premium validation receipt");
  return { ...source, validationReceipt: receipt };
}

describe("Premium recipe validation contract", () => {
  it("requires the Premium acceptance threshold before creating a receipt", () => {
    expect(createPremiumRecipeValidationReceipt(recipe(), { acceptanceScore: 69 })).toBeNull();
    expect(createPremiumRecipeValidationReceipt(recipe(), { acceptanceScore: 70 })).not.toBeNull();
  });

  it("refuses to certify a shared payload with measurement fragments in its canonicals", () => {
    const malformed = recipe({
      ingredientCanonicals: ["salmon", "1", "2 tsp ground coriander"],
      requiredCanonicals: ["salmon", "1"],
      optionalCanonicals: ["2 tsp ground coriander"]
    });

    expect(createPremiumRecipeValidationReceipt(malformed, { acceptanceScore: 90 })).toBeNull();
  });

  it("binds the Premium receipt to the accepted recipe content", () => {
    const accepted = premiumValidatedRecipe();
    expect(hasCurrentPremiumValidationReceipt(accepted)).toBe(true);
    expect(hasCurrentPremiumValidationReceipt({
      ...accepted,
      steps: [...accepted.steps, "Replace the recipe with different instructions."]
    })).toBe(false);
  });

  it("uses stable dish identity across improved versions of the same recipe", () => {
    const original = recipe();
    const improved = recipe({
      ingredientCanonicals: [...original.ingredientCanonicals, "chickpeas", "onion"],
      optionalCanonicals: [...original.optionalCanonicals, "chickpeas", "onion"],
      steps: [...original.steps, "Serve immediately while the onions remain crisp."]
    });

    expect(buildSharedRecipeIdentityKey(improved)).toBe(buildSharedRecipeIdentityKey(original));
    expect(buildSharedRecipeIdFromIdentity(buildSharedRecipeIdentityKey(improved)))
      .toBe(buildSharedRecipeIdFromIdentity(buildSharedRecipeIdentityKey(original)));
  });

  it("keeps materially different dietary variants separate", () => {
    const veganIdentity = buildSharedRecipeIdentityKey(recipe());
    const standardIdentity = buildSharedRecipeIdentityKey(recipe({ dietTags: [] }));
    expect(veganIdentity).not.toBe(standardIdentity);
  });

  it("uses the accepted Premium title instead of stale generated dish metadata", () => {
    const source = recipe({
      title: "Rice Kofta in Tomato Sauce",
      localized: {
        English: {
          name: "Rice Kofta in Tomato Sauce",
          cuisine: "Egyptian",
          dish_identity: "Ful bel Bayd",
          ingredients: ["1 cup rice", "1 cup tomato sauce"],
          missing_ingredients: [],
          steps: ["Shape the kofta.", "Simmer it in tomato sauce.", "Serve over rice."],
          calories: 480,
          protein: "22g",
          carbs: "60g",
          fat: "15g",
          cook_time: "35 minutes",
          difficulty: "Medium"
        }
      }
    });

    expect(buildSharedRecipeIdentityKey(source)).toContain("rice-kofta-in-tomato-sauce");
    expect(buildSharedRecipeIdentityKey(source)).not.toContain("ful-bel-bayd");
  });

  it("prefers a Premium-validated version over an older unvalidated document", () => {
    const existing = recipe({ qualityScore: 95, updatedAt: 100 });
    const incoming = premiumValidatedRecipe({ qualityScore: 80, updatedAt: 101 });
    expect(shouldReplaceSharedRecipeVersion(existing, incoming)).toBe(true);
  });

  it("does not replace a stronger current Premium version with a weaker one", () => {
    const existing = premiumValidatedRecipe({ updatedAt: 100 });
    const incomingSource = recipe({ updatedAt: 101 });
    const weakerReceipt = createPremiumRecipeValidationReceipt(incomingSource, {
      acceptanceScore: 75,
      acceptedAt: 123457
    });
    if (!weakerReceipt) throw new Error("Expected a Premium validation receipt");
    const incoming = { ...incomingSource, validationReceipt: weakerReceipt };
    expect(shouldReplaceSharedRecipeVersion(existing, incoming)).toBe(false);
  });

  it("replaces an equivalent Premium recipe when the incoming version adds its validated photo", () => {
    const existing = premiumValidatedRecipe({
      image: { storagePath: "", status: "pending" },
      updatedAt: 100
    });
    const incoming = premiumValidatedRecipe({
      image: {
        storagePath: "https://firebasestorage.googleapis.com/v0/b/app/o/recipes%2Fkoshary.jpg?alt=media",
        status: "ready"
      },
      updatedAt: 99
    });

    expect(shouldReplaceSharedRecipeVersion(existing, incoming)).toBe(true);
  });

  it("uses Premium acceptance as the shared publication quality decision", () => {
    const accepted = premiumValidatedRecipe({
      steps: ["Combine the ingredients.", "Cook until done.", "Serve warm."]
    });
    const audited = auditSharedRecipePoolDocument(accepted, 123456).document;

    expect(audited.qualityStatus).toBe("verified");
    expect(audited.qualityReasons).toEqual([]);
    expect(audited.publicationWarnings?.length).toBeGreaterThan(0);
    expect(isSharedRecipePublishable(audited)).toBe(true);
    expect(partitionRecipeCatalogByQuality([audited]).discoverable).toHaveLength(1);
  });

  it("does not trust a Premium receipt after publication content is changed", () => {
    const accepted = premiumValidatedRecipe({
      steps: ["Combine the ingredients.", "Cook until done.", "Serve warm."]
    });
    const audited = auditSharedRecipePoolDocument(accepted, 123456).document;
    const mutated = {
      ...audited,
      steps: ["Replace the validated method."]
    };

    expect(partitionRecipeCatalogByQuality([mutated]).discoverable).toHaveLength(0);
  });

  it("keeps explicit food-safety failures outside the shared pool", () => {
    const unsafe = premiumValidatedRecipe({
      title: "Raw Chicken Wrap",
      ingredientCanonicals: ["chicken", "bread"],
      requiredCanonicals: ["chicken", "bread"],
      optionalCanonicals: [],
      steps: [
        "Slice the raw chicken into strips.",
        "Place the raw chicken in the bread.",
        "Serve the raw chicken immediately."
      ]
    });
    const audited = auditSharedRecipePoolDocument(unsafe, 123456).document;

    expect(audited.qualityStatus).toBe("blocked");
    expect(isSharedRecipePublishable(audited)).toBe(false);
  });
});

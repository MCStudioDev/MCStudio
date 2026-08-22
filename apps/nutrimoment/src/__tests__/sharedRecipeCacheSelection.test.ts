import { describe, expect, it } from "vitest";
import { CURATED_TRUSTED_RECIPE_CATALOG } from "../data/offline/curatedTrustedRecipeCatalog";
import {
  prepareCacheIngredientForNormalization,
  rebuildPremiumSharedRecipeCanonicalPayload,
  selectSharedRecipesForIngredients
} from "../services/userRecipeCacheService";
import { hasCurrentPremiumValidationReceipt } from "../services/recipeValidationContractService";
import { normalizeIngredients } from "../services/ingredientNormalizationService";

describe("shared recipe cache selection", () => {
  it("selects published recipes by canonical ingredient without scanning unrelated entries", () => {
    const matches = selectSharedRecipesForIngredients(
      CURATED_TRUSTED_RECIPE_CATALOG,
      ["rice", "tomato", "chickpeas"]
    );

    expect(matches.some((recipe) => recipe.title === "Classic Egyptian Koshary")).toBe(true);
    expect(matches.every((recipe) =>
      recipe.ingredientCanonicals.some((ingredient) => ["rice", "tomato", "chickpeas"].includes(ingredient))
    )).toBe(true);
  });

  it("returns no candidates for an unrelated ingredient", () => {
    expect(selectSharedRecipesForIngredients(
      CURATED_TRUSTED_RECIPE_CATALOG,
      ["durian"]
    )).toEqual([]);
  });

  it("uses lookup aliases without inflating displayed recipe ingredients", () => {
    const source = CURATED_TRUSTED_RECIPE_CATALOG[0];
    const recipe = {
      ...source,
      ingredientCanonicals: ["penne or other tubular pasta", "tomato"],
      ingredientLookupCanonicals: ["penne or other tubular pasta", "pasta", "macaroni", "tomato"]
    };

    expect(selectSharedRecipesForIngredients([recipe], ["pasta"])).toEqual([recipe]);
    expect(recipe.ingredientCanonicals).toHaveLength(2);
  });

  it("keeps newly published Premium recipes inside a bounded shared-pool retrieval window", () => {
    const source = CURATED_TRUSTED_RECIPE_CATALOG[0];
    const olderRows = Array.from({ length: 121 }, (_, index) => ({
      ...source,
      id: `legacy-${index}`,
      title: `Legacy recipe ${index}`,
      source: { provider: "recipenlg" },
      updatedAt: source.updatedAt + index + 10_000
    }));
    const premiumRecipe = {
      ...source,
      id: "shared-premium-current",
      title: "Current Premium Vegan Recipe",
      source: { provider: "premium-validated" },
      updatedAt: source.updatedAt
    };

    const matches = selectSharedRecipesForIngredients(
      [...olderRows, premiumRecipe],
      source.ingredientLookupCanonicals ?? source.ingredientCanonicals
    );

    expect(matches).toHaveLength(120);
    expect(matches[0]).toEqual(premiumRecipe);
    expect(matches).toContainEqual(premiumRecipe);
  });

  it("canonicalizes one ingredient per Premium display line", async () => {
    const normalized = await normalizeIngredients([
      "1 lb large shrimp, peeled and deveined",
      "1 pint cherry tomato, halved",
      "1/4 cup chopped fresh parsley",
      "Salt and black pepper to taste"
    ].map(prepareCacheIngredientForNormalization));

    expect(normalized.normalized).toEqual([
      "shrimp",
      "tomato",
      "parsley",
      "salt",
      "black pepper"
    ]);
    expect(normalized.normalized).not.toContain("peeled");
    expect(normalized.normalized).not.toContain("halved");
    expect(normalized.normalized).not.toContain("1");
  });

  it("preserves numeric fractions while removing quantities from shared-pool canonicals", async () => {
    const prepared = [
      "1/2 tsp ground coriander",
      "1/4 tsp turmeric",
      "1 1/2 cups vegetable broth",
      "2 tbsp water",
      "1 tbsp chopped fresh dill"
    ].map(prepareCacheIngredientForNormalization);
    const normalized = await normalizeIngredients(prepared);

    expect(prepared).toEqual([
      "ground coriander",
      "turmeric",
      "vegetable broth",
      "water",
      "dill"
    ]);
    expect(normalized.normalized).toEqual([
      "ground coriander",
      "turmeric",
      "vegetable broth",
      "water",
      "dill"
    ]);
    expect(normalized.normalized).not.toContain("1");
    expect(normalized.normalized.every((ingredient) => !/^\d|\b(?:cup|cups|tsp|tbsp)\b/i.test(ingredient))).toBe(true);
  });

  it("removes non-food section labels and canonical-only preparation qualifiers", async () => {
    const normalized = await normalizeIngredients([
      "pinch of saffron threads",
      "fresh cilantro",
      "frozen okra",
      "water for cooking",
      "for the sauce"
    ].map(prepareCacheIngredientForNormalization));

    expect(normalized.normalized).toEqual(["saffron threads", "cilantro", "okra", "water"]);
  });

  it("rebuilds an old Premium shared payload and binds a current receipt to the repair", async () => {
    const source = CURATED_TRUSTED_RECIPE_CATALOG[0];
    const repaired = await rebuildPremiumSharedRecipeCanonicalPayload({
      ...source,
      ingredientCanonicals: ["salmon", "1", "2 tsp ground coriander", "4 tsp turmeric"],
      requiredCanonicals: ["salmon", "1", "2 tsp ground coriander"],
      optionalCanonicals: ["4 tsp turmeric"],
      ingredientLookupCanonicals: ["salmon", "1", "2 tsp ground coriander", "4 tsp turmeric"],
      source: { provider: "premium-validated" },
      validationReceipt: {
        profile: "premium",
        acceptanceScore: 88,
        acceptanceReasons: ["quality_score:88"],
        acceptedAt: 123456,
        contentFingerprint: "legacy-fingerprint",
        validatorHash: "premium-recipe-acceptance-v1:2026-08-14"
      },
      localized: {
        ...source.localized,
        English: {
          name: "Egyptian Baked Salmon",
          cuisine: "Egyptian",
          ingredients: ["2 fillets salmon", "1/2 tsp ground coriander", "1/4 tsp turmeric"],
          missing_ingredients: [],
          steps: source.steps,
          calories: source.calories,
          protein: `${source.protein}g`,
          carbs: `${source.carbs}g`,
          fat: `${source.fat}g`,
          cook_time: `${source.totalMinutes} minutes`,
          difficulty: "Medium"
        }
      }
    });

    expect(repaired?.ingredientCanonicals).toEqual(["salmon", "ground coriander", "turmeric"]);
    expect(repaired?.requiredCanonicals).toEqual(["salmon", "ground coriander", "turmeric"]);
    expect(repaired && hasCurrentPremiumValidationReceipt(repaired)).toBe(true);
  });
});

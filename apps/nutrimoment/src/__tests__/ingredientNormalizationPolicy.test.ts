import { describe, expect, it } from "vitest";
import { shouldQueryRemoteIngredientAliases } from "../services/ingredientNormalizationService";
import { IngredientNormalizer, getIngredientProfileForTerm } from "../food/IngredientNormalizer";

describe("ingredient normalization source policy", () => {
  it("keeps remote aliases off the recipe request critical path by default", () => {
    expect(shouldQueryRemoteIngredientAliases({ allowRemoteAliases: false, cleanedTermCount: 5 })).toBe(false);
  });

  it("allows explicit administrative enrichment", () => {
    expect(shouldQueryRemoteIngredientAliases({ allowRemoteAliases: true, cleanedTermCount: 2 })).toBe(true);
  });

  it("does not query aliases for empty input", () => {
    expect(shouldQueryRemoteIngredientAliases({ allowRemoteAliases: true, cleanedTermCount: 0 })).toBe(false);
  });

  it("keeps ground lamb in the lamb protein family", () => {
    expect(new IngredientNormalizer().normalizeOne("ground lamb")).toMatchObject({
      id: "lamb",
      canonicalEnglishName: "lamb"
    });
  });

  it("does not classify black pepper as bell pepper", () => {
    expect(getIngredientProfileForTerm("black pepper")).toMatchObject({
      id: "black_pepper",
      category: "spice"
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildIngredientKnowledgeProfile,
  getIngredientCulinaryPaths,
  getIngredientSubstitutions,
  resolveIngredientKnowledge
} from "../lib/IngredientKnowledgeGraph";

describe("IngredientKnowledgeGraph", () => {
  it("resolves normal ingredient variants to a canonical culinary node", () => {
    const match = resolveIngredientKnowledge("Chicken Breasts");

    expect(match?.canonical).toBe("chicken");
    expect(match?.knowledge.cookingTechniques.map((technique) => technique.name)).toContain("grill");
    expect(match?.knowledge.cuisines.map((cuisine) => cuisine.cuisine)).toContain("italian");
  });

  it("finds shared cuisine and technique knowledge for a mixed pantry", () => {
    const profile = buildIngredientKnowledgeProfile(["chicken breast", "tomatoes", "bell peppers", "rice"]);

    expect(profile.unmatched).toEqual([]);
    expect(profile.sharedCuisines).toEqual(expect.arrayContaining(["egyptian", "indian", "italian", "mexican", "turkish"]));
    expect(profile.flavorPairings).toContain("onion");
    expect(profile.suggestedTechniques.map((technique) => technique.name)).toContain("bake");
  });

  it("returns deterministic substitution guidance", () => {
    expect(getIngredientSubstitutions("prawns")).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient: "firm white fish" })
    ]));
  });

  it("maps chicken to named Egyptian culinary pathways before recipe search", () => {
    expect(getIngredientCulinaryPaths("chicken", "Egyptian")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dishFamily: "chicken molokhia with rice",
        technique: "braise",
        spices: expect.arrayContaining(["cumin"]),
        starches: expect.arrayContaining(["egyptian rice"])
      })
    ]));
  });
});

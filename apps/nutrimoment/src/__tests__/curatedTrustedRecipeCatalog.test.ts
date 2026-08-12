import { describe, expect, it } from "vitest";
import { CURATED_TRUSTED_RECIPE_CATALOG } from "../data/offline/curatedTrustedRecipeCatalog";
import { isUsableRealSourceRecipeDoc } from "../data/offline/realSourceRecipeArtifacts";

describe("curated trusted recipe catalog", () => {
  it("bundles usable source-linked recipes for production fallback", () => {
    expect(CURATED_TRUSTED_RECIPE_CATALOG).toHaveLength(15);
    expect(CURATED_TRUSTED_RECIPE_CATALOG.every(isUsableRealSourceRecipeDoc)).toBe(true);
    expect(new Set(CURATED_TRUSTED_RECIPE_CATALOG.map((recipe) => recipe.title)).size).toBe(15);
  });

  it("keeps cuisine-specific providers and source URLs", () => {
    const thai = CURATED_TRUSTED_RECIPE_CATALOG.filter((recipe) => recipe.cuisine === "Thai");
    const turkish = CURATED_TRUSTED_RECIPE_CATALOG.filter((recipe) => recipe.cuisine === "Turkish");
    const middleEastern = CURATED_TRUSTED_RECIPE_CATALOG.filter((recipe) => recipe.cuisine === "Middle Eastern");
    const italian = CURATED_TRUSTED_RECIPE_CATALOG.filter((recipe) => recipe.cuisine === "Italian");

    expect(thai).toHaveLength(4);
    expect(turkish).toHaveLength(4);
    expect(middleEastern).toHaveLength(4);
    expect(italian).toHaveLength(3);
    expect(thai.every((recipe) =>
      recipe.source?.provider === "hot-thai-kitchen" &&
      recipe.source.url?.startsWith("https://hot-thai-kitchen.com/")
    )).toBe(true);
    expect(turkish.every((recipe) =>
      recipe.source?.url?.startsWith("https://") &&
      ["a-kitchen-in-istanbul", "ozlems-turkish-table"].includes(recipe.source.provider)
    )).toBe(true);
    expect(middleEastern.every((recipe) =>
      recipe.source?.url?.startsWith("https://") &&
      ["feel-good-foodie", "simply-lebanese"].includes(recipe.source.provider)
    )).toBe(true);
    expect(italian.every((recipe) =>
      recipe.source?.url?.startsWith("https://") &&
      ["food-network", "giallo-zafferano"].includes(recipe.source.provider)
    )).toBe(true);
  });
});

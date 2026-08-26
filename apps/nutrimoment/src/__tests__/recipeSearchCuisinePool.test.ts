import { describe, expect, it } from "vitest";
import { getCuisineCatalogV2RecipeDocs } from "../data/offline/cuisineCatalogV2Recipes";
import { buildCuisineUnderfillMessage, filterRecipesByCuisinePreference } from "../lib/cuisines";
import { selectRecipeSearchCuisinePool } from "../services/recipeSearchService";

describe("recipe search cuisine pool", () => {
  it("narrows an explicit cuisine before ranking while retaining named aliases", () => {
    const recipes = getCuisineCatalogV2RecipeDocs();
    const thai = selectRecipeSearchCuisinePool(recipes, "Thai");

    expect(thai.length).toBeGreaterThanOrEqual(20);
    expect(thai.some((recipe) => recipe.cuisine === "Thai" && recipe.title === "Tom Yum Goong")).toBe(true);
    expect(thai.some((recipe) => recipe.title === "Nasi Goreng")).toBe(false);
    expect(thai.some((recipe) => recipe.cuisine === "Egyptian")).toBe(false);
  });

  it("keeps all exact Indian catalog entries available to ranking", () => {
    const recipes = getCuisineCatalogV2RecipeDocs();
    const indian = selectRecipeSearchCuisinePool(recipes, "Indian");
    const exactIndianCount = recipes.filter((recipe) => recipe.cuisine === "Indian").length;

    expect(indian.filter((recipe) => recipe.cuisine === "Indian")).toHaveLength(exactIndianCount);
  });

  it("does not fall back to unrelated cuisines for an explicit cuisine", () => {
    const recipes = getCuisineCatalogV2RecipeDocs()
      .filter((recipe) => recipe.cuisine === "Egyptian" || recipe.cuisine === "Indian")
      .slice(0, 20);

    expect(selectRecipeSearchCuisinePool(recipes, "Mexican")).toEqual([]);
  });

  it("filters mixed response cards and explains cuisine underfill", () => {
    const recipes = [
      { name: "Shrimp Fajitas", cuisine: "Mexican" },
      { name: "Koshary", cuisine: "Egyptian" },
      { name: "Camarones al Mojo de Ajo", cuisine: "Mexican" }
    ];

    expect(filterRecipesByCuisinePreference(recipes, "Mexican").map((recipe) => recipe.name)).toEqual([
      "Shrimp Fajitas",
      "Camarones al Mojo de Ajo"
    ]);
    expect(buildCuisineUnderfillMessage({
      preferredCuisine: "Mexican",
      requestedCount: 10,
      returnedCount: 2
    })).toContain("Showing 2 of 10 validated Mexican recipes");
  });
});

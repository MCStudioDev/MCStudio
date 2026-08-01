import { describe, expect, it } from "vitest";
import { getCuisineCatalogV2RecipeDocs } from "../data/offline/cuisineCatalogV2Recipes";
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
});

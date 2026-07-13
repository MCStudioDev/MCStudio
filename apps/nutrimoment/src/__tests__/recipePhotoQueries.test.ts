import { describe, expect, it } from "vitest";
import {
  buildProviderRecipePhotoQueryCandidates,
  buildRecipePhotoQueryCandidates
} from "../lib/recipePhotoQueries";

describe("recipe photo query candidates", () => {
  it("keeps cache lookup detailed without forcing provider-only plate wording", () => {
    const queries = buildRecipePhotoQueryCandidates({
      cuisine: "American",
      ingredients: ["chicken breast", "rice"],
      name: "Fried Chicken with Rice"
    });

    expect(queries.slice(0, 5)).toContain("fried chicken with rice");
    expect(queries).not.toContain("fried chicken with rice plate");
  });

  it("adds plate wording only for provider searches", () => {
    const queries = buildProviderRecipePhotoQueryCandidates({
      cuisine: "Indian",
      ingredients: ["chicken", "yogurt", "ginger", "garlic", "lemon"],
      name: "Chicken Tandoori"
    });

    expect(queries.slice(0, 5)).toContain("chicken tandoori plate");
  });

  it("adds ingredient-aware provider fallbacks for stews and vegetables", () => {
    const queries = buildProviderRecipePhotoQueryCandidates({
      cuisine: "Mediterranean",
      ingredients: ["beef", "tomato", "onion", "carrot"],
      name: "Beef Stew"
    });

    expect(queries.slice(0, 5)).toContain("beef stew plate");
    expect(queries).toContain("beef with vegetables plate");
  });

  it("keeps sauce-specific shrimp plate queries available for provider matching", () => {
    const queries = buildProviderRecipePhotoQueryCandidates({
      cuisine: "American",
      ingredients: ["shrimp", "sweet chili sauce", "fries"],
      name: "Shrimp Sweet Chili Sauce with Fries"
    });

    expect(queries.slice(0, 5)).toContain("shrimp sweet chili sauce with fries plate");
    expect(queries).toContain("shrimp sweet chili sauce fries plate");
  });
});

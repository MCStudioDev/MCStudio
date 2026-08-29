import { describe, expect, it } from "vitest";
import type { RankedRecipeResult } from "@/lib/domain";
import {
  applyRecipeSearchFreshness,
  filterPreviouslyShownRecipes,
  normalizeRecipeIngredientContextKey,
  partitionRecentlyShownRecipes,
  selectRecipeFreshnessBackfill
} from "@/services/recipeSearchFreshnessService";

describe("recipe search freshness", () => {
  const candidates = Array.from({ length: 12 }, (_, index) => ranked(`recipe-${index}`));

  it("keeps retries of the same click deterministic", () => {
    const first = applyRecipeSearchFreshness(candidates, {
      explorationLimit: 10,
      seed: "click-one"
    });
    const retry = applyRecipeSearchFreshness(candidates, {
      explorationLimit: 10,
      seed: "click-one"
    });

    expect(retry.map((recipe) => recipe.recipeId)).toEqual(first.map((recipe) => recipe.recipeId));
  });

  it("rotates equivalent validated recipes for a new click", () => {
    const first = applyRecipeSearchFreshness(candidates, {
      explorationLimit: 10,
      seed: "click-one"
    });
    const next = applyRecipeSearchFreshness(candidates, {
      explorationLimit: 10,
      seed: "click-two"
    });

    const firstIds = first.slice(0, 10).map((recipe) => recipe.recipeId);
    const nextIds = next.slice(0, 10).map((recipe) => recipe.recipeId);
    expect(nextIds).not.toEqual(firstIds);
    expect(new Set(nextIds)).not.toEqual(new Set(firstIds));
  });

  it("rotates fresh recipes within the same broad relevance band", () => {
    const scoredCandidates = Array.from({ length: 14 }, (_, index) =>
      ranked(`scored-${index}`, { score: 81 + index })
    );
    const first = applyRecipeSearchFreshness(scoredCandidates, {
      explorationLimit: 10,
      seed: "scored-click-one"
    });
    const second = applyRecipeSearchFreshness(scoredCandidates, {
      explorationLimit: 10,
      seed: "scored-click-two"
    });

    expect(new Set(first.slice(0, 10).map((recipe) => recipe.recipeId))).not.toEqual(
      new Set(second.slice(0, 10).map((recipe) => recipe.recipeId))
    );
  });

  it("places recent dishes behind equally relevant fresh dishes", () => {
    const ordered = applyRecipeSearchFreshness(candidates, {
      explorationLimit: 10,
      recentRecipeIds: ["recipe-0", "recipe-1"],
      seed: "fresh-click"
    });

    expect(ordered.slice(0, 10).map((recipe) => recipe.recipeId)).not.toContain("recipe-0");
    expect(ordered.slice(0, 10).map((recipe) => recipe.recipeId)).not.toContain("recipe-1");
  });

  it("places a recent same-quality match behind a fresh candidate with a lower score", () => {
    const ordered = applyRecipeSearchFreshness([
      ranked("recent", { score: 100 }),
      ranked("fresh", { score: 82 })
    ], {
      explorationLimit: 2,
      recentRecipeIds: ["recent"],
      seed: "fresh-click"
    });

    expect(ordered.map((recipe) => recipe.recipeId)).toEqual(["fresh", "recent"]);
  });

  it("never promotes a weaker match above a stronger quality tier", () => {
    const ordered = applyRecipeSearchFreshness([
      ranked("stretch", { matchQuality: "stretch", score: 100 }),
      ranked("great", { matchQuality: "great", score: 80 })
    ], {
      explorationLimit: 2,
      recentRecipeIds: ["great"],
      seed: "fresh-click"
    });

    expect(ordered.map((recipe) => recipe.recipeId)).toEqual(["great", "stretch"]);
  });

  it("partitions V2 matches by either document or source identity", () => {
    const recipes = [
      { id: "fresh", source_recipe_id: "source-fresh" },
      { id: "recent-by-id", source_recipe_id: "source-one" },
      { id: "another-id", source_recipe_id: "recent-by-source" }
    ];

    expect(partitionRecentlyShownRecipes(recipes, ["recent-by-id", "recent-by-source"])).toEqual({
      fresh: [recipes[0]],
      recent: [recipes[1], recipes[2]]
    });
  });

  it("normalizes ingredient contexts without depending on order or punctuation", () => {
    expect(normalizeRecipeIngredientContextKey([" Chicken ", "Tomato"])).toBe("chicken|tomato");
    expect(normalizeRecipeIngredientContextKey(["tomato", "CHICKEN", "tomato!"])).toBe("chicken|tomato");
  });

  it("hard-excludes recipes served in the daily ingredient context", () => {
    const recipes = [
      { id: "new-id", name: "New Chicken Dish" },
      { id: "same-source-new-doc", source_recipe_id: "served-source", name: "Renamed Card" },
      { id: "new-variant", dish_identity: "served-dish", name: "Localized Name" },
      { id: "same-name", name: "Previously Served Chicken" }
    ];
    const recent = [
      { id: "old-doc", source_recipe_id: "served-source", name: "Original Card" },
      { id: "old-variant", dish_identity: "served-dish", name: "Original Localized Name" },
      { id: "old-name", name: "Previously Served Chicken" }
    ];

    expect(filterPreviouslyShownRecipes(recipes, recent)).toEqual([recipes[0]]);
  });

  it("treats translated and inflected title variants as the same dish concept", () => {
    const recipes = [
      { name: "Roast Chicken" },
      { name: "Chicken Pizzaiola" },
      { name: "Chicken Shawarma" }
    ];
    const recent = [
      { name: "Roasted Chicken" },
      { name: "Pollo alla Pizzaiola" }
    ];

    expect(filterPreviouslyShownRecipes(recipes, recent)).toEqual([recipes[2]]);
  });

  it("fills a fresh shortfall from eligible recent recipes without duplicating a dish concept", () => {
    const fresh = [{ name: "Chicken Shawarma" }];
    const recent = [
      { name: "Roast Chicken" },
      { name: "Roasted Chicken" },
      { name: "Chicken Piccata" }
    ];

    expect(selectRecipeFreshnessBackfill(fresh, recent, 3)).toEqual({
      backfilled: [recent[0], recent[2]],
      recipes: [fresh[0], recent[0], recent[2]]
    });
  });

  it("does not exceed the requested count when fresh recipes already fill it", () => {
    const fresh = [{ name: "One" }, { name: "Two" }];
    const recent = [{ name: "Three" }];

    expect(selectRecipeFreshnessBackfill(fresh, recent, 2)).toEqual({
      backfilled: [],
      recipes: fresh
    });
  });
});

function ranked(id: string, overrides: Partial<RankedRecipeResult> = {}): RankedRecipeResult {
  return {
    recipeId: id,
    score: 96,
    matchQuality: "great",
    matchedRequiredCount: 3,
    matchedOptionalCount: 1,
    missingRequired: [],
    missingOptional: [],
    preferenceHits: [],
    servedFrom: "shared_pool",
    ...overrides
  };
}

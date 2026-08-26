import { describe, expect, it } from "vitest";
import {
  buildBalancedRecipeReferenceQueryTerms,
  buildNamedDishReferenceSearchTokens,
  buildRecipeReferenceReadPlan,
  filterRecipeReferenceCandidatesByCuisine,
  filterMeaningfulRecipeReferenceQueryTerms,
  getRecipeReferenceRestrictionPenalty,
  groupRecipeReferenceTaxonomyBuckets,
  recipeMatchesCoreProteinAnchors,
  selectRecipeReferenceCuisineRankingPool,
  shouldContinueRecipeReferenceCandidateSearch,
  shouldLoadRecipeReferencesForGeneration,
  shouldLoadRecipeReferenceTaxonomyMatches
} from "../services/recipeReferenceService";

describe("recipe reference search policy", () => {
  it("keeps exhausted Free requests on the published shared pool", () => {
    expect(shouldLoadRecipeReferencesForGeneration({
      hasAiGenerationAccess: false,
      ingredientCount: 3
    })).toBe(false);
    expect(shouldLoadRecipeReferencesForGeneration({
      hasAiGenerationAccess: true,
      ingredientCount: 3
    })).toBe(true);
    expect(shouldLoadRecipeReferencesForGeneration({
      hasAiGenerationAccess: true,
      ingredientCount: 0
    })).toBe(false);
  });

  it("removes low-signal pantry terms before Firestore queries", () => {
    expect(filterMeaningfulRecipeReferenceQueryTerms([
      "bell pepper",
      "water",
      "juice",
      "salt",
      "oil",
      "tomato"
    ])).toEqual(["bell pepper", "tomato"]);
  });

  it("keeps ingredients that can identify a real dish", () => {
    expect(filterMeaningfulRecipeReferenceQueryTerms([
      "chicken",
      "egg",
      "rice",
      "lemon"
    ])).toEqual(["chicken", "egg", "rice", "lemon"]);
  });

  it("preserves signals from multiple ingredients before adding aliases", () => {
    expect(buildBalancedRecipeReferenceQueryTerms([
      "tomato",
      "bell pepper",
      "egg",
      "lemon"
    ])).toEqual(expect.arrayContaining(["tomato", "bell pepper", "egg", "lemon"]));
  });

  it("bounds candidate transfer and full recipe hydration", () => {
    expect(buildRecipeReferenceReadPlan(100)).toEqual({
      candidateQueryLimit: 50,
      hydrationLimit: 90,
      requestedReferences: 60
    });
  });

  it("stops remote expansion once enough compact candidates exist", () => {
    expect(shouldContinueRecipeReferenceCandidateSearch({
      candidateCount: 30,
      requestedReferences: 10
    })).toBe(false);
    expect(shouldContinueRecipeReferenceCandidateSearch({
      candidateCount: 9,
      requestedReferences: 10
    })).toBe(true);
  });

  it("still loads cuisine-protein taxonomy matches when compact buckets are full", () => {
    expect(shouldLoadRecipeReferenceTaxonomyMatches({
      candidateCount: 50,
      mainIngredientKeys: ["chicken", "tomato"],
      preferredCuisine: "Italian",
      requestedReferences: 30
    })).toBe(true);

    expect(shouldLoadRecipeReferenceTaxonomyMatches({
      candidateCount: 50,
      mainIngredientKeys: ["tomato"],
      preferredCuisine: "Italian",
      requestedReferences: 30
    })).toBe(false);
  });

  it("builds catalog-guided named-dish tokens without querying generic proteins", () => {
    const tokens = buildNamedDishReferenceSearchTokens({
      ingredients: ["chicken", "tomato", "garlic", "olive oil"],
      preferredCuisine: "Italian"
    });

    expect(tokens).toEqual(expect.arrayContaining(["cacciatore", "pizzaiola"]));
    expect(tokens).not.toContain("chicken");
    expect(buildNamedDishReferenceSearchTokens({
      ingredients: ["chicken"],
      preferredCuisine: "Any"
    })).toEqual([]);

    expect(buildNamedDishReferenceSearchTokens({
      ingredients: ["zucchini", "eggplant", "tomato", "white beans", "polenta"],
      preferredCuisine: "Italian"
    })).toEqual(expect.arrayContaining(["ciambotta", "minestrone"]));
  });

  it("prioritizes diet-compatible references before hydration", () => {
    const base = {
      title: "Italian vegetable dinner",
      ingredientCanonicals: ["tomato", "eggplant"],
      mainIngredients: ["tomato"],
      commonAllergens: [],
      tags: []
    } as never;
    const restricted = {
      ...base,
      title: "Italian sausage dinner",
      ingredientCanonicals: ["sausage", "tomato"]
    } as never;
    const preferences = { allergens: [], diets: ["vegetarian"] };

    expect(getRecipeReferenceRestrictionPenalty(base, preferences)).toBe(0);
    expect(getRecipeReferenceRestrictionPenalty(restricted, preferences)).toBe(1_000);
    expect(getRecipeReferenceRestrictionPenalty({
      ...base,
      title: "Minestrone with kidney beans",
      ingredientCanonicals: ["kidney beans", "tomato"]
    } as never, preferences)).toBe(0);
  });

  it("keeps an explicit cuisine deterministic before reference ranking", () => {
    const candidates = [
      { cuisine: "Italian", cuisineKey: "italian", id: "italian" },
      { cuisine: "Global", cuisineKey: "global", id: "global" },
      { cuisine: "American", cuisineKey: "american", id: "american" }
    ];

    expect(filterRecipeReferenceCandidatesByCuisine(candidates, "Italian")).toEqual([
      candidates[0]
    ]);
    expect(filterRecipeReferenceCandidatesByCuisine(candidates, "Any")).toEqual(candidates);
    expect(selectRecipeReferenceCuisineRankingPool(candidates, [], "Egyptian")).toEqual([]);
    expect(selectRecipeReferenceCuisineRankingPool(candidates, [], "Any")).toEqual(candidates);
  });

  it("uses imported protein taxonomy before reparsing abbreviated ingredient lines", () => {
    expect(recipeMatchesCoreProteinAnchors({
      title: "Chicken And Cheese Lasagna",
      protein: "Chicken",
      proteinKey: "chicken",
      ingredients: ["boneless breasts", "lasagna noodles"],
      ingredientCanonicals: ["boneless breasts", "pasta"],
      mainIngredients: ["chicken breast", "pasta"]
    } as never, ["chicken"])).toBe(true);

    expect(recipeMatchesCoreProteinAnchors({
      title: "Turkey Alfredo Casserole",
      protein: "Turkey",
      proteinKey: "turkey",
      ingredients: ["turkey", "chicken stuffing"],
      ingredientCanonicals: ["turkey", "chicken stuffing"],
      mainIngredients: ["turkey", "pasta"]
    } as never, ["chicken"])).toBe(false);
  });

  it("does not mix exact-cuisine taxonomy buckets with generic fallback buckets", () => {
    expect(groupRecipeReferenceTaxonomyBuckets([
      "italian::protein::chicken",
      "italian::ingredient::chicken",
      "protein::chicken",
      "ingredient::chicken"
    ], "italian", true)).toEqual([
      ["italian::protein::chicken"],
      ["italian::ingredient::chicken"],
      ["protein::chicken"],
      ["ingredient::chicken"]
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import {
  buildPantryOwnershipSet,
  classifyRecipeIngredientOwnership,
  isPantryIngredientOwned,
  normalizeCompleteRecipeIngredientLines,
  requiresSeparatePantryPurchase
} from "../services/recipeIngredientOwnershipService";

const recipe: Recipe = {
  name: "Chicken Piccata",
  cuisine: "Italian",
  ingredients: ["500 g chicken breast, sliced"],
  missing_ingredients: ["2 tbsp olive oil", "1 tbsp capers"],
  steps: ["Brown the chicken.", "Finish with capers."],
  calories: 500,
  protein: "40g",
  carbs: "15g",
  fat: "25g",
  cook_time: "30 minutes",
  difficulty: "Medium"
};

describe("recipe ingredient ownership", () => {
  it("classifies pantry ownership without removing recipe quantities", () => {
    const result = classifyRecipeIngredientOwnership(recipe, {
      canonicalize: (value) => value.includes("chicken") ? "chicken" : value.replace(/^\d+\s+\w+\s+/i, "").toLowerCase(),
      isAvailable: (_value, canonical) => canonical === "chicken"
    });

    expect(result.recipe.ingredients).toEqual(["500 g chicken breast, sliced"]);
    expect(result.recipe.missing_ingredients).toEqual(["2 tbsp olive oil", "1 tbsp capers"]);
    expect(result.lines[0]).toEqual({
      availability: "owned",
      canonicalName: "chicken",
      displayText: "500 g chicken breast, sliced"
    });
  });

  it("keeps the richer quantified line when legacy lists duplicate an ingredient", () => {
    const result = classifyRecipeIngredientOwnership({
      ...recipe,
      ingredients: ["chicken"],
      missing_ingredients: ["500 g chicken breast", "2 tbsp olive oil"]
    }, {
      canonicalize: (value) => value.includes("chicken") ? "chicken" : "olive oil",
      isAvailable: (_value, canonical) => canonical === "chicken"
    });

    expect(result.recipe.ingredients).toEqual(["500 g chicken breast"]);
    expect(result.recipe.missing_ingredients).toEqual(["2 tbsp olive oil"]);
  });

  it("normalizes a complete Gemini list before quality validation", () => {
    const normalized = normalizeCompleteRecipeIngredientLines({
      ...recipe,
      ingredients: ["chicken", "500 g chicken breast", "2 tbsp olive oil"],
      missing_ingredients: ["1 tbsp olive oil"]
    }, (value) => value.includes("chicken") ? "chicken" : "olive oil");

    expect(normalized.ingredients).toEqual(["500 g chicken breast", "2 tbsp olive oil"]);
    expect(normalized.missing_ingredients).toEqual([]);
  });

  it("cleans accidental adjacent ingredient word repetition", () => {
    const normalized = normalizeCompleteRecipeIngredientLines({
      ...recipe,
      ingredients: ["10 medium shrimp shrimp", "2 eggs eggs"],
      missing_ingredients: []
    }, (value) => value.replace(/^\d+\s+(?:medium\s+)?/i, "").toLowerCase());

    expect(normalized.ingredients).toEqual(["10 medium shrimp", "2 eggs"]);
  });

  it("requires composite chicken products to be owned separately", () => {
    expect(requiresSeparatePantryPurchase("low sodium chicken stock")).toBe(true);
    expect(requiresSeparatePantryPurchase("chicken broth")).toBe(true);
    expect(requiresSeparatePantryPurchase("ground chicken")).toBe(false);
    expect(requiresSeparatePantryPurchase("chicken breast")).toBe(false);
  });

  it("builds ownership from entered and canonical ingredients only", () => {
    const ownership = buildPantryOwnershipSet({
      inputIngredients: ["Chicken"],
      normalizedIngredients: ["chicken"]
    }, (value) => value.toLowerCase());

    expect([...ownership]).toEqual(["chicken"]);
    expect(ownership.has("chicken stock")).toBe(false);
  });

  it("bypasses related-ingredient matching for composite pantry products", () => {
    const pantry = new Set(["chicken"]);
    const relatedMatcher = () => true;

    expect(isPantryIngredientOwned({
      availableIngredients: pantry,
      canonicalName: "chicken stock",
      displayText: "0.5 cup low-sodium chicken stock",
      matchRelatedIngredient: relatedMatcher
    })).toBe(false);
    expect(isPantryIngredientOwned({
      availableIngredients: new Set(["chicken stock"]),
      canonicalName: "chicken stock",
      displayText: "0.5 cup low-sodium chicken stock",
      matchRelatedIngredient: () => false
    })).toBe(true);
  });
});

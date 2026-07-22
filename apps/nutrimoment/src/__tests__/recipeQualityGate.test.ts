import { describe, expect, it } from "vitest";
import { RecipeQualityGate } from "../services/recipeQualityGate";
import type { Recipe } from "../lib/types";

const validRecipe: Recipe = {
  name: "Chicken Tomato Skillet",
  cuisine: "Italian",
  recipe_source_type: "local_database",
  ingredients: ["chicken", "tomatoes", "olive oil"],
  missing_ingredients: [],
  steps: [
    "Brown the chicken in olive oil.",
    "Add tomatoes and simmer the chicken until cooked through."
  ],
  calories: 520,
  protein: "40g",
  carbs: "28g",
  fat: "20g",
  sodium: "520mg",
  cook_time: "30 minutes",
  difficulty: "Easy"
};

describe("recipe quality gate", () => {
  it("accepts a complete source-backed recipe", () => {
    expect(new RecipeQualityGate().validate(validRecipe, "English")).toEqual({ valid: true, reasons: [] });
  });

  it("rejects unused ingredients, duplicate steps, and Arabic English leakage", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      name: "دجاج كاشاتوري",
      ingredients: ["دجاج", "طماطم", "طماطم", "ريحان"],
      steps: ["اطه الدجاج مع الطماطم.", "اطه الدجاج مع الطماطم."]
    }, "Arabic");

    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "duplicate_ingredients",
      "duplicate_instructions",
      "ingredient_not_used:ريحان",
      "forbidden_arabic_transliteration"
    ]));
  });
});

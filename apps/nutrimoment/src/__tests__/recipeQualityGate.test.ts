import { describe, expect, it } from "vitest";
import { RecipeQualityGate } from "../services/recipeQualityGate";
import type { Recipe } from "../lib/types";

const validRecipe: Recipe = {
  name: "Chicken Tomato Skillet",
  cuisine: "Italian",
  recipe_source_type: "local_database",
  ingredients: ["1 lb chicken", "2 cups tomatoes", "1 tbsp olive oil"],
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

  it("rejects recipe titles that are only the primary ingredient", () => {
    const gate = new RecipeQualityGate();

    expect(gate.validate({
      ...validRecipe,
      name: "Chicken"
    }, "English").reasons).toContain("ingredient_only_title");

    expect(gate.validate({
      ...validRecipe,
      name: "Ground Beef",
      ingredients: ["1 lb ground chuck", "1 cup tomato", "1 onion"],
      steps: [
        "Brown the ground chuck with onion.",
        "Add tomato and simmer until the ground chuck is cooked."
      ]
    }, "English").reasons).toContain("ingredient_only_title");

    expect(gate.validate({
      ...validRecipe,
      name: "\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645",
      ingredients: ["1 lb \u0644\u062d\u0645\u0629 \u0645\u0641\u0631\u0648\u0645\u0629", "2 cups \u0637\u0645\u0627\u0637\u0645", "1 \u0628\u0635\u0644"],
      steps: [
        "\u062d\u0645\u0631 \u0627\u0644\u0644\u062d\u0645\u0629 \u0627\u0644\u0645\u0641\u0631\u0648\u0645\u0629 \u0645\u0639 \u0627\u0644\u0628\u0635\u0644.",
        "\u0623\u0636\u0641 \u0627\u0644\u0637\u0645\u0627\u0637\u0645 \u0648\u0627\u0637\u0647\u0647\u0627 \u062d\u062a\u0649 \u062a\u0646\u0636\u062c."
      ]
    }, "Arabic").reasons).toContain("ingredient_only_title");
  });

  it("accepts finished dish titles that include the primary ingredient", () => {
    const gate = new RecipeQualityGate();

    expect(gate.validate({
      ...validRecipe,
      name: "Chicken Cacciatore"
    }, "English").reasons).not.toContain("ingredient_only_title");

    expect(gate.validate({
      ...validRecipe,
      name: "Turkish Tavuk Sote"
    }, "English").reasons).not.toContain("ingredient_only_title");
  });

  it("rejects protein ingredients without quantities", () => {
    const gate = new RecipeQualityGate();

    expect(gate.validate({
      ...validRecipe,
      ingredients: ["Chicken Breast", "2 cups tomatoes", "1 tbsp olive oil"]
    }, "English").reasons).toContain("protein_missing_quantity:chicken breast");

    expect(gate.validate({
      ...validRecipe,
      ingredients: [
        { quantity: null, unit: "breasts", ingredient: "Chicken Breast" },
        { quantity: 2, unit: "cups", ingredient: "tomatoes" },
        { quantity: 1, unit: "tbsp", ingredient: "olive oil" }
      ] as unknown as Recipe["ingredients"]
    }, "English").reasons).toContain("protein_missing_quantity:chicken breast");

    expect(gate.validate({
      ...validRecipe,
      ingredients: [
        { quantity: 2, unit: "breasts", ingredient: "Chicken Breast" },
        { quantity: 2, unit: "cups", ingredient: "tomatoes" },
        { quantity: 1, unit: "tbsp", ingredient: "olive oil" }
      ] as unknown as Recipe["ingredients"]
    }, "English").reasons).not.toContain("protein_missing_quantity:chicken breast");
  });

  it("rejects ingredients without quantity and unit details", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      ingredients: ["2 cups tomatoes", "olive oil", "1 lb chicken"]
    }, "English");

    expect(result.reasons).toContain("ingredient_missing_quantity_or_unit:olive oil");
  });

  it("does not reject unused missing support ingredients", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      ingredients: ["1 lb chicken"],
      missing_ingredients: ["1 cup rice", "1 tbsp mint"],
      steps: [
        "Brown the chicken for 5 minutes.",
        "Simmer the chicken until tender."
      ]
    }, "English");

    expect(result.reasons).not.toContain("ingredient_not_used:rice");
    expect(result.reasons).not.toContain("ingredient_not_used:mint");
  });
});

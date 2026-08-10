import { describe, expect, it } from "vitest";
import {
  getRecipeIngredientValidationIdentity,
  RecipeQualityGate
} from "../services/recipeQualityGate";
import { hasAuthenticRecipeInstructions } from "../services/recipePipeline/recipeValidator";
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
  it("exposes the same parsed ingredient identity used by validation", () => {
    expect(getRecipeIngredientValidationIdentity("1 medium onion, chopped")).toBe("onion chopped");
    expect(getRecipeIngredientValidationIdentity("2 cloves garlic, minced")).toBe("garlic minced");
  });

  it("accepts a complete source-backed recipe", () => {
    expect(new RecipeQualityGate().validate(validRecipe, "English")).toEqual({ valid: true, reasons: [] });
  });

  it("does not parse an ingredient name or preparation word as a unit", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      ingredients: ["1 medium onion, chopped", "2 cloves garlic, minced", "500 g chicken breast"],
      steps: [
        "Chop the onion and mince the garlic.",
        "Cook the chicken with the onion and garlic for 25 minutes."
      ]
    }, "English");

    expect(result.reasons).not.toContain("duplicate_ingredients");
    expect(result.reasons).not.toContain("ingredient_not_used:chopped");
    expect(result.reasons).not.toContain("ingredient_not_used:minced");
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

  it("accepts authentic canonical dish names that do not appear in the recipe body", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      name: "Karniyarik",
      cuisine: "Turkish",
      ingredients: ["3 medium eggplant", "340 g ground beef", "1 medium onion"],
      steps: [
        "Soften the eggplant and fill it with the seasoned ground beef and onion.",
        "Leave the covered baking dish at 180 C for 45 minutes until tender."
      ],
      cook_time: "60 minutes"
    }, "English");

    expect(result.reasons).not.toContain("malformed_recipe_title");
    expect(result.reasons).not.toContain("ingredient_only_title");
    expect(result.valid).toBe(true);
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

  it("matches ingredient use through bilingual canonical aliases", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      name: "دجاج بالثوم والطماطم",
      cuisine: "إيطالي",
      ingredients: ["500 جرام دجاج", "2 كوب طماطم", "3 فصوص ثوم"],
      steps: [
        "Brown the chicken with minced garlic.",
        "Add tomato and simmer until the chicken is cooked through."
      ],
      cook_time: "30 دقيقة",
      difficulty: "سهل"
    }, "Arabic");

    expect(result.reasons).not.toContain("ingredient_not_used:ثوم");
    expect(result.reasons).toContain("english_leakage_in_arabic");
  });

  it("rejects editorial prose masquerading as recipe instructions", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      name: "Black Bean Hummus",
      ingredients: ["1 cup black beans", "2 tbsp tahini", "1 tbsp lemon juice"],
      steps: [
        "This is the absolute best hummus I have ever had.",
        "My friends love it with toasted bread and I think you will too."
      ]
    }, "English");

    expect(result.reasons).toContain("invalid_recipe_instructions");
  });

  it("rejects generic generated steps even when they contain cooking verbs", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      steps: [
        "Prepare the main ingredients.",
        "Heat a pan and add the chicken.",
        "Cook until done.",
        "Serve warm."
      ]
    }, "English");

    expect(result.reasons).toContain("invalid_recipe_instructions");
  });

  it("accepts specific instructions without requiring recognized cooking action words", () => {
    expect(hasAuthenticRecipeInstructions([
      "Position the seasoned chicken over the sliced tomatoes in a covered casserole.",
      "After 25 minutes at 190 C, check that the center reaches 74 C before resting it."
    ])).toBe(true);
  });

  it.each([
    "1 hour",
    "1 hour 30 minutes",
    "1.5 hours",
    "45-60 minutes",
    "1 ساعة و30 دقيقة",
    "٩٠ دقيقة"
  ])("accepts realistic cooking time %s", (cookTime) => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      cook_time: cookTime
    }, "English");

    expect(result.reasons).not.toContain("unrealistic_cooking_time");
  });

  it.each(["4 minutes", "7 hours", "15 minutes"])("rejects unrealistic cooking time %s", (cookTime) => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      cook_time: cookTime
    }, "English");

    expect(result.reasons).toContain("unrealistic_cooking_time");
  });

  it("rejects imported website descriptions even when localized repair steps exist elsewhere", () => {
    expect(hasAuthenticRecipeInstructions([
      "Recipes, cooking techniques, and news, updated daily.",
      "Chow.com - devoted to the pleasure of food and drink."
    ])).toBe(false);
    expect(hasAuthenticRecipeInstructions([
      "Fattoush is a Lebanese salad, good for hot weather.",
      "This recipe uses two unusual ingredients: sumac and purslane."
    ])).toBe(false);
  });

  it("rejects Arabic fallback titles that begin with the word recipe", () => {
    const result = new RecipeQualityGate().validate({
      ...validRecipe,
      name: "وصفة بيض 2 مع دقيق",
      ingredients: ["2 حبة بيض", "1 كوب دقيق", "1 ملعقة كبيرة زيت"],
      steps: ["اخفق البيض مع الدقيق.", "سخن الزيت واطه الخليط حتى ينضج."],
      cuisine: "عالمي",
      cook_time: "20 دقيقة",
      difficulty: "سهل"
    }, "Arabic");

    expect(result.reasons).toContain("malformed_recipe_title");
  });
});

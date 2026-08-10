import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import {
  buildValidatedSourceFallback,
  getBlockingEditedRecipeQualityReasons
} from "../services/recipeEditorFallbackService";
import { RecipeQualityGate } from "../services/recipeQualityGate";

const sourceRecipe: Recipe = {
  id: "source-chicken-cacciatore",
  source_recipe_id: "source-chicken-cacciatore",
  name: "Chicken Cacciatore",
  dish_identity: "Chicken Cacciatore",
  cuisine: "Italian",
  recipe_source_type: "local_database",
  ingredients: [
    "1 lb chicken breast",
    "2 cups tomatoes",
    "1 tbsp olive oil",
    "1 piece onion"
  ],
  missing_ingredients: [],
  steps: [
    "Slice the onion into thin strips and pat the chicken dry.",
    "Heat the olive oil in a wide pan over medium-high heat for 2 minutes.",
    "Brown the chicken for 4 minutes per side, then transfer it to a plate.",
    "Saute the onion for 5 minutes, add the tomatoes, and simmer for 10 minutes.",
    "Return the chicken and simmer for 20 minutes until it reaches 74 C."
  ],
  calories: 480,
  protein: "42g",
  carbs: "18g",
  fat: "20g",
  fiber: "5g",
  sugar: "8g",
  sodium: "480mg",
  cook_time: "45 minutes",
  difficulty: "Medium"
};

describe("recipe editor source fallback", () => {
  it("treats corrupted editor instructions as blocking", () => {
    const editedRecipe: Recipe = {
      ...sourceRecipe,
      steps: [
        "Heat a pan.",
        "Add chicken.",
        "Cook until done.",
        "Serve warm."
      ]
    };
    const quality = new RecipeQualityGate().validate(editedRecipe, "English");

    expect(getBlockingEditedRecipeQualityReasons(quality.reasons)).toContain("invalid_recipe_instructions");
  });

  it("returns the unchanged source recipe when it is a valid fallback", () => {
    const fallback = buildValidatedSourceFallback(sourceRecipe, "English");

    expect(fallback).not.toBeNull();
    expect(fallback?.steps).toEqual(sourceRecipe.steps);
    expect(fallback?.ingredients).toEqual(sourceRecipe.ingredients);
    expect(fallback).not.toBe(sourceRecipe);
  });

  it("uses a complete prelocalized Arabic source without transliterating or rewriting its steps", () => {
    const arabicSteps = [
      "قطّع البصل إلى شرائح رفيعة وجفف قطع الدجاج جيداً.",
      "سخّن زيت الزيتون في مقلاة واسعة على نار متوسطة إلى عالية لمدة دقيقتين.",
      "حمّر الدجاج أربع دقائق لكل جانب ثم انقله إلى طبق.",
      "شوّح البصل خمس دقائق ثم أضف الطماطم واترك الصلصة على نار هادئة عشر دقائق.",
      "أعد الدجاج واتركه على نار هادئة عشرين دقيقة حتى ينضج تماماً."
    ];
    const localizedSource: Recipe = {
      ...sourceRecipe,
      localized: {
        Arabic: {
          ...sourceRecipe,
          name: "دجاج بالطماطم على الطريقة الإيطالية",
          cuisine: "إيطالي",
          ingredients: [
            "نصف كيلوغرام صدور دجاج",
            "كوبان طماطم",
            "ملعقة كبيرة زيت زيتون",
            "حبة بصل"
          ],
          steps: arabicSteps,
          cook_time: "45 دقيقة",
          difficulty: "متوسط"
        }
      }
    };

    const fallback = buildValidatedSourceFallback(localizedSource, "Arabic");

    expect(fallback?.name).toBe("دجاج بالطماطم على الطريقة الإيطالية");
    expect(fallback?.steps).toEqual(arabicSteps);
    expect(fallback?.steps.join(" ")).not.toMatch(/[A-Za-z]/);
  });
});

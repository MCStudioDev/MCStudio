import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import { RecipeAcceptanceEngine } from "../services/recipeAcceptanceEngine";
import { RecipeQualityGate } from "../services/recipeQualityGate";

const completeRecipe: Recipe = {
  name: "Chicken Cacciatore",
  cuisine: "Italian",
  recipe_source_type: "local_database",
  dish_identity: "Chicken Cacciatore",
  ingredients: ["2 breasts chicken breast", "1 cup tomato sauce", "1 tbsp olive oil"],
  missing_ingredients: [],
  steps: [
    "Heat 1 tbsp olive oil for 2 minutes.",
    "Brown 2 breasts chicken breast for 5 minutes.",
    "Add 1 cup tomato sauce and simmer for 10 minutes.",
    "Turn the chicken after 5 minutes.",
    "Simmer until the sauce thickens for 8 minutes.",
    "Rest the chicken for 3 minutes.",
    "Serve the chicken with the tomato sauce."
  ],
  calories: 520,
  protein: "42g",
  carbs: "24g",
  fat: "22g",
  fiber: "4g",
  sugar: "6g",
  sodium: "520mg",
  cook_time: "35 minutes",
  difficulty: "Medium",
  localized: {
    English: {
      name: "Chicken Cacciatore",
      cuisine: "Italian",
      ingredients: ["2 breasts chicken breast"],
      missing_ingredients: [],
      steps: ["Brown the chicken."],
      calories: 520,
      protein: "42g",
      carbs: "24g",
      fat: "22g",
      cook_time: "35 minutes",
      difficulty: "Medium"
    },
    Arabic: {
      name: "\u062f\u062c\u0627\u062c \u0643\u0627\u062a\u0634\u0627\u062a\u0648\u0631\u064a",
      cuisine: "\u0625\u064a\u0637\u0627\u0644\u064a",
      ingredients: ["2 \u0635\u062f\u0631 \u062f\u062c\u0627\u062c"],
      missing_ingredients: [],
      steps: ["\u062d\u0645\u0631 \u0627\u0644\u062f\u062c\u0627\u062c."],
      calories: 520,
      protein: "42g",
      carbs: "24g",
      fat: "22g",
      cook_time: "35 \u062f\u0642\u064a\u0642\u0629",
      difficulty: "\u0645\u062a\u0648\u0633\u0637"
    }
  }
};

describe("recipe acceptance engine", () => {
  it("scores complete recipes above the production threshold", () => {
    const quality = new RecipeQualityGate().validate(completeRecipe, "English");
    const result = new RecipeAcceptanceEngine().evaluate(completeRecipe, {
      imageReady: false,
      qualityGate: quality,
      recipeLanguage: "English"
    });

    expect(result.accepted).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("rejects recipes that fail title or ingredient quality gates", () => {
    const badRecipe = {
      ...completeRecipe,
      name: "Chicken",
      ingredients: ["Chicken Breast", "1 cup tomato sauce"]
    };
    const quality = new RecipeQualityGate().validate(badRecipe, "English");
    const result = new RecipeAcceptanceEngine().evaluate(badRecipe, {
      imageReady: false,
      qualityGate: quality,
      recipeLanguage: "English"
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "ingredient_only_title",
      "protein_missing_quantity:chicken breast"
    ]));
  });

  it("accepts Arabic recipes localized at the top level", () => {
    const arabicRecipe: Recipe = {
      ...completeRecipe,
      name: "\u062f\u062c\u0627\u062c \u0643\u0627\u062a\u0634\u0627\u062a\u0648\u0631\u064a",
      cuisine: "\u0625\u064a\u0637\u0627\u0644\u064a",
      ingredients: [
        "2 \u0635\u062f\u0648\u0631 \u062f\u062c\u0627\u062c",
        "1 \u0643\u0648\u0628 \u0635\u0644\u0635\u0629 \u0637\u0645\u0627\u0637\u0645",
        "1 \u0643\u0648\u0628 \u0632\u064a\u062a \u0632\u064a\u062a\u0648\u0646"
      ],
      missing_ingredients: [],
      steps: [
        "\u0633\u062e\u0646 \u0632\u064a\u062a \u0632\u064a\u062a\u0648\u0646 \u0644\u0645\u062f\u0629 2 \u062f\u0642\u064a\u0642\u0629.",
        "\u062d\u0645\u0631 2 \u0635\u062f\u0648\u0631 \u062f\u062c\u0627\u062c \u0644\u0645\u062f\u0629 5 \u062f\u0642\u0627\u0626\u0642.",
        "\u0623\u0636\u0641 1 \u0643\u0648\u0628 \u0635\u0644\u0635\u0629 \u0637\u0645\u0627\u0637\u0645.",
        "\u0627\u062a\u0631\u0643 \u0627\u0644\u062f\u062c\u0627\u062c \u064a\u0637\u0647\u0649 10 \u062f\u0642\u0627\u0626\u0642.",
        "\u0642\u0644\u0628 \u0627\u0644\u0635\u0644\u0635\u0629 \u062d\u062a\u0649 \u062a\u062b\u062e\u0646 3 \u062f\u0642\u0627\u0626\u0642.",
        "\u0627\u0631\u062d \u0627\u0644\u062f\u062c\u0627\u062c \u0644\u0645\u062f\u0629 2 \u062f\u0642\u064a\u0642\u0629.",
        "\u0642\u062f\u0645 \u0627\u0644\u062f\u062c\u0627\u062c \u0645\u0639 \u0635\u0644\u0635\u0629 \u0637\u0645\u0627\u0637\u0645."
      ],
      cook_time: "35 \u062f\u0642\u064a\u0642\u0629",
      difficulty: "\u0645\u062a\u0648\u0633\u0637",
      localized: undefined
    };
    const quality = new RecipeQualityGate().validate(arabicRecipe, "Arabic");
    const result = new RecipeAcceptanceEngine().evaluate(arabicRecipe, {
      imageReady: false,
      qualityGate: quality,
      recipeLanguage: "Arabic"
    });

    expect(quality.valid).toBe(true);
    expect(result.accepted).toBe(true);
  });

  it("keeps a fundamentally usable searched source in fail-open mode", () => {
    const sourceRecipe: Recipe = {
      ...completeRecipe,
      name: "دجاج كاتشاتوري الإيطالي",
      cuisine: "إيطالي",
      ingredients: ["500 جرام صدر دجاج", "2 كوب طماطم", "1 ملعقة كبيرة زيت زيتون"],
      steps: [
        "Brown the chicken in olive oil.",
        "Add the tomatoes and simmer until the chicken is cooked through."
      ],
      localized: undefined
    };
    const quality = new RecipeQualityGate().validate(sourceRecipe, "Arabic");
    const result = new RecipeAcceptanceEngine().evaluate(sourceRecipe, {
      allowRepairableQualityIssues: true,
      blockingQualityReasons: [],
      failOpen: true,
      imageReady: false,
      qualityGate: quality,
      recipeLanguage: "Arabic"
    });

    expect(quality.reasons).toContain("english_leakage_in_arabic");
    expect(result.accepted).toBe(true);
    expect(result.reasons).not.toContain("acceptance_image_pending");
  });
});

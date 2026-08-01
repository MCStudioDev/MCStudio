import { describe, expect, it } from "vitest";
import {
  localizationService,
  normalizeRecipeThroughLocalizationService,
  validateArabicRecipeLocalization
} from "../lib/localization/LocalizationService";
import type { Recipe } from "../lib/types";

describe("LocalizationService", () => {
  it("exposes canonical ingredient, dish, verb, unit, and equipment dictionaries", () => {
    expect(localizationService.getIngredientDictionary().some((ingredient) =>
      ingredient.id === "ground_beef" &&
      ingredient.englishName === "ground beef" &&
      ingredient.arabicName === "\u0644\u062d\u0645 \u0628\u0642\u0631\u064a \u0645\u0641\u0631\u0648\u0645" &&
      ingredient.aliases.includes("ground chuck")
    )).toBe(true);

    expect(localizationService.getDishDictionary().some((dish) =>
      dish.id === "chicken-shawarma" &&
      dish.englishTitle === "Chicken Shawarma" &&
      dish.arabicTitle === "\u0634\u0627\u0648\u0631\u0645\u0627 \u062f\u062c\u0627\u062c"
    )).toBe(true);

    expect(localizationService.getCookingVerbDictionary()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ english: "chop", arabic: "\u0641\u0631\u0645" }),
        expect.objectContaining({ english: "dice", arabic: "\u0642\u0637\u0639 \u0645\u0643\u0639\u0628\u0627\u062a" }),
        expect.objectContaining({ english: "marinate", arabic: "\u062a\u0628\u0644" }),
        expect.objectContaining({ english: "whisk", arabic: "\u0627\u062e\u0641\u0642" })
      ])
    );
    expect(localizationService.getMeasurementDictionary()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ english: "tsp", arabic: "\u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629" }),
        expect.objectContaining({ english: "kg", arabic: "\u0643\u064a\u0644\u0648\u062c\u0631\u0627\u0645" }),
        expect.objectContaining({ english: "ml", arabic: "\u0645\u0644" })
      ])
    );
    expect(localizationService.getKitchenEquipmentDictionary()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ english: "skillet", arabic: "\u0645\u0642\u0644\u0627\u0629" }),
        expect.objectContaining({ english: "cutting board", arabic: "\u0644\u0648\u062d \u062a\u0642\u0637\u064a\u0639" })
      ])
    );
  });

  it("normalizes known culinary wording deterministically", () => {
    const step = localizationService.normalizeCookingStep(
      "Chop chicken breast, saute in a skillet, then simmer with 1 cup rice.",
      "ar"
    );

    expect(step).toContain("\u0641\u0631\u0645");
    expect(step).toContain("\u062f\u062c\u0627\u062c");
    expect(step).toContain("\u0634\u0648\u062d");
    expect(step).toContain("\u0645\u0642\u0644\u0627\u0629");
    expect(step).toContain("\u0643\u0648\u0628");
    expect(step).not.toMatch(/\b(chop|chicken breast|saute|skillet|cup)\b/i);
  });

  it("rejects Arabic output that leaks approved English culinary terms", () => {
    const validation = localizationService.validateArabicText(
      "\u0634\u0648\u062d chicken breast \u0641\u064a skillet \u0645\u0639 1 cup \u0623\u0631\u0632",
      "steps.0"
    );

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.term)).toEqual(
      expect.arrayContaining(["chicken breast", "skillet", "cup"])
    );
  });

  it("post-processes recipes before they reach the UI", () => {
    const recipe: Recipe = {
      name: "Chicken Shawarma",
      cuisine: "Middle Eastern",
      ingredients: ["1 lb chicken breast", "2 cup rice"],
      missing_ingredients: ["1 tbsp olive oil"],
      steps: ["Marinate chicken breast, then grill in a grill pan."],
      calories: 520,
      protein: "35g",
      carbs: "48g",
      fat: "18g",
      cook_time: "30 mins",
      difficulty: "Easy"
    };

    const normalized = normalizeRecipeThroughLocalizationService(recipe, "ar");

    expect(normalized.name).toBe("\u0634\u0627\u0648\u0631\u0645\u0627 \u062f\u062c\u0627\u062c");
    expect(normalized.ingredients.join(" ")).toContain("\u062f\u062c\u0627\u062c");
    expect(normalized.missing_ingredients[0]).toContain("\u0645\u0644\u0639\u0642\u0629 \u0643\u0628\u064a\u0631\u0629");
    expect(normalized.steps[0]).toContain("\u062a\u0628\u0644");
    expect(normalized.steps[0]).toContain("\u0627\u0634\u0648");
    expect(validateArabicRecipeLocalization(normalized).valid).toBe(true);
  });

  it("keeps localized dish titles stable across repeated pipeline passes", () => {
    const once = localizationService.normalizeDishTitle("Baladi Hawawshi", "en");
    const twice = localizationService.normalizeDishTitle(once, "en");
    const threeTimes = localizationService.normalizeDishTitle(twice, "en");

    expect(once).toBe("Baladi Egyptian Hawawshi");
    expect(twice).toBe(once);
    expect(threeTimes).toBe(once);
  });
});

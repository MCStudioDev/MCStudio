import { describe, expect, it } from "vitest";
import { buildRecipeDisplayName, normalizeRecipeTitleEncoding } from "../lib/recipeDisplayNames";
import type { Recipe } from "../lib/types";

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    name: "Ful Medames",
    cuisine: "Egyptian",
    ingredients: ["1 cup fava beans"],
    missing_ingredients: ["1 tsp cumin"],
    steps: ["Simmer the fava beans until tender."],
    calories: 320,
    protein: "18g",
    carbs: "42g",
    fat: "8g",
    cook_time: "30 mins",
    difficulty: "Easy",
    ...overrides
  };
}

describe("buildRecipeDisplayName", () => {
  it("repairs common UTF-8 title corruption", () => {
    expect(normalizeRecipeTitleEncoding("Macaroni bÃ©chamel")).toBe("Macaroni bechamel");
  });

  it("localizes an English source title when the UI language is Arabic", () => {
    expect(buildRecipeDisplayName(recipe({}), "ar")).toBe("فول مدمس");
  });

  it("prefers a complete authored Arabic title over an English source title", () => {
    expect(buildRecipeDisplayName(recipe({
      localized: {
        Arabic: {
          name: "فول مدمس بالكمون والليمون",
          cuisine: "مصري",
          ingredients: ["كوب فول"],
          missing_ingredients: ["ملعقة صغيرة كمون"],
          steps: ["يُطهى الفول على نار هادئة حتى يصبح طرياً."],
          cook_time: "30 دقيقة",
          difficulty: "سهل"
        }
      }
    }), "Arabic")).toBe("فول مدمس بالكمون والليمون");
  });

  it("does not display malformed quantity-led Arabic titles", () => {
    const title = buildRecipeDisplayName(recipe({
      name: "4 مطبوخ وربع كوب طحينة",
      localized: {
        Arabic: {
          name: "فول بالطحينة والليمون",
          cuisine: "مصري",
          ingredients: ["كوب فول"],
          missing_ingredients: ["ربع كوب طحينة"],
          steps: ["اخلط الفول مع الطحينة والليمون."],
          cook_time: "20 دقيقة",
          difficulty: "سهل"
        }
      }
    }), "ar");

    expect(title).toBe("فول بالطحينة والليمون");
  });
});

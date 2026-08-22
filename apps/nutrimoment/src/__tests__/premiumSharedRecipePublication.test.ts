import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import { buildPremiumSharedRecipePublicationDocument } from "../services/userRecipeCacheService";

function premiumRecipe(name: string, localizedName: string): Recipe {
  return {
    id: "premium-kofta-patties",
    name,
    cuisine: "Egyptian",
    ingredients: ["1 lb ground beef"],
    missing_ingredients: ["1 onion", "1/4 cup parsley", "1 tsp cumin", "salt"],
    steps: [
      "Mix the beef, onion, parsley, and cumin for 2 minutes.",
      "Shape 8 patties and cook them over medium heat for 5 minutes per side.",
      "Rest for 3 minutes and serve hot."
    ],
    calories: 450,
    protein: "35g",
    carbs: "10g",
    fat: "25g",
    cook_time: "25 minutes",
    difficulty: "Easy",
    acceptance_score: 80,
    localized: {
      English: {
        name: localizedName,
        cuisine: "Egyptian",
        dish_identity: localizedName,
        ingredients: ["1 lb ground beef"],
        missing_ingredients: ["1 onion", "1/4 cup parsley", "1 tsp cumin", "salt"],
        steps: [
          "Mix the beef, onion, parsley, and cumin for 2 minutes.",
          "Shape 8 patties and cook them over medium heat for 5 minutes per side.",
          "Rest for 3 minutes and serve hot."
        ],
        calories: 450,
        protein: "35g",
        carbs: "10g",
        fat: "25g",
        cook_time: "25 minutes",
        difficulty: "Easy"
      }
    }
  };
}

describe("Premium shared recipe publication", () => {
  it("keeps the accepted card title authoritative over broader localized metadata", async () => {
    const result = await buildPremiumSharedRecipePublicationDocument({
      acceptedAt: 123456,
      recipe: premiumRecipe("Kofta Patties", "Kofta"),
      sourceLanguage: "English"
    });

    expect(result.rejection).toBeUndefined();
    expect(result.document?.title).toBe("Kofta Patties");
    expect(result.document?.localized?.English?.name).toBe("Kofta Patties");
    expect(result.document?.sharedIdentityKey).toContain("kofta-patties");
  });
});

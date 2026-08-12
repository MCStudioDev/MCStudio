import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import { buildPreferenceProfile } from "../lib/preferences";
import { rankRecipes } from "../services/rankingService";

const chickenRecipe = {
  allergenTags: [],
  calories: 420,
  carbs: 24,
  dietTags: [],
  fat: 18,
  id: "test-chicken-cacciatore",
  ingredientCanonicals: ["chicken", "tomato", "onion"],
  mealType: "dinner",
  optionalCanonicals: ["tomato", "onion"],
  popularityScore: 80,
  protein: 34,
  qualityScore: 80,
  requiredCanonicals: ["chicken"],
  title: "Chicken Cacciatore"
} as RecipeCatalogDoc;

describe("recipe ranking service", () => {
  it("keeps diet-mismatched source recipes ranked instead of hard-rejecting them", () => {
    const preferences = buildPreferenceProfile({
      allergens: [],
      calorieTarget: 1650,
      conditions: [],
      diets: ["vegetarian"],
      preferredCuisine: "Any"
    });

    const ranked = rankRecipes({
      maxCalories: preferences.nutritionGoals.maxCalories,
      normalizedIngredients: ["chicken"],
      preferences,
      preferredCuisine: "Any",
      recipes: [chickenRecipe]
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.recipeId).toBe(chickenRecipe.id);
  });

  it("still excludes an allergen conflict from retrieval", () => {
    const preferences = buildPreferenceProfile({
      allergens: ["milk"],
      calorieTarget: 1650,
      conditions: [],
      diets: [],
      preferredCuisine: "Any"
    });
    const dairyChicken = { ...chickenRecipe, allergenTags: ["milk"] };

    const ranked = rankRecipes({
      maxCalories: preferences.nutritionGoals.maxCalories,
      normalizedIngredients: ["chicken"],
      preferences,
      preferredCuisine: "Any",
      recipes: [dairyChicken]
    });

    expect(ranked).toHaveLength(0);
  });

  it("prefers a verified curated source over an otherwise equal generic import", () => {
    const preferences = buildPreferenceProfile({
      allergens: [],
      calorieTarget: 2000,
      conditions: [],
      diets: [],
      preferredCuisine: "Middle Eastern"
    });
    const generic = {
      ...chickenRecipe,
      cuisine: "Middle Eastern",
      id: "generic-lamb-dish",
      ingredientCanonicals: ["lamb", "onion"],
      optionalCanonicals: ["onion"],
      requiredCanonicals: ["lamb"],
      source: { provider: "generic-import", url: "https://example.com/lamb" },
      title: "Lamb Dinner"
    } as RecipeCatalogDoc;
    const curated = {
      ...generic,
      id: "trusted-source-middle-eastern-lamb-kabsa",
      source: { provider: "simply-lebanese", url: "https://example.com/kabsa" },
      title: "Lamb Kabsa"
    } as RecipeCatalogDoc;

    const ranked = rankRecipes({
      normalizedIngredients: ["lamb"],
      preferences,
      preferredCuisine: "Middle Eastern",
      recipes: [generic, curated]
    });

    expect(ranked.map((item) => item.recipeId)).toEqual([curated.id, generic.id]);
  });
});

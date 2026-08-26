import { describe, expect, it } from "vitest";
import { normalizeMealPlanData } from "@/lib/mealPlan";

describe("meal plan normalization", () => {
  it("assigns the same recipe provenance contract used by recipe generation", () => {
    const generatedMeal = {
      name: "Ful Medames with Vegetables",
      calories: 420,
      protein: "18g",
      carbs: "58g",
      fat: "12g"
    };
    const libraryMeal = {
      ...generatedMeal,
      name: "Koshary",
      source_recipe_id: "shared-koshary-v2"
    };

    const result = normalizeMealPlanData({
      plan: [{ day: "Monday", breakfast: generatedMeal, lunch: libraryMeal, dinner: generatedMeal }],
      shoppingList: []
    });

    expect(result?.plan[0].breakfast.recipe_source_type).toBe("generated");
    expect(result?.plan[0].lunch.recipe_source_type).toBe("local_database");
  });

  it("preserves validated recipe and photo identity fields", () => {
    const meal = {
      name: "Chickpea Tomato Stew",
      cuisine: "Mediterranean",
      recipe_source_type: "local_database",
      source_recipe_id: "chickpea-tomato-stew",
      meal_type: "dinner",
      calories: 450,
      protein: "18g",
      carbs: "62g",
      fat: "14g",
      ingredients: ["1 cup chickpeas", "1 cup tomato"],
      steps: ["Simmer 1 cup chickpeas with 1 cup tomato for 20 minutes until thick."],
      cook_time: "25 minutes",
      difficulty: "Easy",
      image_url: "https://storage.googleapis.com/nutrimoment/recipe-photo-cache/chickpea-stew.webp",
      image_source: "shared_pool",
      photo_asset: {
        url: "https://storage.googleapis.com/nutrimoment/recipe-photo-cache/chickpea-stew.webp",
        source: "shared_pool",
        dietTags: ["vegan"],
        status: "ready",
        validatedAt: 1234,
        validatorHash: "validator-v1"
      },
      photo_identity: {
        dish_slug: "chickpea-tomato-stew",
        english_name: "Chickpea Tomato Stew"
      }
    };

    const result = normalizeMealPlanData({
      plan: [{ day: "Monday", breakfast: meal, lunch: meal, dinner: meal }],
      shoppingList: []
    });

    expect(result?.plan[0].dinner).toMatchObject({
      cook_time: "25 minutes",
      difficulty: "Easy",
      meal_type: "dinner",
      recipe_source_type: "local_database",
      source_recipe_id: "chickpea-tomato-stew",
      image_source: "shared_pool",
      photo_asset: {
        status: "ready",
        source: "shared_pool",
        dietTags: ["vegan"],
        validatorHash: "validator-v1"
      },
      photo_identity: {
        dish_slug: "chickpea-tomato-stew"
      }
    });
  });

  it("preserves the action grant that completes images after navigation", () => {
    const meal = {
      name: "Menemen",
      calories: 250,
      protein: "15g",
      carbs: "12g",
      fat: "16g"
    };

    const result = normalizeMealPlanData({
      imageActionGrantId: "weekly-plan-final-credit",
      plan: [{ day: "Monday", breakfast: meal, lunch: meal, dinner: meal }],
      shoppingList: []
    });

    expect(result?.imageActionGrantId).toBe("weekly-plan-final-credit");
  });
});

import { describe, expect, it } from "vitest";
import { findRecipeDietViolation } from "../lib/dietEnforcement";
import type { Recipe } from "../lib/types";
import { repairScanRecipesWithGuard } from "../services/scanRecipeGuardService";

describe("scan recipe guard service", () => {
  it("repairs the gamal.mina2013 free scan case by prioritizing scanned shrimp and rice", () => {
    const repaired = repairScanRecipesWithGuard(buildBadFreeScanRecipes(), {
      allergens: [],
      calorieTarget: 1650,
      conditions: ["weightLoss"],
      diets: ["pescatarian", "dairyFree"],
      inputIngredients: ["رز", "shrimp"],
      preferredCuisine: "Egyptian",
      recipeCount: 10,
      recipeLanguage: "Arabic",
      scoringIngredients: ["رز", "rice", "shrimp"]
    });

    expect(repaired).toHaveLength(10);
    expect(repaired.filter((recipe) => /جمبري|shrimp/i.test(JSON.stringify(recipe))).length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(repaired)).not.toMatch(/\beggs?\b|بيض|omelette|shakshuka|cheese|cream|butter|yogurt/i);
    expect(repaired.map((recipe) => findRecipeDietViolation(recipe, { diets: ["pescatarian", "dairyFree"], allergens: [] }))).toEqual(
      Array(10).fill(null)
    );
    expect(repaired.some((recipe) => /توفو|tofu/i.test(recipe.name))).toBe(false);
    expect(
      repaired.some((recipe) =>
        recipe.missing_ingredients.some((ingredient) => /رز|أرز|rice/i.test(ingredient))
      )
    ).toBe(false);
  });
});

function buildBadFreeScanRecipes(): Recipe[] {
  return [
    recipe("أرز بعدس على الطريقة الشرقية", "شرق أوسطي", [], ["أرز", "عدس", "بصل", "زيت زيتون"]),
    recipe("توفو وبروكلي سوتيه", "آسيوي", [], ["توفو", "بروكلي", "أرز", "ثوم"]),
    recipe("طبق أرز وحمص متوسطي", "متوسطي", [], ["حمص", "أرز", "خيار", "طماطم", "زيت زيتون"]),
    recipe("طاجن حمص وطماطم مصري", "مصري", [], ["حمص", "طماطم", "بصل", "ثوم", "أرز"]),
    recipe("وعاء أرز وعدس مستوحى من الكشري", "مصري", [], ["أرز", "عدس", "مكرونة", "طماطم", "بصل", "حمص"]),
    recipe("رز مقلاة", "مصري", ["رز"], ["بصل", "ثوم", "طماطم", "زيت زيتون"])
  ];
}

function recipe(name: string, cuisine: string, ingredients: string[], missing_ingredients: string[]): Recipe {
  return {
    name,
    cuisine,
    ingredients,
    missing_ingredients,
    steps: ["Cook and serve."],
    calories: 420,
    protein: "20g",
    carbs: "55g",
    fat: "12g",
    cook_time: "30 mins",
    difficulty: "Easy",
    preference_hits: []
  };
}

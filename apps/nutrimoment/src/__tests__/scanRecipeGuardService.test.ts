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
    expect(repaired.some((recipe) => /salmon|fish|tilapia|سلمون|سمك|بلطي/i.test(JSON.stringify(recipe)))).toBe(true);
    expect(new Set(repaired.map((recipe) => recipe.image_search_index)).size).toBeGreaterThanOrEqual(8);
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

  it("does not inject seafood fallback cards for vegan vegetarian dairy-free scans", () => {
    const repaired = repairScanRecipesWithGuard(buildBadFreeScanRecipes(), {
      allergens: [],
      calorieTarget: 1650,
      conditions: ["weightLoss", "highCholesterol", "highBloodPressure"],
      diets: ["vegetarian", "vegan", "dairyFree"],
      inputIngredients: ["rice"],
      preferredCuisine: "Egyptian",
      recipeCount: 10,
      recipeLanguage: "Arabic",
      scoringIngredients: ["rice", "shrimp"]
    });

    expect(JSON.stringify(repaired)).not.toMatch(/shrimp|salmon|fish|tilapia|seafood|Ø¬Ù…Ø¨Ø±ÙŠ|Ø³Ù…Ùƒ|Ø³Ù„Ù…ÙˆÙ†|Ø¨Ù„Ø·ÙŠ/i);
    expect(repaired.map((recipe) => findRecipeDietViolation(recipe, { diets: ["vegetarian", "vegan", "dairyFree"], allergens: [] }))).toEqual(
      Array(repaired.length).fill(null)
    );
  });

  it("can use scanned seafood for non-vegetarian users even when pescatarian is not selected", () => {
    const repaired = repairScanRecipesWithGuard(buildBadFreeScanRecipes(), {
      allergens: [],
      calorieTarget: 1650,
      conditions: ["weightLoss"],
      diets: ["dairyFree"],
      inputIngredients: ["rice", "shrimp"],
      preferredCuisine: "Egyptian",
      recipeCount: 10,
      recipeLanguage: "Arabic",
      scoringIngredients: ["rice", "shrimp"]
    });

    expect(JSON.stringify(repaired)).toMatch(/shrimp|seafood|Ø¬Ù…Ø¨Ø±ÙŠ/i);
    expect(repaired.map((recipe) => findRecipeDietViolation(recipe, { diets: ["dairyFree"], allergens: [] }))).toEqual(
      Array(repaired.length).fill(null)
    );
  });
});

it("fills ordinary multi-ingredient free scans to the requested card count", () => {
  const repaired = repairScanRecipesWithGuard(buildSparseChristineStyleScanRecipes(), {
    allergens: [],
    calorieTarget: 2000,
    conditions: ["cholesterol", "highBloodPressure"],
    diets: [],
    inputIngredients: ["lentils", "pasta", "rice", "tomato", "onion"],
    preferredCuisine: "Any",
    recipeCount: 10,
    recipeLanguage: "English",
    scoringIngredients: ["lentils", "pasta", "rice", "tomato", "onion"]
  });

  expect(repaired).toHaveLength(10);
  expect(new Set(repaired.map((recipe) => recipe.image_search_index).filter(Boolean)).size).toBeGreaterThanOrEqual(6);
  const visibleRecipeText = JSON.stringify(
    repaired.map((recipe) => ({
      ingredients: recipe.ingredients,
      missing_ingredients: recipe.missing_ingredients,
      name: recipe.name,
      steps: recipe.steps
    }))
  );
  expect(visibleRecipeText).not.toMatch(/\beggs?\b|cheese|cream|butter|sausage|bacon/i);
  expect(
    repaired.filter((recipe) =>
      recipe.ingredients.some((ingredient) => /lentil|pasta|rice|tomato|onion/i.test(ingredient))
    ).length
  ).toBeGreaterThanOrEqual(8);
});

it("builds healthy varied fallback cards across seafood dairy produce fruit and grains", () => {
  const repaired = repairScanRecipesWithGuard([], {
    allergens: [],
    calorieTarget: 2000,
    conditions: ["cholesterol", "highBloodPressure"],
    diets: [],
    inputIngredients: ["fish", "shrimp", "yogurt", "spinach", "apple", "oats"],
    preferredCuisine: "Any",
    recipeCount: 10,
    recipeLanguage: "English",
    scoringIngredients: ["fish", "shrimp", "yogurt", "spinach", "apple", "oats"]
  });

  expect(repaired).toHaveLength(10);
  const names = repaired.map((recipe) => recipe.name).join(" ");
  expect(names).toMatch(/Grilled|Baked|Stew|Soup/);
  expect(names).toMatch(/Yogurt|Oat|Grain|Tray|Bowl/);
  const visibleRecipeText = JSON.stringify(
    repaired.map((recipe) => ({
      ingredients: recipe.ingredients,
      missing_ingredients: recipe.missing_ingredients,
      name: recipe.name,
      steps: recipe.steps
    }))
  );
  expect(visibleRecipeText).not.toMatch(/cream sauce|butter|deep fried|sausage|bacon/i);
});

it("creates healthy method variety for meat chicken bread and onion", () => {
  const repaired = repairScanRecipesWithGuard([], {
    allergens: [],
    calorieTarget: 2000,
    conditions: ["cholesterol", "highBloodPressure"],
    diets: [],
    inputIngredients: ["meat", "chicken", "bread", "onion"],
    preferredCuisine: "Any",
    recipeCount: 10,
    recipeLanguage: "English",
    scoringIngredients: ["meat", "chicken", "bread", "onion"]
  });

  expect(repaired).toHaveLength(10);
  const names = repaired.map((recipe) => recipe.name).join(" ");
  expect(names).toMatch(/Shawarma-Style|Grilled|BBQ-Style|Smoked-Paprika|Stew|Soup|Baked/);
  expect(repaired.some((recipe) => /Chicken/i.test(recipe.name))).toBe(true);
  expect(repaired.some((recipe) => /Meat/i.test(recipe.name))).toBe(true);
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

function buildSparseChristineStyleScanRecipes(): Recipe[] {
  return [
    recipe("Egyptian lentil tomato soup", "Egyptian", ["lentils", "tomato", "onion"], ["garlic", "cumin"]),
    recipe("Koshary-inspired rice lentil bowl", "Egyptian", ["rice", "lentils", "tomato", "onion"], ["chickpeas"]),
    recipe("Middle Eastern lentil rice", "Middle Eastern", ["rice", "lentils", "onion"], ["parsley"]),
    recipe("Tomato pasta with onions", "Italian", ["pasta", "tomato", "onion"], ["garlic", "basil"])
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

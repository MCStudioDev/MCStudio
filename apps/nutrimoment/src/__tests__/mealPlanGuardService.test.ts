import { describe, expect, it } from "vitest";
import type { MealPlanData, MealPlanMeal } from "../lib/types";
import {
  repairMealPlanWithGuard,
  validateMealPlan
} from "../services/mealPlanGuardService";

const MINA_PREFERENCES = {
  dietContext: {
    diets: ["dairyFree", "pescatarian"],
    allergens: []
  },
  preferredCuisine: "Mexican",
  maxMealRepeatCount: 2,
  minUniqueMeals: 15,
  minPescatarianSeafoodSlots: 6
};

describe("meal plan guard service", () => {
  it("detects Mina-style weekly plan failures before the plan is returned", () => {
    const issues = validateMealPlan(buildBadMinaStylePlan(), MINA_PREFERENCES);

    expect(issues.some((issue) => issue.kind === "seafoodQuota")).toBe(true);
    expect(issues.some((issue) => issue.kind === "repeat" && issue.name === "سلطة أرز بالحمص")).toBe(true);
    expect(issues.some((issue) => issue.kind === "cuisine")).toBe(true);
    expect(issues.some((issue) => issue.kind === "diet")).toBe(false);
  });

  it("repairs seafood quota, Mexican identity, and repetition with deterministic fallback meals", () => {
    const result = repairMealPlanWithGuard(buildBadMinaStylePlan(), MINA_PREFERENCES);

    expect(result.repairedSlots).toBeGreaterThan(0);
    expect(result.finalIssues).toEqual([]);
    expect(validateMealPlan(result.mealPlan, MINA_PREFERENCES)).toEqual([]);
    expect(JSON.stringify(result.mealPlan)).not.toMatch(/\beggs?\b|بيض|شكشوكة|omelette|frittata/i);
  });

  it("replaces malformed weekly plans with a complete guarded fallback plan", () => {
    const result = repairMealPlanWithGuard({ plan: [], shoppingList: [] }, MINA_PREFERENCES);

    expect(result.mealPlan.plan).toHaveLength(7);
    expect(result.mealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner])).toHaveLength(21);
    expect(result.finalIssues).toEqual([]);
  });

  it("repairs Mina vegan dairy-free weekly plans without fish or shrimp fallbacks", () => {
    const result = repairMealPlanWithGuard(buildFishyVeganPlan(), {
      dietContext: {
        diets: ["dairyFree", "vegan"],
        allergens: []
      },
      preferredCuisine: "Middle Eastern",
      maxMealRepeatCount: 2,
      minUniqueMeals: 15,
      minPescatarianSeafoodSlots: 6
    });

    expect(result.repairedSlots).toBeGreaterThan(0);
    expect(result.finalIssues).toEqual([]);
    expect(JSON.stringify(result.mealPlan)).not.toMatch(/fish|shrimp|salmon|tuna|tilapia|سمك|جمبري/i);
  });

  it("lets vegan override pescatarian seafood quota when both diet flags are present", () => {
    const result = repairMealPlanWithGuard(buildFishyVeganPlan(), {
      dietContext: {
        diets: ["vegan", "pescatarian", "dairyFree"],
        allergens: []
      },
      preferredCuisine: "Middle Eastern",
      maxMealRepeatCount: 2,
      minUniqueMeals: 15,
      minPescatarianSeafoodSlots: 6
    });

    expect(result.finalIssues).toEqual([]);
    expect(JSON.stringify(result.mealPlan)).not.toMatch(/fish|shrimp|salmon|tuna|tilapia|سمك|جمبري/i);
  });
  it("repairs Arabic vegan dairy-free plans containing chicken, ground meat, and eggs", () => {
    const preferences = {
      dietContext: {
        diets: ["vegan", "vegetarian", "dairyFree"],
        allergens: []
      },
      preferredCuisine: "Any",
      maxMealRepeatCount: 2,
      minUniqueMeals: 15,
      minPescatarianSeafoodSlots: 6
    };
    const initialIssues = validateMealPlan(buildUnsafeArabicVeganPlan(), preferences);

    expect(initialIssues.some((issue) => issue.kind === "diet")).toBe(true);

    const result = repairMealPlanWithGuard(buildUnsafeArabicVeganPlan(), preferences);

    expect(result.repairedSlots).toBeGreaterThan(0);
    expect(result.finalIssues).toEqual([]);
    expect(JSON.stringify(result.mealPlan)).not.toMatch(/دجاج|لحم|مفروم|بيض|فريتاتا|\b(chicken|beef|meat|eggs?)\b/i);
  });

  it("repairs plant-based plans that over-repeat rice and legumes", () => {
    const preferences = {
      dietContext: {
        diets: ["vegan", "vegetarian", "dairyFree"],
        allergens: []
      },
      preferredCuisine: "Any",
      maxMealRepeatCount: 2,
      minUniqueMeals: 15,
      minPescatarianSeafoodSlots: 6
    };
    const initialIssues = validateMealPlan(buildRiceLegumeClusterPlan(), preferences);

    expect(initialIssues).toContainEqual({ kind: "ingredientCluster", ingredient: "rice", actual: 21, allowed: 7 });
    expect(initialIssues).toContainEqual({ kind: "ingredientCluster", ingredient: "legume", actual: 21, allowed: 9 });

    const result = repairMealPlanWithGuard(buildRiceLegumeClusterPlan(), preferences);
    const finalIssues = validateMealPlan(result.mealPlan, preferences);

    expect(result.repairedSlots).toBeGreaterThan(0);
    expect(finalIssues.filter((issue) => issue.kind === "ingredientCluster")).toEqual([]);
  });
});

function buildBadMinaStylePlan(): MealPlanData {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    plan: days.map((day, index) => ({
      day,
      breakfast:
        index < 3
          ? meal("وعاء كينوا بالتوت", "Mexican", ["كينوا", "توت مشكل", "بذور شيا"])
          : meal("مصري إفطار فول مع طماطم", "Egyptian", ["فول", "طماطم", "بصل", "زيت زيتون"]),
      lunch: meal("سلطة أرز بالحمص", "Mexican", ["حمص", "أرز", "خيار", "طماطم"]),
      dinner:
        index < 4
          ? meal("يخنة عدس بالخضار مع الأرز", "Mexican", ["عدس", "أرز", "جزر", "طماطم"])
          : meal("توفو وبروكلي سوتيه", "Asian", ["توفو", "بروكلي", "أرز", "ثوم"])
    })),
    shoppingList: []
  };
}

function buildFishyVeganPlan(): MealPlanData {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    plan: days.map((day, index) => ({
      day,
      breakfast: meal(`Ful tomato bowl ${index + 1}`, "Middle Eastern", ["fava beans", "tomato", "cucumber", "lemon"]),
      lunch:
        index < 3
          ? meal(`Fish lunch ${index + 1}`, "Middle Eastern", ["white fish", "rice", "tomato", "lemon"])
          : meal(`Lentil rice lunch ${index + 1}`, "Middle Eastern", ["lentils", "rice", "tomato", "parsley"]),
      dinner:
        index < 2
          ? meal(`Shrimp dinner ${index + 1}`, "Middle Eastern", ["shrimp", "rice", "zucchini", "tomato"])
          : meal(`Chickpea stew dinner ${index + 1}`, "Middle Eastern", ["chickpeas", "rice", "onion", "garlic"])
    })),
    shoppingList: []
  };
}

function buildUnsafeArabicVeganPlan(): MealPlanData {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    plan: days.map((day, index) => ({
      day,
      breakfast:
        index % 2 === 0
          ? meal("\u0641\u0631\u064a\u062a\u0627\u062a\u0627 \u0628\u0627\u0644\u0633\u0628\u0627\u0646\u062e \u0648\u0627\u0644\u0628\u064a\u0636", "Italian", ["\u0628\u064a\u0636", "\u0633\u0628\u0627\u0646\u062e", "\u0632\u064a\u062a \u0632\u064a\u062a\u0648\u0646"])
          : meal("\u0641\u0648\u0644 \u0645\u062f\u0645\u0633 \u0628\u0627\u0644\u0637\u0645\u0627\u0637\u0645", "Egyptian", ["\u0641\u0648\u0644", "\u0637\u0645\u0627\u0637\u0645", "\u0628\u0635\u0644"]),
      lunch:
        index % 2 === 0
          ? meal("\u0633\u0644\u0637\u0629 \u062f\u062c\u0627\u062c \u0645\u0634\u0648\u064a \u0628\u0627\u0644\u0644\u064a\u0645\u0648\u0646", "Mediterranean", ["\u062f\u062c\u0627\u062c", "\u0644\u064a\u0645\u0648\u0646", "\u062e\u0633"])
          : meal("\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0627\u0644\u0644\u062d\u0645 \u0627\u0644\u0645\u0641\u0631\u0648\u0645", "Italian", ["\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645", "\u0645\u0643\u0631\u0648\u0646\u0629", "\u0637\u0645\u0627\u0637\u0645"]),
      dinner: meal(`\u064a\u062e\u0646\u0629 \u0639\u062f\u0633 \u0628\u0627\u0644\u062e\u0636\u0627\u0631 ${index + 1}`, "Middle Eastern", ["\u0639\u062f\u0633", "\u062e\u0636\u0627\u0631", "\u0623\u0631\u0632"])
    })),
    shoppingList: []
  };
}

function buildRiceLegumeClusterPlan(): MealPlanData {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    plan: days.map((day, index) => ({
      day,
      breakfast: meal(`Lentil rice breakfast ${index + 1}`, "Middle Eastern", ["lentils", "rice", "tomato"]),
      lunch: meal(`Chickpea rice lunch ${index + 1}`, "Middle Eastern", ["chickpeas", "rice", "cucumber"]),
      dinner: meal(`Bean rice dinner ${index + 1}`, "Middle Eastern", ["white beans", "rice", "tomato"])
    })),
    shoppingList: []
  };
}

function meal(name: string, cuisine: string, ingredients: string[]): MealPlanMeal {
  return {
    name,
    cuisine,
    calories: 450,
    protein: "20g",
    carbs: "55g",
    fat: "14g",
    ingredients,
    steps: ["Cook and serve."]
  };
}

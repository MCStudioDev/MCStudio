import { describe, expect, it } from "vitest";
import type { MealPlanData, MealPlanMeal } from "@/lib/types";
import {
  alignMealPlanWithRecipeContracts,
  buildValidatedRepeatFallbackPlan,
  evaluateMealPlanMealRecipeContract,
  summarizeMealPlanRepeatUsage,
  validateMealPlanRecipeContracts
} from "@/services/mealPlanRecipeContractService";

const OPTIONS = {
  dietContext: { diets: ["vegan"], allergens: [] },
  preferredCuisine: "Mediterranean",
  recipeLanguage: "English"
};

describe("meal plan recipe contract service", () => {
  it("rejects three copies of a dish and same-day aliases even within the similarity allowance", () => {
    const plan = invalidPlan();
    plan.plan.forEach((day, index) => {
      for (const slot of ["breakfast", "lunch", "dinner"] as const) day[slot] = validMeal(`Distinct ${slot} ${index}`, slot);
    });
    plan.plan[1].breakfast = plan.plan[0].breakfast;
    plan.plan[2].breakfast = plan.plan[0].breakfast;
    expect(validateMealPlanRecipeContracts(plan, { ...OPTIONS, maxSimilarMealSlots: 2 })
      .some(issue => issue.reasons.includes("meal_reuse_limit_exceeded"))).toBe(true);
    plan.plan[1].breakfast = validMeal("Different breakfast", "breakfast");
    plan.plan[2].breakfast = validMeal("Another breakfast", "breakfast");
    plan.plan[0].lunch = { ...plan.plan[0].breakfast, name: "Renamed plate", meal_type: "lunch" };
    expect(validateMealPlanRecipeContracts(plan, { ...OPTIONS, maxSimilarMealSlots: 2 })
      .some(issue => issue.reasons.includes("same_day_duplicate_dish"))).toBe(true);
  });
  it("fills a refreshed week with unseen safe meals before recent cached dishes", () => {
    const old = Array.from({ length: 21 }, (_, i) => validMeal(`Earlier Chickpea Stew ${i}`, ["breakfast", "lunch", "dinner"][i % 3] as MealPlanMeal["meal_type"]));
    const fresh = Array.from({ length: 21 }, (_, i) => validMeal(`Unseen Chickpea Stew ${i}`, ["breakfast", "lunch", "dinner"][i % 3] as MealPlanMeal["meal_type"]));
    const result = buildValidatedRepeatFallbackPlan(invalidPlan(), { ...OPTIONS, candidateMeals: [...old, ...fresh],
      maxSimilarMealSlots: 2, lastShownAt: meal => meal.name.startsWith("Earlier") ? 1000 : 0 });
    expect(result.mealPlan).not.toBeNull(); expect(result.repeatedSlots).toBe(0);
    expect(result.mealPlan!.plan.flatMap(day => [day.breakfast, day.lunch, day.dinner]).every(meal => meal.name.startsWith("Unseen"))).toBe(true);
  });
  it("cannot disguise an insufficient pool with two names sharing a photo dish identity", () => {
    const candidates = Array.from({ length: 18 }, (_, i) => validMeal(`Chickpea Stew ${i}`));
    candidates[0].photo_identity = { dish_slug: "vegetable-tacos", english_name: "Vegetable Tacos" } as MealPlanMeal["photo_identity"];
    const alias = { ...validMeal("Roasted Vegetable Tacos"), photo_identity: candidates[0].photo_identity };
    const result = buildValidatedRepeatFallbackPlan(invalidPlan(), { ...OPTIONS, candidateMeals: [...candidates, alias], maxSimilarMealSlots: 2 });
    expect(result.mealPlan).toBeNull(); expect(result.uniqueMealCount).toBe(18);
  });
  it("rejects a thin meal that recipe generation would not accept", () => {
    const result = evaluateMealPlanMealRecipeContract({
      name: "Chicken",
      cuisine: "Mediterranean",
      calories: 0,
      protein: "0g",
      carbs: "0g",
      fat: "0g",
      ingredients: ["chicken"],
      steps: ["Cook and serve."]
    }, "English");

    expect(result.accepted).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "ingredient_only_title",
      "missing_instructions",
      "missing_required_fields"
    ]));
  });

  it("accepts a complete meal using the recipe quality and acceptance engines", () => {
    expect(evaluateMealPlanMealRecipeContract(validMeal("Chickpea Tomato Stew"), "English").accepted).toBe(true);
  });

  it("rejects egg meals from dairy-free weekly plans", () => {
    const eggBreakfast: MealPlanMeal = {
      ...validMeal("Vegetable Omelette", "breakfast"),
      ingredients: ["2 whole eggs", "1 cup spinach", "1 tbsp olive oil"],
      steps: [
        "Warm 1 tbsp olive oil in a skillet over medium heat for 2 minutes.",
        "Add 1 cup spinach and cook for 3 minutes until wilted.",
        "Whisk 2 whole eggs, pour them into the skillet, and cook for 5 minutes until set."
      ]
    };
    const plan: MealPlanData = {
      plan: [{
        day: "Monday",
        breakfast: eggBreakfast,
        lunch: validMeal("Chickpea Tomato Lunch", "lunch"),
        dinner: validMeal("Chickpea Tomato Dinner", "dinner")
      }],
      shoppingList: []
    };

    const issues = validateMealPlanRecipeContracts(plan, {
      ...OPTIONS,
      dietContext: { diets: ["dairyFree"], allergens: [] }
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slot: "breakfast",
        reasons: expect.arrayContaining(["diet:diet:egg"])
      })
    ]));
  });

  it("replaces invalid weekly slots with validated compatible recipe meals", () => {
    const invalid = thinMeal();
    const plan: MealPlanData = {
      plan: Array.from({ length: 7 }, (_, index) => ({
        day: `Day ${index + 1}`,
        breakfast: { ...invalid, name: `Invalid breakfast ${index + 1}` },
        lunch: { ...invalid, name: `Invalid lunch ${index + 1}` },
        dinner: { ...invalid, name: `Invalid dinner ${index + 1}` }
      })),
      shoppingList: []
    };
    const replacements = Array.from({ length: 21 }, (_, index) =>
      validMeal(`Mediterranean Chickpea Stew ${index + 1}`, index % 3 === 0 ? "breakfast" : index % 3 === 1 ? "lunch" : "dinner")
    );

    const result = alignMealPlanWithRecipeContracts(plan, {
      ...OPTIONS,
      maxMealReuse: 1,
      replacementMeals: replacements
    });

    expect(result.replacedSlots).toBe(21);
    expect(result.issuesAfter).toEqual([]);
    expect(validateMealPlanRecipeContracts(result.mealPlan, OPTIONS)).toEqual([]);
  });

  it("fills a weekly plan from 19 validated meals using only two repeated slots", () => {
    const template = invalidPlan();
    const candidates = Array.from({ length: 19 }, (_, index) =>
      validMeal(`Mediterranean Pantry Meal ${index + 1}`, index % 3 === 0 ? "breakfast" : index % 3 === 1 ? "lunch" : "dinner")
    );

    const result = buildValidatedRepeatFallbackPlan(template, {
      ...OPTIONS,
      candidateMeals: candidates,
      maxSimilarMealSlots: 2
    });

    expect(result.mealPlan).not.toBeNull();
    expect(result.uniqueMealCount).toBe(19);
    expect(result.repeatedSlots).toBe(2);
    expect(result.issues).toEqual([]);
    expect(summarizeMealPlanRepeatUsage(result.mealPlan!)).toEqual({
      repeatedSlots: 2,
      uniqueMealCount: 19
    });
    expect(validateMealPlanRecipeContracts(result.mealPlan!, {
      ...OPTIONS,
      maxSimilarMealSlots: 2
    })).toEqual([]);
  });

  it("refuses to exceed the two-slot repeat allowance when only 18 meals validate", () => {
    const candidates = Array.from({ length: 18 }, (_, index) =>
      validMeal(`Mediterranean Limited Meal ${index + 1}`)
    );

    const result = buildValidatedRepeatFallbackPlan(invalidPlan(), {
      ...OPTIONS,
      candidateMeals: candidates,
      maxSimilarMealSlots: 2
    });

    expect(result.mealPlan).toBeNull();
    expect(result.uniqueMealCount).toBe(18);
  });
});

function invalidPlan(): MealPlanData {
  const invalid = thinMeal();
  return {
    plan: Array.from({ length: 7 }, (_, index) => ({
      day: `Day ${index + 1}`,
      breakfast: { ...invalid, name: `Invalid breakfast ${index + 1}` },
      lunch: { ...invalid, name: `Invalid lunch ${index + 1}` },
      dinner: { ...invalid, name: `Invalid dinner ${index + 1}` }
    })),
    shoppingList: []
  };
}

function thinMeal(): MealPlanMeal {
  return {
    name: "Flexible meal",
    cuisine: "Mediterranean",
    calories: 0,
    protein: "0g",
    carbs: "0g",
    fat: "0g",
    ingredients: [],
    steps: []
  };
}

function validMeal(name: string, mealType: MealPlanMeal["meal_type"] = "dinner"): MealPlanMeal {
  return {
    name,
    cuisine: "Mediterranean",
    recipe_source_type: "local_database",
    source_recipe_id: `source-${name.toLowerCase().replace(/\s+/g, "-")}`,
    meal_type: mealType,
    calories: 450,
    protein: "18g",
    carbs: "62g",
    fat: "14g",
    ingredients: ["1 cup chickpeas", "1 cup tomato", "1 tbsp olive oil"],
    steps: [
      "Warm 1 tbsp olive oil in a pot over medium heat for 2 minutes until shimmering.",
      "Add 1 cup tomato and simmer for 8 minutes until the sauce thickens.",
      "Stir in 1 cup chickpeas and cook for 12 minutes until tender and evenly coated."
    ],
    cook_time: "25 minutes",
    difficulty: "Easy"
  };
}

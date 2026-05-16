import { describe, expect, it } from "vitest";
import { localizeMealForArabic, localizeMealPlanForArabic } from "../lib/arabicRecipeLocalization";
import type { MealPlanData } from "../lib/types";

describe("Arabic meal localization", () => {
  it("translates guarded Mexican pescatarian fallback meals into Arabic", () => {
    const localized = localizeMealForArabic({
      name: "Grilled fish tacos with cabbage salsa",
      cuisine: "Mexican",
      calories: 520,
      protein: "36g",
      carbs: "56g",
      fat: "18g",
      ingredients: ["white fish", "corn tortillas", "cabbage", "pico de gallo", "lime"],
      steps: ["Prep the vegetables, salsa, and citrus."]
    });

    expect(localized.name).toBe("تاكوس سمك مشوي مع سالسا الكرنب");
    expect(localized.cuisine).toBe("مكسيكي");
    expect(localized.ingredients?.join(" ")).not.toMatch(/[A-Za-z]/);
    expect(localized.steps?.join(" ")).not.toMatch(/[A-Za-z]/);
  });

  it("transliterates unknown Latin meal text instead of leaking English in Arabic mode", () => {
    const localized = localizeMealForArabic({
      name: "Omega Fish Protein Bowl",
      cuisine: "Nordic",
      calories: 500,
      protein: "34g",
      carbs: "50g",
      fat: "14g",
      ingredients: ["mystery grain", "super sauce"],
      steps: ["Fold the omega sauce into the bowl."]
    });

    expect(localized.name).not.toMatch(/[A-Za-z]/);
    expect(localized.cuisine).not.toMatch(/[A-Za-z]/);
    expect(localized.ingredients?.join(" ")).not.toMatch(/[A-Za-z]/);
    expect(localized.steps?.join(" ")).not.toMatch(/[A-Za-z]/);
  });

  it("keeps all localized weekly plan user-facing fields free of Latin letters", () => {
    const plan: MealPlanData = {
      plan: [
        {
          day: "Monday",
          breakfast: {
            name: "Huevos rancheros with black beans",
            cuisine: "Mexican",
            calories: 430,
            protein: "24g",
            carbs: "48g",
            fat: "14g",
            ingredients: ["eggs", "black beans", "corn tortilla", "salsa"],
            steps: ["Cook and serve."]
          },
          lunch: {
            name: "Shrimp fajita bowl",
            cuisine: "Mexican",
            calories: 540,
            protein: "38g",
            carbs: "56g",
            fat: "18g",
            ingredients: ["shrimp", "brown rice", "bell pepper", "salsa"],
            steps: ["Prep the vegetables, salsa, and citrus."]
          },
          dinner: {
            name: "Seafood pozole verde",
            cuisine: "Mexican",
            calories: 570,
            protein: "41g",
            carbs: "56g",
            fat: "18g",
            ingredients: ["white fish", "shrimp", "hominy", "tomatillo salsa"],
            steps: ["Cook the protein with olive oil, lime, and mild Mexican spices."]
          }
        }
      ],
      shoppingList: ["white fish - 1 fillet", "mystery grain - 1 item"]
    };

    const localized = localizeMealPlanForArabic(plan);
    const userFacingText = [
      ...localized.plan.flatMap((day) => [
        day.day,
        ...[day.breakfast, day.lunch, day.dinner].flatMap((meal) => [
          meal.name,
          meal.cuisine,
          meal.protein,
          meal.carbs,
          meal.fat,
          ...(meal.ingredients ?? []),
          ...(meal.steps ?? [])
        ])
      ]),
      ...localized.shoppingList
    ].join(" ");

    expect(userFacingText).not.toMatch(/[A-Za-z]/);
  });
});

import { describe, expect, it } from "vitest";
import {
  ensureArabicRecipeLanguage,
  localizeRecipeForArabic,
  localizeMealForArabic,
  localizeMealPlanForArabic,
  translateIngredientToArabic
} from "../lib/arabicRecipeLocalization";
import type { MealPlanData } from "../lib/types";

describe("Arabic meal localization", () => {
  it("localizes English culinary titles by meaning instead of transliteration", () => {
    const localized = localizeRecipeForArabic({
      name: "Creamy Tuscan Chicken",
      cuisine: "Italian",
      ingredients: ["chicken", "heavy cream"],
      missing_ingredients: ["parmesan"],
      steps: ["Simmer chicken with heavy cream."],
      calories: 520,
      protein: "42g",
      carbs: "12g",
      fat: "28g",
      cook_time: "30 mins",
      difficulty: "Medium"
    });

    expect(localized.name).toBe("\u062f\u062c\u0627\u062c \u062a\u0648\u0633\u0643\u0627\u0646\u064a \u0628\u0635\u0648\u0635 \u0643\u0631\u064a\u0645\u064a");
    expect(localized.name).not.toMatch(/[A-Za-z]/);
    expect(translateIngredientToArabic("heavy cream")).toBe("\u0643\u0631\u064a\u0645\u0629 \u0637\u0628\u062e");
    expect(translateIngredientToArabic("cooking cream")).toBe("\u0643\u0631\u064a\u0645\u0629 \u0637\u0628\u062e");
  });

  it("uses cookbook-quality Arabic names for Thai and dumpling dishes", () => {
    const thai = ensureArabicRecipeLanguage({
      name: "Gai Pad Krapow",
      cuisine: "Thai",
      ingredients: ["chicken", "thai basil"],
      missing_ingredients: ["fish sauce"],
      steps: ["Stir-fry the chicken with garlic and Thai basil."],
      calories: 480,
      protein: "34g",
      carbs: "42g",
      fat: "16g",
      cook_time: "25 mins",
      difficulty: "Easy"
    });
    const dumplings = ensureArabicRecipeLanguage({
      name: "Chicken and Dumplings",
      cuisine: "American",
      ingredients: ["chicken"],
      missing_ingredients: ["flour", "milk"],
      steps: ["Simmer chicken in the sauce, then cook the dumplings."],
      calories: 560,
      protein: "38g",
      carbs: "50g",
      fat: "20g",
      cook_time: "45 mins",
      difficulty: "Medium"
    });

    expect(thai.name).toBe("دجاج بالريحان التايلندي");
    expect(dumplings.name).toBe("دجاج بصوص كريمي مع زلابية آسيوية");
  });

  it("uses the curated dictionary for source-recipe titles and ingredients", () => {
    const stroganoff = ensureArabicRecipeLanguage({
      name: "Chicken Stroganoff",
      cuisine: "Global",
      ingredients: ["chicken breast", "mushrooms", "cornstarch", "chicken broth"],
      missing_ingredients: ["egg noodles"],
      steps: ["Cut the chicken into thin strips."],
      calories: 520,
      protein: "34g",
      carbs: "42g",
      fat: "18g",
      cook_time: "30 mins",
      difficulty: "Medium"
    });

    expect(stroganoff.name).toBe("دجاج بصوص كريمي بالفطر");
    expect(stroganoff.ingredients).toEqual(["صدر دجاج", "فطر", "نشا الذرة", "مرق دجاج"]);
    expect(stroganoff.missing_ingredients).toEqual(["مكرونة بالبيض"]);
  });

  it("localizes the barbecue-wing and stuffing-bake source terms", () => {
    const wings = ensureArabicRecipeLanguage({
      name: "Quick Barbecue Wings",
      cuisine: "American",
      ingredients: ["chicken wings", "flour", "barbecue sauce"],
      missing_ingredients: ["microwave"],
      steps: ["Coat the wings with flour and fry until cooked through."],
      calories: 667,
      protein: "34g",
      carbs: "66g",
      fat: "12g",
      cook_time: "10 mins",
      difficulty: "Easy"
    });

    expect(wings.name).toBe("أجنحة دجاج بصلصة الباربيكيو");
    expect(wings.ingredients).toEqual(["أجنحة دجاج", "دقيق", "صلصة باربيكيو"]);
    expect(wings.missing_ingredients).toEqual(["ميكروويف"]);
  });

  it("localizes creamy mushroom chicken without losing its dish identity", () => {
    const creamyChicken = ensureArabicRecipeLanguage({
      name: "Creamy Chicken and Mushrooms",
      cuisine: "Global",
      ingredients: ["margarine", "skinless boneless chicken breast halves", "mushrooms", "cream of mushroom soup", "dry sherry"],
      missing_ingredients: [],
      steps: ["Cook the chicken until browned on both sides."],
      calories: 510,
      protein: "42g",
      carbs: "18g",
      fat: "28g",
      cook_time: "25 mins",
      difficulty: "Medium"
    });

    expect(creamyChicken.name).toBe("دجاج بالفطر والصلصة الكريمية");
    expect(creamyChicken.ingredients).toEqual([
      "سمن نباتي",
      "أنصاف صدور دجاج منزوعة الجلد والعظم",
      "فطر",
      "حساء كريمة الفطر",
      "نبيذ شيري جاف"
    ]);
  });

  it("carries photo_identity through Arabic localization without mutation", () => {
    const identity = {
      dish_slug: "lemon-herb-seafood-soup",
      english_name: "Lemon Herb Seafood Soup",
      protein: "seafood",
      sauce: "lemon-herb",
      method: "soup",
      cuisine_key: "mediterranean"
    } as const;
    const localized = localizeMealForArabic({
      name: "\u062d\u0633\u0627\u0621 \u0627\u0644\u0633\u064a \u0641\u0648\u062f \u0628\u0627\u0644\u0644\u064a\u0645\u0648\u0646 \u0648\u0627\u0644\u0623\u0639\u0634\u0627\u0628",
      cuisine: "Mediterranean",
      calories: 480,
      protein: "32g",
      carbs: "44g",
      fat: "16g",
      ingredients: ["seafood mix", "lemon", "herbs"],
      steps: ["Simmer."],
      photo_identity: identity
    });

    expect(localized.photo_identity).toEqual(identity);
  });

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

  it("does not replace short sourced recipe instructions with generic Arabic filler steps", () => {
    const localized = ensureArabicRecipeLanguage({
      name: "Chicken Tandoori",
      cuisine: "Indian",
      ingredients: ["chicken"],
      missing_ingredients: ["yogurt", "lemon", "ginger-garlic paste"],
      steps: [
        "Cut deep slashes into the chicken pieces.",
        "Mix yogurt, lemon juice, ginger-garlic paste, oil, and tandoori spices.",
        "Coat the chicken and marinate for at least 2 hours.",
        "Roast on a rack at 200 C until charred and cooked through."
      ],
      calories: 520,
      protein: "42g",
      carbs: "12g",
      fat: "24g",
      cook_time: "45 mins",
      difficulty: "Medium",
      recipe_source_type: "local_database"
    });

    const userFacingSteps = localized.steps.join(" ");
    expect(localized.steps).toHaveLength(4);
    expect(userFacingSteps).not.toContain("\u0633\u062e\u0651\u0646 \u0627\u0644\u0645\u0642\u0644\u0627\u0629");
    expect(userFacingSteps).not.toContain("\u0645\u0644\u0639\u0642\u062a\u064a\u0646 \u0643\u0628\u064a\u0631\u062a\u064a\u0646 \u0645\u0646 \u0627\u0644\u0645\u0627\u0621");
    expect(localized.steps).toEqual([
      "Cut deep slashes into the chicken pieces.",
      "Mix yogurt, lemon juice, ginger-garlic paste, oil, and tandoori spices.",
      "Coat the chicken and marinate for at least 2 hours.",
      "Roast on a rack at 200 C until charred and cooked through."
    ]);
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

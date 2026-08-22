import { describe, expect, it } from "vitest";
import { buildNormalizedShoppingList, buildShoppingListFromMealIngredients } from "../lib/shoppingListNormalizer";

describe("shopping list normalizer", () => {
  it("derives one aggregated list from quantified meal ingredients and subtracts pantry stock", () => {
    const meal = {
      name: "Rice bowl",
      calories: 400,
      protein: "12g",
      carbs: "60g",
      fat: "10g",
      ingredients: ["2 cups rice", "1 medium onion, chopped", "2 cloves garlic, minced"],
      steps: ["Cook and serve."]
    };
    const list = buildShoppingListFromMealIngredients({
      displayLanguage: "en",
      mealPlan: {
        plan: [{ day: "Monday", breakfast: meal, lunch: meal, dinner: meal }]
      },
      pantryItems: [
        { name: "rice", quantity: "4 cup" },
        { name: "onion", quantity: "2 whole" },
        { name: "garlic", quantity: "4 clove" }
      ]
    });

    expect(list).toEqual([
      "garlic - 2 clove",
      "onion - 1 item",
      "rice - 2 cup"
    ]);
  });

  it("normalizes vague portions for known pantry staples before subtracting stock", () => {
    const meal = {
      name: "Lentil bowl",
      calories: 400,
      protein: "16g",
      carbs: "60g",
      fat: "8g",
      ingredients: ["2 portions lentils", "1 portion garlic", "1 cup chickpeas"],
      steps: ["Cook and serve."]
    };
    const list = buildShoppingListFromMealIngredients({
      displayLanguage: "en",
      mealPlan: {
        plan: [{ day: "Monday", breakfast: meal, lunch: meal, dinner: meal }]
      },
      pantryItems: [
        { name: "lentils", quantity: "5 cup" },
        { name: "garlic", quantity: "2 clove" },
        { name: "chickpeas", quantity: "10 can" }
      ]
    });

    expect(list).toEqual([
      "chickpeas - 3 cup",
      "garlic - 1 clove",
      "lentils - 1 cup"
    ]);
  });

  it("merges duplicate Arabic ingredients when one line has a measured unit and another is a vague item count", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: ["\u062c\u0645\u0628\u0631\u064a - 1 \u0643\u062c", "\u062c\u0645\u0628\u0631\u064a - 2 \u0639\u0646\u0635\u0631"]
      })
    ).toEqual(["\u062c\u0645\u0628\u0631\u064a - 1 \u0643\u062c\u0645"]);
  });

  it("sums duplicate Arabic ingredients with the same measured unit", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: ["\u062c\u0645\u0628\u0631\u064a - 1 \u0643\u062c", "\u062c\u0645\u0628\u0631\u064a - 0.5 \u0643\u062c\u0645"]
      })
    ).toEqual(["\u062c\u0645\u0628\u0631\u064a - 1.5 \u0643\u062c\u0645"]);
  });

  it("normalizes vague mixed-unit shopping entries", () => {
    const list = buildNormalizedShoppingList({
      displayLanguage: "ar",
      shoppingList: ["rice - 14 mixed units", "lentils - 12 mixed unit"]
    });

    expect(list.join(" ")).not.toMatch(/mixed|\u0645\u064a\u0643\u0633\u064a\u062f/i);
  });

  it("keeps Arabic shopping list readable and removes prep wording", () => {
    const list = buildNormalizedShoppingList({
      displayLanguage: "ar",
      shoppingList: [
        "\u0628\u0635\u0644 \u0645\u0641\u0631\u0648\u0645 - 2 \u062d\u0628\u0629",
        "\u0628\u0635\u0644 - 3 \u062d\u0628\u0629",
        "\u0628\u0642\u062f\u0648\u0646\u0633 \u0645\u0641\u0631\u0648\u0645 \u0644\u0644\u062a\u0632\u064a\u064a\u0646 - 1 \u0628\u0648\u0646\u062a\u0634",
        "\u062e\u064a\u0627\u0631 \u0645\u0642\u0637\u0639 \u0645\u0643\u0639\u0628\u0627\u062a - \u0646\u0635\u0641 \u0643\u0648\u0628 - 1 item",
        "nori - 1 item",
        "edamame - 1 cup"
      ]
    });
    const text = list.join(" ");

    expect(text).toContain("\u0628\u0635\u0644 - 5 \u062d\u0628\u0629");
    expect(text).toContain("\u0628\u0642\u062f\u0648\u0646\u0633 - 1 \u062d\u0632\u0645\u0629");
    expect(text).toContain("\u0637\u062d\u0627\u0644\u0628 \u0646\u0648\u0631\u064a");
    expect(text).toContain("\u0641\u0648\u0644 \u0635\u0648\u064a\u0627 \u0623\u062e\u0636\u0631");
    expect(text).not.toMatch(/item|bunch|\u0628\u0648\u0646\u062a\u0634|\u0645\u0642\u0637\u0639|\u0645\u0641\u0631\u0648\u0645|\u0644\u0644\u062a\u0632\u064a\u064a\u0646/i);
  });

  it("merges Arabic rice variants and avoids whole-item units for staples", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: [
          "\u0623\u0631\u0632 - 2 \u062d\u0628\u0629",
          "\u0623\u0631\u0632 \u0645\u0635\u0631\u064a - 1 \u0639\u0628\u0648\u0629",
          "basmati rice - 2 cups"
        ]
      })
    ).toEqual(["\u0623\u0631\u0632 - 5 \u0643\u0648\u0628"]);
  });

  it("uses spoon units for spices instead of vague item counts", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: [
          "cumin - 1 item",
          "\u0643\u0645\u0648\u0646 - 2 \u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629",
          "paprika - 1 package"
        ]
      })
    ).toEqual([
      "\u0628\u0627\u0628\u0631\u064a\u0643\u0627 - 1 \u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629",
      "\u0643\u0645\u0648\u0646 - 3 \u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629"
    ]);
  });

  it("translates plant milks from canonical English into readable Arabic", () => {
    const list = buildNormalizedShoppingList({
      displayLanguage: "ar",
      shoppingList: ["coconut milk - 1 can", "oat milk - 2 cups", "almond milk - 1 cup"]
    });

    expect(list).toContain("\u062d\u0644\u064a\u0628 \u062c\u0648\u0632 \u0627\u0644\u0647\u0646\u062f - 1 \u0639\u0644\u0628\u0629");
    expect(list).toContain("\u062d\u0644\u064a\u0628 \u0627\u0644\u0634\u0648\u0641\u0627\u0646 - 2 \u0643\u0648\u0628");
    expect(list).toContain("\u062d\u0644\u064a\u0628 \u0627\u0644\u0644\u0648\u0632 - 1 \u0643\u0648\u0628");
  });

  it("uses kg for meat, poultry, fish, shrimp, and seafood instead of cups", () => {
    const englishList = buildNormalizedShoppingList({
      displayLanguage: "en",
      shoppingList: [
        "ground meat - 2 cups",
        "chicken - 500 g",
        "fish - 2 fillets",
        "shrimp - 1 cup"
      ]
    });

    expect(englishList).toContain("meat - 0.5 kg");
    expect(englishList).toContain("chicken - 0.5 kg");
    expect(englishList).toContain("fish - 0.4 kg");
    expect(englishList).toContain("shrimp - 0.3 kg");

    const arabicList = buildNormalizedShoppingList({
      displayLanguage: "ar",
      shoppingList: ["\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645 - 2 \u0643\u0648\u0628", "\u062c\u0645\u0628\u0631\u064a - 1 \u0643\u0648\u0628"]
    });

    expect(arabicList).toContain("\u0644\u062d\u0645 - 0.5 \u0643\u062c\u0645");
    expect(arabicList).toContain("\u062c\u0645\u0628\u0631\u064a - 0.3 \u0643\u062c\u0645");
  });

  it("parses ingredient adjectives as names rather than units and combines convertible measures", () => {
    const meal = {
      name: "Mexican dinner",
      calories: 500,
      protein: "25g",
      carbs: "60g",
      fat: "15g",
      ingredients: [
        "1/2 yellow bell pepper, sliced",
        "1/2 red bell pepper, sliced",
        "1/4 lime, cut into wedges",
        "1/4 cup salsa roja",
        "2 tbsp salsa roja",
        "2 corn tortillas"
      ],
      steps: ["Cook and serve."]
    };

    const list = buildShoppingListFromMealIngredients({
      displayLanguage: "en",
      mealPlan: { plan: [{ day: "Monday", breakfast: meal, lunch: meal, dinner: meal }] }
    });

    expect(list).toContain("bell pepper - 3 item");
    expect(list).toContain("lime - 0.8 item");
    expect(list).toContain("salsa roja - 1.1 cup");
    expect(list).toContain("corn tortilla - 6 item");
    expect(list.join(" ")).not.toMatch(/yellow|red|wedges|corn item/i);
  });

  it("rebuilds an existing plan from its ingredients instead of trusting a corrupted stored list", () => {
    const meal = {
      name: "Tacos",
      calories: 400,
      protein: "20g",
      carbs: "45g",
      fat: "12g",
      ingredients: ["2 corn tortillas", "1/4 lime, cut into wedges"],
      steps: ["Cook and serve."]
    };
    const list = buildNormalizedShoppingList({
      displayLanguage: "en",
      mealPlan: {
        plan: [{ day: "Monday", breakfast: meal, lunch: meal, dinner: meal }],
        shoppingList: ["tortillas - 6 corn", "cut into wedges - 0.8 lime"]
      }
    });

    expect(list).toEqual(["corn tortilla - 6 item", "lime - 0.8 item"]);
  });
});

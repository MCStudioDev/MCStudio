import { describe, expect, it } from "vitest";
import { findRecipeDietViolation } from "../lib/dietEnforcement";

describe("diet enforcement", () => {
  it("treats dairy-free as blocking dairy and eggs", () => {
    expect(
      findRecipeDietViolation(
        { name: "Shakshuka", ingredients: ["eggs", "tomato", "bell pepper", "olive oil"] },
        { diets: ["dairyFree"], allergens: [] }
      )
    ).toEqual({ kind: "diet", diet: "dairyFree", match: "egg" });

    expect(
      findRecipeDietViolation(
        { name: "Greek yogurt bowl", ingredients: ["yogurt", "berries"] },
        { diets: ["dairyFree"], allergens: [] }
      )
    ).toEqual({ kind: "diet", diet: "dairyFree", match: "yogurt" });
  });

  it("allows plant-based dairy alternatives for vegan and dairy-free users", () => {
    const ctx = { diets: ["vegan", "dairyFree"], allergens: [] };

    expect(
      findRecipeDietViolation(
        { name: "Broccoli soup", ingredients: ["broccoli", "almond milk", "potato", "garlic"] },
        ctx
      )
    ).toBeNull();
    expect(
      findRecipeDietViolation(
        { name: "Vegan pancakes", ingredients: ["flour", "oat milk", "banana", "cinnamon"] },
        ctx
      )
    ).toBeNull();
    expect(
      findRecipeDietViolation(
        { name: "Thai tofu curry", ingredients: ["tofu", "coconut milk", "vegetables", "basil"] },
        ctx
      )
    ).toBeNull();
    expect(
      findRecipeDietViolation(
        { name: "Mushroom soup", ingredients: ["mushrooms", "coconut cream", "thyme"] },
        ctx
      )
    ).toBeNull();

    expect(findRecipeDietViolation({ name: "Milk soup", ingredients: ["milk", "broccoli"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "milk"
    });
    expect(findRecipeDietViolation({ name: "Cream soup", ingredients: ["heavy cream", "broccoli"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "cream"
    });
    expect(findRecipeDietViolation({ name: "Yogurt bowl", ingredients: ["yogurt", "berries"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "yogurt"
    });
  });

  it("also blocks eggs when egg allergy is selected without dairy-free", () => {
    expect(
      findRecipeDietViolation(
        { name: "Vegetable omelette", ingredients: ["eggs", "spinach"] },
        { diets: [], allergens: ["eggs"] }
      )
    ).toEqual({ kind: "allergen", allergen: "eggs", match: "egg" });
  });

  it("normalizes Arabic custom allergens before checking generated recipes", () => {
    expect(
      findRecipeDietViolation(
        {
          name: "مكرونة بصلصة الطماطم",
          ingredients: ["مكرونة"],
          missing_ingredients: ["صلصة طماطم", "ثوم"]
        },
        { diets: [], allergens: ["الطماطم"] }
      )
    ).toEqual({ kind: "allergen", allergen: "الطماطم", match: "طماطم" });

    expect(
      findRecipeDietViolation(
        { name: "Greek yogurt bowl", ingredients: ["yogurt", "berries"] },
        { diets: [], allergens: ["اللبن"] }
      )
    ).toEqual({ kind: "allergen", allergen: "اللبن", match: "yogurt" });
  });

  it("does not false-positive Arabic pescatarian terms inside safe words", () => {
    const ctx = { diets: ["pescatarian"], allergens: [] };

    expect(findRecipeDietViolation({ name: "سلطة أرز بالحمص", ingredients: ["حمص", "أرز", "طماطم"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "فول مع طماطم", ingredients: ["فول", "طماطم", "بصل"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "طبق أرز وحمص", ingredients: ["حمص", "أرز", "خيار"] }, ctx)).toBeNull();
  });

  it("blocks real Arabic meat and poultry terms", () => {
    const ctx = { diets: ["pescatarian"], allergens: [] };

    expect(findRecipeDietViolation({ name: "لحم بقري مشوي", ingredients: ["لحم بقري"] }, ctx)).toEqual({
      kind: "diet",
      diet: "pescatarian",
      match: "لحم"
    });
    expect(findRecipeDietViolation({ name: "دجاج مشوي", ingredients: ["دجاج"] }, ctx)).toEqual({
      kind: "diet",
      diet: "pescatarian",
      match: "دجاج"
    });
    expect(findRecipeDietViolation({ name: "بط مشوي", ingredients: ["بط"] }, ctx)).toEqual({
      kind: "diet",
      diet: "pescatarian",
      match: "بط"
    });
  });

  it("blocks Arabic chicken, ground meat, and egg meals for vegan dairy-free users", () => {
    const ctx = { diets: ["vegan", "vegetarian", "dairyFree"], allergens: [] };

    expect(findRecipeDietViolation({ name: "سلطة دجاج مشوي بالليمون", ingredients: ["دجاج", "ليمون"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "دجاج"
    });
    expect(findRecipeDietViolation({ name: "مكرونة باللحم المفروم", ingredients: ["لحم مفروم", "طماطم"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "لحم"
    });
    expect(findRecipeDietViolation({ name: "فريتاتا بالسبانخ والبيض", ingredients: ["بيض", "سبانخ"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "بيض"
    });
  });

  it("treats keto as a hard low-carb ingredient gate", () => {
    const ctx = { diets: ["keto"], allergens: [] };

    expect(findRecipeDietViolation({ name: "Chicken rice bowl", ingredients: ["chicken", "rice", "broccoli"] }, ctx)).toEqual({
      kind: "diet",
      diet: "keto",
      match: "rice"
    });
    expect(findRecipeDietViolation({ name: "Shrimp zucchini noodle skillet", ingredients: ["shrimp", "zucchini noodles", "olive oil"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "Salmon cauliflower rice bowl", ingredients: ["salmon", "cauliflower rice", "zucchini"] }, ctx)).toBeNull();
  });

  it("treats paleo as a hard grain legume and dairy gate", () => {
    const ctx = { diets: ["paleo"], allergens: [] };

    expect(findRecipeDietViolation({ name: "White bean chicken stew", ingredients: ["chicken", "white beans", "tomato"] }, ctx)).toEqual({
      kind: "diet",
      diet: "paleo",
      match: "bean"
    });
    expect(findRecipeDietViolation({ name: "Chicken roasted vegetable plate", ingredients: ["chicken", "zucchini", "carrot"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "Greek yogurt bowl", ingredients: ["yogurt", "berries"] }, ctx)).toEqual({
      kind: "diet",
      diet: "paleo",
      match: "yogurt"
    });
  });
});

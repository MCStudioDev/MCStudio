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
});

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
          name: "\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0635\u0644\u0635\u0629 \u0627\u0644\u0637\u0645\u0627\u0637\u0645",
          ingredients: ["\u0645\u0643\u0631\u0648\u0646\u0629"],
          missing_ingredients: ["\u0635\u0644\u0635\u0629 \u0637\u0645\u0627\u0637\u0645", "\u062b\u0648\u0645"]
        },
        { diets: [], allergens: ["\u0627\u0644\u0637\u0645\u0627\u0637\u0645"] }
      )
    ).toEqual({ kind: "allergen", allergen: "\u0627\u0644\u0637\u0645\u0627\u0637\u0645", match: "\u0637\u0645\u0627\u0637\u0645" });

    expect(
      findRecipeDietViolation(
        { name: "Greek yogurt bowl", ingredients: ["yogurt", "berries"] },
        { diets: [], allergens: ["\u0627\u0644\u0644\u0628\u0646"] }
      )
    ).toEqual({ kind: "allergen", allergen: "\u0627\u0644\u0644\u0628\u0646", match: "yogurt" });
  });

  it("does not false-positive Arabic pescatarian terms inside safe words", () => {
    const ctx = { diets: ["pescatarian"], allergens: [] };

    expect(findRecipeDietViolation({ name: "سلطة أرز بالحمص", ingredients: ["حمص", "أرز", "طماطم"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "فول مع طماطم", ingredients: ["فول", "طماطم", "بصل"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "طبق أرز وحمص", ingredients: ["حمص", "أرز", "خيار"] }, ctx)).toBeNull();
  });

  it("still blocks real Arabic meat and poultry terms", () => {
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
});

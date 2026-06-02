import { describe, expect, it } from "vitest";
import { findRecipeHealthViolation } from "../lib/healthEnforcement";

describe("health enforcement", () => {
  it("blocks rich saturated-fat meals for cholesterol profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Chicken lemon butter sauce", ingredients: ["chicken", "butter", "lemon"] },
        ["cholesterol"]
      )
    ).toEqual({ condition: "cholesterol", match: "butter" });

    expect(
      findRecipeHealthViolation(
        { name: "Vegetable white bean minestrone", ingredients: ["white beans", "tomato", "zucchini"] },
        ["cholesterol", "highBloodPressure", "weightLoss"]
      )
    ).toBeNull();
  });

  it("blocks processed salty foods for high blood pressure profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Pepperoni pasta", ingredients: ["pasta", "pepperoni", "tomato"] },
        ["highBloodPressure"]
      )
    ).toEqual({ condition: "highBloodPressure", match: "pepperoni" });
  });

  it("blocks heavy fried or creamy meals for weight-loss profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Fried beef cutlet", ingredients: ["beef", "bread crumbs"], dish_intent: { dish_name: "fried beef cutlet", cuisine: "Italian", visual_keywords: [], exclude_keywords: [] } },
        ["weightLoss"]
      )
    ).toEqual({ condition: "weightLoss", match: "fried" });
  });

  it("uses nutrition numbers for diabetes profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Sweet rice bowl", ingredients: ["rice", "dates"], calories: 520, carbs: "78g", sugar: "22g", protein: "8g" },
        ["diabetes"]
      )
    ).toEqual({ condition: "diabetes", match: "sugar>15g" });
  });

  it("uses nutrition numbers for low blood pressure profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Tiny cucumber salad", ingredients: ["cucumber", "lettuce"], calories: 180, sodium: "80mg", protein: "4g" },
        ["lowBloodPressure"]
      )
    ).toEqual({ condition: "lowBloodPressure", match: "calories<320" });
  });

  it("uses nutrition numbers for weight-gain profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Light broth", ingredients: ["vegetable broth", "herbs"], calories: 240, protein: "7g" },
        ["weightGain"]
      )
    ).toEqual({ condition: "weightGain", match: "calories<430" });
  });

  it("allows numerically compatible health meals", () => {
    expect(
      findRecipeHealthViolation(
        {
          name: "Salmon quinoa vegetable plate",
          ingredients: ["salmon", "quinoa", "broccoli", "olive oil"],
          calories: 540,
          carbs: "38g",
          sugar: "6g",
          sodium: "420mg",
          fat: "18g",
          fiber: "6g",
          protein: "38g"
        },
        ["diabetes", "highBloodPressure", "weightGain", "cholesterol"]
      )
    ).toBeNull();
  });
});

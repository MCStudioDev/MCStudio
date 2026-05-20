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
});

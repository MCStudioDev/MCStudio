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

  it("allows familiar proteins when the preparation and numbers are heart-smart", () => {
    expect(
      findRecipeHealthViolation(
        {
          name: "Lean grilled beef onion flatbread",
          ingredients: ["lean beef", "onion", "whole wheat flatbread", "lemon", "herbs"],
          steps: ["Trim visible fat.", "Grill the beef strips with onion and a small amount of olive oil."],
          calories: 520,
          fat: "18g",
          fiber: "6g",
          sodium: "520mg",
          protein: "36g"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toBeNull();

    expect(
      findRecipeHealthViolation(
        {
          name: "Smoked-paprika chicken shawarma-style wrap",
          ingredients: ["skinless chicken", "onion", "whole wheat pita", "smoked paprika", "garlic"],
          steps: ["Use smoked paprika for flavor, not cured smoked meat.", "Bake the chicken and slice it thin."],
          calories: 480,
          fat: "12g",
          fiber: "5g",
          sodium: "560mg",
          protein: "38g"
        },
        ["highCholesterol", "highBloodPressure"]
      )
    ).toBeNull();
  });

  it("allows adapted dairy while still blocking heavy dairy", () => {
    expect(
      findRecipeHealthViolation(
        {
          name: "Low-fat mozzarella vegetable toast",
          ingredients: ["whole grain bread", "low-fat mozzarella", "tomato", "spinach"],
          calories: 390,
          fat: "11g",
          fiber: "6g",
          sodium: "430mg",
          protein: "23g"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toBeNull();

    expect(
      findRecipeHealthViolation(
        {
          name: "Creamy cheese pasta",
          ingredients: ["pasta", "cheese", "cream", "butter"],
          calories: 720,
          fat: "36g",
          sodium: "820mg"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toEqual({ condition: "cholesterol", match: "butter" });
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

    expect(
      findRecipeHealthViolation(
        {
          name: "Chicken whole grain bowl",
          ingredients: ["chicken", "brown rice", "lentils", "vegetables"],
          calories: 560,
          carbs: "58g",
          sugar: "6g",
          fiber: "8g",
          protein: "34g"
        },
        ["diabetes"]
      )
    ).toBeNull();
  });

  it("uses nutrition numbers for low blood pressure profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Tiny cucumber salad", ingredients: ["cucumber", "lettuce"], calories: 180, sodium: "80mg", protein: "4g" },
        ["lowBloodPressure"]
      )
    ).toEqual({ condition: "lowBloodPressure", match: "calories<260" });
  });

  it("uses nutrition numbers for weight-gain profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Light broth", ingredients: ["vegetable broth", "herbs"], calories: 240, protein: "7g" },
        ["weightGain"]
      )
    ).toEqual({ condition: "weightGain", match: "calories<320" });

    expect(
      findRecipeHealthViolation(
        { name: "Chicken avocado rice plate", ingredients: ["chicken", "avocado", "rice"], calories: 390, protein: "28g" },
        ["weightGain"]
      )
    ).toBeNull();
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

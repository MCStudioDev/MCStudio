import { describe, expect, it } from "vitest";
import { RecipeDiversityEngine } from "../food/RecipeDiversityEngine";

describe("RecipeDiversityEngine", () => {
  it("rotates cuisines and cooking methods before repeating either", () => {
    const selected = new RecipeDiversityEngine().select([
      { value: "alfredo", score: 100, cuisine: "Italian", dishFamily: "chicken alfredo", cookingMethod: "saute" },
      { value: "cacciatore", score: 99, cuisine: "Italian", dishFamily: "chicken cacciatore", cookingMethod: "braise" },
      { value: "molokhia", score: 97, cuisine: "Egyptian", dishFamily: "chicken molokhia", cookingMethod: "braise" },
      { value: "shish", score: 96, cuisine: "Turkish", dishFamily: "shish tavuk", cookingMethod: "grill" },
      { value: "tandoori", score: 95, cuisine: "Indian", dishFamily: "tandoori chicken", cookingMethod: "bake" }
    ], { limit: 4, rotateCuisines: true });

    expect(selected).toEqual(["alfredo", "molokhia", "shish", "tandoori"]);
  });

  it("never repeats a dish family", () => {
    const selected = new RecipeDiversityEngine().select([
      { value: "first", score: 100, cuisine: "Italian", dishFamily: "chicken cacciatore", cookingMethod: "braise" },
      { value: "duplicate", score: 99, cuisine: "Italian", dishFamily: "chicken cacciatore", cookingMethod: "braise" }
    ], { limit: 2, rotateCuisines: false });

    expect(selected).toEqual(["first"]);
  });
});

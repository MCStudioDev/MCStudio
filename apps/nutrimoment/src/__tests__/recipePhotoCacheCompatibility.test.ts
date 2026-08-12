import { describe, expect, it } from "vitest";
import {
  isApproximateRecipePhotoCacheCompatible,
  isGeneratedRecipePhotoCachePayloadConsistent
} from "@/services/recipePhotoCacheCompatibility";

describe("approximate recipe photo cache compatibility", () => {
  it.each([
    ["mediterranean baked fish", "Roasted Zucchini and Tomato Mediterranean food"],
    ["grilled shrimp skewers with lemon and herbs", "Grilled Zucchini and Tomato Skewers"],
    ["spinach omelette", "Egyptian Vegetarian Moussaka"],
    ["shakshuka", "Fried Zucchini with Tomato"]
  ])("rejects unrelated cached image %s for %s", (cachedQuery, requestQuery) => {
    expect(isApproximateRecipePhotoCacheCompatible(
      { query: cachedQuery, signature: `generated:strict-v7:${cachedQuery.replace(/\s+/g, "-")}` },
      [requestQuery]
    )).toBe(false);
  });

  it("accepts the same canonical dish and preparation", () => {
    expect(isApproximateRecipePhotoCacheCompatible(
      { query: "baked eggplant and tomato", signature: "generated:strict-v7:baked-eggplant-and-tomato" },
      ["Baked Eggplant and Tomato Mediterranean food"]
    )).toBe(true);
  });

  it("rejects the same ingredient when the visible cooking method conflicts", () => {
    expect(isApproximateRecipePhotoCacheCompatible(
      { query: "grilled zucchini", signature: "generated:strict-v7:grilled-zucchini" },
      ["Fried Zucchini with Tomato"]
    )).toBe(false);
  });

  it("rejects a poisoned alias whose metadata disagrees with the stored image signature", () => {
    expect(isGeneratedRecipePhotoCachePayloadConsistent({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Afrog-eye-salad-global.jpg?alt=media",
      query: "zucchini and tomato pasta",
      signature: "generated:strict-v7:zucchini-and-tomato-pasta"
    })).toBe(false);
  });
});

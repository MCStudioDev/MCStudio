import { describe, expect, it } from "vitest";
import { CuisineClassifier } from "../food/CuisineClassifier";

const classifier = new CuisineClassifier();

describe("CuisineClassifier", () => {
  it("combines title, ingredient, sauce, herb, and technique signals", () => {
    const result = classifier.classify({
      title: "Chicken Cacciatore",
      ingredients: ["chicken", "marinara sauce", "olive oil", "basil", "oregano"],
      directions: ["Brown the chicken, then braise it gently in marinara sauce until tender."]
    });

    expect(result.cuisine).toBe("Italian");
    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.signals).toEqual(expect.arrayContaining([
      "italian named dish",
      "italian sauce marker",
      "italian herb marker"
    ]));
  });

  it("classifies an Egyptian named dish deterministically", () => {
    const result = classifier.classify({
      title: "Molokhia with Chicken and Rice",
      ingredients: ["molokhia", "chicken", "garlic", "coriander", "rice"],
      directions: ["Simmer the chicken, then finish the molokhia with garlic and coriander."]
    });

    expect(result.cuisine).toBe("Egyptian");
    expect(classifier.shouldEscalate(result)).toBe(false);
  });

  it("marks generic recipes for review instead of forcing a cuisine", () => {
    const result = classifier.classify({
      title: "Chicken Pasta",
      ingredients: ["chicken", "pasta", "salt", "pepper"],
      directions: ["Cook pasta and chicken, then serve warm."]
    });

    expect(result.cuisine).toBe("Global");
    expect(classifier.shouldEscalate(result)).toBe(true);
  });
});

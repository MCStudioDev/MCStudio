import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/types";
import {
  compileRecipeRequestPolicy,
  selectRecipesByRequestPolicy
} from "@/services/recipeRequestPolicyService";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "base",
    name: "Base Recipe",
    dish_identity: "Base Recipe",
    cuisine: "Global",
    ingredients: ["1 cup tomato"],
    missing_ingredients: [],
    steps: ["Prepare the ingredients.", "Cook until done."],
    calories: 400,
    protein: "20g",
    carbs: "40g",
    fat: "12g",
    cook_time: "30 minutes",
    difficulty: "Medium",
    ...overrides
  };
}

describe("compiled recipe request policy", () => {
  it("separates hard restrictions, adaptations, and soft preferences", () => {
    const policy = compileRecipeRequestPolicy({
      allergens: ["shellfish"],
      conditions: ["diabetes"],
      diets: ["glutenFree"],
      excludedIngredients: ["mushroom"],
      ingredients: ["Fish", "rice", "onion"],
      preferredCuisine: "Egyptian",
      requestedCount: 10
    });

    expect(policy.hardRestrictions).toEqual({
      allergens: ["shellfish"],
      diets: ["glutenfree"],
      excludedIngredients: ["mushroom"]
    });
    expect(policy.adaptations.conditions).toEqual(["diabetes"]);
    expect(policy.preferences.preferredCuisine).toBe("Egyptian");
    expect(policy.coveragePlan.anchors.map((anchor) => anchor.id)).toEqual(["fish", "rice", "onion"]);
  });

  it("puts a coherent all-input dish ahead of single-input alternatives", () => {
    const policy = compileRecipeRequestPolicy({
      ingredients: ["fish", "rice", "onion"],
      preferredCuisine: "Any",
      requestedCount: 3
    });
    const candidates = [
      recipe({ id: "fish", name: "Grilled Fish", dish_identity: "Grilled Fish", ingredients: ["500 g fish"] }),
      recipe({ id: "rice", name: "Rice Pilaf", dish_identity: "Rice Pilaf", ingredients: ["2 cups rice", "1 onion"] }),
      recipe({
        id: "sayadeya",
        name: "Sayadeya",
        dish_identity: "Sayadeya",
        cuisine: "Egyptian",
        ingredients: ["500 g fish", "2 cups rice", "2 onions"]
      })
    ];

    expect(selectRecipesByRequestPolicy(candidates, policy, 3).map((item) => item.id)).toEqual([
      "sayadeya",
      "rice",
      "fish"
    ]);
  });

  it("never trades requested-ingredient usage for cuisine variety", () => {
    const policy = compileRecipeRequestPolicy({
      ingredients: ["eggplant", "zucchini", "tomato"],
      preferredCuisine: "Any",
      requestedCount: 3
    });
    const candidates = [
      recipe({ id: "italian-one", cuisine: "Italian", ingredients: ["1 eggplant", "1 zucchini", "2 tomatoes"] }),
      recipe({ id: "italian-two", name: "Caponata", dish_identity: "Caponata", cuisine: "Italian", ingredients: ["1 eggplant", "2 tomatoes"] }),
      recipe({ id: "italian-three", name: "Ciambotta", dish_identity: "Ciambotta", cuisine: "Italian", ingredients: ["1 zucchini", "2 tomatoes"] }),
      recipe({ id: "thai", cuisine: "Thai", ingredients: ["2 tomatoes"] })
    ];

    expect(selectRecipesByRequestPolicy(candidates, policy, 3).map((item) => item.id)).toEqual([
      "italian-one",
      "italian-two",
      "italian-three"
    ]);
  });

  it("applies hard eligibility before ranking and supports vegetable-only requests", () => {
    const policy = compileRecipeRequestPolicy({
      diets: ["vegan"],
      ingredients: ["eggplant", "tomato"],
      requestedCount: 2
    });
    const candidates = [
      recipe({ id: "meat", ingredients: ["1 eggplant", "2 tomatoes", "300 g beef"] }),
      recipe({ id: "veg", name: "Imam Bayildi", dish_identity: "Imam Bayildi", cuisine: "Turkish", ingredients: ["1 eggplant", "2 tomatoes"] }),
      recipe({ id: "tomato", ingredients: ["2 tomatoes"] })
    ];

    expect(selectRecipesByRequestPolicy(candidates, policy, 2, {
      isEligible: (candidate) => candidate.id !== "meat"
    }).map((item) => item.id)).toEqual(["veg", "tomato"]);
  });

  it("is deterministic for identical candidates and policy", () => {
    const policy = compileRecipeRequestPolicy({ ingredients: ["steak"], requestedCount: 3 });
    const candidates = [
      recipe({ id: "a", name: "Steak A", dish_identity: "Steak A", ingredients: ["500 g steak"] }),
      recipe({ id: "b", name: "Steak B", dish_identity: "Steak B", ingredients: ["500 g steak"] }),
      recipe({ id: "c", name: "Steak C", dish_identity: "Steak C", ingredients: ["500 g steak"] })
    ];

    const first = selectRecipesByRequestPolicy(candidates, policy, 3).map((item) => item.id);
    const second = selectRecipesByRequestPolicy(candidates, policy, 3).map((item) => item.id);
    expect(second).toEqual(first);
  });
});

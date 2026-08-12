import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import {
  analyzeRecipeInputCoverage,
  createRecipeInputCoveragePlan,
  doesRecipeSetMeetInputCoverage,
  getRecipeInputAnchorIds,
  selectRecipesForInputCoverage,
  toRecipeInputCoveragePrompt
} from "../services/recipeInputCoverageService";

function recipe(name: string, ingredients: string[]): Recipe {
  return {
    name,
    cuisine: "Global",
    ingredients,
    missing_ingredients: [],
    steps: ["Cook the ingredients thoroughly.", "Serve the finished dish."],
    calories: 400,
    protein: "20g",
    carbs: "30g",
    fat: "15g",
    cook_time: "30 minutes",
    difficulty: "Easy"
  };
}

describe("recipe input coverage", () => {
  it("builds category-independent balanced targets", () => {
    const proteins = createRecipeInputCoveragePlan(["beef", "liver"], 10);
    const vegetables = createRecipeInputCoveragePlan(["eggplant", "zucchini", "tomato"], 10);

    expect(proteins.anchors.map((anchor) => [anchor.id, anchor.targetCards])).toEqual([
      ["beef", 5],
      ["liver", 5]
    ]);
    expect(vegetables.anchors.map((anchor) => [anchor.id, anchor.targetCards])).toEqual([
      ["eggplant", 4],
      ["zucchini", 3],
      ["tomato", 3]
    ]);
    const slots = toRecipeInputCoveragePrompt(proteins).recipeSlots;
    expect(slots.map(({ requiredAnchorId, slot }) => ({ requiredAnchorId, slot }))).toEqual([
      { requiredAnchorId: "beef", slot: 1 }, { requiredAnchorId: "liver", slot: 2 },
      { requiredAnchorId: "beef", slot: 3 }, { requiredAnchorId: "liver", slot: 4 },
      { requiredAnchorId: "beef", slot: 5 }, { requiredAnchorId: "liver", slot: 6 },
      { requiredAnchorId: "beef", slot: 7 }, { requiredAnchorId: "liver", slot: 8 },
      { requiredAnchorId: "beef", slot: 9 }, { requiredAnchorId: "liver", slot: 10 }
    ]);
    expect(slots.filter((slot) => slot.requiredAnchorId === "liver").map((slot) => slot.variationKey))
      .toEqual(["braised_or_stewed", "baked_or_roasted", "pan_seared_or_fried", "grilled_or_skewered", "pasta_or_noodle"]);
  });

  it("does not promote low-signal pantry utilities to anchors", () => {
    const plan = createRecipeInputCoveragePlan(["eggplant", "salt", "water", "oil"], 10);

    expect(plan.anchors.map((anchor) => anchor.id)).toEqual(["eggplant"]);
  });

  it("matches every meaningful anchor without treating derived products as coverage", () => {
    const plan = createRecipeInputCoveragePlan(["beef", "liver", "tomato"], 10);

    expect(getRecipeInputAnchorIds(recipe("Beef Liver with Tomato", [
      "1 lb beef liver",
      "2 cups chopped tomatoes"
    ]), plan)).toEqual(["beef", "liver", "tomato"]);
    expect(getRecipeInputAnchorIds(recipe("Vegetable Soup", ["2 cups beef broth", "1 cup tomato sauce"]), plan)).toEqual([]);
  });

  it("selects a balanced final set and prefers multi-anchor recipes", () => {
    const plan = createRecipeInputCoveragePlan(["beef", "liver"], 4);
    const candidates = [
      recipe("Beef Stew", ["1 lb beef"]),
      recipe("Beef Fajitas", ["1 lb beef"]),
      recipe("Livers and Onions", ["1 lb chicken livers"]),
      recipe("Beef Liver Skillet", ["1 lb beef liver"]),
      recipe("Chicken Soup", ["1 lb chicken"])
    ];

    const selected = selectRecipesForInputCoverage(candidates, plan, 4);
    const analysis = analyzeRecipeInputCoverage(selected, plan);

    expect(selected.map((item) => item.name)).toContain("Beef Liver Skillet");
    expect(selected.map((item) => item.name)).not.toContain("Chicken Soup");
    expect(analysis.coverage).toEqual({ beef: 3, liver: 2 });
    expect(analysis.cardsUsingNoAnchor).toEqual([]);
    expect(doesRecipeSetMeetInputCoverage(selected, plan)).toBe(true);
  });

  it("ranks established dishes using every requested ingredient first", () => {
    const plan = createRecipeInputCoveragePlan(["fish", "rice", "onion"], 10);
    const candidates = [
      recipe("Baked Fish", ["1 lb fish"]),
      recipe("Fried Rice", ["2 cups rice", "1 cup onion"]),
      recipe("Egyptian Sayadeya", ["1 lb fish", "2 cups rice", "2 cups onion"]),
      recipe("Onion Soup", ["3 cups onion"])
    ];

    const selected = selectRecipesForInputCoverage(candidates, plan, 4);
    const prompt = toRecipeInputCoveragePrompt(plan);

    expect(selected[0]?.name).toBe("Egyptian Sayadeya");
    expect(prompt.combinationPriority).toEqual({
      establishedDishesOnly: true,
      preferredAnchorIds: ["fish", "rice", "onion"],
      targetMultiAnchorCards: 4
    });
  });

  it("treats broad use of every input as successful without enforcing an arbitrary equal quota", () => {
    const plan = createRecipeInputCoveragePlan(["eggplant", "zucchini", "tomato"], 10);
    const selected = [
      ...Array.from({ length: 3 }, (_, index) => recipe(`Eggplant ${index}`, ["1 eggplant", "2 tomatoes"])),
      ...Array.from({ length: 4 }, (_, index) => recipe(`Zucchini ${index}`, ["1 zucchini", "2 tomatoes"])),
      ...Array.from({ length: 3 }, (_, index) => recipe(`Tomato ${index}`, ["2 tomatoes"]))
    ];

    const analysis = analyzeRecipeInputCoverage(selected, plan);
    expect(analysis.coverage).toEqual({ eggplant: 3, zucchini: 4, tomato: 10 });
    expect(analysis.meetsTargets).toBe(true);
    expect(doesRecipeSetMeetInputCoverage(selected, plan)).toBe(true);
  });
});

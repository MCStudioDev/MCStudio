import { describe, expect, it } from "vitest";
import { PromptBuilder, buildRecipeGenerationPrompt } from "../ai/PromptBuilder";

describe("PromptBuilder", () => {
  it("keeps the production recipe facade compatible with the legacy builder export", () => {
    const options = {
      recipeLanguage: "English",
      preferredCuisine: "Italian",
      calorieTarget: 1800,
      maxMissingIngredients: 3,
      recipeCount: 5,
      diets: [],
      conditions: []
    };
    const ingredients = [{ name: "chicken breast" }, { name: "tomato" }];

    expect(PromptBuilder.recipeGeneration(ingredients, options)).toBe(buildRecipeGenerationPrompt(ingredients, options));
  });

  it("omits inapplicable prompt modules without changing module order", () => {
    expect(PromptBuilder.compose(["system", "", undefined, false, "schema"])).toBe("system schema");
  });

  it("owns the fridge image prompt and preserves its JSON contract", () => {
    const prompt = PromptBuilder.fridgeImageAnalysis();

    expect(prompt).toContain("Do not hallucinate items that are not present.");
    expect(prompt).toContain('"recipeSuggestion"');
  });
});

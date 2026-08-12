import { describe, expect, it } from "vitest";
import { PromptBuilder, buildRecipeGenerationPrompt } from "../ai/PromptBuilder";
import { createRecipeInputCoveragePlan, toRecipeInputCoveragePrompt } from "../services/recipeInputCoverageService";

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

  it("tells the recipe editor how to satisfy the deterministic validators", () => {
    const prompt = PromptBuilder.recipeEditorSystemPrompt("English");

    expect(prompt).toContain("positive quantity and a clear unit");
    expect(prompt).toContain("Use ingredients only for source-recipe ingredients the user already has");
    expect(prompt).toContain("Do not duplicate normalized ingredient names");
    expect(prompt).toContain("Do not add an available pantry ingredient unless it is part of the source recipe");
    expect(prompt).toContain("never return a preparation modifier as a standalone ingredient");
    expect(prompt).toContain("Mention every ingredient listed in the returned ingredients array and every missing protein ingredient");
    expect(prompt).toContain("total whole minutes in the exact format '<number> minutes'");
    expect(prompt).toContain("do not return hours, ranges, or approximate prose");
  });

  it("builds one ID-keyed batch editor contract without pantry ownership instructions", () => {
    const prompt = JSON.parse(PromptBuilder.recipeEditorBatchPrompt({
      recipeLanguage: "English",
      preferredCuisine: "Any",
      calorieTarget: 1650,
      maxMissingIngredients: 3,
      recipeCount: 2,
      diets: [],
      conditions: [],
      recipeReferences: [
        {
          id: "chicken-piccata",
          title: "Chicken Piccata",
          cuisine: "Italian",
          ingredients: ["500 g chicken breast", "2 tbsp olive oil"],
          steps: ["Brown the chicken.", "Finish the sauce."],
          matchedIngredients: ["chicken"]
        },
        {
          id: "shrimp-curry",
          title: "Shrimp Curry",
          cuisine: "Indian",
          ingredients: ["400 g shrimp", "1 cup tomato"],
          steps: ["Cook the tomato base.", "Simmer the shrimp."],
          matchedIngredients: ["shrimp"]
        }
      ]
    }));

    expect(prompt.task).toBe("edit_validated_recipe_batch");
    expect(prompt.sourceRecipes.map((recipe: { source_recipe_id: string }) => recipe.source_recipe_id)).toEqual([
      "chicken-piccata",
      "shrimp-curry"
    ]);
    expect(prompt.availableIngredients).toBeUndefined();
    expect(prompt.outputContract.missingIngredientsMustBeEmpty).toBe(true);
    expect(PromptBuilder.recipeEditorBatchSystemPrompt("English")).toContain("exactly one result for every source_recipe_id");
    expect(PromptBuilder.recipeEditorBatchResponseSchema(2).minItems).toBe(2);
    expect(PromptBuilder.recipeEditorBatchResponseSchema(2).maxItems).toBe(2);
  });

  it("requires grounded discovery to paraphrase sources and satisfy response validation", () => {
    const prompt = PromptBuilder.recipeDiscoverySystemPrompt("English");

    expect(prompt).toContain("independently summarize and paraphrase");
    expect(prompt).toContain("Never copy source introductions");
    expect(prompt).toContain("positive quantity and a clear unit");
    expect(prompt).toContain("at least two specific, ordered cooking steps");
    expect(prompt).toContain("total whole minutes in the exact format '<number> minutes'");
    expect(prompt).not.toContain("arrays copied from the source recipe");
  });

  it("builds a Flash-Lite-compatible recipe generation contract", () => {
    const prompt = PromptBuilder.recipeBatchGenerationSystemPrompt("English");
    const schema = PromptBuilder.recipeGenerationResponseSchema(10);

    expect(prompt).toContain("Return exactly the recipeCount requested");
    expect(prompt).toContain("Do not paste every requested anchor into every recipe");
    expect(prompt).toContain("A valid lower-overlap recipe is better than a falsely combined recipe");
    expect(prompt).toContain("Estimate calories, protein, carbs, fat, and sodium realistically");
    expect("minItems" in schema).toBe(false);
    expect("maxItems" in schema).toBe(false);
    expect(schema.items.required).not.toContain("source_url");
    expect(schema.items.properties.recipe_source_type.enum).toEqual(["generated"]);
  });

  it("builds Flash-Lite-compatible per-anchor arrays for one-call batch coverage", () => {
    const coverage = toRecipeInputCoveragePrompt(createRecipeInputCoveragePlan(["beef", "liver"], 16));
    const schema = PromptBuilder.recipeGenerationResponseSchema(16, coverage);

    expect(schema.required).toEqual(["recipeGroups"]);
    expect(schema.properties.recipeGroups.required).toEqual(["beef", "liver"]);
    expect(schema.properties.recipeGroups.properties.beef.type).toBe("array");
    expect(schema.properties.recipeGroups.properties.liver.type).toBe("array");
    expect("minItems" in schema.properties.recipeGroups.properties.beef).toBe(false);
    expect("maxItems" in schema.properties.recipeGroups.properties.liver).toBe(false);
  });

  it("discovers established cross-cuisine dishes that maximize pantry usage", () => {
    const coverage = toRecipeInputCoveragePrompt(createRecipeInputCoveragePlan(["fish", "rice", "onion"], 10));
    const context = JSON.parse(PromptBuilder.recipeGeneration(
      [{ name: "fish" }, { name: "rice" }, { name: "onion" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1650,
        maxMissingIngredients: 3,
        ingredientCoverage: coverage,
        recipeCount: 10,
        diets: [],
        conditions: []
      }
    ));

    expect(context.ingredientCoverage.combinationPriority.targetMultiAnchorCards).toBe(4);
    expect(context.dishDiscoveryHints).toContain("sayadeya");
    expect(PromptBuilder.recipeBatchGenerationSystemPrompt("English"))
      .toContain("combine the greatest number of requested anchors");
  });
});

import { describe, expect, it } from "vitest";
import { PromptBuilder, buildRecipeEditorSystemPrompt, buildRecipeGenerationPrompt } from "../ai/PromptBuilder";

const reference = {
  id: "chicken-cacciatore",
  title: "Chicken Cacciatore",
  cuisine: "Italian",
  sourceUrl: "https://example.com/should-not-be-sent",
  matchedIngredients: ["chicken"],
  ingredients: ["chicken breast", "tomatoes", "olives", "mushrooms", "olive oil"],
  steps: ["Brown the chicken.", "Simmer with tomatoes and olives."]
};

function buildPrompt(recipeLanguage = "English") {
  return buildRecipeGenerationPrompt(
    [{ name: "chicken", quantity: "500g" }],
    {
      recipeLanguage,
      preferredCuisine: "Italian",
      calorieTarget: 1800,
      maxMissingIngredients: 5,
      recipeCount: 10,
      diets: [],
      conditions: ["cholesterol", "highBloodPressure", "diabetes"],
      allergens: [],
      recipeReferences: [reference, { ...reference, id: "ignored", title: "Second Recipe" }]
    }
  );
}

describe("compact recipe editor prompt", () => {
  it("sends exactly one validated source recipe without metadata", () => {
    const context = JSON.parse(buildPrompt());

    expect(context.task).toBe("edit_validated_recipe");
    expect(context.sourceRecipe.title).toBe("Chicken Cacciatore");
    expect(context.sourceRecipe).not.toHaveProperty("sourceUrl");
    expect(context.sourceRecipe).not.toHaveProperty("imagePrompt");
    expect(JSON.stringify(context)).not.toContain("Second Recipe");
    expect(JSON.stringify(context)).not.toContain("https://");
    expect(JSON.stringify(context)).not.toContain("nutrition");
    expect(JSON.stringify(context)).not.toContain("shopping");
    expect(JSON.stringify(context)).not.toContain("image_search");
  });

  it("uses a small JSON-only output schema with plain string arrays", () => {
    const context = JSON.parse(buildPrompt());
    const schema = PromptBuilder.recipeEditorResponseSchema();

    expect(context).not.toHaveProperty("returnFormat");
    expect(context).not.toHaveProperty("output");
    expect(schema.type).toBe("array");
    expect(schema.items.properties.ingredients.items.type).toBe("string");
    expect(JSON.stringify(context)).not.toContain("missing_ingredients");
  });

  it("adds localization guidance only to the matching system instruction", () => {
    const englishSystem = buildRecipeEditorSystemPrompt("English");
    const arabicSystem = buildRecipeEditorSystemPrompt("Arabic");

    expect(englishSystem).toContain("English only");
    expect(englishSystem).not.toContain("Modern Standard Arabic");
    expect(arabicSystem).toContain("Modern Standard Arabic");
    expect(arabicSystem).not.toContain("English only");
  });

  it("keeps the representative editor request below the prompt budget", () => {
    const combinedCharacterCount = buildPrompt("Arabic").length + buildRecipeEditorSystemPrompt("Arabic").length;

    expect(combinedCharacterCount).toBeLessThan(5_000);
  });
});

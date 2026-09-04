import { describe, expect, it } from "vitest";
import {
  PromptBuilder,
  buildRecipeDiscoverySystemPrompt,
  buildRecipeEditorSystemPrompt,
  buildRecipeGenerationPrompt
} from "../ai/PromptBuilder";

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

  it("states active substitutions compactly and requires consistent replacement", () => {
    const context = JSON.parse(buildRecipeGenerationPrompt(
      [{ name: "eggplant" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Italian",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 1,
        diets: ["vegetarian", "glutenFree"],
        conditions: [],
        allergens: [],
        recipeReferences: [reference]
      }
    ));

    expect(context.requiredChanges).toHaveLength(2);
    expect(context.requiredChanges.join(" ")).toContain("gluten-free equivalent");
    expect(context.requiredChanges.join(" ")).toContain("vegetarian protein");
    expect(buildRecipeEditorSystemPrompt("English")).toContain("replace every occurrence consistently");
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

  it("uses a grounded discovery contract when no source recipe exists", () => {
    const prompt = buildRecipeGenerationPrompt([{ name: "chicken" }], {
      recipeLanguage: "Arabic",
      preferredCuisine: "Italian",
      calorieTarget: 1800,
      maxMissingIngredients: 4,
      recipeCount: 5,
      diets: [],
      conditions: [],
      recipeReferences: []
    });
    const context = JSON.parse(prompt);
    const system = buildRecipeDiscoverySystemPrompt("Arabic");
    const schema = PromptBuilder.recipeDiscoveryResponseSchema(5);

    expect(context.task).toBe("discover_grounded_recipes");
    expect(context.sourceRecipe).toBeNull();
    expect(context.recipeCount).toBe(5);
    expect(system).toContain("Google Search grounding");
    expect(system).toContain("Modern Standard Arabic");
    expect(schema.maxItems).toBe(5);
    expect(schema.items.required).toContain("source_url");
    expect(schema.items.required).toContain("dish_identity");
  });

  it("makes the dairy-free egg exclusion explicit during discovery", () => {
    const context = JSON.parse(buildRecipeGenerationPrompt([{ name: "tomato" }], {
      recipeLanguage: "English",
      preferredCuisine: "Any",
      calorieTarget: 1800,
      maxMissingIngredients: 4,
      recipeCount: 5,
      diets: ["dairyFree"],
      conditions: [],
      allergens: [],
      recipeReferences: []
    }));

    expect(context.requiredChanges.join(" ")).toContain("dairy-free also means egg-free");
  });
});

import { describe, expect, it } from "vitest";
import { buildMealPlanPrompt, buildRecipeGenerationPrompt } from "../lib/aiPrompts";

describe("cuisine prompt depth", () => {
  it("keeps Italian generation anchored to iconic dishes including pizza", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "flatbread", quantity: "2 pieces" },
        { name: "tomato sauce", quantity: "1 cup" },
        { name: "mozzarella", quantity: "150g" },
        { name: "basil", quantity: "small bunch" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Italian",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Italian pizza rule");
    expect(prompt).toContain("pizza margherita");
    expect(prompt).toContain("before generic toast, sandwich, or baked bread");
    expect(prompt).toContain("at least half of the selected-cuisine cards should be recognizable named dishes");
  });

  it("keeps Italian weekly plans from collapsing into generic pasta and bowls", () => {
    const prompt = buildMealPlanPrompt({
      pantry: ["pasta", "tomato sauce", "bread", "rice", "chicken", "eggplant"],
      pantryItems: [
        { name: "pasta", quantity: "500g" },
        { name: "tomato sauce", quantity: "2 cups" },
        { name: "bread", quantity: "1 loaf" },
        { name: "rice", quantity: "2 cups" },
        { name: "chicken", quantity: "500g" },
        { name: "eggplant", quantity: "2 whole" }
      ],
      diets: [],
      conditions: [],
      allergens: [],
      recipeLanguage: "English",
      preferredCuisine: "Italian",
      calorieTarget: 2000
    });

    expect(prompt).toContain("pizza margherita");
    expect(prompt).toContain("pasta alla norma");
    expect(prompt).toContain("chicken cacciatore");
    expect(prompt).toContain("Do not output multiple generic pasta cards");
  });

  it("promotes shawarma when Middle Eastern pantry signals fit", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "chicken", quantity: "500g" },
        { name: "pita", quantity: "4 pieces" },
        { name: "garlic", quantity: "3 cloves" },
        { name: "lemon", quantity: "1 whole" },
        { name: "tahini", quantity: "2 tbsp" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Middle Eastern",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Middle Eastern shawarma rule");
    expect(prompt).toContain("Shawarma family rule is active");
    expect(prompt).toContain("chicken shawarma wrap");
    expect(prompt).toContain("before a generic grilled meat plate");
  });

  it("forces Any cuisine to rotate beyond the usual nearby cuisines", () => {
    const recipePrompt = buildRecipeGenerationPrompt(
      [
        { name: "chicken", quantity: "500g" },
        { name: "rice", quantity: "2 cups" },
        { name: "tomato sauce", quantity: "1 cup" },
        { name: "pasta", quantity: "300g" },
        { name: "bread", quantity: "1 loaf" },
        { name: "egg", quantity: "6 whole" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );
    const mealPlanPrompt = buildMealPlanPrompt({
      pantry: ["chicken", "rice", "tomato sauce", "pasta", "bread", "egg"],
      diets: [],
      conditions: [],
      allergens: [],
      recipeLanguage: "English",
      preferredCuisine: "Any",
      calorieTarget: 2000
    });

    expect(recipePrompt).toContain("Any-cuisine rotation rule");
    expect(recipePrompt).toContain("not only Egyptian, Turkish, and Mediterranean");
    expect(recipePrompt).toContain("Italian, Mexican, Indian, Thai");
    expect(mealPlanPrompt).toContain("Any-cuisine rotation rule");
    expect(mealPlanPrompt).toContain("Do not let Egyptian + Turkish + Mediterranean together");
  });

  it("adds broad named vegetarian dinner families and respects dairy-free egg bans", () => {
    const vegetarianPrompt = buildRecipeGenerationPrompt(
      [
        { name: "black beans", quantity: "2 cups" },
        { name: "sweet potato", quantity: "2 whole" },
        { name: "mushrooms", quantity: "300g" },
        { name: "pasta", quantity: "300g" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: ["vegetarian", "dairyFree"],
        conditions: [],
        allergens: []
      }
    );

    expect(vegetarianPrompt).toContain("Southern-inspired vegetarian dinner variety");
    expect(vegetarianPrompt).toContain("Good Food-inspired vegetarian dinner variety");
    expect(vegetarianPrompt).toContain("Everyday vegetarian dinner variety");
    expect(vegetarianPrompt).toContain("black bean enchiladas");
    expect(vegetarianPrompt).toContain("chickpea shawarma bowls");
    expect(vegetarianPrompt).toContain("no eggs, and no dairy");
    expect(vegetarianPrompt).toContain("Do not use eggs or dairy as shortcuts");
  });

  it("prevents shrimp recipes from clustering around garlic lemon seasoning", () => {
    const prompt = buildRecipeGenerationPrompt(
      [{ name: "shrimp", quantity: "1 kg" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Shrimp anti-clustering rule");
    expect(prompt).toContain("at most ONE simple garlic/lemon/cumin shrimp card");
    expect(prompt).toContain("butterfly shrimp");
    expect(prompt).toContain("sweet chili shrimp");
    expect(prompt).toContain("shrimp soup");
    expect(prompt).toContain("shrimp tacos");
    expect(prompt).toContain("Cajun shrimp boil");
  });

  it("prevents vegetarian lentil and eggplant plans from repeating mujadara only", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "lentils", quantity: "2 cups" },
        { name: "eggplant", quantity: "2 whole" },
        { name: "rice", quantity: "2 cups" },
        { name: "tomato sauce", quantity: "1 cup" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: ["vegetarian"],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Vegetarian lentil anti-clustering rule");
    expect(prompt).toContain("Mujadara is only one lentil family");
    expect(prompt).toContain("lentil kofta");
    expect(prompt).toContain("koshary");
    expect(prompt).toContain("Vegetarian eggplant anti-clustering rule");
    expect(prompt).toContain("pickled eggplant");
    expect(prompt).toContain("eggplant bechamel casserole");
    expect(prompt).toContain("stuffed eggplant with rice and vegetables");
  });
});

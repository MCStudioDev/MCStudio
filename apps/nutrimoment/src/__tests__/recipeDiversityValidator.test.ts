import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import {
  calculateRecipeSimilarity,
  enforceRecipeDiversity
} from "../services/recipeDiversityValidator";

const baseRecipe: Recipe = {
  name: "Chicken Parmesan",
  cuisine: "Italian",
  dish_intent: {
    dish_name: "Chicken Parmesan",
    cuisine: "Italian",
    cooking_method: "baked",
    visual_keywords: ["chicken", "tomato", "cheese"],
    exclude_keywords: []
  },
  ingredients: ["2 pieces chicken breast", "1 cup tomato sauce", "1 cup mozzarella"],
  missing_ingredients: [],
  steps: [
    "Bake the chicken with tomato sauce.",
    "Top the chicken with mozzarella and bake until bubbling."
  ],
  calories: 540,
  protein: "44g",
  carbs: "28g",
  fat: "24g",
  cook_time: "35 minutes",
  difficulty: "Easy"
};

function recipe(overrides: Partial<Recipe>): Recipe {
  return { ...baseRecipe, ...overrides };
}

describe("recipe diversity validator", () => {
  it("rejects recipes above the similarity threshold", () => {
    const duplicate = recipe({
      name: "Baked Chicken Parmesan",
      steps: [
        "Bake the chicken with tomato sauce.",
        "Top the chicken with mozzarella and bake until bubbling."
      ]
    });
    const shawarma = recipe({
      name: "Chicken Shawarma Plate",
      cuisine: "Middle Eastern",
      dish_intent: {
        dish_name: "Chicken Shawarma Plate",
        cuisine: "Middle Eastern",
        cooking_method: "grilled",
        visual_keywords: ["chicken", "shawarma"],
        exclude_keywords: []
      },
      ingredients: ["2 pieces chicken thighs", "1 cup yogurt", "1 tbsp shawarma spice"],
      steps: [
        "Marinate the chicken with yogurt and shawarma spice.",
        "Grill the chicken and serve it with vegetables."
      ]
    });

    expect(calculateRecipeSimilarity(baseRecipe, duplicate).total).toBeGreaterThan(0.75);
    expect(enforceRecipeDiversity([baseRecipe, duplicate, shawarma], { limit: 3 })).toEqual([
      baseRecipe,
      shawarma
    ]);
  });

  it("prefers cuisine and cooking-method variety when alternatives exist", () => {
    const skillet = recipe({
      name: "Chicken Tomato Skillet",
      dish_intent: {
        dish_name: "Chicken Tomato Skillet",
        cuisine: "Italian",
        cooking_method: "sauteed",
        visual_keywords: ["chicken", "tomato"],
        exclude_keywords: []
      }
    });
    const teriyaki = recipe({
      name: "Chicken Teriyaki Bowl",
      cuisine: "Japanese",
      dish_intent: {
        dish_name: "Chicken Teriyaki Bowl",
        cuisine: "Japanese",
        cooking_method: "sauteed",
        visual_keywords: ["chicken", "teriyaki"],
        exclude_keywords: []
      },
      ingredients: ["2 pieces chicken thigh", "1 cup rice", "2 tbsp teriyaki sauce"],
      steps: ["Cook the rice.", "Saute the chicken with teriyaki sauce."]
    });

    const selected = enforceRecipeDiversity([baseRecipe, skillet, teriyaki], { limit: 2 });

    expect(selected.map((item) => item.name)).toEqual(["Chicken Parmesan", "Chicken Teriyaki Bowl"]);
  });

  it("does not force foreign cuisines when a cuisine was explicitly selected", () => {
    const egyptianGrilled = recipe({
      name: "Egyptian Grilled Chicken",
      cuisine: "Egyptian",
      dish_intent: { ...baseRecipe.dish_intent!, cuisine: "Egyptian", cooking_method: "grilled" }
    });
    const egyptianStew = recipe({
      name: "Egyptian Chicken Stew",
      cuisine: "Egyptian",
      dish_intent: { ...baseRecipe.dish_intent!, cuisine: "Egyptian", cooking_method: "stewed" }
    });
    const italianBaked = recipe({
      name: "Italian Baked Chicken",
      cuisine: "Italian",
      dish_intent: { ...baseRecipe.dish_intent!, cuisine: "Italian", cooking_method: "baked" }
    });

    const selected = enforceRecipeDiversity(
      [egyptianGrilled, egyptianStew, italianBaked],
      { limit: 10, rotateCuisines: false }
    );

    expect(selected.slice(0, 2).map((item) => item.cuisine)).toEqual(["Egyptian", "Egyptian"]);
  });

  it("caps repeated baked, creamy, and tomato-based cards when filling large sets", () => {
    const candidates = [
      recipe({ name: "Baked Tomato Chicken", cuisine: "Italian" }),
      recipe({ name: "Baked Creamy Chicken", cuisine: "American", ingredients: ["2 pieces chicken", "1 cup cream"] }),
      recipe({ name: "Roasted Tomato Chicken", cuisine: "Greek" }),
      recipe({ name: "Chicken Shawarma", cuisine: "Middle Eastern", dish_intent: { ...baseRecipe.dish_intent!, cooking_method: "grilled" } }),
      recipe({ name: "Chicken Teriyaki", cuisine: "Japanese", dish_intent: { ...baseRecipe.dish_intent!, cooking_method: "sauteed" } }),
      recipe({ name: "Butter Chicken", cuisine: "Indian", dish_intent: { ...baseRecipe.dish_intent!, cooking_method: "stewed" } })
    ];

    const selected = enforceRecipeDiversity(candidates, {
      limit: 5,
      targets: {
        maxBaked: 2,
        maxCreamy: 2,
        maxTomatoBased: 2,
        minimumCookingMethods: 4,
        minimumCuisines: 3
      }
    });

    expect(selected.filter((item) => /baked|roasted/i.test(item.name)).length).toBeLessThanOrEqual(2);
    expect(new Set(selected.map((item) => item.cuisine)).size).toBeGreaterThanOrEqual(3);
  });

  it("does not soft-fill two title variants of the same dish family", () => {
    const tabbouleh = recipe({
      id: "tabbouleh-1",
      name: "Tabbouleh",
      dish_identity: "Tabbouleh",
      dish_intent: { ...baseRecipe.dish_intent!, dish_name: "Tabbouleh", cooking_method: "assembled" }
    });
    const authenticTabbouleh = recipe({
      id: "tabbouleh-2",
      name: "Authentic Tabbouleh",
      dish_identity: "Authentic Tabbouleh",
      dish_intent: { ...baseRecipe.dish_intent!, dish_name: "Authentic Tabbouleh", cooking_method: "assembled" }
    });

    expect(enforceRecipeDiversity([tabbouleh, authenticTabbouleh], { limit: 2, softFill: true }))
      .toEqual([tabbouleh]);
  });

  it("collapses localized and qualified variants of the same named dish", () => {
    const cacciatore = recipe({
      id: "cacciatore-1",
      name: "Chicken Cacciatore",
      dish_identity: "Chicken Cacciatore",
      dish_intent: { ...baseRecipe.dish_intent!, dish_name: "Italian tomato chicken" }
    });
    const localizedCacciatore = recipe({
      id: "cacciatore-2",
      name: "\u062f\u062c\u0627\u062c \u0643\u0627\u062a\u0634\u0627\u062a\u0648\u0631\u064a \u0627\u0644\u0625\u064a\u0637\u0627\u0644\u064a",
      dish_identity: "Easy Chicken Cacciatore",
      dish_intent: { ...baseRecipe.dish_intent!, dish_name: "Microwave chicken" }
    });
    const piccata = recipe({
      id: "piccata",
      name: "Chicken Piccata",
      dish_identity: "Chicken Piccata",
      dish_intent: { ...baseRecipe.dish_intent!, dish_name: "Lemon chicken" }
    });

    expect(enforceRecipeDiversity(
      [cacciatore, localizedCacciatore, piccata],
      { limit: 3, softFill: true }
    ).map((item) => item.id)).toEqual(["cacciatore-1", "piccata"]);
  });

  it("keeps named regional kofte dishes as distinct recipes", () => {
    const genericKofte = recipe({ id: "kofte", name: "Turkish Kofte", dish_identity: "Turkish Kofte" });
    const cigKofte = recipe({ id: "cig-kofte", name: "Cig Kofte", dish_identity: "Cig Kofte" });
    const izmirKofte = recipe({ id: "izmir-kofte", name: "Izmir Kofte", dish_identity: "Izmir Kofte" });

    expect(enforceRecipeDiversity(
      [genericKofte, cigKofte, izmirKofte],
      { limit: 3, softFill: true }
    ).map((item) => item.id)).toEqual(["kofte", "cig-kofte", "izmir-kofte"]);
  });
});

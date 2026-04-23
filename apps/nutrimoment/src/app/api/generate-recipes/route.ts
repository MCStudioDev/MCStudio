import { z } from "zod";
import { buildRecipeGenerationPrompt } from "@/lib/aiPrompts";
import { USE_MOCK, ensureAiAvailable, extractJson } from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";
import { generateFallbackRecipes } from "@/services/fallbackAiService";
import { searchCatalogRecipes } from "@/services/recipeSearchService";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import type { Recipe } from "@/lib/types";

const RECIPE_RESULT_COUNT = 10;

const MOCK_RECIPES = {
  recipes: [
    {
      name: "Classic Garlic Chicken with Tomatoes",
      cuisine: "Italian",
      ingredients: ["chicken", "garlic", "tomato", "olive oil", "basil"],
      missing_ingredients: ["parmesan cheese"],
      steps: [
        "Heat olive oil in a large pan over medium heat",
        "Add minced garlic and saute until fragrant (1 minute)",
        "Add chicken pieces and cook until golden (8-10 minutes)",
        "Add chopped tomatoes and simmer for 15 minutes",
        "Season with salt, pepper, and fresh basil",
        "Serve hot with pasta or rice"
      ],
      calories: 450,
      protein: "38g",
      carbs: "12g",
      fat: "28g",
      cook_time: "30 mins",
      difficulty: "Easy"
    },
    {
      name: "Creamy Garlic Chicken Pasta",
      cuisine: "Italian-American",
      ingredients: ["chicken", "garlic", "tomato", "olive oil", "basil", "onion"],
      missing_ingredients: ["cream", "parmesan"],
      steps: [
        "Cook pasta according to package directions",
        "Pan-fry chicken with garlic and onions",
        "Add crushed tomatoes and simmer",
        "Combine pasta with the sauce",
        "Top with fresh basil",
        "Serve immediately"
      ],
      calories: 520,
      protein: "42g",
      carbs: "45g",
      fat: "15g",
      cook_time: "25 mins",
      difficulty: "Easy"
    },
    {
      name: "Tomato and Basil Chicken Skewers",
      cuisine: "Mediterranean",
      ingredients: ["chicken", "tomato", "basil", "garlic", "olive oil"],
      missing_ingredients: ["bell peppers"],
      steps: [
        "Cut chicken into cubes",
        "Thread onto skewers alternating with tomatoes",
        "Brush with garlic-infused olive oil",
        "Grill for 12-15 minutes, turning occasionally",
        "Season with basil, salt and pepper",
        "Rest for 2 minutes before serving"
      ],
      calories: 380,
      protein: "40g",
      carbs: "8g",
      fat: "22g",
      cook_time: "20 mins",
      difficulty: "Medium"
    }
  ]
};

const requestSchema = z.object({
  ingredients: z.array(z.string()).min(1).optional(),
  ingredientQuantities: z.array(z.string()).optional(),
  prompt: z.string().min(20).optional(),
  recipeLanguage: z.string().optional(),
  preferredCuisine: z.string().optional(),
  calorieTarget: z.number().optional(),
  maxMissingIngredients: z.number().optional(),
  diets: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional()
}).refine((value) => Boolean(value.ingredients?.length || value.prompt), {
  message: "Provide ingredients or a prompt."
});

export async function POST(request: Request) {
  let accessCheck: Awaited<ReturnType<typeof canUseApiFeature>> | null = null;
  try {
    accessCheck = await canUseApiFeature(request, "recipe_generation");
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "No ingredients provided" },
        { status: 400 }
      );
    }

    const ingredients = parsed.data.ingredients ?? extractIngredientsFromPrompt(parsed.data.prompt ?? "");
    const availableIngredients = await buildAvailableIngredientSet(ingredients);

    if (USE_MOCK && accessCheck.allowed) {
      const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_generation");
      const strictRecipes = rankStrictRecipes(
        applyStrictIngredientOwnership(MOCK_RECIPES.recipes, availableIngredients),
        parsed.data
      );
      return Response.json({
        recipes: strictRecipes,
        result: JSON.stringify(strictRecipes),
        servedFrom: "mock",
        access: accessPayload(nextAccess)
      });
    }

    const searchResult = await searchCatalogRecipes({
      ingredients,
      preferredCuisine: parsed.data.preferredCuisine,
      calorieTarget: parsed.data.calorieTarget,
      diets: parsed.data.diets,
      conditions: parsed.data.conditions,
      allergens: parsed.data.allergens,
      maxResults: RECIPE_RESULT_COUNT
    });

    if (!accessCheck.allowed) {
      console.info("Recipe generation served from offline catalog because access is not allowed", {
        reason: accessCheck.reason,
        recipeCount: searchResult.recipes.length
      });
      const strictRecipes = rankStrictRecipes(
        applyStrictIngredientOwnership(searchResult.recipes, availableIngredients),
        parsed.data
      );
      return Response.json({
        result: JSON.stringify(strictRecipes),
        servedFrom: searchResult.servedFrom,
        canLoadMore: searchResult.canLoadMore,
        fallbackNotice: "Your 5 free AI credits are used. These recipes are from the offline catalog.",
        access: accessPayload(accessCheck.access)
      });
    }

    const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_generation");

    try {
      ensureAiAvailable();
      const prompt = ingredients.length
        ? buildRecipeGenerationPrompt(
            ingredients.map((ingredient, index) => ({
              name: ingredient,
              quantity: readIngredientQuantity(parsed.data.ingredientQuantities?.[index])
            })),
            {
              recipeLanguage: parsed.data.recipeLanguage ?? "English",
              preferredCuisine: parsed.data.preferredCuisine ?? "Any",
              calorieTarget: parsed.data.calorieTarget ?? 2000,
              maxMissingIngredients: parsed.data.maxMissingIngredients ?? 3,
              diets: parsed.data.diets ?? [],
              conditions: parsed.data.conditions ?? [],
              allergens: parsed.data.allergens ?? []
            }
          )
        : parsed.data.prompt ?? "";
      const text = await generateFallbackRecipes(prompt);
      const json = extractJson(text);
      const recipes = JSON.parse(json);
      const normalizedRecipes = recipes.recipes ?? recipes;
      if (Array.isArray(normalizedRecipes) && normalizedRecipes.length) {
        const strictRecipes = rankStrictRecipes(
          applyStrictIngredientOwnership(normalizedRecipes, availableIngredients),
          parsed.data
        ).slice(0, RECIPE_RESULT_COUNT);
        console.info("Recipe generation served from Gemini fallback AI", {
          recipeCount: strictRecipes.length
        });
        return Response.json({
          ...recipes,
          recipes: strictRecipes,
          servedFrom: "fallback_ai",
          result: JSON.stringify(strictRecipes),
          access: accessPayload(nextAccess)
        });
      }
    } catch (aiError) {
      console.error("AI recipe generation failed; using offline catalog fallback:", aiError);
    }

    console.info("Recipe generation served from offline catalog after AI failure", {
      recipeCount: searchResult.recipes.length,
      canLoadMore: searchResult.canLoadMore
    });
    const strictRecipes = rankStrictRecipes(
      applyStrictIngredientOwnership(searchResult.recipes, availableIngredients),
      parsed.data
    );
    return Response.json({
      result: JSON.stringify(strictRecipes),
      servedFrom: "offline_catalog",
      canLoadMore: searchResult.canLoadMore,
      fallbackNotice: "AI recipe generation was unavailable, so we used offline catalog matches.",
      access: accessPayload(nextAccess)
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Admin") || error.message.includes("Premium") || error.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(error);
    }
    console.error("Error generating recipes:", error);
    const message = error instanceof Error ? error.message : "Failed to generate recipes";
    return Response.json(
      { error: message },
      { status: message.includes("GEMINI_API_KEY") ? 503 : 500 }
    );
  }
}

function extractIngredientsFromPrompt(prompt: string): string[] {
  const exact = prompt.match(/ingredients:\s*(.+?)\./i);
  if (exact?.[1]) {
    return exact[1].split(",").map((item) => item.trim()).filter(Boolean);
  }

  const broad = prompt.match(/using these ingredients:\s*(.+?)\./i);
  if (broad?.[1]) {
    return broad[1].split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function readIngredientQuantity(value?: string) {
  if (!value) return undefined;
  const [, quantity] = value.split(/\s+-\s+/, 2);
  return quantity?.trim() || undefined;
}

async function buildAvailableIngredientSet(inputIngredients: string[]) {
  const normalized = await normalizeIngredients(inputIngredients);
  return new Set(
    [...inputIngredients, ...normalized.normalized]
      .map(normalizeIngredientForStrictMatch)
      .filter(Boolean)
  );
}

function applyStrictIngredientOwnership(inputRecipes: unknown[], availableIngredients: Set<string>): Recipe[] {
  return inputRecipes.map((recipe) => {
    const baseRecipe = recipe as Recipe;
    const allRecipeIngredients = dedupeIngredients([
      ...(Array.isArray(baseRecipe.ingredients) ? baseRecipe.ingredients : []),
      ...(Array.isArray(baseRecipe.missing_ingredients) ? baseRecipe.missing_ingredients : [])
    ]);

    const owned: string[] = [];
    const missing: string[] = [];

    for (const ingredient of allRecipeIngredients) {
      const label = getRecipeIngredientLabel(ingredient);
      if (isIngredientAvailable(label, availableIngredients)) {
        owned.push(label);
      } else {
        missing.push(label);
      }
    }

    return {
      ...baseRecipe,
      ingredients: owned,
      missing_ingredients: missing
    };
  });
}

function rankStrictRecipes(
  recipes: Recipe[],
  options: {
    preferredCuisine?: string;
    calorieTarget?: number;
    maxMissingIngredients?: number;
    diets?: string[];
    conditions?: string[];
  }
) {
  const targetCaloriesPerMeal = Math.round((options.calorieTarget ?? 2000) / 3);
  const preferredCuisine = options.preferredCuisine && options.preferredCuisine !== "Any"
    ? options.preferredCuisine.toLowerCase()
    : "";

  return recipes
    .map((recipe, index) => ({
      recipe,
      index,
      score: scoreStrictRecipe(recipe, {
        targetCaloriesPerMeal,
        preferredCuisine,
        maxMissingIngredients: options.maxMissingIngredients ?? 3,
        hasPreferences: Boolean(options.diets?.length || options.conditions?.length)
      })
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ recipe }) => recipe)
    .slice(0, RECIPE_RESULT_COUNT);
}

function scoreStrictRecipe(
  recipe: Recipe,
  options: {
    targetCaloriesPerMeal: number;
    preferredCuisine: string;
    maxMissingIngredients: number;
    hasPreferences: boolean;
  }
) {
  const ownedCount = recipe.ingredients.length;
  const missingCount = recipe.missing_ingredients.length;
  const preferenceHitCount = recipe.preference_hits?.length ?? 0;
  const cuisineMatch =
    options.preferredCuisine && recipe.cuisine.toLowerCase().includes(options.preferredCuisine)
      ? 1
      : 0;
  const calorieDistance = Number.isFinite(recipe.calories)
    ? Math.abs(recipe.calories - options.targetCaloriesPerMeal)
    : options.targetCaloriesPerMeal;
  const calorieScore = Math.max(0, 8 - calorieDistance / 50);
  const maxMissingBonus = missingCount <= options.maxMissingIngredients ? 4 : -4;
  const matchQualityScore = getMatchQualityScore(recipe.match_quality);

  return (
    ownedCount * 20 -
    missingCount * 8 +
    preferenceHitCount * (options.hasPreferences ? 7 : 3) +
    cuisineMatch * 5 +
    calorieScore +
    maxMissingBonus +
    matchQualityScore
  );
}

function getMatchQualityScore(matchQuality: Recipe["match_quality"]) {
  switch (matchQuality) {
    case "great":
      return 8;
    case "good":
      return 5;
    case "possible":
      return 2;
    case "stretch":
      return -3;
    default:
      return 0;
  }
}

function dedupeIngredients(ingredients: unknown[]) {
  const seen = new Set<string>();
  const deduped: unknown[] = [];

  for (const ingredient of ingredients) {
    const key = normalizeIngredientForStrictMatch(getRecipeIngredientLabel(ingredient));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(ingredient);
  }

  return deduped;
}

function getRecipeIngredientLabel(ingredient: unknown) {
  if (typeof ingredient === "string") return ingredient;

  if (ingredient && typeof ingredient === "object") {
    const maybeIngredient = ingredient as { name?: unknown; quantity?: unknown };
    const name = typeof maybeIngredient.name === "string" ? maybeIngredient.name : "";
    const quantity = typeof maybeIngredient.quantity === "string" ? maybeIngredient.quantity : "";

    return [name, quantity].filter(Boolean).join(" - ") || JSON.stringify(ingredient);
  }

  return String(ingredient);
}

function isIngredientAvailable(ingredient: string, availableIngredients: Set<string>) {
  const normalizedIngredient = normalizeIngredientForStrictMatch(ingredient);
  if (!normalizedIngredient) return false;
  if (availableIngredients.has(normalizedIngredient)) return true;

  for (const available of availableIngredients) {
    if (isSafeIngredientSubsetMatch(normalizedIngredient, available)) return true;
  }

  return false;
}

function isSafeIngredientSubsetMatch(recipeIngredient: string, availableIngredient: string) {
  return (
    (recipeIngredient.length >= 4 && availableIngredient.includes(recipeIngredient)) ||
    (availableIngredient.length >= 4 && recipeIngredient.includes(availableIngredient))
  );
}

function normalizeIngredientForStrictMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+-\s+.*$/, "")
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\b(cup|cups|tbsp|tsp|g|gram|grams|kg|lb|oz|can|cans|large|small|medium|whole|clove|cloves|fresh|cooked|dry|rinsed|drained|chopped|diced|sliced|pressed|crumbled|optional)\b/g, " ")
    .replace(/\b(canned|white|brown|green|red|yellow|firm|low sodium|no salt added|any color)\b/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\bbeans\b/g, "bean")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\s+/g, " ")
    .trim();
}

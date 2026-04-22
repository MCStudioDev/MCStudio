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
  conditions: z.array(z.string()).optional()
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

    if (USE_MOCK && accessCheck.allowed) {
      const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_generation");
      return Response.json({
        ...MOCK_RECIPES,
        result: JSON.stringify(MOCK_RECIPES.recipes),
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
      maxResults: 3
    });

    if (!accessCheck.allowed) {
      console.info("Recipe generation served from offline catalog because access is not allowed", {
        reason: accessCheck.reason,
        recipeCount: searchResult.recipes.length
      });
      return Response.json({
        result: JSON.stringify(searchResult.recipes),
        servedFrom: searchResult.servedFrom,
        canLoadMore: searchResult.canLoadMore,
        fallbackNotice: "Your 5 free AI credits are used. These recipes are from the offline catalog.",
        access: accessPayload(accessCheck.access)
      });
    }

    if (!parsed.data.prompt) {
      console.info("Recipe generation served from offline catalog because no AI prompt was provided", {
        recipeCount: searchResult.recipes.length
      });
      return Response.json({
        result: JSON.stringify(searchResult.recipes),
        servedFrom: searchResult.servedFrom,
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
              conditions: parsed.data.conditions ?? []
            }
          )
        : parsed.data.prompt ?? "";
      const text = await generateFallbackRecipes(prompt);
      const json = extractJson(text);
      const recipes = JSON.parse(json);
      const normalizedRecipes = recipes.recipes ?? recipes;
      if (Array.isArray(normalizedRecipes) && normalizedRecipes.length) {
        console.info("Recipe generation served from Gemini fallback AI", {
          recipeCount: normalizedRecipes.length
        });
        return Response.json({
          ...recipes,
          servedFrom: "fallback_ai",
          result: JSON.stringify(normalizedRecipes),
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
    return Response.json({
      result: JSON.stringify(searchResult.recipes),
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

import { z } from "zod";
import {
  getClientFacingAiErrorMessage,
  isTransientModelError,
  USE_MOCK,
  callOpenAIText,
  callOpenAIVision,
  ensureAiAvailable,
  extractJson
} from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  buildFreeAiCreditsExhaustedNotice,
  canUseApiFeature,
  consumeFreeAiCredit,
  isFirebaseTransientError
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { logger } from "@/lib/logger";
import { enforceAuthenticCuisineRecipeSet } from "@/lib/cuisineAuthenticityResolver";
import { PromptBuilder } from "@/ai/PromptBuilder";
import type { Recipe } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Legacy compatibility route. New recipe generation should use
// POST /api/generate-recipes, which has the complete diet/cuisine pipeline.
const requestSchema = z.object({
  ingredients: z.array(z.string()).optional(),
  prompt: z.string().min(20),
  image: z.string().optional(),
  preferredCuisine: z.string().optional(),
  recipeCount: z.number().int().min(1).max(10).optional(),
  recipeLanguage: z.string().optional()
});

const MOCK_RECIPES = [
  {
    name: "Mediterranean Chicken Skillet",
    cuisine: "Mediterranean",
    ingredients: ["chicken breast", "tomato", "onion", "garlic", "olive oil", "basil"],
    missing_ingredients: ["lemon", "feta cheese"],
    steps: [
      "Heat olive oil in a large skillet over medium heat.",
      "Add diced onion and minced garlic; sauté 2 minutes until fragrant.",
      "Cube the chicken breast and add to the skillet, cooking until lightly golden.",
      "Stir in chopped tomato and let simmer for 8 minutes.",
      "Finish with torn basil, a squeeze of lemon and crumbled feta. Serve warm."
    ],
    calories: 420,
    protein: "38g",
    carbs: "14g",
    fat: "22g",
    fiber: "4g",
    sugar: "6g",
    sodium: "380mg",
    cook_time: "25 minutes",
    difficulty: "Easy"
  },
  {
    name: "Garlic Spinach Pasta",
    cuisine: "Italian",
    ingredients: ["garlic", "spinach", "olive oil", "pasta", "basil"],
    missing_ingredients: ["parmesan", "lemon zest"],
    steps: [
      "Bring a large pot of salted water to a boil and cook pasta to al dente.",
      "While pasta cooks, warm olive oil and sauté sliced garlic until golden.",
      "Add spinach and toss until wilted, about 90 seconds.",
      "Drain pasta reserving 1/4 cup pasta water; toss with garlic-spinach mix.",
      "Top with fresh basil, parmesan and lemon zest."
    ],
    calories: 480,
    protein: "16g",
    carbs: "62g",
    fat: "14g",
    fiber: "5g",
    sugar: "3g",
    sodium: "260mg",
    cook_time: "20 minutes",
    difficulty: "Easy"
  },
  {
    name: "Tomato Basil Bruschetta",
    cuisine: "Italian",
    ingredients: ["tomato", "garlic", "basil", "olive oil"],
    missing_ingredients: ["sourdough", "balsamic glaze"],
    steps: [
      "Toast slices of sourdough until golden and crisp.",
      "Rub each toast with a halved garlic clove.",
      "Top with diced tomato tossed in olive oil and torn basil.",
      "Finish with cracked pepper and a drizzle of balsamic glaze."
    ],
    calories: 220,
    protein: "5g",
    carbs: "32g",
    fat: "8g",
    fiber: "3g",
    sugar: "5g",
    sodium: "210mg",
    cook_time: "15 minutes",
    difficulty: "Easy"
  }
];

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  logger.info("Basic recipe generation HTTP request received", { requestId });
  try {
    const accessCheck = await canUseApiFeature(request, "recipe_generation");
    const rl = applyRateLimit({
      uid: accessCheck.access.uid,
      feature: "recipe_generation",
      isPremium: accessCheck.access.isPremium,
      bypass: accessCheck.access.isAdmin
    });
    if (!rl.decision.allowed) {
      return rateLimitedResponse(rl.decision, rl.config);
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    const { image } = parsed.data;
    const prompt = PromptBuilder.legacyRecipeRequest(parsed.data.prompt);

    if (!accessCheck.allowed) {
      return Response.json({
        result: "[]",
        servedFrom: "shared_pool",
        fallbackNotice: buildFreeAiCreditsExhaustedNotice("Use the shared recipe pool or upgrade to premium."),
        access: accessPayload(accessCheck.access)
      });
    }

    if (!accessCheck.access.isPremium && !accessCheck.access.isAdmin) {
      return Response.json({
        result: "[]",
        servedFrom: "shared_pool",
        fallbackNotice: "Free plan recipe generation is served through the curated shared recipe pool. Use /api/generate-recipes for the full free-tier pipeline.",
        access: accessPayload(accessCheck.access)
      });
    }

    const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_generation");
    const availableIngredients = buildLegacyAvailableIngredients(parsed.data.prompt, parsed.data.ingredients);
    const preferredCuisine = parsed.data.preferredCuisine;
    const recipeLanguage = parsed.data.recipeLanguage;
    const recipeCount = parsed.data.recipeCount;

    if (USE_MOCK) {
      const guardedMockRecipes = enforceLegacyCuisineGuard(MOCK_RECIPES, {
        availableIngredients,
        preferredCuisine,
        recipeCount,
        recipeLanguage
      });
      return Response.json({ result: JSON.stringify(guardedMockRecipes), access: accessPayload(nextAccess) });
    }

    ensureAiAvailable();
    const text = image && image.length > 10
      ? await callOpenAIVision(prompt, image)
      : await callOpenAIText(prompt);

    const json = extractJson(text);
    const guardedJson = enforceLegacyRecipePayloadCuisineGuard(json, {
      availableIngredients,
      preferredCuisine,
      recipeCount,
      recipeLanguage,
      requestId
    });
    return Response.json({ result: guardedJson, access: accessPayload(nextAccess) });
  } catch (err) {
    if (
      isFirebaseTransientError(err) ||
      (err instanceof Error && (err.message.includes("Sign in") || err.message.includes("Firebase Admin credentials")))
    ) {
      logger.warn("Basic recipe generation request failed during access checks", {
        requestId,
        errorMessage: err instanceof Error ? err.message : String(err)
      });
      return accessErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : "Recipe generation failed";
    const status = message.includes("GEMINI_API_KEY") ? 503 : isTransientModelError(err) ? 503 : 500;
    const safeMessage = isTransientModelError(err)
      ? getClientFacingAiErrorMessage(err, "Recipe generation is temporarily unavailable. Please try again in a few minutes.")
      : message;
    logger.error("Basic recipe generation failed", err, { requestId });
    return Response.json({ error: safeMessage, result: "[]" }, { status });
  }
}

function enforceLegacyRecipePayloadCuisineGuard(
  json: string,
  options: {
    availableIngredients: string[];
    preferredCuisine?: string;
    recipeCount?: number;
    recipeLanguage?: string;
    requestId: string;
  }
) {
  try {
    const payload = JSON.parse(json) as unknown;
    if (Array.isArray(payload)) {
      return JSON.stringify(enforceLegacyCuisineGuard(payload, options));
    }

    if (payload && typeof payload === "object" && Array.isArray((payload as { recipes?: unknown }).recipes)) {
      const nextPayload = {
        ...payload,
        recipes: enforceLegacyCuisineGuard((payload as { recipes: Recipe[] }).recipes, options)
      };
      return JSON.stringify(nextPayload);
    }
  } catch (error) {
    logger.warn("Legacy recipe cuisine guard could not parse AI payload", {
      requestId: options.requestId,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  return json;
}

function enforceLegacyCuisineGuard(
  recipes: Recipe[],
  options: {
    availableIngredients: string[];
    preferredCuisine?: string;
    recipeCount?: number;
    recipeLanguage?: string;
  }
) {
  const availableIngredients = options.availableIngredients.length
    ? options.availableIngredients
    : recipes.flatMap((recipe) => recipe.ingredients ?? []);

  return enforceAuthenticCuisineRecipeSet(recipes, {
    availableIngredients,
    preferredCuisine: options.preferredCuisine,
    recipeCount: options.recipeCount ?? recipes.length,
    recipeLanguage: options.recipeLanguage
  });
}

function buildLegacyAvailableIngredients(prompt: string, explicitIngredients?: string[]) {
  if (explicitIngredients?.length) return explicitIngredients;

  const pantryMatch = prompt.match(/(?:ingredients|pantry items|items available|available ingredients)\s*:\s*([^.:\n]+)/i);
  const source = pantryMatch?.[1] ?? prompt;
  return Array.from(
    new Set(
      source
        .split(/[,;\n]/)
        .map((item) => item.replace(/\b(generate|create|recipe|recipes|with|using|make|cook|for|and)\b/gi, "").trim())
        .filter((item) => item.length > 1 && item.length <= 48)
        .slice(0, 24)
    )
  );
}

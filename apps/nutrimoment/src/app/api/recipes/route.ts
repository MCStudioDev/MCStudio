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
  canUseApiFeature,
  consumeFreeAiCredit,
  isFirebaseTransientError
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().min(20),
  image: z.string().optional()
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
    const { prompt, image } = parsed.data;

    if (!accessCheck.allowed) {
      return Response.json({
        result: "[]",
        servedFrom: "shared_pool",
        fallbackNotice: "Your 5 free AI credits are used. Use the shared recipe pool or upgrade to premium.",
        access: accessPayload(accessCheck.access)
      });
    }

    const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_generation");

    if (USE_MOCK) {
      return Response.json({ result: JSON.stringify(MOCK_RECIPES), access: accessPayload(nextAccess) });
    }

    ensureAiAvailable();
    const text = image && image.length > 10
      ? await callOpenAIVision(prompt, image)
      : await callOpenAIText(prompt);

    const json = extractJson(text);
    return Response.json({ result: json, access: accessPayload(nextAccess) });
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

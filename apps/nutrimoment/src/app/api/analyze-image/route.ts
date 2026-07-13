import { buildIngredientVisionPrompt } from "@/lib/aiPrompts";
import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";
import { logger } from "@/lib/logger";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";

// Deprecated compatibility route. New image ingredient extraction should use
// POST /api/scan or POST /api/scan/process.
export async function POST(request: Request) {
  try {
    const accessCheck = await canUseApiFeature(request, "image_to_text");
    const rl = applyRateLimit({
      uid: accessCheck.access.uid,
      feature: "image_scan",
      isPremium: accessCheck.access.isPremium,
      bypass: accessCheck.access.isAdmin
    });
    if (!rl.decision.allowed) {
      return rateLimitedResponse(rl.decision, rl.config);
    }
    const { image } = await request.json();

    if (!image) {
      return Response.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    if (!accessCheck.access.isPremium && !accessCheck.access.isAdmin) {
      return Response.json(
        {
          error: "Scan fridge is a premium feature.",
          access: accessPayload(accessCheck.access)
        },
        { status: 403 }
      );
    }

    if (!accessCheck.allowed) {
      return Response.json({
        ingredients: [],
        fallbackNotice: "Your 5 free AI credits are used. Add ingredients manually or upgrade to premium.",
        access: accessPayload(accessCheck.access)
      });
    }

    const nextAccess = await consumeFreeAiCredit(accessCheck.access, "image_to_text");

    if (USE_MOCK) {
      const mockIngredients = ["chicken", "garlic", "onion", "tomato", "olive oil", "basil"];
      return Response.json({ ingredients: mockIngredients, access: accessPayload(nextAccess) });
    }

    ensureAiAvailable();
    const text = await callOpenAIVision(buildIngredientVisionPrompt(), image, "gemini-2.5-flash-lite");
    const json = extractJson(text);
    const parsedResult = JSON.parse(json) as { ingredients?: string[] } | string[];
    const ingredients = Array.isArray(parsedResult) ? parsedResult : parsedResult.ingredients ?? [];

    return Response.json({ ingredients, access: accessPayload(nextAccess) });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(error);
    }
    logger.error("Error analyzing image", error);
    const message = error instanceof Error ? error.message : "Failed to analyze image";

    return Response.json(
      { error: message, ingredients: [] },
      { status: message.includes("GEMINI_API_KEY") ? 503 : 500 }
    );
  }
}

import { PromptBuilder } from "@/ai/PromptBuilder";
import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";
import { logger } from "@/lib/logger";
import {
  accessErrorResponse,
  accessPayload,
  buildFreeAiCreditsExhaustedNotice,
  canUseApiFeature,
  completeFreeAiAction,
  releaseFreeAiAction,
  reserveFreeAiAction
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";

// Deprecated compatibility route. New image ingredient extraction should use
// POST /api/scan or POST /api/scan/process.
export async function POST(request: Request) {
  let pendingAccess: Awaited<ReturnType<typeof canUseApiFeature>>["access"] | undefined;
  let pendingActionId: string | undefined;
  try {
    const accessCheck = await canUseApiFeature(request, "image_to_text");
    const rl = applyRateLimit({
      uid: accessCheck.access.uid,
      feature: "image_scan",
      isPremium: accessCheck.allowed,
      bypass: accessCheck.access.isAdmin
    });
    if (!rl.decision.allowed) {
      return rateLimitedResponse(rl.decision, rl.config);
    }
    const { actionId, image } = await request.json();

    if (!image) {
      return Response.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    if (!accessCheck.allowed) {
      return Response.json({
        ingredients: [],
        fallbackNotice: buildFreeAiCreditsExhaustedNotice("Add ingredients manually or upgrade to premium."),
        access: accessPayload(accessCheck.access)
      });
    }

    const aiAction = await reserveFreeAiAction(
      accessCheck.access,
      "image_to_text",
      typeof actionId === "string" ? actionId : crypto.randomUUID()
    );
    pendingAccess = accessCheck.access;
    pendingActionId = aiAction.actionId;

    if (USE_MOCK) {
      const mockIngredients = ["chicken", "garlic", "onion", "tomato", "olive oil", "basil"];
      const nextAccess = await completeFreeAiAction(accessCheck.access, pendingActionId);
      pendingActionId = undefined;
      return Response.json({ ingredients: mockIngredients, access: accessPayload(nextAccess) });
    }

    ensureAiAvailable();
    const text = await callOpenAIVision(PromptBuilder.ingredientVision(), image, "gemini-2.5-flash-lite");
    const json = extractJson(text);
    const parsedResult = JSON.parse(json) as { ingredients?: string[] } | string[];
    const ingredients = Array.isArray(parsedResult) ? parsedResult : parsedResult.ingredients ?? [];
    const nextAccess = ingredients.length
      ? await completeFreeAiAction(accessCheck.access, pendingActionId)
      : accessCheck.access;
    if (!ingredients.length) await releaseFreeAiAction(accessCheck.access, pendingActionId);
    pendingActionId = undefined;

    return Response.json({ ingredients, access: accessPayload(nextAccess) });
  } catch (error) {
    if (pendingAccess && pendingActionId) {
      await releaseFreeAiAction(pendingAccess, pendingActionId);
      pendingActionId = undefined;
    }
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

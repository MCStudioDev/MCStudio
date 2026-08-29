import { z } from "zod";
import { getClientFacingAiErrorMessage, isTransientModelError } from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  buildFreeAiCreditsExhaustedNotice,
  canUseApiFeature,
  completeFreeAiAction,
  releaseFreeAiAction,
  reserveFreeAiAction,
  isFirebaseTransientError
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { processScan } from "@/services/scanService";
import { isArabicRecipeLanguage } from "@/lib/arabicRecipeLocalization";
import { normalizeRecipeLanguage } from "@/lib/language";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  actionId: z.string().min(1).max(128).optional(),
  image: z.string().min(10),
  imagePath: z.string().optional(),
  language: z.string().optional(),
  isPantry: z.boolean().optional(),
  filters: z.object({
    dietTags: z.array(z.string()).optional(),
    maxCalories: z.number().optional(),
    mealType: z.string().optional(),
    cuisine: z.string().optional()
  }).optional()
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let pendingAccess: Awaited<ReturnType<typeof canUseApiFeature>>["access"] | undefined;
  let pendingActionId: string | undefined;
  logger.info("Image scan processing HTTP request received", { requestId });
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
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }
    const language = normalizeRecipeLanguage(parsed.data.language, "English");

    if (!accessCheck.allowed) {
      return Response.json({
        ingredients: [],
        recipes: [],
        servedFrom: "shared_pool",
        fallbackNotice: buildScanProcessFallbackNotice(language),
        access: accessPayload(accessCheck.access)
      });
    }

    const aiAction = await reserveFreeAiAction(
      accessCheck.access,
      "image_to_text",
      parsed.data.actionId ?? requestId
    );
    pendingAccess = accessCheck.access;
    pendingActionId = aiAction.actionId;
    const result = await processScan({
      uid: accessCheck.access.uid,
      image: parsed.data.image,
      imagePath: parsed.data.imagePath,
      language,
      isPantry: parsed.data.isPantry,
      filters: {
        dietTags: parsed.data.filters?.dietTags ?? [],
        maxCalories: parsed.data.filters?.maxCalories,
        mealType: parsed.data.filters?.mealType,
        cuisine: parsed.data.filters?.cuisine
      }
    });
    const hasResults = result.ingredientsNormalized.length > 0;
    const nextAccess = hasResults
      ? await completeFreeAiAction(accessCheck.access, pendingActionId)
      : accessCheck.access;
    if (!hasResults) await releaseFreeAiAction(accessCheck.access, pendingActionId);
    pendingActionId = undefined;

    return Response.json({ ...result, access: accessPayload(nextAccess) });
  } catch (error) {
    if (pendingAccess && pendingActionId) {
      await releaseFreeAiAction(pendingAccess, pendingActionId);
      pendingActionId = undefined;
    }
    if (
      isFirebaseTransientError(error) ||
      (error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Firebase Admin credentials")))
    ) {
      logger.warn("Image scan processing request failed during access checks", {
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      return accessErrorResponse(error);
    }
    const message = error instanceof Error ? error.message : "Failed to process scan";
    const status = message.includes("GEMINI_API_KEY") ? 503 : isTransientModelError(error) ? 503 : 500;
    const safeMessage = isTransientModelError(error)
      ? getClientFacingAiErrorMessage(error, "Image scan processing is temporarily unavailable. Please try again in a few minutes.")
      : message;
    logger.error("Image scan processing failed", error, { requestId });
    return Response.json({ error: safeMessage }, { status });
  }
}

function buildScanProcessFallbackNotice(language?: string) {
  if (!isArabicRecipeLanguage(language ?? "English")) {
    return buildFreeAiCreditsExhaustedNotice("Add ingredients manually or upgrade to premium for image scans.");
  }

  return "تم استهلاك 10 أرصدة الذكاء الاصطناعي المجانية. أضف المكونات يدويًا أو قم بالترقية إلى الخطة المميزة لمسح الصور.";
}

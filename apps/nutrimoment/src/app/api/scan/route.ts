import { z } from "zod";
import { getClientFacingAiErrorMessage, isTransientModelError, USE_MOCK } from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  buildFreeAiCreditsExhaustedNotice,
  canUseApiFeature,
  consumeFreeAiCredit,
  isFirebaseTransientError
} from "@/services/authService";
import { extractPantryItemsFromImage } from "@/services/ingredientExtractionService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { processScan } from "@/services/scanService";
import { isArabicRecipeLanguage, translateIngredientToArabic } from "@/lib/arabicRecipeLocalization";
import { normalizeRecipeLanguage } from "@/lib/language";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  image: z.string().min(10),
  language: z.string().optional(),
  isPantry: z.boolean().optional()
});

const MOCK_INGREDIENTS = ["tomato", "onion", "garlic", "olive oil", "basil", "chicken breast", "spinach"];
const MOCK_PANTRY = ["rice", "pasta", "canned beans", "olive oil", "salt", "black pepper"];

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  logger.info("Image scan HTTP request received", { requestId });
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

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }
    const language = normalizeRecipeLanguage(parsed.data.language, "English");
    const { image, isPantry = false } = parsed.data;

    if (!isPantry && !accessCheck.access.isPremium && !accessCheck.access.isAdmin) {
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
        result: "[]",
        pantryItems: [],
        fallbackNotice: buildScanFallbackNotice(language, isPantry),
        access: accessPayload(accessCheck.access)
      });
    }

    const nextAccess = await consumeFreeAiCredit(accessCheck.access, "image_to_text");

    if (USE_MOCK) {
      const items = isPantry ? MOCK_PANTRY : MOCK_INGREDIENTS;
      return Response.json({ result: JSON.stringify(items), access: accessPayload(nextAccess) });
    }

    if (isPantry) {
      const pantryItems = await extractPantryItemsFromImage({
        image,
        language,
        isPantry: true
      });

      return Response.json({
        result: JSON.stringify(pantryItems.map((item) => item.name)),
        pantryItems,
        access: accessPayload(nextAccess)
      });
    }

    const result = await processScan({
      image,
      language,
      isPantry,
      filters: { dietTags: [] }
    });
    const displayIngredients = localizeScannedIngredients(result.ingredientsRaw, result.ingredientsNormalized, language);
    return Response.json({
      ingredients: displayIngredients,
      canonicalIngredients: result.ingredientsNormalized,
      result: JSON.stringify(displayIngredients),
      scanId: result.scanId,
      access: accessPayload(nextAccess)
    });
  } catch (err) {
    if (
      isFirebaseTransientError(err) ||
      (err instanceof Error && (err.message.includes("Sign in") || err.message.includes("Firebase Admin credentials")))
    ) {
      logger.warn("Image scan request failed during access checks", {
        requestId,
        errorMessage: err instanceof Error ? err.message : String(err)
      });
      return accessErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : "Scan failed";
    const status = message.includes("GEMINI_API_KEY") ? 503 : isTransientModelError(err) ? 503 : 500;
    const safeMessage = isTransientModelError(err)
      ? getClientFacingAiErrorMessage(err, "Image scanning is temporarily unavailable. Please try again in a few minutes.")
      : message;
    logger.error("Image scan failed", err, { requestId });
    return Response.json({ error: safeMessage, result: "[]" }, { status });
  }
}

function localizeScannedIngredients(raw: string[], canonical: string[], language: string) {
  if (!isArabicRecipeLanguage(language)) {
    return canonical;
  }

  const arabicRaw = raw
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && /[\u0600-\u06FF]/.test(item));
  const arabicCanonical = canonical
    .map((item) => translateIngredientToArabic(item).trim())
    .filter(Boolean);

  return Array.from(new Set([...arabicRaw, ...arabicCanonical]));
}

function buildScanFallbackNotice(language: string, isPantry: boolean) {
  const wantsArabic = isArabicRecipeLanguage(language);
  if (!wantsArabic) {
    return buildFreeAiCreditsExhaustedNotice(isPantry
      ? "Add pantry items manually or upgrade to premium for image scans."
      : "Add ingredients manually or upgrade to premium for image scans.");
  }

  return isPantry
    ? "تم استهلاك 5 أرصدة الذكاء الاصطناعي المجانية. أضف عناصر المخزن يدويًا أو قم بالترقية إلى الخطة المميزة لمسح الصور."
    : "تم استهلاك 5 أرصدة الذكاء الاصطناعي المجانية. أضف المكونات يدويًا أو قم بالترقية إلى الخطة المميزة لمسح الصور.";
}

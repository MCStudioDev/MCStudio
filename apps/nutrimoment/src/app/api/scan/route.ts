import { z } from "zod";
import { USE_MOCK } from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";
import { extractPantryItemsFromImage } from "@/services/ingredientExtractionService";
import { processScan } from "@/services/scanService";

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
  try {
    const accessCheck = await canUseApiFeature(request, "image_to_text");
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }
    const { image, language = "English", isPantry = false } = parsed.data;

    if (!accessCheck.allowed) {
      return Response.json({
        result: "[]",
        pantryItems: [],
        fallbackNotice: isPantry
          ? "Your 5 free AI credits are used. Add pantry items manually or upgrade to premium for image scans."
          : "Your 5 free AI credits are used. Add ingredients manually or upgrade to premium for image scans.",
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
    return Response.json({
      result: JSON.stringify(result.ingredientsNormalized),
      scanId: result.scanId,
      access: accessPayload(nextAccess)
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Sign in") || err.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : "Scan failed";
    const status = message.includes("GEMINI_API_KEY") ? 503 : 500;
    return Response.json({ error: message, result: "[]" }, { status });
  }
}

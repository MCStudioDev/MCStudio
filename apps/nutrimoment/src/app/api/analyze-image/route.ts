import { buildIngredientVisionPrompt } from "@/lib/aiPrompts";
import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";

export async function POST(request: Request) {
  try {
    const accessCheck = await canUseApiFeature(request, "image_to_text");
    const { image } = await request.json();

    if (!image) {
      return Response.json(
        { error: "No image provided" },
        { status: 400 }
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
    const text = await callOpenAIVision(buildIngredientVisionPrompt(), image, "gemini-2.5-flash");
    const json = extractJson(text);
    const parsedResult = JSON.parse(json);

    return Response.json({ ...parsedResult, access: accessPayload(nextAccess) });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(error);
    }
    console.error("Error analyzing image:", error);
    const message = error instanceof Error ? error.message : "Failed to analyze image";

    return Response.json(
      { error: message, ingredients: [] },
      { status: message.includes("GEMINI_API_KEY") ? 503 : 500 }
    );
  }
}

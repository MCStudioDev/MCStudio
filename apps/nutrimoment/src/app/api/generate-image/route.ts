import { z } from "zod";
import { buildFoodImagePrompt, buildRecipeImagePrompt } from "@/lib/aiPrompts";
import { USE_MOCK, ensureAiAvailable, generateOpenAIImage } from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  prompt: z.string().min(5),
  recipeName: z.string().optional(),
  cuisine: z.string().optional(),
  ingredients: z.array(z.string()).optional()
});

const MOCK_IMAGE_URL = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop";

export async function POST(request: Request) {
  try {
    const accessCheck = await canUseApiFeature(request, "recipe_image");
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!accessCheck.allowed) {
      return Response.json({
        imageUrl: "",
        source: "placeholder",
        fallbackNotice: "Your 5 free AI/photo credits are used. Use placeholder images or upgrade to premium.",
        access: accessPayload(accessCheck.access)
      });
    }

    const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_image");

    if (USE_MOCK) {
      return Response.json({ imageUrl: MOCK_IMAGE_URL, access: accessPayload(nextAccess) });
    }

    ensureAiAvailable();
    const prompt = parsed.data.recipeName
      ? buildRecipeImagePrompt(parsed.data.recipeName, parsed.data.cuisine, parsed.data.ingredients)
      : buildFoodImagePrompt(parsed.data.prompt);
    const imageUrl = await generateOpenAIImage(prompt, "gemini-2.5-flash-image");
    return Response.json({ imageUrl, access: accessPayload(nextAccess) });
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Sign in") || err.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : "Image generation failed";
    return Response.json({ error: message, imageUrl: "" }, { status: message.includes("GEMINI_API_KEY") ? 503 : 500 });
  }
}

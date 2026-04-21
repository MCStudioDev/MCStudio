import { z } from "zod";
import { USE_MOCK } from "@/lib/openai";
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
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }
    const { image, language = "English", isPantry = false } = parsed.data;

    if (USE_MOCK) {
      const items = isPantry ? MOCK_PANTRY : MOCK_INGREDIENTS;
      return Response.json({ result: JSON.stringify(items) });
    }

    if (isPantry) {
      const pantryItems = await extractPantryItemsFromImage({
        image,
        language,
        isPantry: true
      });

      return Response.json({
        result: JSON.stringify(pantryItems.map((item) => item.name)),
        pantryItems
      });
    }

    const result = await processScan({
      image,
      language,
      isPantry,
      filters: { dietTags: [] }
    });
    return Response.json({ result: JSON.stringify(result.ingredientsNormalized), scanId: result.scanId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    const status = message.includes("GEMINI_API_KEY") ? 503 : 500;
    return Response.json({ error: message, result: "[]" }, { status });
  }
}

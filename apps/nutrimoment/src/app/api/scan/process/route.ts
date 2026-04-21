import { z } from "zod";
import { getOptionalRequestUserId } from "@/services/authService";
import { processScan } from "@/services/scanService";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
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
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }

    const uid = getOptionalRequestUserId(request);
    const result = await processScan({
      uid,
      image: parsed.data.image,
      imagePath: parsed.data.imagePath,
      language: parsed.data.language,
      isPantry: parsed.data.isPantry,
      filters: {
        dietTags: parsed.data.filters?.dietTags ?? [],
        maxCalories: parsed.data.filters?.maxCalories,
        mealType: parsed.data.filters?.mealType,
        cuisine: parsed.data.filters?.cuisine
      }
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process scan";
    return Response.json({ error: message }, { status: message.includes("GEMINI_API_KEY") ? 503 : 500 });
  }
}

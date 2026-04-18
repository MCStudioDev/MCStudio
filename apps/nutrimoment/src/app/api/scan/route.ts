import { z } from "zod";
import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";

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

    ensureAiAvailable();

    const prompt = isPantry
      ? `You are a food vision expert. Identify all distinct grocery or pantry items visible in this image (jars, cans, packaged goods, fresh produce, etc.). Respond ONLY with a JSON array of short item names (e.g., ["olive oil", "rice", "canned tomatoes"]). Use ${language}. No commentary.`
      : `You are a food vision expert. Identify the raw ingredients visible in this image. Respond ONLY with a JSON array of short ingredient names in singular form (e.g., ["tomato", "onion", "chicken breast"]). Use ${language}. No commentary.`;

    const text = await callOpenAIVision(prompt, image);
    const json = extractJson(text);
    return Response.json({ result: json });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return Response.json({ error: message, result: "[]" }, { status });
  }
}

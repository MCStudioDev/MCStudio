import { z } from "zod";
import { USE_MOCK, ensureAiAvailable, generateOpenAIImage } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  prompt: z.string().min(5)
});

const MOCK_IMAGE_URL = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    if (USE_MOCK) {
      return Response.json({ imageUrl: MOCK_IMAGE_URL });
    }

    ensureAiAvailable();
    const imageUrl = await generateOpenAIImage(parsed.data.prompt, "gpt-4.1-mini");
    return Response.json({ imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    return Response.json({ error: message, imageUrl: "" }, { status: message.includes("OPENAI_API_KEY") ? 503 : 500 });
  }
}

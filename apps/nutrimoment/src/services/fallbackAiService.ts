import { callOpenAIText, ensureAiAvailable } from "@/lib/openai";
import type { AiCallTraceOptions } from "@/lib/openai";

export async function generateFallbackRecipes(prompt: string, trace?: AiCallTraceOptions) {
  ensureAiAvailable();
  return callOpenAIText(prompt, "gemini-2.5-flash-lite", trace);
}

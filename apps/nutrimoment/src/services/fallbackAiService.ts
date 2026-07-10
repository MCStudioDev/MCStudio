import { callOpenAIText, ensureAiAvailable } from "@/lib/openai";
import type { AiCallTraceOptions, AiTextGenerationOptions } from "@/lib/openai";

export async function generateFallbackRecipes(
  prompt: string,
  trace?: AiCallTraceOptions,
  options?: AiTextGenerationOptions
) {
  ensureAiAvailable();
  return callOpenAIText(prompt, "gemini-2.5-flash-lite", trace, options);
}

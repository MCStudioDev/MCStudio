import { callOpenAIText, ensureAiAvailable } from "@/lib/openai";
import type { AiCallTraceOptions, AiTextGenerationOptions } from "@/lib/openai";

export async function generateFallbackRecipes(
  prompt: string,
  trace?: AiCallTraceOptions,
  options?: AiTextGenerationOptions
) {
  ensureAiAvailable();
  const model = options?.groundWithGoogleSearch ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";
  return callOpenAIText(prompt, model, trace, options);
}

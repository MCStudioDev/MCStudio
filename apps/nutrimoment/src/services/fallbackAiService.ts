import { callOpenAIText, ensureAiAvailable } from "@/lib/openai";
import type { AiCallTraceOptions, AiTextGenerationOptions } from "@/lib/openai";

export async function generateFallbackRecipes(
  prompt: string,
  trace?: AiCallTraceOptions,
  options?: AiTextGenerationOptions
) {
  ensureAiAvailable();
  const model = options?.groundWithGoogleSearch
    ? process.env.GEMINI_GROUNDED_MODEL ?? "gemini-2.5-flash-lite"
    : "gemini-2.5-flash-lite";
  return callOpenAIText(prompt, model, trace, options);
}

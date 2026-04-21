import { callOpenAIText, ensureAiAvailable } from "@/lib/openai";

export async function generateFallbackRecipes(prompt: string) {
  ensureAiAvailable();
  return callOpenAIText(prompt, "gemini-2.5-flash");
}

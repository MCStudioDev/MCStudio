"use server";

import { PromptBuilder } from "@/ai/PromptBuilder";
import { callOpenAIVision } from "@/lib/openai";

export async function analyzeFridgeImage(base64Image: string, mimeType: string) {
  try {
    const image = `data:${mimeType};base64,${base64Image}`;
    const text = await callOpenAIVision(PromptBuilder.fridgeImageAnalysis(), image, "gemini-2.5-flash-lite");
    const parsed = JSON.parse(text);
    return { success: true, data: parsed };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to analyze image.";
    console.error("Gemini Vision Error:", error);
    return { success: false, error: message };
  }
}

"use server";

import { getClient } from "@/lib/openai";

export async function analyzeFridgeImage(base64Image: string, mimeType: string) {
  try {
    const client = getClient();
    if (!client) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Image
          }
        },
        {
          text: `You are an expert dietitian and chef. Look at this image of a fridge or groceries.
Identify all the distinct food ingredients you can see perfectly clearly.
Do not hallucinate items that are not present.

Return strict JSON in this shape:
{
  "ingredients": [
    { "name": "Ingredient Name", "quantity": "Estimated Quantity/Unit" }
  ],
  "recipeSuggestion": {
    "title": "A clever recipe name using mainly these ingredients",
    "description": "Brief 1 sentence pitch of the recipe."
  }
}`,
        },
      ]
    });

    if (!response.text) {
      throw new Error("Received empty response from Gemini.");
    }

    const parsed = JSON.parse(response.text);
    return { success: true, data: parsed };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to analyze image.";
    console.error("Gemini Vision Error:", error);
    return { success: false, error: message };
  }
}

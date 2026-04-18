"use server";

import { getClient } from "@/lib/openai";

export async function analyzeFridgeImage(base64Image: string, mimeType: string) {
  try {
    const client = getClient();
    if (!client) {
      throw new Error("OPENAI_API_KEY is not configured on the server.");
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
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
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64Image}`,
              detail: "auto",
            },
          ],
        },
      ],
    });

    if (!response.output_text) {
      throw new Error("Received empty response from OpenAI.");
    }

    const parsed = JSON.parse(response.output_text);
    return { success: true, data: parsed };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to analyze image.";
    console.error("OpenAI Vision Error:", error);
    return { success: false, error: message };
  }
}

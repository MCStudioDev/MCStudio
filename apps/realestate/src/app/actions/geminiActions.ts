"use server";

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generatePropertyPost(propertyDescription: string) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert Real Estate Marketing Copywriter. Based on the following property description, generate a highly converting social media post.
              
              PROPERTY DESCRIPTION:
              ${propertyDescription}
              
              Return the response strictly as a JSON object matching this schema:
              {
                "postContent": "The main body of the social media post, engaging and utilizing emojis.",
                "hashtags": ["list", "of", "hashtags"],
                "callToAction": "A strong CTA for the end of the post."
              }`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    if (!response.text) {
      throw new Error("Received empty response from Gemini.");
    }

    const parsed = JSON.parse(response.text);
    return { success: true, data: parsed };
  } catch (error: any) {
    console.error("Gemini AI Error:", error);
    return { success: false, error: error.message || "Failed to generate post." };
  }
}

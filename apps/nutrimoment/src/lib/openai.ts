import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY ?? "";

export const USE_MOCK = process.env.USE_MOCK_API === "true";
export const HAS_GEMINI_API_KEY = apiKey.length > 0;

export function getClient(): GoogleGenAI | null {
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export function ensureAiAvailable() {
  if (USE_MOCK) return;
  if (!HAS_GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Set it in apps/nutrimoment/.env.local or enable USE_MOCK_API=true for demo mode."
    );
  }
}

export function normalizeImageInput(image: string, fallbackMimeType = "image/jpeg") {
  const trimmed = image.trim();
  if (trimmed.startsWith("data:")) {
    const match = trimmed.match(/^data:(.*?);base64,(.*)$/);
    return {
      mimeType: match?.[1] ?? fallbackMimeType,
      data: match?.[2] ?? ""
    };
  }
  return {
    mimeType: fallbackMimeType,
    data: trimmed
  };
}

export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const stripped = trimmed.replace(/```(?:json)?/g, "").replace(/```$/g, "").trim();
    return stripped;
  }
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (arrayMatch && objMatch) {
    return arrayMatch.index! < objMatch.index! ? arrayMatch[0] : objMatch[0];
  }
  return arrayMatch?.[0] ?? objMatch?.[0] ?? trimmed;
}

export async function callOpenAIText(prompt: string, modelName = "gemini-2.5-flash"): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("Gemini API key not configured");

  const response = await client.models.generateContent({
    model: modelName,
    contents: prompt
  });

  const text = response.text?.trim() ?? "";
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

export async function callOpenAIVision(
  prompt: string,
  image: string,
  modelName = "gemini-2.5-flash"
): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("Gemini API key not configured");
  const normalizedImage = normalizeImageInput(image);

  const response = await client.models.generateContent({
    model: modelName,
    contents: [
      {
        inlineData: {
          mimeType: normalizedImage.mimeType,
          data: normalizedImage.data
        }
      },
      { text: prompt }
    ]
  });

  const text = response.text?.trim() ?? "";
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

export async function generateOpenAIImage(prompt: string, modelName = "gemini-2.5-flash-image"): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("Gemini API key not configured");

  const response = await client.models.generateContent({
    model: modelName,
    contents: prompt
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("No image returned from Gemini");
  }

  const mimeType = imagePart.inlineData.mimeType ?? "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

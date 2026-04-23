import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const defaultTextModel = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
const fallbackTextModels = (process.env.GEMINI_TEXT_FALLBACK_MODELS ?? "gemini-2.5-flash-lite")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

export const USE_MOCK = process.env.USE_MOCK_API === "true";
export const HAS_GEMINI_API_KEY = apiKey.length > 0;

export function getClient(): GoogleGenAI | null {
  if (!apiKey) return null;
  // The Gemini SDK prefers GOOGLE_API_KEY when both variables exist in the process.
  // Keep it aligned so a stale machine-level key cannot override this app's key.
  process.env.GOOGLE_API_KEY = apiKey;
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

function getTextModelAttempts(modelName: string) {
  return Array.from(new Set([modelName, ...fallbackTextModels]));
}

function isTransientModelError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  const message = error instanceof Error ? error.message : String(error);

  return status === 429 || status === 503 || /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|rate limit/i.test(message);
}

function getGeminiErrorLog(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  const message = error instanceof Error ? error.message : String(error);

  return {
    status,
    transient: isTransientModelError(error),
    message
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callOpenAIText(prompt: string, modelName = defaultTextModel): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("Gemini API key not configured");

  const modelAttempts = getTextModelAttempts(modelName);
  let lastError: unknown;
  for (const [index, model] of modelAttempts.entries()) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt
      });

      const text = response.text?.trim() ?? "";
      if (!text) throw new Error(`Empty response from Gemini model ${model}`);
      return text;
    } catch (error) {
      lastError = error;
      console.error("Gemini text generation attempt failed", {
        model,
        attempt: index + 1,
        attempts: modelAttempts.length,
        ...getGeminiErrorLog(error)
      });
      if (!isTransientModelError(error)) break;
      if (index < modelAttempts.length - 1) {
        await delay(400);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini text generation failed");
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

import { GoogleGenAI } from "@google/genai";
import { logger } from "@/lib/logger";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const defaultTextModel = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash-lite";
const fallbackTextModels = (process.env.GEMINI_TEXT_FALLBACK_MODELS ?? "gemini-2.5-flash,gemini-2.0-flash-lite")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const defaultVisionModel = process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash-lite";
const fallbackVisionModels = (process.env.GEMINI_VISION_FALLBACK_MODELS ?? "gemini-2.5-flash,gemini-2.0-flash-lite")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const transientRetryAttempts = Math.max(1, Number(process.env.GEMINI_TRANSIENT_RETRY_ATTEMPTS ?? "2") || 2);
const requestTimeoutMs = Math.max(5_000, Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? "45000") || 45_000);

export interface AiCallTraceOptions {
  feature?: string;
  phase?: string;
  requestId?: string;
}

export interface AiTextGenerationOptions {
  temperature?: number;
  topP?: number;
}

const rawUseMock = process.env.USE_MOCK_API === "true";
if (rawUseMock && process.env.NODE_ENV === "production") {
  throw new Error(
    "USE_MOCK_API=true is not permitted when NODE_ENV=production. Remove the variable or unset NODE_ENV before starting the server."
  );
}
export const USE_MOCK = rawUseMock;
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

function getModelAttempts(modelName: string, fallbacks: string[]) {
  return Array.from(new Set([modelName, ...fallbacks]));
}

function getAttemptDelayMs(attempt: number) {
  return Math.min(2000, 500 * attempt);
}

export function isTransientModelError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  const message = error instanceof Error ? error.message : String(error);

  return status === 429 || status === 503 || /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|rate limit|timeout|timed out|abort/i.test(message);
}

function isModelTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|abort/i.test(message);
}

export function getClientFacingAiErrorMessage(error: unknown, fallback = "AI service is temporarily unavailable. Please try again again in a few minutes.") {
  const message = error instanceof Error ? error.message : String(error);

  if (/RESOURCE_EXHAUSTED|Quota exceeded|quota exceeded|rate limit|too many requests/i.test(message)) {
    return "AI quota is temporarily exhausted. Please try again in a few minutes.";
  }

  if (/UNAVAILABLE|high demand|deadline exceeded|timeout/i.test(message)) {
    return "AI service is temporarily busy. Please try again in a few minutes.";
  }

  return fallback;
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

function createGeminiRequestAbortController() {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    controller.abort(new Error(`Gemini request timed out after ${requestTimeoutMs}ms`));
  }, requestTimeoutMs);

  return { controller, timeout };
}

function clearGeminiRequestAbortTimeout(timeout: ReturnType<typeof globalThis.setTimeout>) {
  globalThis.clearTimeout(timeout);
}

export async function callOpenAIText(
  prompt: string,
  modelName = defaultTextModel,
  trace?: AiCallTraceOptions,
  options?: AiTextGenerationOptions
): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("Gemini API key not configured");

  const modelAttempts = getModelAttempts(modelName, fallbackTextModels);
  let lastError: unknown;
  const totalAttempts = modelAttempts.length * transientRetryAttempts;
  let attempt = 0;
  for (const model of modelAttempts) {
    for (let modelAttempt = 1; modelAttempt <= transientRetryAttempts; modelAttempt += 1) {
      attempt += 1;
      try {
        const { controller, timeout } = createGeminiRequestAbortController();
        logger.debug("Gemini text generation attempt started", {
          requestId: trace?.requestId,
          feature: trace?.feature,
          phase: trace?.phase,
          model,
          modelAttempt,
          attempt,
          attempts: totalAttempts
        });
        let response;
        try {
          response = await client.models.generateContent({
            model,
            contents: prompt,
            config: {
              abortSignal: controller.signal,
              ...(typeof options?.temperature === "number" ? { temperature: options.temperature } : {}),
              ...(typeof options?.topP === "number" ? { topP: options.topP } : {}),
              httpOptions: {
                timeout: requestTimeoutMs
              }
            }
          });
        } finally {
          clearGeminiRequestAbortTimeout(timeout);
        }

        const text = response.text?.trim() ?? "";
        if (!text) throw new Error(`Empty response from Gemini model ${model}`);
        logger.info("Gemini text generation attempt succeeded", {
          requestId: trace?.requestId,
          feature: trace?.feature,
          phase: trace?.phase,
          model,
          modelAttempt,
          attempt,
          attempts: totalAttempts
        });
        return text;
      } catch (error) {
        lastError = error;
        logger.error("Gemini text generation attempt failed", error, {
          requestId: trace?.requestId,
          feature: trace?.feature,
          phase: trace?.phase,
          model,
          modelAttempt,
          attempt,
          attempts: totalAttempts,
          ...getGeminiErrorLog(error)
        });
        if (isModelTimeoutError(error) || !isTransientModelError(error)) {
          throw error instanceof Error ? error : new Error(String(error));
        }
        if (attempt < totalAttempts) {
          await delay(getAttemptDelayMs(modelAttempt));
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini text generation failed");
}

export async function callOpenAIVision(
  prompt: string,
  image: string,
  modelName = defaultVisionModel,
  trace?: AiCallTraceOptions
): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("Gemini API key not configured");
  const normalizedImage = normalizeImageInput(image);
  const modelAttempts = getModelAttempts(modelName, fallbackVisionModels);
  let lastError: unknown;
  const totalAttempts = modelAttempts.length * transientRetryAttempts;
  let attempt = 0;

  for (const model of modelAttempts) {
    for (let modelAttempt = 1; modelAttempt <= transientRetryAttempts; modelAttempt += 1) {
      attempt += 1;
      try {
        const { controller, timeout } = createGeminiRequestAbortController();
        logger.debug("Gemini vision generation attempt started", {
          requestId: trace?.requestId,
          feature: trace?.feature,
          phase: trace?.phase,
          model,
          modelAttempt,
          attempt,
          attempts: totalAttempts
        });
        let response;
        try {
          response = await client.models.generateContent({
            model,
            contents: [
              {
                inlineData: {
                  mimeType: normalizedImage.mimeType,
                  data: normalizedImage.data
                }
              },
              { text: prompt }
            ],
            config: {
              abortSignal: controller.signal,
              httpOptions: {
                timeout: requestTimeoutMs
              }
            }
          });
        } finally {
          clearGeminiRequestAbortTimeout(timeout);
        }

        const text = response.text?.trim() ?? "";
        if (!text) throw new Error(`Empty response from Gemini model ${model}`);
        logger.info("Gemini vision generation attempt succeeded", {
          requestId: trace?.requestId,
          feature: trace?.feature,
          phase: trace?.phase,
          model,
          modelAttempt,
          attempt,
          attempts: totalAttempts
        });
        return text;
      } catch (error) {
        lastError = error;
        logger.error("Gemini vision generation attempt failed", error, {
          requestId: trace?.requestId,
          feature: trace?.feature,
          phase: trace?.phase,
          model,
          modelAttempt,
          attempt,
          attempts: totalAttempts,
          ...getGeminiErrorLog(error)
        });
        if (isModelTimeoutError(error) || !isTransientModelError(error)) {
          throw error instanceof Error ? error : new Error(String(error));
        }
        if (attempt < totalAttempts) {
          await delay(getAttemptDelayMs(modelAttempt));
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini vision generation failed");
}

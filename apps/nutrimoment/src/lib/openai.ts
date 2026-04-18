import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY ?? "";

export const USE_MOCK = process.env.USE_MOCK_API === "true";
export const HAS_OPENAI_API_KEY = apiKey.length > 0;

export function getClient(): OpenAI | null {
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function ensureAiAvailable() {
  if (USE_MOCK) return;
  if (!HAS_OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it in apps/nutrimoment/.env.local or enable USE_MOCK_API=true for demo mode."
    );
  }
}

export function normalizeImageInput(image: string, fallbackMimeType = "image/jpeg"): string {
  const trimmed = image.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  return `data:${fallbackMimeType};base64,${trimmed}`;
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

export async function callOpenAIText(prompt: string, modelName = "gpt-4.1-mini"): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("OpenAI API key not configured");

  const response = await client.responses.create({
    model: modelName,
    input: prompt,
  });

  const text = response.output_text?.trim() ?? "";
  if (!text) throw new Error("Empty response from OpenAI");
  return text;
}

export async function callOpenAIVision(
  prompt: string,
  image: string,
  modelName = "gpt-4.1-mini"
): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("OpenAI API key not configured");

  const response = await client.responses.create({
    model: modelName,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: normalizeImageInput(image),
            detail: "auto",
          },
        ],
      },
    ],
  });

  const text = response.output_text?.trim() ?? "";
  if (!text) throw new Error("Empty response from OpenAI");
  return text;
}

export async function generateOpenAIImage(prompt: string, modelName = "gpt-4.1-mini"): Promise<string> {
  ensureAiAvailable();
  const client = getClient();
  if (!client) throw new Error("OpenAI API key not configured");

  const response = await client.responses.create({
    model: modelName,
    input: prompt,
    tools: [{ type: "image_generation" }],
  });

  const imageCall = response.output.find((output) => output.type === "image_generation_call");
  if (!imageCall || !("result" in imageCall) || !imageCall.result) {
    throw new Error("No image returned from OpenAI");
  }

  return `data:image/png;base64,${imageCall.result}`;
}

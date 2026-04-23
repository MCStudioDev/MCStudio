import { GoogleGenAI } from "@google/genai";

export interface GeneratedRecipeImage {
  imageUrl: string;
  source: "generated";
  model: string;
}

const imagenEnabled = process.env.GOOGLE_IMAGEN_ENABLED !== "false";
const imagenApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const imagenModel = process.env.GOOGLE_IMAGEN_MODEL ?? "imagen-4.0-generate-001";

export function isImagenConfigured() {
  return Boolean(imagenEnabled && imagenApiKey);
}

export async function generateRecipeImageWithImagen(query: string): Promise<GeneratedRecipeImage | null> {
  if (!isImagenConfigured()) return null;

  process.env.GOOGLE_API_KEY = imagenApiKey;
  const client = new GoogleGenAI({ apiKey: imagenApiKey });

  const response = await client.models.generateImages({
    model: imagenModel,
    prompt: buildRecipeImagePrompt(query),
    config: {
      numberOfImages: 1,
      aspectRatio: "4:3",
      outputMimeType: "image/jpeg",
      outputCompressionQuality: 86,
      includeRaiReason: true
    }
  });

  const image = response.generatedImages?.find((candidate) => candidate.image?.imageBytes)?.image;
  if (!image?.imageBytes) return null;

  return {
    imageUrl: `data:${image.mimeType ?? "image/jpeg"};base64,${image.imageBytes}`,
    source: "generated",
    model: imagenModel
  };
}

function buildRecipeImagePrompt(query: string) {
  const dish = query
    .replace(/\b(prepared food|food plated|food|recipe|dish|meal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    `Create a photorealistic editorial food photograph of ${dish || query}.`,
    "The image must match this exact meal name and cuisine as closely as possible.",
    "Show the finished plated dish only, appetizing and realistic, with natural restaurant lighting.",
    "Do not show a different dish, dessert, pancakes, random salad, packaging, people, hands, logos, labels, captions, or text.",
    "Use a clean tabletop background and a 4:3 composition suitable for a recipe card."
  ].join(" ");
}

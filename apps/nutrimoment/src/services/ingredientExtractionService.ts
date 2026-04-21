import type { PantryItem } from "@/lib/types";
import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";

const MOCK_INGREDIENTS = ["tomato", "onion", "garlic", "olive oil", "basil", "chicken breast", "spinach"];
const MOCK_PANTRY = ["rice", "pasta", "canned beans", "olive oil", "salt", "black pepper"];
const MOCK_PANTRY_ITEMS: PantryItem[] = [
  { name: "rice", quantity: "1 bag" },
  { name: "pasta", quantity: "2 boxes" },
  { name: "canned beans", quantity: "3 cans" },
  { name: "olive oil", quantity: "1 bottle" },
  { name: "salt", quantity: "1 container" },
  { name: "black pepper", quantity: "1 jar" }
];

export interface ExtractIngredientsInput {
  image: string;
  language?: string;
  isPantry?: boolean;
}

export async function extractIngredientsFromImage({
  image,
  language = "English",
  isPantry = false
}: ExtractIngredientsInput): Promise<string[]> {
  if (USE_MOCK) {
    return isPantry ? MOCK_PANTRY : MOCK_INGREDIENTS;
  }

  ensureAiAvailable();

  const prompt = isPantry
    ? `You are a food vision expert. Identify all distinct grocery or pantry items visible in this image (jars, cans, packaged goods, fresh produce, etc.). Respond ONLY with a JSON array of short item names (e.g., ["olive oil", "rice", "canned tomatoes"]). Use ${language}. No commentary.`
    : `You are a food vision expert. Identify the raw ingredients visible in this image. Respond ONLY with a JSON array of short ingredient names in singular form (e.g., ["tomato", "onion", "chicken breast"]). Use ${language}. No commentary.`;

  const text = await callOpenAIVision(prompt, image);
  const json = extractJson(text);
  const parsed = JSON.parse(json) as string[];
  return parsed.map((item) => item.trim()).filter(Boolean);
}

export async function extractPantryItemsFromImage({
  image,
  language = "English"
}: ExtractIngredientsInput): Promise<PantryItem[]> {
  if (USE_MOCK) {
    return MOCK_PANTRY_ITEMS;
  }

  ensureAiAvailable();

  const prompt = `You are a pantry inventory assistant. Analyze this pantry or grocery image and identify visible food items.

Return ONLY valid JSON in this format:
{
  "items": [
    { "name": "rice", "quantity": "1 bag" },
    { "name": "olive oil", "quantity": "1 bottle" }
  ]
}

Rules:
- Estimate quantity approximately using simple units like "1 jar", "2 cans", "half bag", "1 bunch", "1 carton"
- Use short singular item names where possible
- Only include food or pantry items that are reasonably visible
- If uncertain, still provide a cautious approximate quantity
- Use ${language}
- Return JSON only, no extra commentary.`;

  const text = await callOpenAIVision(prompt, image);
  const json = extractJson(text);
  const parsed = JSON.parse(json) as { items?: Array<{ name?: string; quantity?: string }> };

  return (parsed.items ?? [])
    .map((item) => ({
      name: item.name?.trim() ?? "",
      quantity: item.quantity?.trim() || "1 item"
    }))
    .filter((item) => Boolean(item.name));
}

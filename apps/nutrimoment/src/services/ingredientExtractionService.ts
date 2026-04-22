import type { PantryItem } from "@/lib/types";
import { buildIngredientNameArrayVisionPrompt, buildPantryInventoryVisionPrompt } from "@/lib/aiPrompts";
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

  const text = await callOpenAIVision(buildIngredientNameArrayVisionPrompt(language, isPantry), image);
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

  const text = await callOpenAIVision(buildPantryInventoryVisionPrompt(language), image);
  const json = extractJson(text);
  const parsed = JSON.parse(json) as { items?: Array<{ name?: string; quantity?: string }> };

  return (parsed.items ?? [])
    .map((item) => ({
      name: item.name?.trim() ?? "",
      quantity: item.quantity?.trim() || "1 item"
    }))
    .filter((item) => Boolean(item.name));
}

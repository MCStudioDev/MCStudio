import type { PantryItem } from "@/lib/types";
import { buildIngredientNameArrayVisionPrompt, buildPantryInventoryVisionPrompt } from "@/lib/aiPrompts";
import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";
import { isArabicRecipeLanguage, translateIngredientToArabic, translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";

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
    return normalizeDetectedIngredientNames(isPantry ? MOCK_PANTRY : MOCK_INGREDIENTS, { isPantry, language });
  }

  ensureAiAvailable();

  const text = await callOpenAIVision(buildIngredientNameArrayVisionPrompt(language, isPantry), image);
  const json = extractJson(text);
  const parsed = JSON.parse(json) as string[] | { ingredients?: string[]; items?: Array<{ name?: string }> };
  const rawItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.ingredients)
      ? parsed.ingredients
      : Array.isArray(parsed.items)
        ? parsed.items.map((item) => item?.name ?? "")
        : [];

  return normalizeDetectedIngredientNames(rawItems, { isPantry, language });
}

export async function extractPantryItemsFromImage({
  image,
  language = "English"
}: ExtractIngredientsInput): Promise<PantryItem[]> {
  if (USE_MOCK) {
    return MOCK_PANTRY_ITEMS.map((item) => ({
      ...item,
      name: normalizeDetectedIngredientName(item.name, { isPantry: true, language })
    }));
  }

  ensureAiAvailable();

  const text = await callOpenAIVision(buildPantryInventoryVisionPrompt(language), image);
  const json = extractJson(text);
  const parsed = JSON.parse(json) as { items?: Array<{ name?: string; quantity?: string }> };

  return (parsed.items ?? [])
    .map((item) => ({
      name: normalizeDetectedIngredientName(item.name ?? "", { isPantry: true, language }),
      quantity: item.quantity?.trim() || "1 item"
    }))
    .filter((item) => Boolean(item.name));
}

function normalizeDetectedIngredientNames(values: string[], options: { isPantry: boolean; language?: string }) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeDetectedIngredientName(value, options))
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function normalizeDetectedIngredientName(value: string, options: { isPantry: boolean; language?: string }) {
  const englishSeed = translateIngredientToEnglish(value.trim());
  const normalizedEnglish = englishSeed
    .toLowerCase()
    .replace(/[_]/g, " ")
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\b(pack|packet|box|jar|bottle|container|brand|label|plate|bowl|dish|meal|food|ingredient mix)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\bgrilled chicken breast\b/g, "chicken breast")
    .replace(/\bfried chicken breast\b/g, "chicken breast")
    .replace(/\bgrilled chicken\b/g, "chicken")
    .replace(/\bfried chicken\b/g, "chicken")
    .replace(/\broasted chicken\b/g, "chicken")
    .replace(/\bred sauce\b/g, "tomato sauce")
    .replace(/\bmarinara\b/g, "tomato sauce")
    .replace(/\bwhite sauce\b/g, "white sauce")
    .replace(/\balfredo sauce\b/g, "white sauce")
    .replace(/\bcreamy sauce\b/g, "white sauce")
    .replace(/\begg noodles\b/g, "egg noodles")
    .replace(/\bnoodles\b/g, options.isPantry ? "noodles" : "egg noodles")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\bbreasts\b/g, "breast")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedEnglish) return "";
  if (normalizedEnglish.length < 2) return "";
  if (!options.isPantry && /^(food|meal|dish|ingredient)$/.test(normalizedEnglish)) return "";

  if (isArabicRecipeLanguage(options.language)) {
    return translateIngredientToArabic(normalizedEnglish);
  }

  return normalizedEnglish;
}

import {
  translateCuisineToEnglish,
  translateIngredientToEnglish,
  translateRecipeTitleToEnglish
} from "@/lib/arabicRecipeLocalization";
import type { LocalizedRecipeVariant, Recipe, RecipeDishIntent } from "@/lib/types";

export interface EnglishRecipePhotoContext {
  cuisine: string;
  dishIntent?: RecipeDishIntent;
  imageSearchIndex?: string;
  imageSearchIndices?: string[];
  ingredients: string[];
  missingIngredients: string[];
  name: string;
}

export function buildEnglishRecipePhotoContext(recipe: Recipe): EnglishRecipePhotoContext {
  const englishLocalized = normalizeEnglishLocalizedRecipeVariant(recipe.localized?.English);
  const identityEnglishName = recipe.photo_identity?.english_name?.trim();
  const identityCuisine = recipe.photo_identity?.cuisine_key?.replace(/-/g, " ");
  const fallbackName = firstEnglishText([
    identityEnglishName,
    recipe.dish_intent?.dish_name,
    recipe.image_search_index,
    ...toStringArray(recipe.image_search_indices),
    recipe.name
  ]);
  const name = identityEnglishName || cleanEnglishTitle(englishLocalized?.name ?? recipe.name, fallbackName);
  const dishIntent = normalizeDishIntentForPhoto(
    recipe.dish_intent ?? englishLocalized?.dish_intent,
    name,
    recipe.image_search_index ?? englishLocalized?.image_search_index
  );
  const imageSearchIndices = normalizeEnglishSearchIndices([
    identityEnglishName,
    recipe.image_search_index,
    ...toStringArray(recipe.image_search_indices),
    englishLocalized?.image_search_index,
    ...toStringArray(englishLocalized?.image_search_indices),
    dishIntent?.dish_name,
    name
  ]);

  return {
    cuisine: cleanEnglishCuisine(identityCuisine || recipe.cuisine || englishLocalized?.cuisine || dishIntent?.cuisine || "Unknown"),
    dishIntent,
    imageSearchIndex: imageSearchIndices[0],
    imageSearchIndices,
    ingredients: buildEnglishIngredients(
      hasStringArrayItems(englishLocalized?.ingredients) ? englishLocalized?.ingredients : recipe.ingredients
    ),
    missingIngredients: buildEnglishIngredients(
      hasStringArrayItems(englishLocalized?.missing_ingredients)
        ? englishLocalized.missing_ingredients
        : recipe.missing_ingredients
    ),
    name
  };
}

export function buildEnglishRecipePhotoIngredients(recipe: Recipe) {
  const englishLocalized = normalizeEnglishLocalizedRecipeVariant(recipe.localized?.English);
  return Array.from(
    new Set([
      ...buildEnglishIngredients(englishLocalized?.ingredients?.length ? englishLocalized.ingredients : recipe.ingredients),
      ...buildEnglishIngredients(
        hasStringArrayItems(englishLocalized?.missing_ingredients)
          ? englishLocalized.missing_ingredients
          : recipe.missing_ingredients
      )
    ])
  ).slice(0, 10);
}

export function containsArabicText(value?: string | null) {
  return Boolean(value && /[\u0600-\u06FF]/.test(value));
}

function normalizeEnglishLocalizedRecipeVariant(variant?: LocalizedRecipeVariant) {
  if (!variant) return undefined;
  const name = cleanEnglishTitle(variant.name, variant.image_search_index);
  const cuisine = cleanEnglishCuisine(variant.cuisine);
  return {
    ...variant,
    name,
    cuisine,
    dish_intent: normalizeDishIntentForPhoto(variant.dish_intent, name, variant.image_search_index),
    image_search_index: normalizeEnglishSearchPhrase(variant.image_search_index, name),
    image_search_indices: normalizeEnglishSearchIndices(variant.image_search_indices)
  };
}

function normalizeDishIntentForPhoto(
  dishIntent: RecipeDishIntent | undefined,
  fallbackName: string,
  fallbackQuery?: string
): RecipeDishIntent | undefined {
  if (!dishIntent) return undefined;
  const dishName = cleanEnglishTitle(dishIntent.dish_name, fallbackQuery || fallbackName);
  return {
    ...dishIntent,
    cuisine: cleanEnglishCuisine(dishIntent.cuisine),
    dish_name: dishName || fallbackName,
    visual_keywords: normalizeEnglishSearchIndices(dishIntent.visual_keywords),
    exclude_keywords: normalizeEnglishSearchIndices(dishIntent.exclude_keywords)
  };
}

function buildEnglishIngredients(ingredients: unknown = []) {
  return toUnknownArray(ingredients)
    .map(getRecipeIngredientLabel)
    .map((value) => translateIngredientToEnglish(value).trim())
    .filter(Boolean);
}

function getRecipeIngredientLabel(ingredient: unknown) {
  if (typeof ingredient === "string") return ingredient;

  if (ingredient && typeof ingredient === "object") {
    const maybeIngredient = ingredient as { name?: unknown; quantity?: unknown };
    const name = typeof maybeIngredient.name === "string" ? maybeIngredient.name : "";
    const quantity = typeof maybeIngredient.quantity === "string" ? maybeIngredient.quantity : "";

    return [name, quantity].filter(Boolean).join(" - ") || JSON.stringify(ingredient);
  }

  return String(ingredient);
}

function cleanEnglishTitle(value?: string, fallbackQuery?: string) {
  const text = value?.trim() || fallbackQuery?.trim() || "recipe";
  if (containsArabicText(text)) {
    return stripArabicTextArtifacts(translateRecipeTitleToEnglish(text, fallbackQuery));
  }
  return stripArabicTextArtifacts(text);
}

function cleanEnglishCuisine(value?: string) {
  const text = value?.trim() || "Unknown";
  if (containsArabicText(text)) {
    return stripArabicTextArtifacts(translateCuisineToEnglish(text));
  }
  return stripArabicTextArtifacts(text);
}

function normalizeEnglishSearchPhrase(value?: string, fallbackQuery?: string) {
  const text = value?.trim();
  if (!text) return undefined;
  const translated = containsArabicText(text)
    ? translateRecipeTitleToEnglish(text, fallbackQuery)
    : text;
  const cleaned = stripArabicTextArtifacts(translated)
    .replace(/\b(prepared food|food plated|food|recipe|dish|meal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 ? cleaned : undefined;
}

function normalizeEnglishSearchIndices(values: unknown) {
  return Array.from(
    new Set(
      toStringArray(values)
        .map((value) => normalizeEnglishSearchPhrase(value))
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 5);
}

function firstEnglishText(values: unknown) {
  return toStringArray(values).find((value) => value && !containsArabicText(value))?.trim();
}

function hasStringArrayItems(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim());
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : undefined))
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n;|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function stripArabicTextArtifacts(value: string) {
  return value
    .replace(/[\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

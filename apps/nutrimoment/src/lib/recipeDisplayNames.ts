import { ensureArabicRecipeLanguage, isArabicRecipeLanguage } from "@/lib/arabicRecipeLocalization";
import type { Recipe } from "@/lib/types";

export function buildRecipeDisplayName(recipe: Recipe, uiLanguage?: string) {
  const currentName = normalizeRecipeTitleEncoding(recipe.name).trim();
  const wantsArabic = isArabicRecipeLanguage(uiLanguage) || containsArabicText(currentName);
  if (!wantsArabic) {
    return currentName || recipe.localized?.English?.name || "Recipe";
  }

  if (containsArabicText(currentName) && !containsLatinText(currentName) && !isWeakArabicDisplayName(currentName)) {
    return currentName;
  }

  const candidates = [
    recipe.localized?.Arabic?.name,
    recipe.localized?.English?.name,
    recipe.dish_intent?.dish_name,
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.localized?.Arabic?.dish_intent?.dish_name,
    recipe.image_search_index,
    recipe.localized?.English?.image_search_index,
    recipe.name
  ];

  for (const candidate of candidates) {
    const repaired = buildArabicDisplayCandidate(recipe, candidate);
    if (repaired && !isWeakArabicDisplayName(repaired)) {
      return repaired;
    }
  }

  const fallback = ensureArabicRecipeLanguage(recipe).name.trim();
  return fallback && !isWeakArabicDisplayName(fallback) ? fallback : "وصفة";
}

export function normalizeRecipeTitleEncoding(value: string) {
  return value
    .replace(/bÃ©chamel/gi, "bechamel")
    .replace(/cafÃ©/gi, "cafe")
    .replace(/jalapeÃ±o/gi, "jalapeno")
    .replace(/piÃ±a/gi, "pina")
    .replace(/crÃ¨me/gi, "creme")
    .replace(/\s+/g, " ")
    .trim();
}

function buildArabicDisplayCandidate(recipe: Recipe, candidate?: string) {
  const trimmed = candidate?.trim();
  if (!trimmed) return "";
  if (!containsLatinText(trimmed) && !isWeakArabicDisplayName(trimmed)) {
    return trimmed;
  }

  return ensureArabicRecipeLanguage({
    ...recipe,
    name: trimmed
  }).name.trim();
}

function isWeakArabicDisplayName(value: string) {
  const normalized = value.trim();
  return (
    !normalized ||
    /^[\d¼½¾]/u.test(normalized) ||
    /^(?:و|مع)\s+\S+/u.test(normalized) ||
    /^(?:طبق|وعاء|وجبة)\s+(?:عشاء|غداء|فطور|خفيفة)\b/u.test(normalized) ||
    /\b(?:عشاء|غداء|فطور)\s+(?:جمبري|دجاج|لحم|سمك|أرز|طماطم|ثوم|ليمون)\b/u.test(normalized) ||
    /^(?:وصفة|طبق)\s+(?:مقترحة|مناسبة)$/u.test(normalized)
  );
}

function containsArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatinText(value: string) {
  return /[A-Za-z]/.test(value);
}

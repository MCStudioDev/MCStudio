import { ensureArabicRecipeLanguage, isArabicRecipeLanguage } from "@/lib/arabicRecipeLocalization";
import type { Recipe } from "@/lib/types";

export function buildRecipeDisplayName(recipe: Recipe, uiLanguage?: string) {
  const currentName = recipe.name.trim();
  const wantsArabic = isArabicRecipeLanguage(uiLanguage) || containsArabicText(currentName);
  if (!wantsArabic || !isWeakArabicDisplayName(currentName)) {
    return currentName || recipe.localized?.English?.name || "Recipe";
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
  return fallback && !isWeakArabicDisplayName(fallback) ? fallback : currentName || "وصفة";
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
    /^مع\s+\S+/u.test(normalized) ||
    /^(طبق|وعاء|وجبة)\s+(عشاء|غداء|فطور|خفيفة)\b/u.test(normalized) ||
    /\b(عشاء|غداء|فطور)\s+(جمبري|دجاج|لحم|سمك|أرز|طماطم|ثوم|ليمون)\b/u.test(normalized)
  );
}

function containsArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatinText(value: string) {
  return /[A-Za-z]/.test(value);
}

import {
  hasApprovedArabicRecipeTitle,
  isArabicRecipeLanguage,
  localizeRecipeTitleForArabic
} from "@/lib/arabicRecipeLocalization";
import type { Recipe } from "@/lib/types";

const GENERIC_ENGLISH_IDENTITY_TOKENS = new Set([
  "american",
  "beef",
  "chicken",
  "dish",
  "egyptian",
  "fish",
  "greek",
  "italian",
  "meal",
  "plate",
  "recipe",
  "shrimp",
  "turkish"
]);

const GENERIC_ARABIC_IDENTITY_TOKENS = new Set([
  "أمريكي",
  "إيطالي",
  "تركي",
  "جمبري",
  "دجاج",
  "طبق",
  "فراخ",
  "لحم",
  "مصري",
  "وجبة",
  "وصفة",
  "يوناني"
]);

export function preserveSourceDishIdentityName(
  sourceRecipe: Recipe,
  editedName: string,
  recipeLanguage: string
) {
  const identity = (sourceRecipe.dish_identity || sourceRecipe.name).trim();
  if (!identity) return editedName.trim();

  if (isArabicRecipeLanguage(recipeLanguage)) {
    const localizedIdentity = localizeRecipeTitleForArabic(identity);
    const hasDeterministicArabicIdentity = isCleanArabicRecipeTitle(localizedIdentity);

    if (hasApprovedArabicRecipeTitle(identity) && hasDeterministicArabicIdentity) {
      return localizedIdentity;
    }

    if (!hasDeterministicArabicIdentity) {
      return isCleanArabicRecipeTitle(editedName) ? editedName.trim() : sourceRecipe.name;
    }

    return titlesShareDishIdentity(editedName, localizedIdentity)
      ? editedName.trim()
      : localizedIdentity;
  }

  return titlesShareDishIdentity(editedName, identity)
    ? editedName.trim()
    : sourceRecipe.name;
}

export function recipeTitlePreservesSourceDishIdentity(
  sourceRecipe: Recipe,
  candidateName: string,
  recipeLanguage: string
) {
  const preserved = preserveSourceDishIdentityName(sourceRecipe, candidateName, recipeLanguage);
  return normalizeIdentityText(preserved) === normalizeIdentityText(candidateName);
}

export function isCleanArabicRecipeTitle(value: string) {
  const normalized = value.trim();
  if (!normalized || /[A-Za-z]/.test(normalized) || !/[\u0600-\u06ff]/u.test(normalized)) return false;
  if (/^[\d\u00bc\u00bd\u00be]/u.test(normalized)) return false;
  if (/^(?:و|مع)\s+\S+/u.test(normalized)) return false;
  if (/^(?:وصفة|طبق)\s+(?:مقترحة|مناسبة)$/u.test(normalized)) return false;
  return tokenizeIdentity(normalized).length > 0;
}

export function titlesShareDishIdentity(candidate: string, expectedIdentity: string) {
  const candidateText = normalizeIdentityText(candidate);
  const expectedText = normalizeIdentityText(expectedIdentity);
  if (!candidateText || !expectedText) return false;
  if (candidateText === expectedText) return true;

  const expectedTokens = getDistinctiveIdentityTokens(expectedIdentity);
  if (!expectedTokens.length) return false;
  const candidateTokens = new Set(tokenizeIdentity(candidate));

  return expectedTokens.some((token) => candidateTokens.has(token));
}

function getDistinctiveIdentityTokens(value: string) {
  const hasArabic = /[\u0600-\u06ff]/u.test(value);
  const genericTokens = hasArabic
    ? GENERIC_ARABIC_IDENTITY_TOKENS
    : GENERIC_ENGLISH_IDENTITY_TOKENS;

  return tokenizeIdentity(value)
    .filter((token) => token.length >= 3)
    .filter((token) => !genericTokens.has(token));
}

function tokenizeIdentity(value: string) {
  return normalizeIdentityText(value)
    .split(" ")
    .map(normalizeArabicIdentityPrefix)
    .filter(Boolean);
}

function normalizeArabicIdentityPrefix(token: string) {
  if (!/[\u0600-\u06ff]/u.test(token)) return token;

  let normalized = token;
  if (normalized.length > 4 && normalized.startsWith("و")) normalized = normalized.slice(1);
  if (normalized.length > 4 && normalized.startsWith("ب")) normalized = normalized.slice(1);
  if (normalized.length > 4 && normalized.startsWith("ال")) normalized = normalized.slice(2);
  return normalized;
}

function normalizeIdentityText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

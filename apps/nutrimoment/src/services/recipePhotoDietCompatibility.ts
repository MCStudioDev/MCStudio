import { findRecipeDietViolation } from "@/lib/dietEnforcement";

export interface RecipePhotoDietEntry {
  imageUrl: string;
  query?: string;
  signature?: string;
  source?: string;
  mainIngredientKey?: string;
  canonicalDishKey?: string;
  familyKey?: string;
  dietTags?: string[];
}

export interface RecipePhotoDietRequest {
  diets?: string[];
  allergens?: string[];
}

const PLANT_ADAPTATION_REQUIRED_DISH_PATTERN =
  /\b(bamia|fattah|fatta|fasolia|hawawshi|kafta|kebab|kofta|mahshi|molokhia|moussaka|roz[ -]meammar|shawarma|torly|turly)\b/;

export function requiresPlantBasedRecipePhotoProof(values: Array<string | null | undefined>) {
  return PLANT_ADAPTATION_REQUIRED_DISH_PATTERN.test(
    values.filter((value): value is string => Boolean(value)).join(" ").toLowerCase()
  );
}

export function normalizeRecipePhotoDietIds(values: string[]) {
  return Array.from(new Set(values.map(normalizeRecipePhotoDietId).filter(Boolean))).sort();
}

export function inferRecipePhotoDietIds(values: Array<string | null | undefined>) {
  const text = values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase();
  const inferred: string[] = [];

  if (/\b(?:vegan|plant[ -]based)\b/.test(text)) inferred.push("vegan");
  if (/\bvegetarian\b/.test(text)) inferred.push("vegetarian");
  if (/\bpesc(?:a|e)tarian\b/.test(text)) inferred.push("pescatarian");
  if (/\bgluten[ -]?free\b/.test(text)) inferred.push("glutenFree");
  if (/\bdairy[ -]?free\b/.test(text)) inferred.push("dairyFree");
  if (/\bketo(?:genic)?\b/.test(text)) inferred.push("keto");
  if (/\bpaleo\b/.test(text)) inferred.push("paleo");

  return normalizeRecipePhotoDietIds(inferred);
}

export function scopeRecipePhotoAliasesForDiet(aliases: string[], diets: string[]) {
  const normalizedDiets = normalizeRecipePhotoDietIds(diets);
  if (!normalizedDiets.length) return aliases;

  const scope = normalizedDiets.map((diet) => diet.toLowerCase()).join("+");
  return Array.from(new Set(aliases.map((alias) => `diet:${scope}:${alias}`)));
}

export function isRecipePhotoDietCompatible(
  entry: RecipePhotoDietEntry,
  request: RecipePhotoDietRequest
) {
  const diets = normalizeRecipePhotoDietIds(request.diets ?? []);
  const allergens = normalizeRecipePhotoDietIds(request.allergens ?? []);
  if (!diets.length && !allergens.length) return true;

  const externalProvider = getExternalProvider(entry.imageUrl);
  if (externalProvider && entry.source && !isMatchingExternalProviderSource(entry.source, externalProvider)) {
    return false;
  }

  // Older records occasionally labeled provider URLs as generated. Their
  // query metadata cannot prove what is visible, so constrained requests must
  // not inherit them.
  if (entry.source === "generated" && isExternalProviderImageUrl(entry.imageUrl)) {
    return false;
  }

  const inspectionText = [
    entry.query,
    entry.signature,
    entry.mainIngredientKey,
    entry.canonicalDishKey,
    entry.familyKey
  ].filter((value): value is string => Boolean(value));
  const normalizedInspectionText = inspectionText.join(" ").toLowerCase();
  const requiresPlantBasedProof = diets.some((diet) => diet === "vegan" || diet === "vegetarian") &&
    requiresPlantBasedRecipePhotoProof([normalizedInspectionText]);
  const hasExplicitPlantBasedProof = /\b(plant[ -]based|vegan|vegetarian)\b/.test(normalizedInspectionText);
  const hasMatchingDietTag = diets.some((diet) =>
    entry.dietTags?.some((tag) => tag.toLowerCase() === diet.toLowerCase())
  );
  const hasPlantBasedProof = externalProvider
    ? hasExplicitPlantBasedProof
    : hasExplicitPlantBasedProof || hasMatchingDietTag;
  if (requiresPlantBasedProof && !hasPlantBasedProof) {
    return false;
  }

  return findRecipeDietViolation(
    {
      name: inspectionText[0] ?? "recipe photo",
      ingredients: inspectionText.slice(1)
    },
    { diets, allergens }
  ) === null;
}

function isExternalProviderImageUrl(imageUrl: string) {
  return getExternalProvider(imageUrl) !== null;
}

function getExternalProvider(imageUrl: string): "pexels" | "unsplash" | null {
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    if (host === "images.pexels.com" || host.endsWith(".pexels.com")) return "pexels";
    if (host === "images.unsplash.com" || host.endsWith(".unsplash.com")) return "unsplash";
    return null;
  } catch {
    return null;
  }
}

function isMatchingExternalProviderSource(source: string, provider: "pexels" | "unsplash") {
  const normalizedSource = source.trim().toLowerCase();
  return provider === "pexels"
    ? normalizedSource === "pexels_search" || normalizedSource === "search"
    : normalizedSource === "unsplash_search" || normalizedSource === "unsplash";
}

function normalizeRecipePhotoDietId(value: string) {
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const canonical: Record<string, string> = {
    dairyfree: "dairyFree",
    glutenfree: "glutenFree",
    keto: "keto",
    paleo: "paleo",
    pescatarian: "pescatarian",
    vegan: "vegan",
    vegetarian: "vegetarian"
  };
  return canonical[key] ?? value.trim();
}

import { getCuisineDisplayLabel, normalizeCuisineLabel } from "@/lib/cuisines";
import { localizeRecipeForArabic, translateIngredientToArabic, translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import type { MealType, RecipeCatalogDoc } from "@/lib/domain";

type RecipeTitleSource = {
  title?: string;
  englishName?: string;
  arabicName?: string;
  cuisine?: string;
  mealType?: MealType;
  requiredCanonicals?: string[];
  ingredientCanonicals?: string[];
  dishIntentName?: string;
  imageSearchIndex?: string;
};

const ARABIC_CUISINE_LABELS: Record<string, string> = {
  American: "أمريكي",
  Asian: "آسيوي",
  Egyptian: "مصري",
  European: "أوروبي",
  Generic: "متنوع",
  Global: "عالمي",
  Indian: "هندي",
  Italian: "إيطالي",
  "Italian-American": "إيطالي أمريكي",
  "Latin American": "لاتيني",
  Mediterranean: "متوسطي",
  Mexican: "مكسيكي",
  "Middle Eastern": "شرق أوسطي",
  Spanish: "إسباني",
  Thai: "تايلندي",
  Turkish: "تركي",
  Unknown: "عالمي"
};

const GENERIC_IDENTITY_PATTERNS = [
  /\bany\b/i,
  /\b(dinner|lunch|breakfast|snack)\b/i,
  /\b(plate|bowl|meal|dish|food)\b/i,
  /\b(global|generic|unknown)\b/i
];

export function buildSharedRecipeEnglishTitle(source: RecipeTitleSource) {
  const specificDish = pickSpecificDishLabel(source);
  if (specificDish) {
    return toTitleCase(specificDish);
  }

  const englishCuisine = normalizeEnglishCuisineLabel(source.cuisine);
  const leadIngredients = getLeadEnglishIngredients(source);
  const parts = [
    isSpecificCuisine(englishCuisine) ? englishCuisine : "",
    ...leadIngredients
  ].filter(Boolean);

  return parts.length ? parts.join(" ") : "Shared Recipe";
}

export function buildSharedRecipeArabicTitle(source: RecipeTitleSource) {
  if (source.arabicName && !isWeakArabicTitle(source.arabicName)) {
    return source.arabicName.trim();
  }

  const specificDish = pickSpecificDishLabel(source);
  if (specificDish) {
    const translatedSpecificDish = localizeRecipeForArabic({
      id: "temp",
      name: specificDish,
      cuisine: normalizeEnglishCuisineLabel(source.cuisine),
      ingredients: [],
      missing_ingredients: [],
      steps: [],
      calories: 0,
      protein: "0g",
      carbs: "0g",
      fat: "0g",
      cook_time: "0 mins",
      difficulty: "Easy"
    }).name;

    if (!containsLatinText(translatedSpecificDish) && translatedSpecificDish.trim()) {
      return translatedSpecificDish.trim();
    }
  }

  const arabicCuisine = translateCuisineLabelToArabic(source.cuisine);
  const leadIngredients = getLeadArabicIngredients(source);
  const leadDisplay = leadIngredients.join(" و");
  const parts = [
    leadDisplay,
    isSpecificCuisine(arabicCuisine) ? arabicCuisine : ""
  ].filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim() || "وصفة مشتركة";
}

export function buildSharedRecipeDistinctKey(source: RecipeTitleSource) {
  return [
    normalizeIdentity(buildSharedRecipeEnglishTitle(source)),
    normalizeIdentity(normalizeEnglishCuisineLabel(source.cuisine)),
    source.mealType ?? "dinner"
  ].join("|");
}

export function isWeakEnglishTitle(value?: string | null) {
  if (!value?.trim()) return true;
  return containsArabicText(value) || isGenericRecipeIdentity(value);
}

export function isWeakArabicTitle(value?: string | null) {
  if (!value?.trim()) return true;
  return (
    containsLatinText(value) ||
    isGenericRecipeIdentity(value) ||
    /مكون إضافي/u.test(value) ||
    /^(طبق|وعاء|وجبة)\s+(عشاء|غداء|فطور|خفيفة)\b/u.test(value) ||
    /\b(عشاء|غداء|فطور)\s+(صدر دجاج|دجاج|جمبري|لحم|سمك|أرز|زيت زيتون)\b/u.test(value)
  );
}

export function normalizeEnglishCuisineLabel(value?: string | null) {
  const normalized = normalizeCuisineLabel(value ?? "").trim();
  if (!normalized || normalized === "Unknown") return "Global";
  if (containsArabicText(normalized)) {
    return translateCuisineLabelToEnglish(normalized);
  }
  return normalized;
}

export function translateCuisineLabelToArabic(value?: string | null) {
  const englishCuisine = normalizeEnglishCuisineLabel(value);
  return getCuisineDisplayLabel(englishCuisine, "ar");
}

export function translateCuisineLabelToEnglish(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "Global";
  const reverseMatch = Object.entries(ARABIC_CUISINE_LABELS).find(([, arabic]) => arabic === text)?.[0];
  return reverseMatch ?? normalizeCuisineLabel(text) ?? "Global";
}

export function buildRecipeTitleSource(recipe: Pick<RecipeCatalogDoc, "title" | "cuisine" | "mealType" | "requiredCanonicals" | "ingredientCanonicals" | "localized">) {
  return {
    title: recipe.title,
    cuisine: recipe.cuisine,
    mealType: recipe.mealType,
    requiredCanonicals: recipe.requiredCanonicals,
    ingredientCanonicals: recipe.ingredientCanonicals,
    englishName: recipe.localized?.English?.name,
    arabicName: recipe.localized?.Arabic?.name,
    dishIntentName: recipe.localized?.English?.dish_intent?.dish_name ?? recipe.localized?.Arabic?.dish_intent?.dish_name,
    imageSearchIndex: recipe.localized?.English?.image_search_index ?? recipe.localized?.Arabic?.image_search_index
  } satisfies RecipeTitleSource;
}

function pickSpecificDishLabel(source: RecipeTitleSource) {
  const candidates = [
    source.imageSearchIndex,
    source.dishIntentName,
    source.englishName,
    source.title
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidates) {
    const cleaned = cleanDishLabel(candidate);
    if (!cleaned) continue;
    if (!isGenericRecipeIdentity(cleaned) && !containsArabicText(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

function cleanDishLabel(value: string) {
  return value
    .trim()
    .replace(/\b(food|plate|bowl|dish|meal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLeadEnglishIngredients(source: RecipeTitleSource) {
  return getIngredientCanonicals(source)
    .slice(0, 2)
    .map((ingredient) => toTitleCase(translateIngredientToEnglish(ingredient)))
    .filter(Boolean);
}

function getLeadArabicIngredients(source: RecipeTitleSource) {
  return getIngredientCanonicals(source)
    .slice(0, 2)
    .map((ingredient) => translateIngredientToArabic(ingredient))
    .filter(Boolean);
}

function getIngredientCanonicals(source: RecipeTitleSource) {
  return (source.requiredCanonicals?.length ? source.requiredCanonicals : source.ingredientCanonicals ?? [])
    .map((ingredient) => ingredient.trim())
    .filter(Boolean);
}

function isSpecificCuisine(value: string) {
  return Boolean(value && !/^(global|generic|unknown|عالمي|متنوع)$/i.test(value));
}

function isGenericRecipeIdentity(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  return GENERIC_IDENTITY_PATTERNS.some((pattern) => pattern.test(normalized)) || hasRepeatedContentToken(normalized);
}

function normalizeIdentity(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function containsArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatinText(value: string) {
  return /[A-Za-z]/.test(value);
}

function hasRepeatedContentToken(value: string) {
  const tokens = value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4 && !["with", "style"].includes(token));
  const seen = new Set<string>();

  for (const token of tokens) {
    if (seen.has(token)) return true;
    seen.add(token);
  }

  return false;
}

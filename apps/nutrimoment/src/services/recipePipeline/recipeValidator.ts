import type { Recipe } from "@/lib/types";
import { FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS } from "@/data/culinary/arabicCulinaryDictionary";
import { hasGenericRecipeInstructions } from "@/services/recipeContentQualityService";

export interface RecipeValidationResult {
  reasons: string[];
  valid: boolean;
}

export class RecipeValidator {
  validate(recipe: Recipe): RecipeValidationResult {
    const reasons: string[] = [];
    const ingredients = recipe.ingredients.concat(recipe.missing_ingredients).filter(Boolean);
    const steps = recipe.steps.map(normalize).filter(Boolean);

    if (ingredients.length < 2) reasons.push("missing_ingredients");
    if (steps.length < 2) reasons.push("missing_instructions");
    if (new Set(steps).size !== steps.length) reasons.push("duplicate_instructions");
    if (!hasAuthenticRecipeInstructions(recipe.steps)) {
      reasons.push("invalid_recipe_instructions");
    }
    if (!Number.isFinite(recipe.calories) || recipe.calories <= 0 || !recipe.protein || !recipe.carbs || !recipe.fat) reasons.push("incomplete_nutrition");
    if (!hasRealisticCookingTime(recipe.cook_time, steps.join(" "))) reasons.push("unrealistic_cooking_time");
    if (!recipe.recipe_source_type || recipe.recipe_source_type === "generated") reasons.push("not_source_backed");
    if (/^[\u0600-\u06FF\s\d،.]+$/u.test(recipe.name) && FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS.some((term) => recipe.name.includes(term))) {
      reasons.push("forbidden_arabic_transliteration");
    }

    return { valid: reasons.length === 0, reasons };
  }
}

export function hasAuthenticRecipeInstructions(steps: string[]) {
  return !containsEditorialProse(steps) && !hasGenericRecipeInstructions(steps);
}

function containsEditorialProse(steps: string[]) {
  const text = steps.join(" ");
  return /\b(?:my toddler|my family|my friends|i (?:know|think|love|was|have|go|fear)|we (?:moved|love|think)|this recipe comes from|this recipe uses|favorite blogger|blogher|on this site|new neighborhood|apartment|introduce a new bean to the repertoire|recipes, cooking techniques, and news|devoted to the pleasure of food and drink)\b|(?:هذه الوصفة|تستخدم هذه الوصفة|أخذتها من (?:أمي|والدتي)|أمي وحماتي|كتب الطبخ المختلفة|مناسبة للطقس الحار|جربه مع خبز|طبق غموس .* ولذيذ)|https?:\/\/|www\./iu.test(text);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function hasRealisticCookingTime(cookTime: string, steps: string) {
  const minutes = parseCookingTimeMinutes(cookTime);
  if (minutes == null || minutes < 5 || minutes > 360) return false;
  if (/stew|braise|simmer|طاجن|يطهى على نار هادئة/i.test(steps) && minutes < 20) return false;
  return true;
}

function parseCookingTimeMinutes(value: string) {
  const normalized = normalizeDigits(value).toLowerCase().trim();
  if (!normalized) return null;

  const alternatives = normalized
    .split(/(?<=\d)\s*[-–—]\s*(?=\d)|\s+(?:to|إلى)\s+/u)
    .map((part) => parseDurationPart(part))
    .filter((minutes): minutes is number => minutes != null);

  return alternatives.length ? Math.max(...alternatives) : null;
}

function parseDurationPart(value: string) {
  const durationPattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|ساعات|ساعة|ساعه|minutes?|mins?|min|m|دقائق|دقيقة|دقيقه)/giu;
  let totalMinutes = 0;
  let foundUnit = false;

  for (const match of value.matchAll(durationPattern)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    foundUnit = true;
    totalMinutes += /^(?:h|hr|hrs|hour|hours|ساع)/iu.test(match[2]) ? amount * 60 : amount;
  }

  if (foundUnit) return totalMinutes;
  const bareMinutes = Number(value.match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(bareMinutes) ? bareMinutes : null;
}

function normalizeDigits(value: string) {
  const arabicIndicDigits = "٠١٢٣٤٥٦٧٨٩";
  const easternArabicDigits = "۰۱۲۳۴۵۶۷۸۹";
  return value
    .replace(/[٠-٩]/g, (digit) => String(arabicIndicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(easternArabicDigits.indexOf(digit)));
}

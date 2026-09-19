import { z } from "zod";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import { RecipeQualityGate } from "@/services/recipeQualityGate";
import { translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import type { Recipe } from "@/lib/types";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import { normalizeArabicInputs, normalizeArabicMeasure, westernDigits } from "./ingredients";
import { ARABIC_VALIDATOR_VERSION } from "./config";
import { arabicFingerprint } from "./repository";
import type { ArabicMissingIngredientLimit, ArabicRecipeEntry } from "./types";
import { buildArabicFactsEntry, arabicPropertyViolation } from "./recipeFacts";
import { findArabicFood } from "./foodCatalog";

export const arabicRecipeSchema = z.object({
  name: z.string().min(3).max(180), cuisine: z.string().min(1).max(80),
  ingredients: z.array(z.string().min(1).max(240)).min(1).max(30),
  missing_ingredients: z.array(z.string().min(1).max(240)).max(30).default([]),
  steps: z.array(z.string().min(10).max(1500)).min(3).max(15),
  calories: z.number().positive().max(3000), protein: z.string(), carbs: z.string(), fat: z.string(),
  cook_time: z.string(), difficulty: z.string()
});
const gate = new RecipeQualityGate();
const allIngredients = (recipe: Recipe) => [...recipe.ingredients, ...recipe.missing_ingredients];

function measure(value: string) {
  const match = normalizeArabicMeasure(value).match(/^\s*((?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(\S+)/);
  if (!match) return undefined;
  const fraction = match[1].match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  const quantity = fraction ? Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]) : Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? `${quantity} ${match[2].toLowerCase()}` : undefined;
}
function normalizedMacro(value: string) { return Number(westernDigits(value).match(/\d+(?:\.\d+)?/)?.[0]); }

const instructionActions: Array<[RegExp, RegExp]> = [
  [/\b(?:rinse|wash)\b/i, /اغسل|اشطف/], [/\b(?:put|place|add)\b/i, /ضع|أضف|اضف/],
  [/\bcover\b/i, /غط/], [/\bcook\b/i, /اطبخ|اطه|اطهي|اطهِ/],
  [/\b(?:serve|plate)\b/i, /قدم|قدّم/], [/\b(?:bake|roast)\b/i, /اخبز|اشو|اشوِ/],
  [/\b(?:boil|simmer)\b/i, /اغل|اسلق|غلي|يغلي/], [/\b(?:fry|saute|sauté)\b/i, /اقل|اقلي|شوح|حمّر|حمر/],
  [/\bgrill\b/i, /اشو|اشوِ/], [/\b(?:chop|cut|slice|dice)\b/i, /قطع|قطّع|فرم/],
  [/\b(?:mix|stir|toss)\b/i, /اخلط|حرك|حرّك|قلب|قلّب/], [/\bdrain\b/i, /(?:^|\s)صف(?:ي)?(?=$|[\s.،])/]
];

function instructionConsistency(english: string, arabic: string) {
  const normalized = arabic.replace(/[ًٌٍَُِّْـ]/g, "");
  const missingAction = instructionActions.some(([en, ar]) => en.test(english) && !ar.test(normalized));
  const negationChanged = /\b(?:not|never|avoid)\b/i.test(english) !== /(?:^|\s)(?:لا|تجنب|تجنّب)(?:\s|$)/.test(arabic);
  const proteinTerms = [/\bsalmon\b|سلمون/iu, /\btuna\b|تونة|تونه/iu, /\bchicken\b|دجاج|فراخ/iu,
    /\bbeef\b|لحم بقر/iu, /\bpork\b|خنزير/iu, /\blamb\b|لحم ضأن|لحم غنم/iu,
    /\bturkey\b|ديك رومي/iu, /\b(?:shrimp|prawns?)\b|جمبري|روبيان/iu, /\btofu\b|توفو/iu, /\bmushrooms?\b|فطر|مشروم/iu];
  const proteins = (text: string) => proteinTerms.map(pattern => pattern.test(text)).join("|");
  return !missingAction && !negationChanged && proteins(english) === proteins(arabic);
}

export async function validateArabicPair(canonical: Recipe, recipe: Recipe, restrictions: GenerationRestrictions) {
  const reasons = new Set<string>();
  const shape = arabicRecipeSchema.safeParse(recipe);
  const canonicalShape = arabicRecipeSchema.safeParse(canonical);
  if (!shape.success || !canonicalShape.success) return ["invalid_recipe_shape"];
  const canonicalQuality = gate.validate(canonical, "English");
  // Source-backed publication is an English pool policy, not a safety check.
  // Arabic accepts fresh generation; derivatives independently verify their source.
  canonicalQuality.reasons.filter(reason => reason !== "not_source_backed").forEach(reason => reasons.add(`canonical:${reason}`));
  // Digit conversion supports Arabic-Indic quantities without modifying shared validators.
  const arabicQuality = gate.validate({ ...recipe,
    ingredients: recipe.ingredients.map(westernDigits), missing_ingredients: recipe.missing_ingredients.map(westernDigits),
    protein: westernDigits(recipe.protein), carbs: westernDigits(recipe.carbs), fat: westernDigits(recipe.fat), cook_time: westernDigits(recipe.cook_time)
  }, "Arabic");
  arabicQuality.reasons.filter(reason => reason !== "not_source_backed").forEach(reason => reasons.add(`arabic:${reason}`));
  for (const subject of [canonical, recipe]) {
    if (findRecipeDietViolation(subject, restrictions)) reasons.add("diet_violation");
    if (findRecipeHealthViolation(subject, restrictions.conditions)) reasons.add("health_violation");
  }
  if (recipe.calories !== canonical.calories || ["protein", "carbs", "fat"].some(key =>
    normalizedMacro(recipe[key as "protein"]) !== normalizedMacro(canonical[key as "protein"]))) reasons.add("nutrition_changed");
  if (recipe.steps.length !== canonical.steps.length) reasons.add("instruction_count_changed");
  const numbers = (text: string) => westernDigits(text).match(/\d+(?:\.\d+)?/g)?.join("|") ?? "";
  if (numbers(recipe.cook_time) !== numbers(canonical.cook_time)) reasons.add("cooking_time_changed");
  if (recipe.steps.some((step, index) => numbers(step) !== numbers(canonical.steps[index] ?? ""))) reasons.add("instruction_numbers_changed");
  if (recipe.steps.some((step, index) => !instructionConsistency(canonical.steps[index] ?? "", step))) reasons.add("instruction_meaning_changed");
  const left = allIngredients(canonical), right = allIngredients(recipe);
  if (left.length !== right.length) reasons.add("ingredients_changed");
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const a = await normalizeArabicInputs([left[index]]);
    const b = await normalizeArabicInputs([right[index]]);
    if (a.unclear.length || b.unclear.length || a.canonical.join("|") !== b.canonical.join("|")) reasons.add("ingredient_identity_changed");
    const aMeasure = measure(left[index]);
    const bMeasure = measure(translateIngredientToEnglish(normalizeArabicMeasure(right[index])));
    if (!aMeasure || aMeasure !== bMeasure) reasons.add("ingredient_quantity_changed");
  }
  if (/[A-Za-z]/.test([recipe.name, recipe.cuisine, recipe.cook_time, recipe.difficulty, recipe.protein, recipe.carbs, recipe.fat, ...recipe.steps, ...right].join(" "))) reasons.add("wrong_output_language");
  return [...reasons];
}
export async function buildArabicEntry(canonicalInput: unknown, arabicInput: unknown, restrictions: GenerationRestrictions, source?: ArabicRecipeEntry["source"]) {
  const canonical = arabicRecipeSchema.parse(canonicalInput);
  const recipe = arabicRecipeSchema.parse(arabicInput);
  const reasons = await validateArabicPair(canonical, recipe, restrictions);
  if (reasons.length) return { entry: null, reasons };
  const ingredients = await normalizeArabicInputs(allIngredients(canonical));
  if (arabicPropertyViolation(ingredients.canonical, restrictions)) return { entry: null, reasons: ["diet_violation"] };
  const fingerprint = arabicFingerprint({ canonical, recipe, source: source ?? null });
  const id = `ar-${fingerprint.slice(0, 24)}`;
  const entry: ArabicRecipeEntry = {
    id, canonical, recipe: { ...recipe, id, generationLanguage: "ar", recipe_source_type: source ? "external_source" : "generated" }, ingredientCanonicals: ingredients.canonical,
    validatorVersion: ARABIC_VALIDATOR_VERSION, fingerprint, source, validatedAt: new Date().toISOString()
  };
  return { reasons: [], entry };
}
export async function partitionArabicRecipe(entry: ArabicRecipeEntry, pantry: string[], missingLimit: ArabicMissingIngredientLimit, pantryOptional = false) {
  const canonical = allIngredients(entry.canonical), display = allIngredients(entry.recipe);
  const owned: string[] = [], missing: string[] = [];
  for (const [index, ingredient] of canonical.entries()) {
    if (entry.facts) {
      const item = entry.ingredientCanonicals[index];
      const pantryIds = new Set(pantry.map(name => findArabicFood(name)?.id ?? name));
      (pantryIds.has(findArabicFood(item)?.id ?? item) ? owned : missing).push(display[index]);
      continue;
    }
    const normalized = await normalizeArabicInputs([ingredient]);
    if (normalized.unclear.length) return null;
    (normalized.canonical.every(name => pantry.includes(name)) ? owned : missing).push(display[index]);
  }
  if ((!owned.length && !pantryOptional) || (missingLimit !== "unlimited" && missing.length > missingLimit)) return null;
  return { ...entry.recipe, ingredients: owned, missing_ingredients: missing };
}
export async function revalidateArabicEntry(entry: ArabicRecipeEntry, restrictions: GenerationRestrictions) {
  const result = entry.facts ? await buildArabicFactsEntry(entry.facts, restrictions, entry.source, entry.labelReceipt, entry.safetyReceipt)
    : await buildArabicEntry(entry.canonical, entry.recipe, restrictions, entry.source);
  if (result.entry && entry.variantKey) result.entry.variantKey = entry.variantKey;
  return result;
}

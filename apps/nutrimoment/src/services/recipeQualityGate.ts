import { FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS } from "@/data/culinary/arabicCulinaryDictionary";
import {
  getIngredientProfileForExactTerm,
  getIngredientProfileForTerm,
  normalizeIngredientText
} from "@/food/IngredientNormalizer";
import type { Recipe } from "@/lib/types";
import { RecipeValidator } from "@/services/recipePipeline/recipeValidator";
import { validateRecipeIdentityContent } from "@/services/recipeIdentityContractService";

export interface RecipeQualityGateResult {
  reasons: string[];
  valid: boolean;
}

export class IngredientValidator {
  validate(recipe: Recipe) {
    const reasons: string[] = [];
    const availableIngredients = readRecipeIngredients(recipe.ingredients)
      .filter((ingredient) => ingredient.label);
    const missingIngredients = readRecipeIngredients(recipe.missing_ingredients)
      .filter((ingredient) => ingredient.label);
    const ingredients = [...availableIngredients, ...missingIngredients];
    const normalizedIngredients = ingredients.map((ingredient) => normalizeRecipeIngredientIdentity(ingredient.label)).filter(Boolean);
    if (!ingredients.length) reasons.push("missing_ingredients");
    if (new Set(normalizedIngredients).size !== normalizedIngredients.length) reasons.push("duplicate_ingredients");
    for (const ingredient of ingredients) {
      if (!hasIngredientQuantity(ingredient) || !hasIngredientUnit(ingredient)) {
        reasons.push(`ingredient_missing_quantity_or_unit:${normalizeRecipeIngredientIdentity(ingredient.label)}`);
      }
      if (isProteinIngredient(ingredient.label) && !hasIngredientQuantity(ingredient)) {
        reasons.push(`protein_missing_quantity:${normalizeRecipeIngredientIdentity(ingredient.label)}`);
      }
    }

    const steps = recipe.steps.map(normalizeText).filter(Boolean);
    const stepRequiredIngredients = [
      ...availableIngredients,
      ...missingIngredients.filter((ingredient) => isProteinIngredient(ingredient.label))
    ];
    for (const ingredient of stepRequiredIngredients) {
      const signals = ingredientMatchSignals(ingredient.label);
      if (signals.length && !steps.some((step) => signals.some((signal) => step.includes(signal)))) {
        reasons.push(`ingredient_not_used:${normalizeRecipeIngredientIdentity(ingredient.label)}`);
      }
    }
    return reasons;
  }
}

export class LanguageValidator {
  validate(recipe: Recipe, recipeLanguage: string) {
    if (recipeLanguage.toLowerCase() !== "arabic") return [];
    const userFacingText = [
      recipe.name,
      recipe.cuisine,
      ...readRecipeIngredients(recipe.ingredients).map((ingredient) => ingredient.label),
      ...readRecipeIngredients(recipe.missing_ingredients).map((ingredient) => ingredient.label),
      ...recipe.steps,
      recipe.cook_time,
      recipe.difficulty,
      ...(recipe.preference_hits ?? [])
    ].join(" ");
    const reasons: string[] = [];
    if (FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS.some((term) => userFacingText.includes(term))) {
      reasons.push("forbidden_arabic_transliteration");
    }
    if (/[A-Za-z]/.test(userFacingText)) reasons.push("english_leakage_in_arabic");
    return reasons;
  }
}

export class NutritionValidator {
  validate(recipe: Recipe) {
    const calories = Number(recipe.calories);
    const protein = readNumber(recipe.protein);
    const carbs = readNumber(recipe.carbs);
    const fat = readNumber(recipe.fat);
    const sodium = readNumber(recipe.sodium);
    const reasons: string[] = [];
    if (!Number.isFinite(calories) || calories < 80 || calories > 2_500) reasons.push("implausible_calories");
    if ([protein, carbs, fat].some((value) => value == null || value < 0 || value > 300)) reasons.push("implausible_macros");
    if (sodium != null && (sodium < 0 || sodium > 6_000)) reasons.push("implausible_sodium");
    return reasons;
  }
}

export class RecipeQualityGate {
  private readonly recipeValidator = new RecipeValidator();
  private readonly ingredientValidator = new IngredientValidator();
  private readonly languageValidator = new LanguageValidator();
  private readonly nutritionValidator = new NutritionValidator();

  validate(recipe: Recipe, recipeLanguage: string): RecipeQualityGateResult {
    const reasons = [
      ...validateRecipeShape(recipe),
      ...validateTitle(recipe),
      ...validateRecipeIdentityContent(recipe),
      ...validateCookabilityContract(recipe),
      ...this.recipeValidator.validate(recipe).reasons,
      ...this.ingredientValidator.validate(recipe),
      ...this.languageValidator.validate(recipe, recipeLanguage),
      ...this.nutritionValidator.validate(recipe)
    ];
    return { valid: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
  }
}

function validateCookabilityContract(recipe: Recipe) {
  const reasons: string[] = [];
  const listedIngredients = [...readRecipeIngredients(recipe.ingredients), ...readRecipeIngredients(recipe.missing_ingredients)];
  const listedText = normalizeText(listedIngredients.map((ingredient) => ingredient.label).join(" "));
  const stepsText = normalizeText(recipe.steps.join(" "));
  const recipeIdentity = normalizeText([recipe.name, recipe.dish_identity, recipe.dish_intent?.dish_name].filter(Boolean).join(" "));

  if (/\btomato paste\b/.test(stepsText) && !/\btomato paste\b/.test(listedText)) {
    reasons.push("step_ingredient_not_listed:tomato paste");
  }

  if (/\blasagna\b/.test(recipeIdentity)) {
    const requiredStructuralIngredients = listedIngredients
      .map((ingredient) => ({
        identity: ingredient.label.toLocaleLowerCase().trim(),
        normalized: normalizeText(ingredient.label)
      }))
      .filter((ingredient) => /\b(?:lasagna noodles?|lasagne sheets?|dairy free cheese|vegan cheese|mozzarella|ricotta)\b/.test(ingredient.normalized));
    for (const ingredient of requiredStructuralIngredients) {
      const key = /cheese|mozzarella|ricotta/.test(ingredient.normalized) ? "cheese" : "lasagna noodles";
      if (!new RegExp(`\\b${key.replaceAll(" ", "\\s+")}\\b`).test(stepsText)) {
        reasons.push(`required_ingredient_not_used:${ingredient.identity}`);
      }
    }
    if (!/\b(?:assemble|layer|arrange)\b/.test(stepsText)) {
      reasons.push("missing_dish_stage:lasagna_assembly");
    }
    if (!/\b(?:bake|oven)\b/.test(stepsText)) {
      reasons.push("missing_dish_stage:lasagna_baking");
    }
  }

  const hasPlantGroundProtein = /\b(?:ground|minced)\s+(?:chickpeas?|lentils?|beans?|tofu|tempeh)\b/.test(listedText);
  const hasAnimalProtein = /\b(?:beef|chicken|lamb|pork|turkey|fish|shrimp|meat)\b/.test(listedText);
  const hasMeatTemplateTechnique = /\b(?:drain off (?:pan drippings?|excess fat)|rendered fat|stirring to crumble)\b/.test(stepsText);
  const hasFlaxCarbonaraTemplate = /\bcarbonara\b/.test(recipeIdentity) &&
    /\bground flaxseed\b/.test(`${listedText} ${stepsText}`);
  if ((hasPlantGroundProtein && !hasAnimalProtein && hasMeatTemplateTechnique) || hasFlaxCarbonaraTemplate) {
    reasons.push("plant_substitution_template_artifact");
  }

  return reasons;
}

function validateRecipeShape(recipe: Recipe) {
  const reasons: string[] = [];
  if (!recipe.name?.trim() || !recipe.cuisine?.trim()) reasons.push("missing_title_or_cuisine");
  if (recipe.steps.filter(Boolean).length < 2) reasons.push("missing_instructions");
  const normalizedSteps = recipe.steps.map(normalizeText).filter(Boolean);
  if (new Set(normalizedSteps).size !== normalizedSteps.length) reasons.push("duplicate_instructions");
  if (!recipe.cook_time?.trim() || !recipe.difficulty?.trim()) reasons.push("missing_required_fields");
  return reasons;
}

function validateTitle(recipe: Recipe) {
  if (isMalformedRecipeTitle(recipe.name)) return ["malformed_recipe_title"];
  if (isIngredientOnlyRecipeTitle(recipe)) return ["ingredient_only_title"];
  return [];
}

export function isMalformedRecipeTitle(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  if (/^[\d¼½¾]/u.test(normalized)) return true;
  if (/^(?:و|مع)\s+\S+/u.test(normalized)) return true;
  if (/^وصفة(?:\s|$)/u.test(normalized) || /^recipe\b/iu.test(normalized)) return true;
  if (/\b(?:cup|cups|tbsp|tsp|ounce|ounces|pound|pounds)\b/i.test(normalized)) return true;
  return false;
}

function isIngredientOnlyRecipeTitle(recipe: Recipe) {
  // A catalog-v2 source ID means the title was selected from the curated dish
  // catalog. Some authentic dishes (for example, molokhia) are also ingredient
  // names, so their one-word cookbook title is valid in this narrow case.
  if (recipe.source_recipe_id?.startsWith("catalog-v2-")) return false;
  const titleIdentity = buildIngredientIdentity(recipe.name);
  if (!titleIdentity) return false;

  const recipeIngredientIdentities = new Set(
    [...readRecipeIngredients(recipe.ingredients), ...readRecipeIngredients(recipe.missing_ingredients)]
      .map((ingredient) => buildIngredientIdentity(ingredient.label))
      .filter((identity): identity is string => Boolean(identity))
  );

  if (recipeIngredientIdentities.has(titleIdentity)) return true;

  const knownSingleIngredientTitle = getIngredientProfileForExactTerm(recipe.name);
  if (!knownSingleIngredientTitle) return false;

  return isLikelyPrimaryIngredientProfile(knownSingleIngredientTitle.category);
}

function buildIngredientIdentity(value: string) {
  const profile = getIngredientProfileForExactTerm(value);
  if (profile) return profile.id;

  const normalized = normalizeRecipeIngredientIdentity(value);
  if (!normalized) return "";

  return normalizeIngredientText(normalized).replace(/\s+/g, "_");
}

function isLikelyPrimaryIngredientProfile(category: string | undefined) {
  return /^(protein|grain|starch|vegetable|legume|dairy|fruit)$/i.test(category ?? "");
}

type RecipeIngredientInput = {
  label: string;
  quantity?: unknown;
  unit?: string;
};

function readRecipeIngredients(values: unknown): RecipeIngredientInput[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(readRecipeIngredient)
    .filter((ingredient): ingredient is RecipeIngredientInput => Boolean(ingredient));
}

function readRecipeIngredient(value: unknown): RecipeIngredientInput | null {
  if (typeof value === "string") {
    const parsed = parseIngredientQuantityPrefix(value);
    return {
      label: parsed.label || value.trim(),
      quantity: parsed.quantity,
      unit: parsed.unit
    };
  }

  if (value && typeof value === "object") {
    const item = value as { ingredient?: unknown; name?: unknown; quantity?: unknown; unit?: unknown };
    const label = typeof item.ingredient === "string"
      ? item.ingredient.trim()
      : typeof item.name === "string"
        ? item.name.trim()
        : "";
    if (!label) return null;
    return {
      label,
      quantity: item.quantity,
      unit: typeof item.unit === "string" ? item.unit.trim() : undefined
    };
  }

  return null;
}

function parseIngredientQuantityPrefix(value: string): RecipeIngredientInput {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^((?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?|half|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|lbs|pound|pounds|kg|kilogram|kilograms|g|gram|grams|ml|milliliter|milliliters|l|liter|liters|can|cans|clove|cloves|piece|pieces|portion|portions|serving|servings|package|packages|pkg|box|boxes|bunch|bunches|slice|slices|breast|breasts|whole|large|small|medium|\u0643\u0648\u0628|\u0623\u0643\u0648\u0627\u0628|\u0645\u0644\u0639\u0642\u0629|\u0645\u0644\u0627\u0639\u0642|\u063a\u0631\u0627\u0645|\u0643\u064a\u0644\u0648\u063a\u0631\u0627\u0645|\u062d\u0628\u0629|\u062d\u0628\u0627\u062a|\u0641\u0635|\u0641\u0635\u0648\u0635|\u0635\u062f\u0631|\u0635\u062f\u0648\u0631|\u0639\u0628\u0648\u0629)(?=\s|$)\s*)?(.+)$/iu
  );
  if (!match) return { label: trimmed };

  return {
    label: match[3]?.trim() || trimmed,
    quantity: match[1],
    unit: match[2]?.trim()
  };
}

function isProteinIngredient(value: string) {
  const profile = getIngredientProfileForExactTerm(value);
  if (profile?.category === "protein") return true;
  return /\b(chicken|beef|ground beef|ground chuck|ground round|hamburger|minced beef|meat|lamb|fish|salmon|shrimp|egg|turkey|tofu)\b/i.test(
    normalizeText(value)
  );
}

function hasIngredientQuantity(ingredient: RecipeIngredientInput) {
  if (ingredient.quantity == null || ingredient.quantity === "") return false;
  if (typeof ingredient.quantity === "number") return Number.isFinite(ingredient.quantity) && ingredient.quantity > 0;
  if (typeof ingredient.quantity === "string") return ingredient.quantity.trim().length > 0;
  return true;
}

function hasIngredientUnit(ingredient: RecipeIngredientInput) {
  return typeof ingredient.unit === "string" && ingredient.unit.trim().length > 0;
}

export function normalizeRecipeIngredientIdentity(value: string) {
  return normalizeText(value)
    .replace(/\b\d+(?:\.\d+)?\b/g, "")
    .replace(/\b(?:cup|cups|tbsp|tsp|oz|ounce|ounces|lb|kg|g|gram|grams|can|cans|piece|pieces|portion|portions|serving|servings|whole|large|small|medium)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getRecipeIngredientValidationIdentity(value: unknown) {
  const ingredient = readRecipeIngredient(value);
  return ingredient ? normalizeRecipeIngredientIdentity(ingredient.label) : "";
}

function ingredientTokens(value: string) {
  return normalizeRecipeIngredientIdentity(value)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !new Set(["with", "and", "from", "fresh", "dried", "optional", "taste", "حسب", "الرغبة", "طازج"]).has(token));
}

function ingredientMatchSignals(value: string) {
  const profile = getIngredientProfileForTerm(value);
  const profileTerms = profile
    ? [
        profile.canonicalEnglishName,
        profile.canonicalArabicName,
        ...profile.aliases,
        ...profile.synonyms,
        ...profile.pluralForms
      ]
    : [];

  return Array.from(new Set(
    [...ingredientTokens(value), ...profileTerms]
      .map(normalizeText)
      .filter((signal) => signal.length >= 2)
  ));
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function readNumber(value: string | number | undefined) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

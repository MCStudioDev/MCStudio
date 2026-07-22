import { FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS } from "@/data/culinary/arabicCulinaryDictionary";
import type { Recipe } from "@/lib/types";
import { RecipeValidator } from "@/services/recipePipeline/recipeValidator";

export interface RecipeQualityGateResult {
  reasons: string[];
  valid: boolean;
}

export class IngredientValidator {
  validate(recipe: Recipe) {
    const reasons: string[] = [];
    const ingredients = [...recipe.ingredients, ...recipe.missing_ingredients].filter(Boolean);
    const normalizedIngredients = ingredients.map(normalizeIngredient).filter(Boolean);
    if (!ingredients.length) reasons.push("missing_ingredients");
    if (new Set(normalizedIngredients).size !== normalizedIngredients.length) reasons.push("duplicate_ingredients");

    const steps = recipe.steps.map(normalizeText).filter(Boolean);
    for (const ingredient of ingredients) {
      const tokens = ingredientTokens(ingredient);
      if (tokens.length && !steps.some((step) => tokens.some((token) => step.includes(token)))) {
        reasons.push(`ingredient_not_used:${normalizeIngredient(ingredient)}`);
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
      ...recipe.ingredients,
      ...recipe.missing_ingredients,
      ...recipe.steps,
      recipe.cook_time,
      recipe.difficulty,
      ...(recipe.preference_hits ?? [])
    ].join(" ");
    const reasons: string[] = [];
    if (FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS.some((term) => userFacingText.includes(term))) {
      reasons.push("forbidden_arabic_transliteration");
    }
    if (/[A-Za-z]{3,}/.test(userFacingText)) reasons.push("english_leakage_in_arabic");
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
      ...this.recipeValidator.validate(recipe).reasons,
      ...this.ingredientValidator.validate(recipe),
      ...this.languageValidator.validate(recipe, recipeLanguage),
      ...this.nutritionValidator.validate(recipe)
    ];
    return { valid: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
  }
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
  const titleTokens = ingredientTokens(recipe.name);
  if (!titleTokens.length) return ["title_does_not_describe_recipe"];
  const recipeText = normalizeText([...recipe.ingredients, ...recipe.missing_ingredients, ...recipe.steps].join(" "));
  return titleTokens.some((token) => recipeText.includes(token)) ? [] : ["title_does_not_describe_recipe"];
}

function normalizeIngredient(value: string) {
  return normalizeText(value)
    .replace(/\b\d+(?:\.\d+)?\b/g, "")
    .replace(/\b(?:cup|cups|tbsp|tsp|oz|ounce|ounces|lb|kg|g|gram|grams|can|cans|whole|large|small|medium)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ingredientTokens(value: string) {
  return normalizeIngredient(value)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !new Set(["with", "and", "from", "fresh", "dried", "optional", "taste", "حسب", "الرغبة", "طازج"]).has(token));
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function readNumber(value: string | number | undefined) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

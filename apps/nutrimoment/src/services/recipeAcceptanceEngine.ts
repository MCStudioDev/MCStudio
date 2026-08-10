import type { Recipe } from "@/lib/types";
import { calculateRecipeSimilarity } from "@/services/recipeDiversityValidator";
import type { RecipeQualityGateResult } from "@/services/recipeQualityGate";

export interface RecipeAcceptanceResult {
  accepted: boolean;
  reasons: string[];
  score: number;
  checks: {
    diversity: number;
    imageReady: number;
    ingredientCompleteness: number;
    localization: number;
    nutritionPlausibility: number;
    stepQuality: number;
    titleQuality: number;
  };
}

export interface RecipeAcceptanceOptions {
  allowRepairableQualityIssues?: boolean;
  blockingQualityReasons?: string[];
  failOpen?: boolean;
  imageReady?: boolean;
  minimumScore?: number;
  qualityGate?: RecipeQualityGateResult;
  recipeLanguage: string;
  selectedRecipes?: Recipe[];
}

// Source recipes may legitimately require shopping-list ingredients or await
// client-side image hydration. Those are ranking penalties, not invalid cards.
const MINIMUM_ACCEPTANCE_SCORE = 70;

export class RecipeAcceptanceEngine {
  evaluate(recipe: Recipe, options: RecipeAcceptanceOptions): RecipeAcceptanceResult {
    const qualityReasons = options.qualityGate?.reasons ?? [];
    const checks = {
      titleQuality: scoreTitleQuality(recipe, qualityReasons),
      ingredientCompleteness: scoreIngredientCompleteness(recipe, qualityReasons),
      stepQuality: scoreStepQuality(recipe, qualityReasons),
      diversity: scoreDiversity(recipe, options.selectedRecipes ?? []),
      nutritionPlausibility: scoreNutrition(recipe, qualityReasons),
      localization: scoreLocalization(recipe, options.recipeLanguage, qualityReasons),
      imageReady: 10
    };
    const score = Object.values(checks).reduce((sum, value) => sum + value, 0);
    const reasons = buildReasons(checks, qualityReasons);
    const minimumScore = options.minimumScore ?? MINIMUM_ACCEPTANCE_SCORE;
    const blockingQualityReasons = options.blockingQualityReasons ?? qualityReasons;

    return {
      accepted: (Boolean(options.failOpen) || score >= minimumScore) &&
        (qualityReasons.length === 0 || (Boolean(options.allowRepairableQualityIssues) && blockingQualityReasons.length === 0)),
      checks,
      reasons,
      score
    };
  }
}

function scoreTitleQuality(recipe: Recipe, qualityReasons: string[]) {
  if (qualityReasons.includes("malformed_recipe_title")) return 0;
  if (qualityReasons.includes("ingredient_only_title")) return 0;
  const wordCount = recipe.name.trim().split(/\s+/).filter(Boolean).length;
  return wordCount >= 2 ? 15 : 8;
}

function scoreIngredientCompleteness(recipe: Recipe, qualityReasons: string[]) {
  if (qualityReasons.some((reason) => reason.startsWith("protein_missing_quantity"))) return 0;
  if (qualityReasons.some((reason) => reason.startsWith("ingredient_missing_quantity_or_unit"))) return 7;
  if (qualityReasons.includes("missing_ingredients")) return 0;
  return recipe.ingredients.length ? 15 : 0;
}

function scoreStepQuality(recipe: Recipe, qualityReasons: string[]) {
  if (qualityReasons.includes("missing_instructions")) return 0;
  if (qualityReasons.includes("duplicate_instructions")) return 8;
  const detailedSteps = recipe.steps.filter((step) => /\b\d+\b|minute|minutes|min|دقيق/u.test(step)).length;
  if (recipe.steps.length >= 7 && detailedSteps >= 4) return 20;
  if (recipe.steps.length >= 4) return 15;
  return 10;
}

function scoreDiversity(recipe: Recipe, selectedRecipes: Recipe[]) {
  if (!selectedRecipes.length) return 15;
  const maxSimilarity = Math.max(
    ...selectedRecipes.map((selected) => calculateRecipeSimilarity(recipe, selected).total)
  );
  if (maxSimilarity > 0.75) return 0;
  if (maxSimilarity > 0.6) return 8;
  return 15;
}

function scoreNutrition(recipe: Recipe, qualityReasons: string[]) {
  if (qualityReasons.includes("implausible_calories") || qualityReasons.includes("implausible_macros")) return 0;
  return 10;
}

function scoreLocalization(recipe: Recipe, recipeLanguage: string, qualityReasons: string[]) {
  const wantsArabic = recipeLanguage.toLowerCase() === "arabic";
  if (wantsArabic && qualityReasons.some((reason) =>
    reason === "english_leakage_in_arabic" || reason === "forbidden_arabic_transliteration"
  )) return 0;
  const hasEnglish = Boolean(recipe.localized?.English?.name?.trim());
  const hasArabic = Boolean(recipe.localized?.Arabic?.name?.trim());
  if (wantsArabic && !hasArabic) return hasArabicTopLevelRecipe(recipe) ? 15 : 0;
  if (!wantsArabic && !hasEnglish) return 10;
  return hasEnglish && hasArabic ? 15 : 12;
}

function hasArabicTopLevelRecipe(recipe: Recipe) {
  const displayText = [
    recipe.name,
    recipe.cuisine,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps
  ].join(" ");
  return /[\u0600-\u06FF]/u.test(displayText) && !/[A-Za-z]/.test(displayText);
}

function buildReasons(
  checks: RecipeAcceptanceResult["checks"],
  qualityReasons: string[]
) {
  const reasons = [...qualityReasons];
  if (checks.titleQuality < 15) reasons.push("acceptance_title_quality");
  if (checks.ingredientCompleteness < 15) reasons.push("acceptance_ingredient_completeness");
  if (checks.stepQuality < 20) reasons.push("acceptance_step_quality");
  if (checks.diversity < 15) reasons.push("acceptance_diversity");
  if (checks.nutritionPlausibility < 10) reasons.push("acceptance_nutrition");
  if (checks.localization < 15) reasons.push("acceptance_localization");
  return Array.from(new Set(reasons));
}

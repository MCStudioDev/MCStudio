import type { Recipe } from "@/lib/types";
import { FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS } from "@/data/culinary/arabicCulinaryDictionary";

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
  return !containsEditorialProse(steps) && hasCulinaryWorkflow(steps);
}

function containsEditorialProse(steps: string[]) {
  const text = steps.join(" ");
  return /\b(?:my toddler|my family|my friends|i (?:know|think|love|was|have|go|fear)|we (?:moved|love|think)|this recipe comes from|this recipe uses|favorite blogger|blogher|on this site|new neighborhood|apartment|introduce a new bean to the repertoire|recipes, cooking techniques, and news|devoted to the pleasure of food and drink)\b|(?:هذه الوصفة|تستخدم هذه الوصفة|أخذتها من (?:أمي|والدتي)|أمي وحماتي|كتب الطبخ المختلفة|مناسبة للطقس الحار|جربه مع خبز|طبق غموس .* ولذيذ)|https?:\/\/|www\./iu.test(text);
}

function hasCulinaryWorkflow(steps: string[]) {
  const text = steps.join(" ");
  const culinaryActions = text.match(/\b(?:add|arrange|bake|beat|blend|boil|brown|chop|combine|cook|drain|fold|fry|grate|grill|heat|knead|marinate|mash|mix|peel|pour|preheat|reduce|roast|saute|season|sear|simmer|slice|steam|stir|toast|whisk)\b|(?:أضف|اخبز|اخفق|اخلط|اسلق|اشو|اطه|اعجن|اهر[سِ]|اترك|ادهن|افرم|جهز|حض[ّ]?ر|تب[ّ]?ل|حم[ّ]?ر|سخ[ّ]?ن|شو[ّ]?ح|صف[ِّ]?|ضع|قط[ّ]?ع|قل[ّ]?ب|قد[ّ]?م|قس[ّ]?م|وز[ّ]?ع|هرس|يُطهى|يطهى)/giu);
  return (culinaryActions?.length ?? 0) >= 2;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function hasRealisticCookingTime(cookTime: string, steps: string) {
  const minutes = Number(cookTime.match(/\d+/)?.[0] ?? 0);
  if (minutes < 5 || minutes > 360) return false;
  if (/stew|braise|simmer|طاجن|يطهى على نار هادئة/i.test(steps) && minutes < 20) return false;
  return true;
}

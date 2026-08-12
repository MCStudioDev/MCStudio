import type { RecipeCatalogDoc } from "@/lib/domain";
import { CuisineClassifier } from "@/food/CuisineClassifier";
import { IngredientNormalizer } from "@/food/IngredientNormalizer";

export interface EnrichedRecipeMetadata {
  confidence: number;
  difficulty: RecipeCatalogDoc["difficulty"];
  dishFamily: string;
  estimatedCookMinutes: number;
  estimatedPrepMinutes: number;
  ingredientIds: string[];
  mealType: RecipeCatalogDoc["mealType"];
  predictedCuisine: string;
  tags: string[];
  techniques: string[];
}

const classifier = new CuisineClassifier();
const normalizer = new IngredientNormalizer();

export function enrichRecipeDatasetRecord(recipe: Pick<
  RecipeCatalogDoc,
  "cookMinutes" | "cuisine" | "difficulty" | "ingredients" | "mealType" | "prepMinutes" | "steps" | "styleTags" | "title"
>): EnrichedRecipeMetadata {
  const ingredientNames = recipe.ingredients.map((ingredient) => ingredient.canonical || ingredient.name).filter(Boolean);
  const normalizedIngredients = normalizer.normalize(ingredientNames);
  const cuisinePrediction = classifier.predict({
    title: recipe.title,
    ingredients: ingredientNames,
    directions: recipe.steps
  });
  const techniques = inferTechniques(recipe.steps);
  const tags = Array.from(new Set([
    ...techniques.map((technique) => technique.toLowerCase()),
    ...(recipe.styleTags ?? []),
    ...normalizedIngredients.map((ingredient) => ingredient.category).filter((value): value is string => Boolean(value))
  ]));

  return {
    confidence: Math.round(cuisinePrediction.confidence),
    difficulty: recipe.difficulty,
    dishFamily: normalizeDishFamily(recipe.title),
    estimatedCookMinutes: recipe.cookMinutes,
    estimatedPrepMinutes: recipe.prepMinutes,
    ingredientIds: Array.from(new Set(normalizedIngredients.map((ingredient) => ingredient.id))),
    mealType: recipe.mealType,
    predictedCuisine: cuisinePrediction.cuisine || recipe.cuisine,
    tags,
    techniques
  };
}

function inferTechniques(steps: string[]) {
  const source = steps.join(" ").toLowerCase();
  const techniques: string[] = [];
  if (/\b(bake|baked|oven|roast|roasted)\b/.test(source)) techniques.push("Bake");
  if (/\b(bread|breaded|breadcrumbs|coat)\b/.test(source)) techniques.push("Bread");
  if (/\b(grill|grilled|broil|char)\b/.test(source)) techniques.push("Grill");
  if (/\b(saute|sauté|stir fry|stir-fry|skillet)\b/.test(source)) techniques.push("Saute");
  if (/\b(simmer|stew|braise|braised)\b/.test(source)) techniques.push("Simmer");
  if (/\b(fry|fried|deep fry)\b/.test(source)) techniques.push("Fry");
  return techniques.length ? techniques : ["Assemble"];
}

function normalizeDishFamily(title: string) {
  return title
    .replace(/\b(?:easy|best|classic|simple|quick|homemade|recipe)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

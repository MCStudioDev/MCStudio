import type { Recipe } from "@/lib/types";
export interface ArabicRecipeSuggestion {
  name: string;
  missingIngredients: string[];
  maxMissingIngredients: number;
}
export interface ArabicRecipeEntry {
  id: string;
  recipe: Recipe;
  canonical: Recipe;
  ingredientCanonicals: string[];
  validatorVersion: string;
  fingerprint: string;
  source?: { id: string; fingerprint: string };
  validatedAt: string;
}

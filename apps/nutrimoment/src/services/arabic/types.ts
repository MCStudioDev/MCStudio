import type { Recipe } from "@/lib/types";
export interface ArabicRecipeSuggestion {
  name: string;
  missingIngredients: string[];
  maxMissingIngredients: number;
}
export interface ArabicRecipeEntry {
  facts?: import("./recipeFacts").ArabicRecipeFacts;
  labelReceipt?: import("./recipeFacts").ArabicLabelReceipt;
  safetyReceipt?: string;
  id: string;
  recipe: Recipe;
  canonical: Recipe;
  ingredientCanonicals: string[];
  validatorVersion: string;
  fingerprint: string;
  source?: { id: string; fingerprint: string; kind?: "reference" | "shared" | "trusted"; editorKey?: string; editorFingerprint?: string };
  variantKey?: string;
  validatedAt: string;
}

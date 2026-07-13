export interface RecipeReferenceDoc {
  id: string;
  title: string;
  cuisine?: string;
  cuisineKey?: string;
  cuisineConfidence?: number;
  ingredients: string[];
  ingredientCanonicals: string[];
  mainIngredients: string[];
  mainIngredientKeys?: string[];
  lookupBuckets?: string[];
  protein?: string;
  proteinKey?: string;
  mealType?: string;
  cookingMethod?: string;
  difficulty?: string;
  flavorProfile?: string[];
  tags?: string[];
  estimatedCalories?: number;
  ingredientIds?: string[];
  techniques?: string[];
  estimatedPrepMinutes?: number;
  estimatedCookMinutes?: number;
  commonAllergens?: string[];
  imagePrompt?: string;
  publishStatus?: "ready" | "needs_review";
  validationWarnings?: string[];
  taxonomy?: RecipeReferenceTaxonomy;
  taxonomyLookupBuckets?: string[];
  directions: string[];
  source?: {
    provider: string;
    url?: string;
    name?: string;
  };
  searchTokens: string[];
  qualityScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface RecipeReferenceTaxonomy {
  cuisine: string;
  cuisineKey: string;
  cuisineConfidence: number;
  cuisineSignals: string[];
  protein?: string;
  proteinKey?: string;
  mealType: string;
  cookingMethod: string;
  difficulty: string;
  flavorProfile: string[];
  tags: string[];
  estimatedCalories: number;
  ingredientIds: string[];
  techniques: string[];
  estimatedPrepMinutes: number;
  estimatedCookMinutes: number;
  commonAllergens: string[];
  imagePrompt: string;
  publishStatus: "ready" | "needs_review";
  validationWarnings: string[];
  classifierSource: "rule_engine" | "gemini" | "hybrid";
  needsClassifierReview: boolean;
}

export interface RecipeReferencePromptRecipe {
  id: string;
  title: string;
  cuisine: string;
  taxonomy?: RecipeReferenceTaxonomy;
  imagePrompt?: string;
  ingredients: string[];
  steps: string[];
  sourceUrl?: string;
  matchedIngredients: string[];
}

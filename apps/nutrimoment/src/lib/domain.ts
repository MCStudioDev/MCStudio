export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type Difficulty = "easy" | "medium" | "hard";

export type CalorieBand = "0_300" | "301_500" | "501_700" | "701_plus";

export type ServedFrom = "offline_catalog" | "fallback_ai" | "mock";

export interface RecipeIngredient {
  name: string;
  canonical: string;
  quantity?: number;
  unit?: string;
  required: boolean;
}

export interface RecipeCatalogDoc {
  id: string;
  title: string;
  slug: string;
  description: string;
  ingredients: RecipeIngredient[];
  ingredientCanonicals: string[];
  requiredCanonicals: string[];
  optionalCanonicals: string[];
  dietTags: string[];
  allergenTags: string[];
  mealType: MealType;
  cuisine: string;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  difficulty: Difficulty;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  calorieBand: CalorieBand;
  servings: number;
  steps: string[];
  image: {
    storagePath: string;
    thumbPath?: string;
  };
  searchTokens: string[];
  popularityScore: number;
  qualityScore: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface IngredientDoc {
  id: string;
  name: string;
  category: string;
  broadCategory: string;
  dietCompatibility: string[];
  commonSubstitutes: string[];
  isActive: boolean;
}

export interface IngredientAliasDoc {
  id: string;
  raw: string;
  canonical: string;
  category?: string;
  synonyms: string[];
  misspellings: string[];
  isActive: boolean;
}

export interface IngredientRecipeIndexDoc {
  ingredient: string;
  recipeIds: string[];
  updatedAt: number;
}

export interface ScanFilters {
  dietTags: string[];
  maxCalories?: number;
  mealType?: string;
  cuisine?: string;
}

export interface ScanDoc {
  id: string;
  uid: string | null;
  imagePath: string;
  scanType: "fridge" | "pantry" | "dish";
  ingredientsRaw: string[];
  ingredientsNormalized: string[];
  candidateRecipeIds: string[];
  selectedRecipeIds: string[];
  servedFrom: ServedFrom;
  fallbackUsed: boolean;
  filters: ScanFilters;
  createdAt: number;
}

export interface RankedRecipeResult {
  recipeId: string;
  score: number;
  matchQuality: "great" | "good" | "possible" | "stretch";
  matchedRequiredCount: number;
  matchedOptionalCount: number;
  missingRequired: string[];
  missingOptional: string[];
  preferenceHits: string[];
  hardRejected?: boolean;
  servedFrom: Exclude<ServedFrom, "mock">;
}

export interface RecipeSearchResponse {
  scanId?: string;
  ingredientsNormalized: string[];
  recipes: import("@/lib/types").Recipe[];
  servedFrom: ServedFrom;
  canLoadMore: boolean;
}

export interface UserPreferenceSnapshot {
  preferredCuisine: string;
  calorieTarget: number;
  diets: string[];
  conditions: string[];
  allergens?: string[];
}

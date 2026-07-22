import type { RecipeGenerationStatus } from "@/lib/RecipeGenerationStatus";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type Difficulty = "easy" | "medium" | "hard";

export type CalorieBand = "0_300" | "301_500" | "501_700" | "701_plus";

export type ServedFrom = "shared_pool" | "fallback_ai" | "mock";

export { RecipeGenerationStatus } from "@/lib/RecipeGenerationStatus";

export interface RecipeIngredient {
  name: string;
  canonical: string;
  quantity?: number;
  unit?: string;
  required: boolean;
}

export interface RecipeIngredientVariantDoc {
  canonical: string;
  locale: "en" | "ar";
  region?: string;
  variants: string[];
}

export interface RecipeHealthMetadata {
  conditionTags: string[];
  cautionFlags: string[];
  nutritionClaims: string[];
}

export interface RecipeSearchMetadata {
  aliasTokens: string[];
  cuisineTokens?: string[];
  ingredientVariants?: RecipeIngredientVariantDoc[];
}

export interface IngredientLexiconVariantDoc {
  locale: "en" | "ar";
  region?: string;
  values: string[];
}

export interface IngredientLexiconDoc {
  id: string;
  canonical: string;
  category: string;
  broadCategory: string;
  dietCompatibility: string[];
  commonSubstitutes: string[];
  variants: IngredientLexiconVariantDoc[];
  misspellings: string[];
  relatedCanonicals?: string[];
  isActive: boolean;
}

export interface HealthTagDoc {
  id: string;
  type: "condition_support" | "caution" | "nutrition_claim";
  label: string;
  description: string;
  localized?: Partial<
    Record<
      "English" | "Arabic",
      {
        label: string;
        description: string;
      }
    >
  >;
  isActive: boolean;
}

export interface RecipeSourceDoc {
  id: string;
  name: string;
  provider: string;
  mode: "api" | "wiki" | "html" | "dataset";
  baseUrl?: string;
  focusCuisines: string[];
  focusRegions?: string[];
  languages: string[];
  license?: string;
  trustScore: number;
  importPriority: number;
  active: boolean;
  notes?: string;
  lastImportedAt?: number;
}

export interface RecipeRawImportDoc {
  id: string;
  sourceId: string;
  importBatchId: string;
  externalId?: string;
  sourceUrl?: string;
  title: string;
  cuisine: string;
  language: string;
  ingredients: string[];
  steps: string[];
  imageUrl?: string;
  license?: string;
  recipeFingerprint: string;
  fetchedAt: number;
}

export interface RecipeCanonicalStagingDoc {
  id: string;
  rawImportId: string;
  sourceId: string;
  importBatchId: string;
  canonicalTitle: string;
  normalizedTitle: string;
  cuisine: string;
  ingredientCanonicals: string[];
  steps: string[];
  duplicateKey: string;
  source: {
    provider: string;
    externalId?: string;
    url?: string;
    license?: string;
  };
  localized?: Partial<Record<"English" | "Arabic", import("@/lib/types").Recipe>>;
  image?: {
    storagePath?: string;
    thumbPath?: string;
  };
  qualityScore: number;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  candidateRecipeId?: string;
  createdAt: number;
  updatedAt: number;
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
    signature?: string;
    sharedCacheKey?: string;
    sourceQuery?: string;
  };
  source?: {
    provider: string;
    externalId?: string;
    url?: string;
    license?: string;
  };
  localized?: Partial<Record<"English" | "Arabic", import("@/lib/types").Recipe>>;
  dishIntent?: import("@/lib/types").RecipeDishIntent;
  regionalCuisines?: string[];
  styleTags?: string[];
  healthMetadata?: RecipeHealthMetadata;
  searchMetadata?: RecipeSearchMetadata;
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
  generationStatus?: RecipeGenerationStatus;
}

export interface UserPreferenceSnapshot {
  preferredCuisine: string;
  calorieTarget: number;
  diets: string[];
  conditions: string[];
  allergens?: string[];
}

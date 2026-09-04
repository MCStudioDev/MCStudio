export type Tab = "scanner" | "pantry" | "mealplan" | "history" | "settings";

export type Language = "en" | "ar";
export type RecipeImageSource = "api" | "cache" | "pexels" | "replicate" | "search" | "shared_pool" | "unsplash" | "wikimedia";
export type DashboardTheme = "auroraDark" | "mintWhite";
export type RecipeMealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface AppNotification {
  id: string;
  createdAt: string;
  language: Language;
  message: string;
}

export interface RecipeDishIntent {
  dish_name: string;
  cuisine: string;
  meal_type?: RecipeMealType;
  diet_type?: string;
  cooking_method?: string;
  visual_keywords: string[];
  exclude_keywords: string[];
  candidate_score?: number;
  candidate_hits?: string[];
}

export interface PhotoIdentity {
  dish_slug: string;
  english_name: string;
  protein?: string;
  starch?: string;
  sauce?: string;
  method?: string;
  cuisine_key?: string;
}

export interface RecipePhotoAsset {
  url?: string;
  source?: RecipeImageSource;
  attributionName?: string;
  attributionUrl?: string;
  dietTags: string[];
  status: "pending" | "ready";
  validatedAt?: number;
  validatorHash?: string;
}

export interface PantryItem {
  id?: string;
  name: string;
  quantity: string;
  expiration?: string;
}

export interface NutritionMacros {
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
}

export interface LocalizedRecipeVariant {
  name: string;
  cuisine: string;
  recipe_origin?: "exact_scan_match" | "similar_ingredients";
  scan_match_explanation?: string;
  dish_intent?: RecipeDishIntent;
  image_search_index?: string;
  image_search_indices?: string[];
  ingredients: string[];
  missing_ingredients: string[];
  steps: string[];
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
  cook_time: string;
  difficulty: string;
  image_url?: string;
  image_source?: RecipeImageSource;
  image_attribution_name?: string;
  image_attribution_url?: string;
  preference_hits?: string[];
  plated_visual_description?: string;
  recipe_source_type?: "local_database" | "external_source" | "generated";
  source_url?: string;
}

export interface Recipe {
  id?: string;
  name: string;
  cuisine: string;
  plated_visual_description?: string;
  recipe_origin?: "exact_scan_match" | "similar_ingredients";
  freshness_origin?: "fresh" | "backfilled_recent";
  cuisine_match_origin?: "preferred" | "ingredient_fallback";
  recipe_source_type?: "local_database" | "external_source" | "generated";
  dish_identity?: string;
  source_recipe_id?: string;
  scan_match_explanation?: string;
  source_url?: string;
  dish_intent?: RecipeDishIntent;
  image_search_index?: string;
  image_search_indices?: string[];
  ingredient_ownership?: RecipeIngredientOwnership[];
  ingredients: string[];
  missing_ingredients: string[];
  steps: string[];
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
  cook_time: string;
  difficulty: string;
  image_url?: string;
  image_source?: RecipeImageSource;
  image_attribution_name?: string;
  image_attribution_url?: string;
  photo_asset?: RecipePhotoAsset;
  image_loading?: boolean;
  image_error?: boolean;
  image_placeholder?: {
    label: string;
    tone: string;
  };
  acceptance_score?: number;
  acceptance_reasons?: string[];
  match_quality?: "great" | "good" | "possible" | "stretch";
  matched_required_count?: number;
  matched_optional_count?: number;
  preference_hits?: string[];
  visual_match_label?: string;
  photo_identity?: PhotoIdentity;
  localized?: Partial<Record<"English" | "Arabic", LocalizedRecipeVariant>>;
}

export interface RecipeIngredientOwnership {
  canonicalName: string;
  displayText: string;
  availability: "owned" | "missing";
}

export interface MealPlanMeal {
  name: string;
  cuisine?: string;
  recipe_source_type?: Recipe["recipe_source_type"];
  source_recipe_id?: string;
  meal_type?: RecipeMealType;
  image_search_index?: string;
  image_search_indices?: string[];
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  ingredients?: string[];
  steps?: string[];
  cook_time?: string;
  difficulty?: string;
  image_url?: string;
  image_source?: RecipeImageSource;
  image_attribution_name?: string;
  image_attribution_url?: string;
  photo_asset?: RecipePhotoAsset;
  photo_identity?: PhotoIdentity;
}

export interface MealPlanDay {
  day: string;
  breakfast: MealPlanMeal;
  lunch: MealPlanMeal;
  dinner: MealPlanMeal;
}

export interface MealPlanData {
  plan: MealPlanDay[];
  shoppingList: string[];
  recommendedRecipes?: Recipe[];
  servedFrom?: "shared_pool" | "fallback_ai" | "mock";
  preferenceSignature?: string;
  imageActionGrantId?: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  title?: string;
  sessionType?: "recipe_generation" | "weekly_meal_plan";
  ingredients: string[];
  recipes: Recipe[];
  generationStatus?: "pending" | "completed" | "failed";
  generationMessage?: string;
  completedAt?: string;
  imageActionGrantId?: string;
}

export interface HealthProfile {
  diets: string[];
  conditions: string[];
  allergens?: string[];
  ageYears?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
}

export interface UserSettings {
  calorieTarget: number;
  preferredCuisine: string;
  maxMissingIngredients: number;
  recipeCount: number;
  uiLanguage: Language;
  themeMode?: DashboardTheme;
  targetWeightKg?: number | null;
  goalTimelineMonths?: number | null;
}

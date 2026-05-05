export type Tab = "scanner" | "pantry" | "mealplan" | "health" | "history" | "settings";

export type Language = "en" | "ar";
export type RecipeImageSource = "api" | "cache" | "search" | "unsplash" | "wikimedia";
export type DashboardTheme = "auroraDark" | "mintWhite";
export type RecipeMealType = "breakfast" | "lunch" | "dinner" | "snack";

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
}

export interface Recipe {
  id?: string;
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
  image_loading?: boolean;
  image_error?: boolean;
  match_quality?: "great" | "good" | "possible" | "stretch";
  matched_required_count?: number;
  matched_optional_count?: number;
  preference_hits?: string[];
  visual_match_label?: string;
  localized?: Partial<Record<"English" | "Arabic", LocalizedRecipeVariant>>;
}

export interface MealPlanMeal {
  name: string;
  image_search_index?: string;
  image_search_indices?: string[];
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  ingredients?: string[];
  steps?: string[];
  image_url?: string;
  image_source?: RecipeImageSource;
  image_attribution_name?: string;
  image_attribution_url?: string;
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
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  ingredients: string[];
  recipes: Recipe[];
  generationStatus?: "pending" | "completed" | "failed";
  generationMessage?: string;
  completedAt?: string;
}

export interface HealthProfile {
  diets: string[];
  conditions: string[];
  allergens?: string[];
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

export type Tab = "scanner" | "pantry" | "mealplan" | "health" | "history" | "settings";

export type Language = "en" | "ar" | "es" | "fr";

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

export interface Recipe {
  name: string;
  cuisine: string;
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
  image_loading?: boolean;
  image_error?: boolean;
}

export interface MealPlanMeal {
  name: string;
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
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
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  ingredients: string[];
  recipes: Recipe[];
}

export interface HealthProfile {
  diets: string[];
  conditions: string[];
}

export interface UserSettings {
  calorieTarget: number;
  preferredCuisine: string;
  maxMissingIngredients: number;
  voiceLanguage: string;
  recipeLanguage: string;
  uiLanguage: Language;
}

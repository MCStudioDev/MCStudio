import type { HealthProfile, UserSettings } from "@/lib/types";

export const DEFAULT_USER_SETTINGS: Readonly<UserSettings> = {
  calorieTarget: 1650,
  preferredCuisine: "Any",
  maxMissingIngredients: 5,
  recipeCount: 10,
  uiLanguage: "en",
  themeMode: "auroraDark",
  targetWeightKg: null,
  goalTimelineMonths: null
};

export const DEFAULT_USER_HEALTH_PROFILE: Readonly<HealthProfile> = {
  diets: [],
  conditions: [],
  allergens: [],
  ageYears: 30,
  weightKg: 75,
  heightCm: null
};

export function createDefaultUserSettings(): UserSettings {
  return { ...DEFAULT_USER_SETTINGS };
}

export function createDefaultUserHealthProfile(): HealthProfile {
  return {
    ...DEFAULT_USER_HEALTH_PROFILE,
    diets: [],
    conditions: [],
    allergens: []
  };
}

import type { HealthProfile, Language, UserSettings } from "@/lib/types";

export interface MealPlanPreferenceSignatureInput {
  allergens?: string[];
  calorieTarget?: number;
  conditions?: string[];
  diets?: string[];
  preferredCuisine?: string;
  uiLanguage?: Language | string;
}

export function buildMealPlanPreferenceSignature(input: MealPlanPreferenceSignatureInput) {
  return [
    "meal-plan-pref-v1",
    `diets:${normalizeList(input.diets).join(",")}`,
    `allergens:${normalizeList(input.allergens).join(",")}`,
    `conditions:${normalizeList(input.conditions).join(",")}`,
    `cuisine:${normalizeText(input.preferredCuisine || "Any")}`,
    `calories:${normalizeCalorieTarget(input.calorieTarget)}`,
    `language:${normalizeText(input.uiLanguage || "en")}`
  ].join("|");
}

export function buildMealPlanPreferenceSignatureFromProfile(settings: UserSettings, health: HealthProfile) {
  return buildMealPlanPreferenceSignature({
    allergens: health.allergens ?? [],
    calorieTarget: settings.calorieTarget,
    conditions: health.conditions,
    diets: health.diets,
    preferredCuisine: settings.preferredCuisine,
    uiLanguage: settings.uiLanguage
  });
}

function normalizeList(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map(normalizeText)
        .filter(Boolean)
    )
  ).sort();
}

function normalizeText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeCalorieTarget(value: number | undefined) {
  return Number.isFinite(value) && value ? Math.round(value) : 0;
}

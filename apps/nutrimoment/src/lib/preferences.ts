import type { UserPreferenceSnapshot } from "@/lib/domain";

export interface NutritionGoals {
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxCarbs?: number;
  maxSugar?: number;
  maxSodium?: number;
  minSodium?: number;
  maxFat?: number;
  minFiber?: number;
}

export interface ResolvedPreferenceProfile extends UserPreferenceSnapshot {
  requiredDietTags: string[];
  preferredDietTags: string[];
  promptDietLabels: string[];
  promptConditionLabels: string[];
  nutritionGoals: NutritionGoals;
}

const DIET_RULES: Record<
  string,
  { label: string; requiredDietTags?: string[]; preferredDietTags?: string[]; nutritionGoals?: NutritionGoals }
> = {
  vegetarian: {
    label: "vegetarian",
    requiredDietTags: ["vegetarian"]
  },
  vegan: {
    label: "vegan",
    requiredDietTags: ["vegan"]
  },
  keto: {
    label: "keto",
    requiredDietTags: ["low-carb"],
    nutritionGoals: { maxCarbs: 25 }
  },
  paleo: {
    label: "paleo",
    preferredDietTags: ["gluten-free", "dairy-free", "high-protein"],
    nutritionGoals: { maxCarbs: 35, minProtein: 18 }
  },
  glutenFree: {
    label: "gluten-free",
    requiredDietTags: ["gluten-free"]
  },
  dairyFree: {
    label: "dairy-free",
    requiredDietTags: ["dairy-free"]
  }
};

const CONDITION_RULES: Record<
  string,
  { label: string; preferredDietTags?: string[]; nutritionGoals?: NutritionGoals }
> = {
  diabetes: {
    label: "diabetes-friendly",
    preferredDietTags: ["low-carb", "high-protein"],
    nutritionGoals: { maxCarbs: 45, maxSugar: 12, minProtein: 18 }
  },
  highBloodPressure: {
    label: "low sodium",
    nutritionGoals: { maxSodium: 500, maxFat: 20 }
  },
  lowBloodPressure: {
    label: "energizing meals",
    nutritionGoals: { minCalories: 320, minSodium: 180 }
  },
  weightGain: {
    label: "higher calorie",
    nutritionGoals: { minCalories: 450, minProtein: 20 }
  },
  weightLoss: {
    label: "lighter meals",
    preferredDietTags: ["high-protein", "low-carb"],
    nutritionGoals: { maxCalories: 450, minProtein: 20 }
  },
  cholesterol: {
    label: "heart-friendly",
    nutritionGoals: { maxFat: 18, minFiber: 4 }
  }
};

export function buildPreferenceProfile(snapshot: UserPreferenceSnapshot): ResolvedPreferenceProfile {
  const requiredDietTags = new Set<string>();
  const preferredDietTags = new Set<string>();
  const promptDietLabels = new Set<string>();
  const promptConditionLabels = new Set<string>();
  const nutritionGoals: NutritionGoals = {};

  for (const dietId of snapshot.diets) {
    const rule = DIET_RULES[dietId];
    if (!rule) continue;
    promptDietLabels.add(rule.label);
    rule.requiredDietTags?.forEach((tag) => requiredDietTags.add(tag));
    rule.preferredDietTags?.forEach((tag) => preferredDietTags.add(tag));
    mergeNutritionGoals(nutritionGoals, rule.nutritionGoals);
  }

  for (const conditionId of snapshot.conditions) {
    const rule = CONDITION_RULES[conditionId];
    if (!rule) continue;
    promptConditionLabels.add(rule.label);
    rule.preferredDietTags?.forEach((tag) => preferredDietTags.add(tag));
    mergeNutritionGoals(nutritionGoals, rule.nutritionGoals);
  }

  const calorieGoalPerMeal =
    snapshot.calorieTarget && Number.isFinite(snapshot.calorieTarget) && snapshot.calorieTarget > 0
      ? Math.round(snapshot.calorieTarget / 3)
      : undefined;

  if (calorieGoalPerMeal) {
    nutritionGoals.maxCalories = nutritionGoals.maxCalories
      ? Math.min(nutritionGoals.maxCalories, calorieGoalPerMeal)
      : calorieGoalPerMeal;
  }

  return {
    ...snapshot,
    requiredDietTags: Array.from(requiredDietTags),
    preferredDietTags: Array.from(preferredDietTags),
    promptDietLabels: Array.from(promptDietLabels),
    promptConditionLabels: Array.from(promptConditionLabels),
    nutritionGoals
  };
}

export function formatPreferencesForPrompt(diets: string[], conditions: string[]) {
  const resolved = buildPreferenceProfile({
    preferredCuisine: "Any",
    calorieTarget: 2000,
    diets,
    conditions,
    allergens: []
  });

  return {
    diets: resolved.promptDietLabels,
    conditions: resolved.promptConditionLabels
  };
}

function mergeNutritionGoals(target: NutritionGoals, next?: NutritionGoals) {
  if (!next) return;

  target.maxCalories = minDefined(target.maxCalories, next.maxCalories);
  target.maxCarbs = minDefined(target.maxCarbs, next.maxCarbs);
  target.maxSugar = minDefined(target.maxSugar, next.maxSugar);
  target.maxSodium = minDefined(target.maxSodium, next.maxSodium);
  target.maxFat = minDefined(target.maxFat, next.maxFat);

  target.minCalories = maxDefined(target.minCalories, next.minCalories);
  target.minProtein = maxDefined(target.minProtein, next.minProtein);
  target.minSodium = maxDefined(target.minSodium, next.minSodium);
  target.minFiber = maxDefined(target.minFiber, next.minFiber);
}

function minDefined(current?: number, next?: number) {
  if (current == null) return next;
  if (next == null) return current;
  return Math.min(current, next);
}

function maxDefined(current?: number, next?: number) {
  if (current == null) return next;
  if (next == null) return current;
  return Math.max(current, next);
}

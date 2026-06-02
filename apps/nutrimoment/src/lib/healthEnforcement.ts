import type { PhotoIdentity, Recipe, RecipeDishIntent } from "@/lib/types";

type HealthIngredient =
  | string
  | {
      name?: string;
      displayName?: string;
      canonical?: string;
      quantity?: string | number;
    };

export interface HealthEnforcementSubject {
  name?: string;
  title?: string;
  description?: string;
  cuisine?: string;
  image_search_index?: string;
  image_search_indices?: string[];
  photo_identity?: Partial<PhotoIdentity>;
  dish_intent?: Partial<RecipeDishIntent>;
  localized?: Partial<Record<"English" | "Arabic", Partial<Recipe>>>;
  ingredients?: HealthIngredient[];
  missing_ingredients?: HealthIngredient[];
  steps?: string[];
}

export interface HealthViolation {
  condition: "cholesterol" | "diabetes" | "highBloodPressure" | "lowBloodPressure" | "weightGain" | "weightLoss";
  match: string;
}

const HEART_HEAVY_TERMS = [
  "butter",
  "ghee",
  "cream",
  "heavy cream",
  "cream sauce",
  "alfredo",
  "bechamel",
  "cheese",
  "ricotta",
  "mozzarella",
  "parmesan",
  "fried",
  "deep fried",
  "breaded",
  "beef",
  "steak",
  "meatball",
  "sausage",
  "pepperoni",
  "salami",
  "bacon",
  "egg",
  "eggs",
  "omelette",
  "omelet",
  "frittata"
];

const LOW_SODIUM_RISK_TERMS = [
  "sausage",
  "pepperoni",
  "salami",
  "bacon",
  "ham",
  "processed meat",
  "cured",
  "pickled",
  "salted",
  "cheese",
  "parmesan",
  "feta"
];

const WEIGHT_LOSS_HEAVY_TERMS = [
  "fried",
  "deep fried",
  "breaded",
  "cream",
  "cream sauce",
  "alfredo",
  "bechamel",
  "butter",
  "ghee",
  "cheese",
  "beef",
  "steak",
  "meatball",
  "sausage"
];

export function findRecipeHealthViolation(
  subject: HealthEnforcementSubject,
  conditions: string[] = []
): HealthViolation | null {
  if (!conditions.length) return null;

  const haystack = buildHealthSearchText(subject);
  const nutrition = readNutritionNumbers(subject);
  if (conditions.includes("diabetes")) {
    if (nutrition.sugar != null && nutrition.sugar > 15) return { condition: "diabetes", match: `sugar>${15}g` };
    if (nutrition.carbs != null && nutrition.carbs > 55) return { condition: "diabetes", match: `carbs>${55}g` };
    if (nutrition.carbs != null && nutrition.carbs > 45 && nutrition.protein != null && nutrition.protein < 12) {
      return { condition: "diabetes", match: "high-carb low-protein" };
    }
  }

  if (conditions.includes("cholesterol")) {
    const match = findTerm(haystack, HEART_HEAVY_TERMS);
    if (match) return { condition: "cholesterol", match };
    if (nutrition.fat != null && nutrition.fat > 26) return { condition: "cholesterol", match: `fat>${26}g` };
    if (nutrition.fiber != null && nutrition.fiber < 3 && nutrition.fat != null && nutrition.fat > 18) {
      return { condition: "cholesterol", match: "high-fat low-fiber" };
    }
  }

  if (conditions.includes("highBloodPressure")) {
    const match = findTerm(haystack, LOW_SODIUM_RISK_TERMS);
    if (match) return { condition: "highBloodPressure", match };
    if (nutrition.sodium != null && nutrition.sodium > 700) return { condition: "highBloodPressure", match: `sodium>${700}mg` };
  }

  if (conditions.includes("lowBloodPressure")) {
    if (nutrition.calories != null && nutrition.calories < 320) return { condition: "lowBloodPressure", match: `calories<${320}` };
    if (nutrition.sodium != null && nutrition.sodium < 120) return { condition: "lowBloodPressure", match: `sodium<${120}mg` };
  }

  if (conditions.includes("weightGain")) {
    if (nutrition.calories != null && nutrition.calories < 430) return { condition: "weightGain", match: `calories<${430}` };
    if (nutrition.protein != null && nutrition.protein < 16) return { condition: "weightGain", match: `protein<${16}g` };
  }

  if (conditions.includes("weightLoss")) {
    const match = findTerm(haystack, WEIGHT_LOSS_HEAVY_TERMS);
    if (match) return { condition: "weightLoss", match };
    if (nutrition.calories != null && nutrition.calories > 700) return { condition: "weightLoss", match: `calories>${700}` };
    if (nutrition.fat != null && nutrition.fat > 28) return { condition: "weightLoss", match: `fat>${28}g` };
  }

  return null;
}

function readNutritionNumbers(subject: HealthEnforcementSubject) {
  const maybeNutritionSubject = subject as HealthEnforcementSubject & {
    calories?: number | string;
    carbs?: number | string;
    sugar?: number | string;
    sodium?: number | string;
    fat?: number | string;
    fiber?: number | string;
    protein?: number | string;
  };

  return {
    calories: readNutritionNumber(maybeNutritionSubject.calories),
    carbs: readNutritionNumber(maybeNutritionSubject.carbs),
    sugar: readNutritionNumber(maybeNutritionSubject.sugar),
    sodium: readNutritionNumber(maybeNutritionSubject.sodium),
    fat: readNutritionNumber(maybeNutritionSubject.fat),
    fiber: readNutritionNumber(maybeNutritionSubject.fiber),
    protein: readNutritionNumber(maybeNutritionSubject.protein)
  };
}

function readNutritionNumber(value: number | string | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildHealthSearchText(subject: HealthEnforcementSubject) {
  return [
    subject.name,
    subject.title,
    subject.description,
    subject.cuisine,
    subject.image_search_index,
    ...(subject.image_search_indices ?? []),
    subject.photo_identity?.english_name,
    subject.photo_identity?.dish_slug,
    subject.photo_identity?.sauce,
    subject.photo_identity?.method,
    subject.dish_intent?.dish_name,
    subject.localized?.English?.name,
    subject.localized?.English?.dish_intent?.dish_name,
    subject.dish_intent?.cooking_method,
    ...(subject.dish_intent?.visual_keywords ?? []),
    ...stringifyHealthItems(subject.ingredients),
    ...stringifyHealthItems(subject.missing_ingredients),
    ...(subject.steps ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function stringifyHealthItems(items?: HealthIngredient[]) {
  return (items ?? []).map((item) => {
    if (typeof item === "string") return item;
    return [item.name, item.displayName, item.canonical, item.quantity].filter(Boolean).join(" ");
  });
}

function findTerm(text: string, terms: string[]) {
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    if (new RegExp(`\\b${escaped}s?\\b`, "i").test(text)) return term;
  }
  return null;
}

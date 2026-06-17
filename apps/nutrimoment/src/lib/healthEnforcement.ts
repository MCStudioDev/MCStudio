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

const HEART_SATURATED_FAT_TERMS = [
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
  "sausage",
  "pepperoni",
  "salami",
  "bacon"
];

const HEART_RICH_MEAT_TERMS = [
  "ribeye",
  "brisket",
  "short rib",
  "pork belly",
  "fatty beef",
  "fatty lamb"
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
  "sausage"
];

const DEEP_FRYING_PATTERN = /\b(deep[-\s]?fried|deep[-\s]?fry|deep[-\s]?frying|battered|breaded)\b/i;
const CONTROLLED_HEART_SMART_PREPARATION_PATTERN =
  /\b(pan[-\s]?fried|pan[-\s]?seared|sauteed|sautéed|skillet|stir[-\s]?fried|lightly fried|air[-\s]?fried|grilled|baked|roasted|broiled|steamed|olive oil|small amount of oil|nonstick|trimmed|lean|skinless|low[-\s]?fat|reduced[-\s]?fat)\b/i;

export function findRecipeHealthViolation(
  subject: HealthEnforcementSubject,
  conditions: string[] = []
): HealthViolation | null {
  const normalizedConditions = normalizeConditions(conditions);
  if (!normalizedConditions.size) return null;

  const haystack = buildHealthSearchText(subject);
  const nutrition = readNutritionNumbers(subject);
  const adaptation = readHealthAdaptationSignals(haystack, nutrition);

  if (normalizedConditions.has("diabetes")) {
    if (nutrition.sugar != null && nutrition.sugar > 15) return { condition: "diabetes", match: `sugar>${15}g` };
    if (nutrition.carbs != null && nutrition.carbs > 65) return { condition: "diabetes", match: `carbs>${65}g` };
    if (
      nutrition.carbs != null &&
      nutrition.carbs > 55 &&
      !adaptation.bloodSugarBalanced
    ) {
      return { condition: "diabetes", match: `carbs>${55}g` };
    }
    if (nutrition.carbs != null && nutrition.carbs > 45 && nutrition.protein != null && nutrition.protein < 12) {
      return { condition: "diabetes", match: "high-carb low-protein" };
    }
  }

  if (normalizedConditions.has("cholesterol")) {
    const match = findTerm(haystack, HEART_SATURATED_FAT_TERMS);
    if (match && !isAdaptedCholesterolTermAllowed(match, haystack, nutrition, adaptation)) {
      return { condition: "cholesterol", match };
    }
    const richMeatMatch = findTerm(haystack, HEART_RICH_MEAT_TERMS);
    if (richMeatMatch && !adaptation.heartSmartPreparation) return { condition: "cholesterol", match: richMeatMatch };
    if (nutrition.fat != null && nutrition.fat > 30) return { condition: "cholesterol", match: `fat>${30}g` };
    if (nutrition.fiber != null && nutrition.fiber < 3 && nutrition.fat != null && nutrition.fat > 22) {
      return { condition: "cholesterol", match: "high-fat low-fiber" };
    }
  }

  if (normalizedConditions.has("highBloodPressure")) {
    const match = findTerm(haystack, LOW_SODIUM_RISK_TERMS);
    if (match && !adaptation.lowSodiumPreparation) return { condition: "highBloodPressure", match };
    if (nutrition.sodium != null && nutrition.sodium > 700) return { condition: "highBloodPressure", match: `sodium>${700}mg` };
  }

  if (normalizedConditions.has("lowBloodPressure")) {
    if (nutrition.calories != null && nutrition.calories < 260) return { condition: "lowBloodPressure", match: `calories<${260}` };
    if (
      nutrition.calories != null &&
      nutrition.calories < 320 &&
      !adaptation.nutrientDense
    ) {
      return { condition: "lowBloodPressure", match: `calories<${320}` };
    }
    if (nutrition.sodium != null && nutrition.sodium < 120 && !adaptation.nutrientDense) {
      return { condition: "lowBloodPressure", match: `sodium<${120}mg` };
    }
  }

  if (normalizedConditions.has("weightGain")) {
    if (nutrition.calories != null && nutrition.calories < 320) return { condition: "weightGain", match: `calories<${320}` };
    if (nutrition.calories != null && nutrition.calories < 430 && !adaptation.weightGainSupportive) {
      return { condition: "weightGain", match: `calories<${430}` };
    }
    if (nutrition.protein != null && nutrition.protein < 14) return { condition: "weightGain", match: `protein<${14}g` };
  }

  if (normalizedConditions.has("weightLoss")) {
    const match = findTerm(haystack, WEIGHT_LOSS_HEAVY_TERMS);
    if (match && !isAdaptedWeightLossTermAllowed(match, haystack, nutrition, adaptation)) {
      return { condition: "weightLoss", match };
    }
    if (nutrition.calories != null && nutrition.calories > 700) return { condition: "weightLoss", match: `calories>${700}` };
    if (nutrition.fat != null && nutrition.fat > 30) return { condition: "weightLoss", match: `fat>${30}g` };
  }

  return null;
}

function isAdaptableDairyFatTerm(term: string) {
  return /^(cheese|ricotta|mozzarella|parmesan)$/i.test(term);
}

function isAdaptedCholesterolTermAllowed(
  term: string,
  text: string,
  nutrition: ReturnType<typeof readNutritionNumbers>,
  adaptation: ReturnType<typeof readHealthAdaptationSignals>
) {
  if (isAdaptableDairyFatTerm(term)) return adaptation.heartSmartPreparation;
  if (!/^fried$/i.test(term)) return false;
  return isControlledHeartSmartFrying(text, nutrition, adaptation);
}

function isAdaptedWeightLossTermAllowed(
  term: string,
  text: string,
  nutrition: ReturnType<typeof readNutritionNumbers>,
  adaptation: ReturnType<typeof readHealthAdaptationSignals>
) {
  if (isAdaptableDairyFatTerm(term)) return adaptation.heartSmartPreparation;
  if (!/^fried$/i.test(term)) return false;
  return isControlledHeartSmartFrying(text, nutrition, adaptation) && (nutrition.calories ?? 0) <= 620;
}

function isControlledHeartSmartFrying(
  text: string,
  nutrition: ReturnType<typeof readNutritionNumbers>,
  adaptation: ReturnType<typeof readHealthAdaptationSignals>
) {
  if (DEEP_FRYING_PATTERN.test(text)) return false;
  if (!CONTROLLED_HEART_SMART_PREPARATION_PATTERN.test(text)) return false;

  const fatOk = nutrition.fat == null || nutrition.fat <= 24;
  const sodiumOk = nutrition.sodium == null || nutrition.sodium <= 700;
  const fiberOk = nutrition.fiber == null || nutrition.fiber >= 3 || nutrition.fat == null || nutrition.fat <= 18;
  return adaptation.heartSmartPreparation && fatOk && sodiumOk && fiberOk;
}

function normalizeConditions(conditions: string[]) {
  const normalized = new Set<string>();
  for (const condition of conditions) {
    const value = condition.trim().toLowerCase();
    if (!value) continue;
    if (value === "highcholesterol" || value === "high cholesterol") {
      normalized.add("cholesterol");
      continue;
    }
    if (value === "highbloodpressure" || value === "hypertension" || value === "high blood pressure") {
      normalized.add("highBloodPressure");
      continue;
    }
    normalized.add(condition);
  }
  return normalized;
}

function readHealthAdaptationSignals(
  text: string,
  nutrition: ReturnType<typeof readNutritionNumbers>
) {
  const lowFatText = /\b(lean|trimmed|skinless|grilled|baked|roasted|steamed|broiled|air[-\s]?fried|olive oil|small amount of oil|low[-\s]?fat|light)\b/i.test(text);
  const lowSodiumText = /\b(low[-\s]?sodium|no[-\s]?salt|unsalted|reduced[-\s]?sodium|salt[-\s]?free)\b/i.test(text);
  const balancedCarbText = /\b(whole grain|high fiber|fiber|beans?|lentils?|chickpeas?|vegetables?|non[-\s]?starchy|portion controlled|balanced carbs?)\b/i.test(text);
  const nutrientDenseText = /\b(nutrient dense|beans?|lentils?|chickpeas?|nuts?|seeds?|avocado|olive oil|whole grain|yogurt|dates?|banana|electrolyte|broth)\b/i.test(text);
  const highProteinText = /\b(high protein|protein|chicken|fish|seafood|turkey|lean beef|lean meat|eggs?|beans?|lentils?|chickpeas?|tofu)\b/i.test(text);

  return {
    bloodSugarBalanced: Boolean(
      balancedCarbText ||
        ((nutrition.protein ?? 0) >= 20 && (nutrition.fiber ?? 0) >= 5 && (nutrition.carbs ?? 0) <= 65)
    ),
    heartSmartPreparation: Boolean(
      lowFatText ||
        ((nutrition.fat ?? Number.POSITIVE_INFINITY) <= 24 && (nutrition.sodium ?? Number.POSITIVE_INFINITY) <= 700)
    ),
    lowSodiumPreparation: Boolean(lowSodiumText),
    nutrientDense: Boolean(
      nutrientDenseText ||
        ((nutrition.protein ?? 0) >= 12 && (nutrition.calories ?? 0) >= 260)
    ),
    weightGainSupportive: Boolean(
      highProteinText ||
        ((nutrition.protein ?? 0) >= 20 && (nutrition.calories ?? 0) >= 360)
    )
  };
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
    if (new RegExp(`\\b${escaped}s?\\b`, "i").test(text) && !hasNegatedHealthTerm(text, escaped)) return term;
  }
  return null;
}

function hasNegatedHealthTerm(text: string, escapedTerm: string) {
  return new RegExp(`\\b(?:avoid|without|not|no|free\\s+from)\\s+(?:\\w+\\s+){0,3}${escapedTerm}s?\\b`, "i").test(text);
}

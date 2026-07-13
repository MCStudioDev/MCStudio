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

type HealthAdaptableRecipe = Recipe & {
  localized?: Recipe["localized"];
  preference_hits?: string[];
};

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

export function adaptRecipeForHealthConditions<T extends HealthAdaptableRecipe>(
  recipe: T,
  conditions: string[] = []
): T {
  const normalizedConditions = normalizeConditions(conditions);
  if (!normalizedConditions.size) return recipe;

  let next = { ...recipe };
  const heartFatControl = normalizedConditions.has("cholesterol");
  const lowSodium = normalizedConditions.has("highBloodPressure");
  const weightLoss = normalizedConditions.has("weightLoss");

  if (heartFatControl || weightLoss) {
    next = mapRecipeText(next, adaptHeartFatText);
  }
  if (lowSodium) {
    next = mapRecipeText(next, adaptLowSodiumText);
  }

  next = adaptRecipeNutrition(next, {
    caloriesMax: weightLoss ? 620 : undefined,
    caloriesMin: normalizedConditions.has("weightGain") ? 360 : normalizedConditions.has("lowBloodPressure") ? 320 : undefined,
    carbsMax: normalizedConditions.has("diabetes") ? 55 : undefined,
    fatMax: heartFatControl || weightLoss ? 24 : undefined,
    fiberMin: normalizedConditions.has("diabetes") ? 5 : undefined,
    proteinMin: normalizedConditions.has("diabetes") || normalizedConditions.has("weightGain") ? 20 : normalizedConditions.has("lowBloodPressure") ? 12 : undefined,
    sodiumMax: lowSodium ? 620 : heartFatControl || weightLoss ? 700 : undefined,
    sodiumMin: normalizedConditions.has("lowBloodPressure") ? 150 : undefined,
    sugarMax: normalizedConditions.has("diabetes") ? 12 : undefined
  });

  const healthSteps = buildHealthAdaptationSteps(normalizedConditions);
  if (healthSteps.length) {
    next.steps = appendDistinctStrings(next.steps ?? [], healthSteps);
    next.localized = adaptLocalizedHealthSteps(next.localized, healthSteps);
  }
  next.preference_hits = appendDistinctStrings(next.preference_hits ?? [], buildHealthPreferenceHits(normalizedConditions));

  return next;
}

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

function mapRecipeText<T extends HealthAdaptableRecipe>(recipe: T, mapper: (value: string) => string): T {
  return {
    ...recipe,
    ingredients: recipe.ingredients?.map(mapper),
    missing_ingredients: recipe.missing_ingredients?.map(mapper),
    steps: recipe.steps?.map(mapper),
    localized: recipe.localized
      ? {
          ...recipe.localized,
          English: recipe.localized.English ? mapLocalizedVariantText(recipe.localized.English, mapper) : undefined,
          Arabic: recipe.localized.Arabic
        }
      : recipe.localized
  };
}

function mapLocalizedVariantText(
  variant: NonNullable<Recipe["localized"]>["English"] | undefined,
  mapper: (value: string) => string
) {
  if (!variant) return variant;
  return {
    ...variant,
    ingredients: variant.ingredients?.map(mapper),
    missing_ingredients: variant.missing_ingredients?.map(mapper),
    steps: variant.steps?.map(mapper)
  };
}

function adaptHeartFatText(value: string) {
  return value
    .replace(/\bheavy cream\b/gi, "low-fat yogurt")
    .replace(/\bcream sauce\b/gi, "light yogurt sauce")
    .replace(/\bcream\b/gi, "low-fat yogurt")
    .replace(/\bbutter\b/gi, "1 tsp olive oil")
    .replace(/\bghee\b/gi, "1 tsp olive oil")
    .replace(/\bmozzarella\b/gi, "part-skim mozzarella")
    .replace(/\bparmesan\b/gi, "small amount of parmesan")
    .replace(/\bricotta\b/gi, "part-skim ricotta")
    .replace(/\bcheese\b/gi, "reduced-fat cheese")
    .replace(/\bdeep[-\s]?fried\b/gi, "oven-baked")
    .replace(/\bdeep[-\s]?fry(?:ing)?\b/gi, "oven-bake")
    .replace(/\bbattered\b/gi, "lightly crusted")
    .replace(/\bbreaded\b/gi, "lightly oven-crusted")
    .replace(/\bfried\b/gi, "lightly pan-seared");
}

function adaptLowSodiumText(value: string) {
  return value
    .replace(/\bsoy sauce\b/gi, "low-sodium soy sauce")
    .replace(/\bbroth\b/gi, "low-sodium broth")
    .replace(/\bstock\b/gi, "low-sodium stock")
    .replace(/\bsalted\b/gi, "unsalted")
    .replace(/\bprocessed meat\b/gi, "lean fresh meat")
    .replace(/\bcured\b/gi, "fresh")
    .replace(/\bpickled\b/gi, "fresh")
    .replace(/\bpepperoni\b/gi, "roasted peppers")
    .replace(/\bsalami\b/gi, "lean fresh protein")
    .replace(/\bbacon\b/gi, "smoked paprika")
    .replace(/\bham\b/gi, "lean fresh protein")
    .replace(/\bfeta\b/gi, "reduced-sodium feta")
    .replace(/\bparmesan\b/gi, "small amount of parmesan")
    .replace(/\bcheese\b/gi, "reduced-sodium cheese")
    .replace(/\bsalt\b/gi, "salt-free seasoning");
}

function adaptRecipeNutrition<T extends HealthAdaptableRecipe>(
  recipe: T,
  limits: {
    caloriesMax?: number;
    caloriesMin?: number;
    carbsMax?: number;
    fatMax?: number;
    fiberMin?: number;
    proteinMin?: number;
    sodiumMax?: number;
    sodiumMin?: number;
    sugarMax?: number;
  }
): T {
  const nutrition = readNutritionNumbers(recipe);
  return {
    ...recipe,
    calories: clampNumericValue(nutrition.calories, limits.caloriesMin, limits.caloriesMax, recipe.calories) as number,
    carbs: formatMacro(clampNumericValue(nutrition.carbs, undefined, limits.carbsMax, recipe.carbs)),
    fat: formatMacro(clampNumericValue(nutrition.fat, undefined, limits.fatMax, recipe.fat)),
    fiber: formatMacro(clampNumericValue(nutrition.fiber, limits.fiberMin, undefined, recipe.fiber)),
    protein: formatMacro(clampNumericValue(nutrition.protein, limits.proteinMin, undefined, recipe.protein)),
    sodium: formatMilligrams(clampNumericValue(nutrition.sodium, limits.sodiumMin, limits.sodiumMax, recipe.sodium)),
    sugar: formatMacro(clampNumericValue(nutrition.sugar, undefined, limits.sugarMax, recipe.sugar))
  };
}

function clampNumericValue(value: number | undefined, min: number | undefined, max: number | undefined, fallback: number | string | undefined) {
  const fallbackNumber = readNutritionNumber(fallback);
  const base = value ?? fallbackNumber;
  if (base == null) return fallback;
  let next = base;
  if (min != null && next < min) next = min;
  if (max != null && next > max) next = max;
  return Math.round(next);
}

function formatMacro(value: number | string | undefined) {
  if (typeof value === "number") return `${value}g`;
  return value;
}

function formatMilligrams(value: number | string | undefined) {
  if (typeof value === "number") return `${value}mg`;
  return value;
}

function buildHealthAdaptationSteps(conditions: Set<string>) {
  const steps: string[] = [];
  if (conditions.has("cholesterol")) {
    steps.push("Health adaptation: use lean or skinless protein, keep added fat to about 1 tsp olive oil per serving, and keep rich saturated-fat ingredients out while preserving the original dish workflow.");
  }
  if (conditions.has("highBloodPressure")) {
    steps.push("Health adaptation: use low-sodium or unsalted pantry items, season with lemon, vinegar, garlic, herbs, and spices first, then add only a tiny pinch of salt if still needed.");
  }
  if (conditions.has("weightLoss")) {
    steps.push("Health adaptation: keep the plate portion controlled, favor baking, grilling, roasting, or light pan-searing, and serve sauces on the side when possible.");
  }
  if (conditions.has("diabetes")) {
    steps.push("Health adaptation: pair starches with protein, vegetables, and fiber-rich sides, and keep added sugar out of the sauce or marinade.");
  }
  return steps;
}

function adaptLocalizedHealthSteps(localized: Recipe["localized"], englishSteps: string[]) {
  if (!localized) return localized;
  return {
    ...localized,
    English: localized.English
      ? {
          ...localized.English,
          steps: appendDistinctStrings(localized.English.steps ?? [], englishSteps)
        }
      : localized.English
  };
}

function buildHealthPreferenceHits(conditions: Set<string>) {
  const hits: string[] = [];
  if (conditions.has("cholesterol")) hits.push("Adjusted for lower saturated fat while preserving the original dish identity");
  if (conditions.has("highBloodPressure")) hits.push("Adjusted for lower sodium while preserving the original dish identity");
  if (conditions.has("weightLoss")) hits.push("Portion-controlled and lighter preparation while preserving the original dish identity");
  if (conditions.has("diabetes")) hits.push("Balanced carbohydrate guidance applied while preserving the original dish identity");
  if (conditions.has("weightGain")) hits.push("Protein and calorie support applied while preserving the original dish identity");
  if (conditions.has("lowBloodPressure")) hits.push("Nutrient density support applied while preserving the original dish identity");
  return hits;
}

function appendDistinctStrings(current: string[], additions: string[]) {
  const seen = new Set(current.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const next = [...current];
  for (const addition of additions) {
    const cleaned = addition.trim();
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    next.push(cleaned);
  }
  return next;
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

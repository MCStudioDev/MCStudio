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
  condition: "cholesterol" | "highBloodPressure" | "weightLoss";
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
  if (conditions.includes("cholesterol")) {
    const match = findTerm(haystack, HEART_HEAVY_TERMS);
    if (match) return { condition: "cholesterol", match };
  }

  if (conditions.includes("highBloodPressure")) {
    const match = findTerm(haystack, LOW_SODIUM_RISK_TERMS);
    if (match) return { condition: "highBloodPressure", match };
  }

  if (conditions.includes("weightLoss")) {
    const match = findTerm(haystack, WEIGHT_LOSS_HEAVY_TERMS);
    if (match) return { condition: "weightLoss", match };
  }

  return null;
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

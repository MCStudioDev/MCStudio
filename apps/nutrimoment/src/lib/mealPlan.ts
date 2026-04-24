import type { MealPlanData, MealPlanDay } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

export function normalizeMealPlanData(value: unknown): MealPlanData | null {
  if (Array.isArray(value)) {
    return normalizeMealPlanData({ plan: value });
  }

  if (!isRecord(value)) return null;

  if (!Array.isArray(value.plan) && Array.isArray(value.mealPlan)) {
    return normalizeMealPlanData({ ...value, plan: value.mealPlan });
  }

  const plan = Array.isArray(value.plan)
    ? value.plan.map(normalizeMealPlanDay).filter((day): day is MealPlanDay => Boolean(day))
    : [];
  if (!plan.length) return null;

  const normalized: MealPlanData = {
    plan,
    shoppingList: normalizeShoppingList(value.shoppingList),
    servedFrom:
      value.servedFrom === "offline_catalog" || value.servedFrom === "fallback_ai" || value.servedFrom === "mock"
        ? value.servedFrom
        : undefined
  };

  if (Array.isArray(value.recommendedRecipes) && value.recommendedRecipes.length) {
    normalized.recommendedRecipes = value.recommendedRecipes as MealPlanData["recommendedRecipes"];
  }

  return stripUndefinedDeep(normalized) as MealPlanData;
}

export function normalizeShoppingList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(formatShoppingListItem).filter(Boolean);
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => formatShoppingListItem(item) || formatShoppingListItem(key))
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(/\n|,/).map(formatShoppingListItem).filter(Boolean);
  }

  return [];
}

function formatShoppingListItem(value: unknown) {
  if (typeof value === "string") {
    const item = value.trim();
    if (!item) return "";
    return hasQuantity(item) ? item : `${item} - 1 item`;
  }
  if (!isRecord(value)) return "";

  const name = readString(value, ["name", "ingredient", "item", "canonical"]);
  if (!name) return "";

  const quantity = readString(value, ["quantity", "amount", "qty"]);
  const unit = readString(value, ["unit"]);
  const suffix = [quantity, unit].filter(Boolean).join(" ");

  return suffix ? `${name} - ${suffix}` : `${name} - 1 item`;
}

function hasQuantity(value: string) {
  return /\d/.test(value) || /\b(half|quarter|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(value);
}

function normalizeMealPlanDay(value: unknown): MealPlanDay | null {
  if (!isRecord(value)) return null;

  const meals = isRecord(value.meals) ? value.meals : value;
  const breakfast = normalizeMeal(meals.breakfast);
  const lunch = normalizeMeal(meals.lunch);
  const dinner = normalizeMeal(meals.dinner);

  if (!breakfast || !lunch || !dinner) return null;

  return {
    ...value,
    day: readString(value, ["day", "date", "label"]) || "Day",
    breakfast,
    lunch,
    dinner
  } as MealPlanDay;
}

function normalizeMeal(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return {
      name: value.trim(),
      calories: 0,
      protein: "0g",
      carbs: "0g",
      fat: "0g"
    };
  }

  if (!isRecord(value)) return null;

  const name = readString(value, ["name", "title", "meal"]);
  if (!name) return null;
  const imageSearchIndices = readStringArray(value, ["image_search_indices", "photo_queries", "search_indices"]);
  const imageSearchIndex = readString(value, ["image_search_index", "photo_query", "search_index"]) || imageSearchIndices?.[0];

  return {
    ...value,
    name,
    image_search_index: imageSearchIndex,
    image_search_indices: imageSearchIndices,
    calories: readNumber(value, ["calories", "kcal"]),
    protein: readMacro(value, ["protein"]),
    carbs: readMacro(value, ["carbs", "carbohydrates"]),
    fat: readMacro(value, ["fat", "fats"])
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return `${value}`;
  }

  return "";
}

function readNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return 0;
}

function readMacro(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return `${value}g`;
  }

  return "0g";
}

function readStringArray(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const items = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (items.length) {
        return Array.from(new Set(items)).slice(0, 5);
      }
    }
  }

  return undefined;
}

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
  );
}

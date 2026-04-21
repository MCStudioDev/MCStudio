import type { MealPlanData, MealPlanDay } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

export function normalizeMealPlanData(value: unknown): MealPlanData | null {
  if (!isRecord(value)) return null;

  const plan = Array.isArray(value.plan) ? value.plan.filter(isMealPlanDay) : [];
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

function isMealPlanDay(value: unknown): value is MealPlanDay {
  return isRecord(value) && typeof value.day === "string" && isMeal(value.breakfast) && isMeal(value.lunch) && isMeal(value.dinner);
}

function isMeal(value: unknown) {
  return isRecord(value) && typeof value.name === "string";
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

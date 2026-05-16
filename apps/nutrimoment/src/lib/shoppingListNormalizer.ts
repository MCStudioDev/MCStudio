import { translateIngredientToArabic, translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import { normalizeShoppingList } from "@/lib/mealPlan";
import { normalizePantryIngredientName, normalizeUnit, parsePantryQuantity, unitsMatch } from "@/lib/pantryQuantity";
import type { MealPlanData } from "@/lib/types";

export interface ShoppingListPantryItem {
  name: string;
  quantity?: string;
}

type ShoppingLanguage = "ar" | "en";

interface ShoppingAmount {
  canonical: string;
  quantity: number;
  unit: string;
}

const ARABIC_UNIT_ALIASES: Record<string, string> = {
  "حبة": "whole",
  "حبات": "whole",
  "قطعة": "whole",
  "قطع": "whole",
  "عنصر": "whole",
  "عناصر": "whole",
  "كوب": "cup",
  "اكواب": "cup",
  "أكواب": "cup",
  "علبة": "can",
  "علب": "can",
  "فص": "clove",
  "فصوص": "clove",
  "شريحة": "slice",
  "شرائح": "slice",
  "ملعقة": "tbsp",
  "ملعقة كبيرة": "tbsp",
  "ملاعق": "tbsp",
  "ملعقة صغيرة": "tsp",
  "رطل": "lb",
  "أوقية": "oz",
  "اوقية": "oz",
  "باقة": "bunch",
  "حزمة": "bunch",
  "فيليه": "fillet",
  "جرام": "g",
  "غرام": "g",
  "جم": "g",
  "كج": "kg",
  "كجم": "kg",
  "كيلو": "kg"
};

const ENGLISH_DESCRIPTOR_PATTERN =
  /\b(chopped|diced|minced|sliced|fresh|dried|ground|grated|crushed|optional|canned|cooked|raw|large|small|medium|for garnish|to taste|peeled|seeded|boneless|skinless)\b/gi;
const ARABIC_DESCRIPTOR_PATTERN =
  /\b(مفروم(?:ة)?|مقطع(?:ة)?|شرائح|طازج(?:ة)?|مجفف(?:ة)?|مطحون(?:ة)?|مبشور(?:ة)?|مهروس(?:ة)?|اختياري(?:ة)?|للتزيين|حسب الرغبة|كبير(?:ة)?|صغير(?:ة)?|متوسط(?:ة)?|معلب(?:ة)?|مسلوق(?:ة)?|مقشر(?:ة)?)\b/gu;

export function buildNormalizedShoppingList(input: {
  displayLanguage: ShoppingLanguage | string;
  mealPlan?: Pick<MealPlanData, "plan" | "shoppingList"> | null;
  pantryItems?: ShoppingListPantryItem[];
  shoppingList?: string[];
}) {
  const rawEntries = normalizeShoppingList(input.shoppingList ?? input.mealPlan?.shoppingList ?? []);
  const sourceEntries = rawEntries.length ? rawEntries : deriveEntriesFromMealPlan(input.mealPlan ?? null);
  return reconcileShoppingEntries(sourceEntries, input.pantryItems ?? [], input.displayLanguage === "ar" ? "ar" : "en");
}

export function reconcileShoppingListWithPantryAndLanguage(
  shoppingList: string[],
  pantryItems: ShoppingListPantryItem[],
  displayLanguage: ShoppingLanguage | string = "en"
) {
  return reconcileShoppingEntries(
    normalizeShoppingList(shoppingList),
    pantryItems,
    displayLanguage === "ar" ? "ar" : "en"
  );
}

function deriveEntriesFromMealPlan(mealPlan: Pick<MealPlanData, "plan"> | null) {
  if (!mealPlan) return [];
  return mealPlan.plan
    .flatMap((day) => [day.breakfast, day.lunch, day.dinner])
    .flatMap((meal) => meal.ingredients ?? [])
    .map((ingredient) => `${ingredient} - 1 item`);
}

function reconcileShoppingEntries(entries: string[], pantryItems: ShoppingListPantryItem[], displayLanguage: ShoppingLanguage) {
  const needed = new Map<string, ShoppingAmount>();
  const pantryStock = buildPantryStock(pantryItems);

  for (const entry of entries) {
    const parsed = parseShoppingEntry(entry);
    if (!parsed) continue;
    const canonical = canonicalizeShoppingIngredient(parsed.label);
    if (!canonical) continue;

    const unit = normalizeShoppingUnit(parsed.unit) || "whole";
    const key = `${canonical}::${unit}`;
    const current = needed.get(key);
    if (current) {
      current.quantity += parsed.quantity;
      continue;
    }

    const compatible = findCompatibleShoppingAmount(needed, canonical, unit);
    if (compatible) {
      mergeCompatibleShoppingAmount(needed, compatible, { canonical, quantity: parsed.quantity, unit });
      continue;
    }

    needed.set(key, {
      canonical,
      quantity: parsed.quantity,
      unit
    });
  }

  for (const item of needed.values()) {
    const pantryItem = pantryStock.get(item.canonical);
    if (!pantryItem || !unitsMatch(item.unit, pantryItem.unit)) continue;
    item.quantity = Math.max(0, item.quantity - pantryItem.quantity);
  }

  return Array.from(needed.values())
    .filter((item) => item.quantity > 0)
    .sort((left, right) => localizeIngredientLabel(left.canonical, displayLanguage).localeCompare(localizeIngredientLabel(right.canonical, displayLanguage)))
    .map((item) => formatShoppingAmount(item, displayLanguage));
}

function findCompatibleShoppingAmount(needed: Map<string, ShoppingAmount>, canonical: string, unit: string) {
  return Array.from(needed.values()).find((item) => {
    if (item.canonical !== canonical) return false;
    return unitsMatch(item.unit, unit) || isVagueItemUnit(item.unit) || isVagueItemUnit(unit);
  });
}

function mergeCompatibleShoppingAmount(
  needed: Map<string, ShoppingAmount>,
  current: ShoppingAmount,
  next: ShoppingAmount
) {
  const currentKey = `${current.canonical}::${current.unit}`;
  const preferredUnit = choosePreferredShoppingUnit(current.unit, next.unit);
  current.quantity += shouldAddCompatibleQuantity(current.unit, next.unit) ? next.quantity : 0;
  current.unit = preferredUnit;

  const preferredKey = `${current.canonical}::${preferredUnit}`;
  if (preferredKey !== currentKey) {
    needed.delete(currentKey);
    const existing = needed.get(preferredKey);
    if (existing) {
      existing.quantity += current.quantity;
    } else {
      needed.set(preferredKey, current);
    }
  }
}

function choosePreferredShoppingUnit(left: string, right: string) {
  if (isVagueItemUnit(left) && !isVagueItemUnit(right)) return right;
  return left;
}

function shouldAddCompatibleQuantity(left: string, right: string) {
  return unitsMatch(left, right) || (isVagueItemUnit(left) && isVagueItemUnit(right));
}

function isVagueItemUnit(unit: string) {
  return normalizeShoppingUnit(unit) === "whole";
}

function buildPantryStock(items: ShoppingListPantryItem[]) {
  const stock = new Map<string, ShoppingAmount>();

  for (const item of items) {
    const canonical = canonicalizeShoppingIngredient(item.name);
    if (!canonical) continue;

    const parsed = parsePantryQuantity(item.quantity, item.name);
    const unit = normalizeShoppingUnit(parsed.unit) || "whole";
    const current = stock.get(canonical);
    if (current && unitsMatch(current.unit, unit)) {
      current.quantity += parsed.quantity;
      continue;
    }

    stock.set(canonical, {
      canonical,
      quantity: parsed.quantity,
      unit
    });
  }

  return stock;
}

function parseShoppingEntry(entry: string): { label: string; quantity: number; unit: string } | null {
  const normalized = normalizeNumerals(entry).replace(/[–—]/g, "-").trim();
  if (!normalized) return null;

  const [namePart, ...detailParts] = normalized.split(/\s+-\s+/);
  const label = namePart?.trim();
  if (!label) return null;

  const detail = detailParts.join(" ").trim();
  const detailMatch = detail.match(/(\d+(?:\.\d+)?)\s*(.*)$/);
  if (detailMatch) {
    return {
      label,
      quantity: Number.parseFloat(detailMatch[1]),
      unit: detailMatch[2] ?? ""
    };
  }

  const trailingMatch = normalized.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(.*)$/);
  if (trailingMatch) {
    return {
      label: trailingMatch[1],
      quantity: Number.parseFloat(trailingMatch[2]),
      unit: trailingMatch[3] ?? ""
    };
  }

  const leadingMatch = normalized.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (leadingMatch) {
    return {
      label: leadingMatch[2],
      quantity: Number.parseFloat(leadingMatch[1]),
      unit: ""
    };
  }

  return {
    label,
    quantity: 1,
    unit: ""
  };
}

function canonicalizeShoppingIngredient(value: string) {
  const withoutParentheses = value.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const descriptorStripped = withoutParentheses
    .replace(ENGLISH_DESCRIPTOR_PATTERN, " ")
    .replace(ARABIC_DESCRIPTOR_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  const translated = translateIngredientToEnglish(descriptorStripped).trim();
  return normalizePantryIngredientName(translated || descriptorStripped);
}

function normalizeShoppingUnit(unit: string) {
  const normalized = unit.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalizeUnit(ARABIC_UNIT_ALIASES[normalized] ?? normalized);
}

function formatShoppingAmount(item: ShoppingAmount, displayLanguage: ShoppingLanguage) {
  const quantity = Number.isInteger(item.quantity) ? `${item.quantity}` : item.quantity.toFixed(1);
  const label = localizeIngredientLabel(item.canonical, displayLanguage);
  const unit = localizeUnit(item.unit, displayLanguage);
  return `${label} - ${quantity} ${unit}`;
}

function localizeIngredientLabel(canonical: string, displayLanguage: ShoppingLanguage) {
  return displayLanguage === "ar" ? translateIngredientToArabic(canonical) : translateIngredientToEnglish(canonical);
}

function localizeUnit(unit: string, displayLanguage: ShoppingLanguage) {
  if (displayLanguage !== "ar") return unit === "whole" ? "item" : unit;
  const normalized = normalizeShoppingUnit(unit) || unit;
  const arabicUnits: Record<string, string> = {
    whole: "حبة",
    cup: "كوب",
    can: "علبة",
    clove: "فص",
    slice: "شريحة",
    tbsp: "ملعقة كبيرة",
    tsp: "ملعقة صغيرة",
    lb: "رطل",
    oz: "أوقية",
    bunch: "حزمة",
    fillet: "فيليه",
    g: "جرام",
    kg: "كجم"
  };
  return arabicUnits[normalized] ?? normalized;
}

function normalizeNumerals(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

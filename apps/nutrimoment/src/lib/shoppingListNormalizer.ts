import { translateIngredientToArabic, translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import { normalizeShoppingList } from "@/lib/mealPlan";
import {
  getPreferredPantryUnit,
  normalizePantryIngredientName,
  normalizeUnit,
  parsePantryQuantity,
  unitsMatch
} from "@/lib/pantryQuantity";
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

const READABLE_ARABIC_UNIT_ALIASES: Record<string, string> = {
  "\u062d\u0628\u0629": "whole",
  "\u062d\u0628\u0627\u062a": "whole",
  "\u0642\u0637\u0639\u0629": "whole",
  "\u0642\u0637\u0639": "whole",
  "\u0639\u0646\u0635\u0631": "whole",
  "\u0639\u0646\u0627\u0635\u0631": "whole",
  "\u0643\u0648\u0628": "cup",
  "\u0627\u0643\u0648\u0627\u0628": "cup",
  "\u0623\u0643\u0648\u0627\u0628": "cup",
  "\u0639\u0644\u0628\u0629": "can",
  "\u0639\u0644\u0628": "can",
  "\u0639\u0628\u0648\u0629": "package",
  "\u0639\u0628\u0648\u0627\u062a": "package",
  "\u0643\u064a\u0633": "bag",
  "\u0623\u0643\u064a\u0627\u0633": "bag",
  "\u0627\u0643\u064a\u0627\u0633": "bag",
  "\u0641\u0635": "clove",
  "\u0641\u0635\u0648\u0635": "clove",
  "\u0634\u0631\u064a\u062d\u0629": "slice",
  "\u0634\u0631\u0627\u0626\u062d": "slice",
  "\u0645\u0644\u0639\u0642\u0629": "tbsp",
  "\u0645\u0644\u0639\u0642\u0629 \u0643\u0628\u064a\u0631\u0629": "tbsp",
  "\u0645\u0644\u0627\u0639\u0642": "tbsp",
  "\u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629": "tsp",
  "\u0631\u0637\u0644": "lb",
  "\u0623\u0648\u0642\u064a\u0629": "oz",
  "\u0627\u0648\u0642\u064a\u0629": "oz",
  "\u0628\u0627\u0642\u0629": "bunch",
  "\u062d\u0632\u0645\u0629": "bunch",
  "\u0628\u0648\u0646\u062a\u0634": "bunch",
  "\u0641\u064a\u0644\u064a\u0647": "fillet",
  "\u062c\u0631\u0627\u0645": "g",
  "\u063a\u0631\u0627\u0645": "g",
  "\u062c\u0645": "g",
  "\u0643\u062c": "kg",
  "\u0643\u062c\u0645": "kg",
  "\u0643\u064a\u0644\u0648": "kg",
  "\u0645\u064a\u0643\u0633\u064a\u062f \u0648\u0646\u064a\u062a\u0633": "whole",
  "\u0648\u062d\u062f\u0627\u062a \u0645\u062a\u0646\u0648\u0639\u0629": "whole"
};

const ARABIC_UNIT_ALIASES: Record<string, string> = {
  ...READABLE_ARABIC_UNIT_ALIASES,
  "Ø­Ø¨Ø©": "whole",
  "Ø­Ø¨Ø§Øª": "whole",
  "Ù‚Ø·Ø¹Ø©": "whole",
  "Ù‚Ø·Ø¹": "whole",
  "Ø¹Ù†ØµØ±": "whole",
  "Ø¹Ù†Ø§ØµØ±": "whole",
  "ÙƒÙˆØ¨": "cup",
  "Ø§ÙƒÙˆØ§Ø¨": "cup",
  "Ø£ÙƒÙˆØ§Ø¨": "cup",
  "Ø¹Ù„Ø¨Ø©": "can",
  "Ø¹Ù„Ø¨": "can",
  "Ø¹Ø¨ÙˆØ©": "package",
  "Ø¹Ø¨ÙˆØ§Øª": "package",
  "ÙƒÙŠØ³": "bag",
  "Ø£ÙƒÙŠØ§Ø³": "bag",
  "Ø§ÙƒÙŠØ§Ø³": "bag",
  "ÙØµ": "clove",
  "ÙØµÙˆØµ": "clove",
  "Ø´Ø±ÙŠØ­Ø©": "slice",
  "Ø´Ø±Ø§Ø¦Ø­": "slice",
  "Ù…Ù„Ø¹Ù‚Ø©": "tbsp",
  "Ù…Ù„Ø¹Ù‚Ø© ÙƒØ¨ÙŠØ±Ø©": "tbsp",
  "Ù…Ù„Ø§Ø¹Ù‚": "tbsp",
  "Ù…Ù„Ø¹Ù‚Ø© ØµØºÙŠØ±Ø©": "tsp",
  "Ø±Ø·Ù„": "lb",
  "Ø£ÙˆÙ‚ÙŠØ©": "oz",
  "Ø§ÙˆÙ‚ÙŠØ©": "oz",
  "Ø¨Ø§Ù‚Ø©": "bunch",
  "Ø­Ø²Ù…Ø©": "bunch",
  "ÙÙŠÙ„ÙŠÙ‡": "fillet",
  "Ø¬Ø±Ø§Ù…": "g",
  "ØºØ±Ø§Ù…": "g",
  "Ø¬Ù…": "g",
  "ÙƒØ¬": "kg",
  "ÙƒØ¬Ù…": "kg",
  "ÙƒÙŠÙ„Ùˆ": "kg",
  "Ù…ÙŠÙƒØ³ÙŠØ¯ ÙˆÙ†ÙŠØªØ³": "whole",
  "ÙˆØ­Ø¯Ø§Øª Ù…ØªÙ†ÙˆØ¹Ø©": "whole"
};

const ENGLISH_DESCRIPTOR_PATTERN =
  /\b(chopped|diced|minced|sliced|fresh|dried|ground|grated|crushed|optional|canned|cooked|raw|large|small|medium|for garnish|to taste|peeled|seeded|boneless|skinless)\b/gi;
const ARABIC_DESCRIPTOR_PATTERN =
  /\b(Ù…ÙØ±ÙˆÙ…(?:Ø©)?|Ù…Ù‚Ø·Ø¹(?:Ø©)?|Ø´Ø±Ø§Ø¦Ø­|Ø·Ø§Ø²Ø¬(?:Ø©)?|Ù…Ø¬ÙÙ(?:Ø©)?|Ù…Ø·Ø­ÙˆÙ†(?:Ø©)?|Ù…Ø¨Ø´ÙˆØ±(?:Ø©)?|Ù…Ù‡Ø±ÙˆØ³(?:Ø©)?|Ø§Ø®ØªÙŠØ§Ø±ÙŠ(?:Ø©)?|Ù„Ù„ØªØ²ÙŠÙŠÙ†|Ø­Ø³Ø¨ Ø§Ù„Ø±ØºØ¨Ø©|ÙƒØ¨ÙŠØ±(?:Ø©)?|ØµØºÙŠØ±(?:Ø©)?|Ù…ØªÙˆØ³Ø·(?:Ø©)?|Ù…Ø¹Ù„Ø¨(?:Ø©)?|Ù…Ø³Ù„ÙˆÙ‚(?:Ø©)?|Ù…Ù‚Ø´Ø±(?:Ø©)?)\b/gu;

const ARABIC_DESCRIPTOR_PATTERN_UNICODE =
  /(\u0645\u0641\u0631\u0648\u0645(?:\u0629)?|\u0645\u0642\u0637\u0639(?:\u0629)?|\u0645\u0643\u0639\u0628\u0627\u062a|\u0634\u0631\u0627\u0626\u062d|\u0637\u0627\u0632\u062c(?:\u0629)?|\u0645\u062c\u0641\u0641(?:\u0629)?|\u0645\u0637\u062d\u0648\u0646(?:\u0629)?|\u0645\u0628\u0634\u0648\u0631(?:\u0629)?|\u0645\u0647\u0631\u0648\u0633(?:\u0629)?|\u0627\u062e\u062a\u064a\u0627\u0631\u064a(?:\u0629)?|\u0644\u0644\u062a\u0632\u064a\u064a\u0646|\u062d\u0633\u0628 \u0627\u0644\u0631\u063a\u0628\u0629|\u062d\u0633\u0628 \u0627\u0644\u062d\u0627\u062c\u0629|\u0643\u0628\u064a\u0631(?:\u0629)?|\u0635\u063a\u064a\u0631(?:\u0629)?|\u0645\u062a\u0648\u0633\u0637(?:\u0629)?|\u0645\u0639\u0644\u0628(?:\u0629)?|\u0645\u0633\u0644\u0648\u0642(?:\u0629)?|\u0645\u0642\u0634\u0631(?:\u0629)?)/gu;
const TO_TASTE_UNIT = "to_taste";
const TO_TASTE_PATTERN = /(?:\bto taste\b|\u062d\u0633\u0628 \u0627\u0644\u0631\u063a\u0628\u0629|\u062d\u0633\u0628 \u0627\u0644\u062d\u0627\u062c\u0629)/i;

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

    const unit = chooseShoppingUnit(canonical, normalizeShoppingUnit(parsed.unit) || "whole");
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
    return unitsMatch(item.unit, unit) ||
      isVagueItemUnit(item.unit) ||
      isVagueItemUnit(unit) ||
      isPackageLikeUnit(item.unit) ||
      isPackageLikeUnit(unit);
  });
}

function mergeCompatibleShoppingAmount(
  needed: Map<string, ShoppingAmount>,
  current: ShoppingAmount,
  next: ShoppingAmount
) {
  const currentKey = `${current.canonical}::${current.unit}`;
  const preferredUnit = choosePreferredShoppingUnit(current.unit, next.unit);
  current.quantity = mergeCompatibleQuantity(current, next, preferredUnit);
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
  if (isPackageLikeUnit(left) && !isPackageLikeUnit(right)) return left;
  if (isPackageLikeUnit(right)) return right;
  if (isVagueItemUnit(left) && !isVagueItemUnit(right)) return right;
  return left;
}

function mergeCompatibleQuantity(current: ShoppingAmount, next: ShoppingAmount, preferredUnit: string) {
  if (isPackageLikeUnit(preferredUnit)) {
    if (isPackageLikeUnit(current.unit) && isPackageLikeUnit(next.unit)) {
      return current.quantity + next.quantity;
    }
    return isPackageLikeUnit(next.unit) ? next.quantity : current.quantity;
  }
  return unitsMatch(current.unit, next.unit) || (isVagueItemUnit(current.unit) && isVagueItemUnit(next.unit))
    ? current.quantity + next.quantity
    : current.quantity;
}

function isVagueItemUnit(unit: string) {
  return normalizeShoppingUnit(unit) === "whole";
}

function isPackageLikeUnit(unit: string) {
  const normalized = normalizeShoppingUnit(unit);
  return normalized === "package" || normalized === "bag";
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
  const normalized = normalizeNumerals(entry).replace(/[â€“â€”]/g, "-").trim();
  if (!normalized) return null;

  const [namePart, ...detailParts] = normalized.split(/\s+-\s+/);
  const label = namePart?.trim();
  if (!label) return null;

  const detail = detailParts.join(" ").trim();
  if (extractToTasteDetail(detail)) {
    return {
      label,
      quantity: 1,
      unit: TO_TASTE_UNIT
    };
  }

  const detailMatch = detail.match(/(\d+(?:\.\d+)?)\s*(.*)$/);
  if (detailMatch) {
    return {
      label,
      quantity: Number.parseFloat(detailMatch[1]),
      unit: normalizeShoppingDetailUnit(detailMatch[2] ?? "")
    };
  }

  const trailingMatch = normalized.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(.*)$/);
  if (trailingMatch) {
    return {
      label: trailingMatch[1],
      quantity: Number.parseFloat(trailingMatch[2]),
      unit: normalizeShoppingDetailUnit(trailingMatch[3] ?? "")
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
    .replace(ARABIC_DESCRIPTOR_PATTERN_UNICODE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const translated = translateIngredientToEnglish(descriptorStripped).trim();
  return normalizePantryIngredientName(translated || descriptorStripped);
}

function normalizeShoppingDetailUnit(unit: string) {
  const clean = unit.trim();
  if (TO_TASTE_PATTERN.test(clean)) return TO_TASTE_UNIT;

  const firstUnit = clean.split(/\s+-\s+/)[0]?.trim() ?? clean;
  return firstUnit.replace(/\bitems?\b/gi, "whole").trim();
}

function extractToTasteDetail(detail: string) {
  return TO_TASTE_PATTERN.test(detail);
}

function normalizeShoppingUnit(unit: string) {
  const normalized = unit.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized === TO_TASTE_UNIT) return TO_TASTE_UNIT;
  return normalizeUnit(ARABIC_UNIT_ALIASES[normalized] ?? normalized);
}

function chooseShoppingUnit(canonical: string, unit: string) {
  const normalized = normalizeShoppingUnit(unit) || "whole";
  if (normalized !== "whole") return normalized;

  const preferred = getPreferredPantryUnit(canonical);
  return preferred === "whole" ? normalized : preferred;
}

function formatShoppingAmount(item: ShoppingAmount, displayLanguage: ShoppingLanguage) {
  if (item.unit === TO_TASTE_UNIT) {
    const label = localizeIngredientLabel(item.canonical, displayLanguage);
    return displayLanguage === "ar" ? `${label} - Ø­Ø³Ø¨ Ø§Ù„Ø­Ø§Ø¬Ø©` : `${label} - to taste`;
  }

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
    whole: "\u062d\u0628\u0629",
    cup: "\u0643\u0648\u0628",
    can: "\u0639\u0644\u0628\u0629",
    clove: "\u0641\u0635",
    slice: "\u0634\u0631\u064a\u062d\u0629",
    tbsp: "\u0645\u0644\u0639\u0642\u0629 \u0643\u0628\u064a\u0631\u0629",
    tsp: "\u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629",
    lb: "\u0631\u0637\u0644",
    oz: "\u0623\u0648\u0642\u064a\u0629",
    bunch: "\u062d\u0632\u0645\u0629",
    fillet: "\u0641\u064a\u0644\u064a\u0647",
    g: "\u062c\u0631\u0627\u0645",
    kg: "\u0643\u062c\u0645",
    package: "\u0639\u0628\u0648\u0629",
    bag: "\u0643\u064a\u0633"
  };
  return arabicUnits[normalized] ?? normalized;
}

function normalizeNumerals(value: string) {
  return value.replace(/[Ù -Ù©Û°-Û¹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

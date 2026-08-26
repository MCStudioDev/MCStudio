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
  inferred?: boolean;
  quantity: number;
  unit: string;
}

const FORCE_MEASURED_SHOPPING_UNITS = new Set([
  "all purpose flour",
  "almond flour",
  "baking powder",
  "baking soda",
  "breadcrumbs",
  "bulgur",
  "beans",
  "black beans",
  "canned beans",
  "chickpeas",
  "couscous",
  "flour",
  "garlic",
  "kidney beans",
  "lentils",
  "macaroni",
  "noodles",
  "oats",
  "olive oil",
  "oil",
  "pasta",
  "quinoa",
  "rice",
  "spaghetti",
  "tomato paste",
  "tomato sauce",
  "white beans",
  "vinegar",
  "tahini",
  "honey",
  "salt",
  "black pepper",
  "cumin",
  "coriander",
  "paprika",
  "turmeric",
  "cinnamon",
  "oregano",
  "basil",
  "thyme",
  "rosemary",
  "chili powder",
  "curry powder",
  "garlic powder",
  "onion powder",
  "beef",
  "meat",
  "ground beef",
  "ground meat",
  "minced beef",
  "minced meat",
  "lamb",
  "chicken",
  "chicken breast",
  "fish",
  "salmon",
  "seafood",
  "shrimp"
]);

const WEIGHT_SHOPPING_INGREDIENTS = new Set([
  "beef",
  "meat",
  "ground beef",
  "ground meat",
  "minced beef",
  "minced meat",
  "lamb",
  "chicken",
  "chicken breast",
  "fish",
  "salmon",
  "seafood",
  "shrimp"
]);

const INGREDIENT_UNIT_EQUIVALENTS: Record<string, Partial<Record<string, { quantity: number; unit: string }>>> = {
  egg: {
    cup: { quantity: 4, unit: "whole" },
    tbsp: { quantity: 0.25, unit: "whole" }
  },
  onion: {
    cup: { quantity: 1, unit: "whole" },
    tbsp: { quantity: 0.0625, unit: "whole" }
  },
  tomato: {
    cup: { quantity: 2, unit: "whole" },
    tbsp: { quantity: 0.125, unit: "whole" }
  },
  "bell pepper": {
    cup: { quantity: 1.5, unit: "whole" },
    tbsp: { quantity: 0.09375, unit: "whole" }
  },
  cilantro: {
    cup: { quantity: 0.5, unit: "bunch" },
    tbsp: { quantity: 0.03125, unit: "bunch" }
  },
  parsley: {
    cup: { quantity: 0.5, unit: "bunch" },
    tbsp: { quantity: 0.03125, unit: "bunch" }
  }
};

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

const ARABIC_UNIT_ALIASES: Record<string, string> = READABLE_ARABIC_UNIT_ALIASES;

const ENGLISH_DESCRIPTOR_PATTERN =
  /\b(chopped|diced|minced|sliced|fresh|dried|ground|grated|crushed|optional|canned|cooked|raw|large|small|medium|finely|scrambled|shredded|sauteed|saut\u00e9ed|deveined|for garnish|to taste|peeled|seeded|boneless|skinless)\b/gi;
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
  const mealEntries = deriveEntriesFromMealPlan(input.mealPlan ?? null);
  const sourceEntries = mealEntries.length ? mealEntries : rawEntries;
  return reconcileShoppingEntries(sourceEntries, input.pantryItems ?? [], input.displayLanguage === "ar" ? "ar" : "en");
}

export function buildShoppingListFromMealIngredients(input: {
  displayLanguage: ShoppingLanguage | string;
  mealPlan: Pick<MealPlanData, "plan">;
  pantryItems?: ShoppingListPantryItem[];
}) {
  return reconcileShoppingEntries(
    deriveEntriesFromMealPlan(input.mealPlan),
    input.pantryItems ?? [],
    input.displayLanguage === "ar" ? "ar" : "en"
  );
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
    .map((ingredient) => ingredient.trim())
    .filter(Boolean);
}

function reconcileShoppingEntries(entries: string[], pantryItems: ShoppingListPantryItem[], displayLanguage: ShoppingLanguage) {
  const needed = new Map<string, ShoppingAmount>();
  const pantryStock = buildPantryStock(pantryItems);

  for (const entry of entries) {
    const parsed = parseShoppingEntry(entry);
    if (!parsed) continue;
    const canonical = canonicalizeShoppingIngredient(parsed.label);
    if (!canonical) continue;

    const originalUnit = normalizeShoppingUnit(parsed.unit) || "whole";
    const unit = chooseShoppingUnit(canonical, originalUnit);
    const quantity = normalizeShoppingQuantity(canonical, parsed.quantity, originalUnit, unit);
    const inferred = isInferredWeightShoppingQuantity(canonical, originalUnit, unit);
    const key = `${canonical}::${unit}`;
    const current = needed.get(key);
    if (current) {
      if (current.inferred && !inferred) {
        current.quantity = quantity;
        current.inferred = false;
        continue;
      }
      if (!current.inferred && inferred) continue;
      current.quantity += quantity;
      continue;
    }

    const compatible = findCompatibleShoppingAmount(needed, canonical, unit);
    if (compatible) {
      if (compatible.inferred && !inferred) {
        compatible.quantity = quantity;
        compatible.unit = unit;
        compatible.inferred = false;
        continue;
      }
      if (!compatible.inferred && inferred) continue;
      mergeCompatibleShoppingAmount(needed, compatible, { canonical, inferred, quantity, unit });
      continue;
    }

    needed.set(key, {
      canonical,
      inferred,
      quantity,
      unit
    });
  }

  for (const item of needed.values()) {
    const pantryItem = pantryStock.get(item.canonical);
    if (!pantryItem) continue;
    const pantryQuantity = convertShoppingQuantity(pantryItem.quantity, pantryItem.unit, item.unit);
    if (pantryQuantity === null) continue;
    item.quantity = Math.max(0, item.quantity - pantryQuantity);
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
      canConvertShoppingUnits(item.unit, unit) ||
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
  const preferredUnit = choosePreferredShoppingUnit(current.canonical, current.unit, next.unit);
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

function choosePreferredShoppingUnit(canonical: string, left: string, right: string) {
  const preferred = getPreferredPantryUnit(canonical);
  if (shouldForceMeasuredShoppingUnit(canonical, left) || shouldForceMeasuredShoppingUnit(canonical, right)) {
    return preferred;
  }
  if (isPackageLikeUnit(left) && !isPackageLikeUnit(right)) return left;
  if (isPackageLikeUnit(right)) return right;
  if (isVagueItemUnit(left) && !isVagueItemUnit(right)) return right;
  if (canConvertShoppingUnits(left, right)) {
    return canConvertShoppingUnits(left, preferred) ? preferred : left;
  }
  return left;
}

function mergeCompatibleQuantity(current: ShoppingAmount, next: ShoppingAmount, preferredUnit: string) {
  if (shouldForceMeasuredShoppingUnit(current.canonical, preferredUnit)) {
    return current.quantity + next.quantity;
  }
  if (isPackageLikeUnit(preferredUnit)) {
    if (isPackageLikeUnit(current.unit) && isPackageLikeUnit(next.unit)) {
      return current.quantity + next.quantity;
    }
    return isPackageLikeUnit(next.unit) ? next.quantity : current.quantity;
  }
  const convertedCurrent = convertShoppingQuantity(current.quantity, current.unit, preferredUnit);
  const convertedNext = convertShoppingQuantity(next.quantity, next.unit, preferredUnit);
  if (convertedCurrent !== null && convertedNext !== null) {
    return convertedCurrent + convertedNext;
  }
  return unitsMatch(current.unit, next.unit) || (isVagueItemUnit(current.unit) && isVagueItemUnit(next.unit))
    ? current.quantity + next.quantity
    : current.quantity;
}

function isVagueItemUnit(unit: string) {
  const normalized = normalizeShoppingUnit(unit);
  return normalized === "whole" ||
    normalized === "portion" ||
    normalized === "portions" ||
    normalized === "serving" ||
    normalized === "servings";
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
    const originalUnit = normalizeShoppingUnit(parsed.unit) || "whole";
    const unit = chooseShoppingUnit(canonical, originalUnit);
    const quantity = normalizeShoppingQuantity(canonical, parsed.quantity, originalUnit, unit);
    const current = stock.get(canonical);
    if (current && unitsMatch(current.unit, unit)) {
      current.quantity += quantity;
      continue;
    }

    stock.set(canonical, {
      canonical,
      quantity,
      unit
    });
  }

  return stock;
}

function parseShoppingEntry(entry: string): { label: string; quantity: number; unit: string } | null {
  const normalized = normalizeNumerals(entry).replace(/[\u2013\u2014]/g, "-").trim();
  if (!normalized) return null;

  const [namePart, ...detailParts] = normalized.split(/\s+-\s+/);
  if (detailParts.length) {
    const label = cleanIngredientPreparation(namePart ?? "");
    if (!label) return null;
    const detail = detailParts.join(" ").trim();
    if (extractToTasteDetail(detail)) {
      return { label, quantity: 1, unit: TO_TASTE_UNIT };
    }
    const parsedDetail = parseQuantityPrefix(detail);
    return {
      label,
      quantity: parsedDetail?.quantity ?? 1,
      unit: normalizeShoppingDetailUnit(parsedDetail?.remainder ?? detail)
    };
  }

  if (TO_TASTE_PATTERN.test(normalized)) {
    return {
      label: cleanIngredientPreparation(normalized.replace(TO_TASTE_PATTERN, "")),
      quantity: 1,
      unit: TO_TASTE_UNIT
    };
  }

  const prefix = parseQuantityPrefix(normalized);
  if (!prefix) {
    return {
      label: cleanIngredientPreparation(normalized),
      quantity: 1,
      unit: ""
    };
  }

  const firstTokenMatch = prefix.remainder.match(/^(\S+)\s+(.+)$/);
  if (firstTokenMatch && isRecognizedShoppingUnit(firstTokenMatch[1])) {
    return {
      label: cleanIngredientPreparation(firstTokenMatch[2]),
      quantity: prefix.quantity,
      unit: normalizeShoppingDetailUnit(firstTokenMatch[1])
    };
  }

  return {
    label: cleanIngredientPreparation(prefix.remainder),
    quantity: prefix.quantity,
    unit: ""
  };
}

function parseQuantityPrefix(value: string) {
  const match = value.trim().match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return null;
  return {
    quantity: parseShoppingNumber(match[1]),
    remainder: match[2].trim()
  };
}

function cleanIngredientPreparation(value: string) {
  return value
    .split(/\s*,\s*/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

const RECOGNIZED_SHOPPING_UNITS = new Set([
  "bag", "bunch", "can", "clove", "cup", "fillet", "g", "kg", "lb", "ml", "l",
  "oz", "package", "portion", "portions", "serving", "servings", "slice", "tbsp", "tsp", "whole"
]);

function isRecognizedShoppingUnit(value: string) {
  return RECOGNIZED_SHOPPING_UNITS.has(normalizeShoppingUnit(value));
}

function canonicalizeShoppingIngredient(value: string) {
  if (/^(?:ground|chopped|minced)\s+meat$/i.test(value.trim())) return "meat";
  if (/^(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629)?\s+\u0645\u0641\u0631\u0648\u0645(?:\u0629)?$/u.test(value.trim())) return "meat";
  const withoutParentheses = value.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const descriptorStripped = withoutParentheses
    .replace(ENGLISH_DESCRIPTOR_PATTERN, " ")
    .replace(ARABIC_DESCRIPTOR_PATTERN_UNICODE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:ground|chopped|minced) meat$/i.test(descriptorStripped)) return "meat";
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

function parseShoppingNumber(value: string) {
  const mixed = value.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denominator = Number.parseFloat(mixed[3]);
    return Number.parseFloat(mixed[1]) + (denominator ? Number.parseFloat(mixed[2]) / denominator : 0);
  }
  const fraction = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!fraction) return Number.parseFloat(value);
  const denominator = Number.parseFloat(fraction[2]);
  return denominator ? Number.parseFloat(fraction[1]) / denominator : 0;
}

const SHOPPING_UNIT_FACTORS: Record<string, { family: "mass" | "volume"; factor: number }> = {
  g: { family: "mass", factor: 1 },
  kg: { family: "mass", factor: 1000 },
  lb: { family: "mass", factor: 453.592 },
  oz: { family: "mass", factor: 28.3495 },
  ml: { family: "volume", factor: 0.202884 },
  l: { family: "volume", factor: 202.884 },
  tsp: { family: "volume", factor: 1 },
  tbsp: { family: "volume", factor: 3 },
  cup: { family: "volume", factor: 48 }
};

function canConvertShoppingUnits(left: string, right: string) {
  const leftFactor = SHOPPING_UNIT_FACTORS[normalizeShoppingUnit(left)];
  const rightFactor = SHOPPING_UNIT_FACTORS[normalizeShoppingUnit(right)];
  return Boolean(leftFactor && rightFactor && leftFactor.family === rightFactor.family);
}

function convertShoppingQuantity(quantity: number, fromUnit: string, toUnit: string) {
  const normalizedFrom = normalizeShoppingUnit(fromUnit);
  const normalizedTo = normalizeShoppingUnit(toUnit);
  if (normalizedFrom === normalizedTo) return quantity;
  const fromFactor = SHOPPING_UNIT_FACTORS[normalizedFrom];
  const toFactor = SHOPPING_UNIT_FACTORS[normalizedTo];
  if (!fromFactor || !toFactor || fromFactor.family !== toFactor.family) return null;
  return quantity * fromFactor.factor / toFactor.factor;
}

function chooseShoppingUnit(canonical: string, unit: string) {
  const normalized = normalizeShoppingUnit(unit) || "whole";
  if (shouldForceMeasuredShoppingUnit(canonical, normalized)) return getPreferredPantryUnit(canonical);
  const equivalent = INGREDIENT_UNIT_EQUIVALENTS[canonical]?.[normalized];
  if (equivalent) return equivalent.unit;
  if (normalized !== "whole") return normalized;

  const preferred = getPreferredPantryUnit(canonical);
  return preferred === "whole" ? normalized : preferred;
}

function shouldForceMeasuredShoppingUnit(canonical: string, unit: string) {
  const preferred = getPreferredPantryUnit(canonical);
  if (WEIGHT_SHOPPING_INGREDIENTS.has(canonical) && preferred === "kg") {
    return unit !== TO_TASTE_UNIT;
  }
  return preferred !== "whole" &&
    FORCE_MEASURED_SHOPPING_UNITS.has(canonical) &&
    (unit === preferred || isVagueItemUnit(unit) || isPackageLikeUnit(unit));
}

function normalizeShoppingQuantity(canonical: string, quantity: number, originalUnit: string, selectedUnit: string) {
  const equivalent = INGREDIENT_UNIT_EQUIVALENTS[canonical]?.[normalizeShoppingUnit(originalUnit)];
  if (equivalent?.unit === selectedUnit) return quantity * equivalent.quantity;
  if (!WEIGHT_SHOPPING_INGREDIENTS.has(canonical) || selectedUnit !== "kg") return quantity;

  switch (normalizeShoppingUnit(originalUnit)) {
    case "g":
      return quantity / 1000;
    case "lb":
      return quantity * 0.45;
    case "oz":
      return quantity * 0.03;
    case "cup":
      return quantity * 0.25;
    case "fillet":
      return quantity * 0.2;
    default:
      return quantity;
  }
}

function isInferredWeightShoppingQuantity(canonical: string, originalUnit: string, selectedUnit: string) {
  return WEIGHT_SHOPPING_INGREDIENTS.has(canonical) &&
    selectedUnit === "kg" &&
    (isVagueItemUnit(originalUnit) || isPackageLikeUnit(originalUnit));
}

function formatShoppingAmount(item: ShoppingAmount, displayLanguage: ShoppingLanguage) {
  if (item.unit === TO_TASTE_UNIT) {
    const label = localizeIngredientLabel(item.canonical, displayLanguage);
    return displayLanguage === "ar" ? `${label} - \u062d\u0633\u0628 \u0627\u0644\u062d\u0627\u062c\u0629` : `${label} - to taste`;
  }

  const readableAmount = toReadableShoppingAmount(item.canonical, item.quantity, item.unit);
  const quantity = Number.isInteger(readableAmount.quantity)
    ? `${readableAmount.quantity}`
    : readableAmount.quantity.toFixed(1);
  const label = localizeIngredientLabel(item.canonical, displayLanguage);
  const unit = localizeUnit(readableAmount.unit, displayLanguage);
  return `${label} - ${quantity} ${unit}`;
}

function toReadableShoppingAmount(canonical: string, quantity: number, unit: string) {
  const normalized = normalizeShoppingUnit(unit);
  if (normalized === "tsp" && quantity >= 3 && getPreferredPantryUnit(canonical) !== "tsp") {
    return { quantity: quantity / 3, unit: "tbsp" };
  }
  if (normalized === "tbsp" && quantity >= 16) {
    return { quantity: quantity / 16, unit: "cup" };
  }
  if (normalized === "g" && quantity >= 1000) {
    return { quantity: quantity / 1000, unit: "kg" };
  }
  if (normalized === "oz" && quantity >= 16) {
    return { quantity: quantity / 16, unit: "lb" };
  }
  return { quantity, unit: normalized || unit };
}

function localizeIngredientLabel(canonical: string, displayLanguage: ShoppingLanguage) {
  if (displayLanguage === "en" && canonical === "meat") return "meat";
  if (displayLanguage === "ar" && canonical === "meat") return "\u0644\u062d\u0645";
  const label = displayLanguage === "ar" ? translateIngredientToArabic(canonical) : translateIngredientToEnglish(canonical);
  return cleanShoppingDisplayLabel(label);
}

function cleanShoppingDisplayLabel(label: string) {
  return label
    .replace(ENGLISH_DESCRIPTOR_PATTERN, " ")
    .replace(ARABIC_DESCRIPTOR_PATTERN_UNICODE, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

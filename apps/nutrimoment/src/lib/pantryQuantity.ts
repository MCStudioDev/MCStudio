import { translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";

export interface ParsedPantryQuantity {
  quantity: number;
  unit: string;
}

const PREFERRED_UNITS: Record<string, string> = {
  rice: "cup",
  lentils: "cup",
  oats: "cup",
  quinoa: "cup",
  pasta: "cup",
  chickpeas: "can",
  "canned beans": "can",
  tomato: "whole",
  onion: "whole",
  cucumber: "whole",
  banana: "whole",
  avocado: "whole",
  egg: "whole",
  bread: "slice",
  garlic: "clove",
  "olive oil": "tbsp",
  "coconut milk": "can",
  "oat milk": "cup",
  "almond milk": "cup",
  "greek yogurt": "cup",
  yogurt: "cup",
  "plain yogurt": "cup",
  "mixed berries": "cup",
  granola: "cup",
  spinach: "cup",
  broccoli: "cup",
  asparagus: "bunch",
  salmon: "fillet",
  "chicken breast": "lb",
  tofu: "oz"
};

const UNIT_ALIASES: Record<string, string> = {
  item: "whole",
  items: "whole",
  "mixed unit": "whole",
  "mixed units": "whole",
  "various unit": "whole",
  "various units": "whole",
  miscellaneous: "whole",
  "\u062d\u0628\u0629": "whole",
  "\u0639\u0646\u0635\u0631": "whole",
  "\u0643\u0648\u0628": "cup",
  "\u0639\u0644\u0628\u0629": "can",
  "\u0641\u0635": "clove",
  "\u062d\u0632\u0645\u0629": "bunch",
  "\u0628\u0648\u0646\u062a\u0634": "bunch",
  "\u0643\u062c": "kg",
  "\u0643\u062c\u0645": "kg",
  piece: "whole",
  pieces: "whole",
  tomato: "whole",
  tomatoes: "whole",
  cup: "cup",
  cups: "cup",
  can: "can",
  cans: "can",
  package: "package",
  packages: "package",
  pack: "package",
  packs: "package",
  bag: "bag",
  bags: "bag",
  clove: "clove",
  cloves: "clove",
  slice: "slice",
  slices: "slice",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  bunch: "bunch",
  bunches: "bunch",
  fillet: "fillet",
  fillets: "fillet",
  whole: "whole"
};

export function normalizePantryIngredientName(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\bbreasts\b/g, "breast")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\bbags?\b/g, "")
    .replace(/\bcans?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const englishNormalized = translateIngredientToEnglish(normalized).toLowerCase();
  return INGREDIENT_EQUIVALENTS[englishNormalized] ?? englishNormalized;
}

const INGREDIENT_EQUIVALENTS: Record<string, string> = {
  "egyptian rice": "rice",
  "white rice": "rice",
  "short grain rice": "rice",
  "medium grain rice": "rice",
  "long grain rice": "rice",
  yogurt: "greek yogurt",
  "plain yogurt": "greek yogurt",
  yogurts: "greek yogurt",
  "coconut beverage": "coconut milk",
  "coconut drink": "coconut milk",
  "milk coconut": "coconut milk",
  "oat beverage": "oat milk",
  "almond beverage": "almond milk"
};

export function getPreferredPantryUnit(ingredientName: string) {
  const canonical = normalizePantryIngredientName(ingredientName);
  return PREFERRED_UNITS[canonical] ?? "whole";
}

export function getPantryQuantityHint(ingredientName: string) {
  const unit = getPreferredPantryUnit(ingredientName);
  const label = unit === "whole" ? "whole/items" : unit;
  return ingredientName.trim()
    ? `Use ${label} for ${normalizePantryIngredientName(ingredientName)}`
    : "Examples: rice 2 cups, tomato 4 whole/items, chicken breast 1 lb";
}

export function parsePantryQuantity(value: string | undefined, ingredientName: string): ParsedPantryQuantity {
  const preferredUnit = getPreferredPantryUnit(ingredientName);
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return { quantity: 1, unit: preferredUnit };
  }

  const fraction = parseFractionWord(trimmed);
  if (fraction) {
    return {
      quantity: fraction.quantity,
      unit: normalizeUnit(fraction.unit || preferredUnit)
    };
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) {
    return { quantity: 1, unit: normalizeUnit(trimmed) || preferredUnit };
  }

  return {
    quantity: Number(match[1]),
    unit: normalizeUnit(match[2] || preferredUnit)
  };
}

export function unitsMatch(left: string, right: string) {
  return normalizeUnit(left) === normalizeUnit(right);
}

export function normalizeUnit(unit: string) {
  const clean = unit.trim().toLowerCase();
  if (!clean) return "";
  return UNIT_ALIASES[clean] ?? clean;
}

function parseFractionWord(value: string): ParsedPantryQuantity | null {
  const match = value.match(/^(half|quarter)\s*(.*)$/);
  if (!match) return null;

  return {
    quantity: match[1] === "half" ? 0.5 : 0.25,
    unit: match[2]?.trim() ?? ""
  };
}

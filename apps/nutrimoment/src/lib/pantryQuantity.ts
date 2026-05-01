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
  piece: "whole",
  pieces: "whole",
  tomato: "whole",
  tomatoes: "whole",
  cup: "cup",
  cups: "cup",
  can: "can",
  cans: "can",
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
  yogurt: "greek yogurt",
  "plain yogurt": "greek yogurt",
  yogurts: "greek yogurt"
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

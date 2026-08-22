import { translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";

export interface ParsedPantryQuantity {
  quantity: number;
  unit: string;
}

const PREFERRED_UNITS: Record<string, string> = {
  "all purpose flour": "cup",
  "almond flour": "cup",
  "baking powder": "tsp",
  "baking soda": "tsp",
  rice: "cup",
  "basmati rice": "cup",
  "brown rice": "cup",
  "jasmine rice": "cup",
  lentils: "cup",
  oats: "cup",
  quinoa: "cup",
  bulgur: "cup",
  couscous: "cup",
  pasta: "cup",
  macaroni: "cup",
  spaghetti: "oz",
  noodles: "cup",
  flour: "cup",
  breadcrumbs: "cup",
  chickpeas: "can",
  beans: "can",
  "white beans": "can",
  "black beans": "can",
  "kidney beans": "can",
  "canned beans": "can",
  "tomato sauce": "can",
  "tomato paste": "tbsp",
  tomato: "whole",
  onion: "whole",
  "red onion": "whole",
  "green onion": "bunch",
  cucumber: "whole",
  carrot: "whole",
  potato: "whole",
  "sweet potato": "whole",
  zucchini: "whole",
  eggplant: "whole",
  "bell pepper": "whole",
  pepper: "whole",
  lemon: "whole",
  lime: "whole",
  lettuce: "whole",
  cabbage: "whole",
  cauliflower: "whole",
  mushroom: "cup",
  banana: "whole",
  avocado: "whole",
  egg: "whole",
  bread: "slice",
  garlic: "clove",
  "olive oil": "tbsp",
  oil: "tbsp",
  vinegar: "tbsp",
  tahini: "tbsp",
  honey: "tbsp",
  salt: "tsp",
  "black pepper": "tsp",
  cumin: "tsp",
  coriander: "tsp",
  paprika: "tsp",
  turmeric: "tsp",
  cinnamon: "tsp",
  oregano: "tsp",
  basil: "tsp",
  thyme: "tsp",
  rosemary: "tsp",
  "chili powder": "tsp",
  "curry powder": "tsp",
  "garlic powder": "tsp",
  "onion powder": "tsp",
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
  parsley: "bunch",
  cilantro: "bunch",
  dill: "bunch",
  mint: "bunch",
  asparagus: "bunch",
  beef: "kg",
  meat: "kg",
  "ground beef": "kg",
  "ground meat": "kg",
  "minced beef": "kg",
  "minced meat": "kg",
  lamb: "kg",
  chicken: "kg",
  salmon: "fillet",
  "chicken breast": "kg",
  fish: "kg",
  seafood: "kg",
  shrimp: "kg",
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
  "\u0643\u064a\u0644\u0648": "kg",
  "\u062c\u0631\u0627\u0645": "g",
  "\u063a\u0631\u0627\u0645": "g",
  "\u062c\u0645": "g",
  "\u0645\u0644\u0639\u0642\u0629": "tbsp",
  "\u0645\u0644\u0627\u0639\u0642": "tbsp",
  "\u0645\u0644\u0639\u0642\u0629 \u0643\u0628\u064a\u0631\u0629": "tbsp",
  "\u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629": "tsp",
  piece: "whole",
  pieces: "whole",
  small: "whole",
  medium: "whole",
  large: "whole",
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
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
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
  "basmati rice": "rice",
  "jasmine rice": "rice",
  "brown rice": "rice",
  "short grain rice": "rice",
  "medium grain rice": "rice",
  "long grain rice": "rice",
  macaroni: "pasta",
  "macaroni pasta": "pasta",
  "pasta noodles": "pasta",
  "red sauce": "tomato sauce",
  "marinara sauce": "tomato sauce",
  marinara: "tomato sauce",
  "tomato puree": "tomato sauce",
  "tomato passata": "tomato sauce",
  "fresh parsley": "parsley",
  "fresh cilantro": "cilantro",
  "fresh coriander": "cilantro",
  coriander: "coriander",
  yogurt: "greek yogurt",
  "plain yogurt": "greek yogurt",
  yogurts: "greek yogurt",
  "coconut beverage": "coconut milk",
  "coconut drink": "coconut milk",
  "milk coconut": "coconut milk",
  "oat beverage": "oat milk",
  "almond beverage": "almond milk",
  beefs: "beef",
  "beef meat": "beef",
  "chopped meat": "ground meat",
  "chopped beef": "ground beef",
  chicken: "chicken",
  "chicken breasts": "chicken breast",
  "chicken thighs": "chicken",
  "chicken pieces": "chicken",
  "chicken piece": "chicken",
  "chicken strips": "chicken",
  "shredded chicken": "chicken",
  "cooked chicken pieces": "chicken",
  "cooked shredded chicken": "chicken",
  "white onion": "onion",
  "yellow onions": "onion",
  onions: "onion",
  "red bell pepper": "bell pepper",
  "yellow bell pepper": "bell pepper",
  "green bell pepper": "bell pepper",
  "orange bell pepper": "bell pepper",
  "bell peppers": "bell pepper",
  "carne asada steak": "beef",
  "grilled carne asada steak": "beef",
  "shredded beef": "beef",
  "corn tortillas": "corn tortilla",
  "flour tortillas": "flour tortilla",
  eggs: "egg",
  lambs: "lamb",
  "lamb meat": "lamb",
  meats: "meat",
  prawns: "shrimp",
  shrimps: "shrimp",
  "white fish": "fish"
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
    : "Examples: rice 2 cups, tomato 4 whole/items, chicken breast 1 kg";
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

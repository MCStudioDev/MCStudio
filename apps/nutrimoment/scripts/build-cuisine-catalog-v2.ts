import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ASIAN_DISHES,
  EGYPTIAN_DISHES,
  ITALIAN_DISHES,
  MEXICAN_DISHES,
  MIDDLE_EASTERN_DISHES,
  TURKISH_DISHES
} from "../src/lib/cuisineCatalogs/detailedCuisineCatalogs";
import {
  ASIAN_EXPANSION,
  EGYPTIAN_EXPANSION,
  ITALIAN_EXPANSION,
  MEXICAN_EXPANSION,
  MIDDLE_EASTERN_EXPANSION,
  TURKISH_EXPANSION
} from "../src/lib/cuisineCatalogs/cuisineExpansions";
import {
  AMERICAN_DISHES,
  INDIAN_DISHES,
  LIVER_SPECIALTY_DISHES,
  MEDITERRANEAN_DISHES,
  THAI_DISHES
} from "../src/lib/cuisineCatalogs/appCuisineSupplements";
import type {
  CatalogConfidence,
  CuisineCatalogV2Entry,
  CuisineCatalogV2File,
  CuisineCatalogV2Manifest,
  CuisineDish,
  CuisineKey
} from "../src/lib/cuisineCatalogs/types";

const OUT_DIR = path.join(process.cwd(), "src", "data", "cuisineCatalogV2");
const GENERATED_AT = process.env.CATALOG_V2_GENERATED_AT ?? "2026-05-05T00:00:00.000Z";

const NATIVE_NAME_OVERRIDES: Record<string, string[]> = {
  "alexandrian-liver": ["كبدة إسكندراني"],
  bamia: ["بامية"],
  basbousa: ["بسبوسة"],
  besara: ["بصارة"],
  "chicken-fattah": ["فتة دجاج"],
  "egyptian-liver-sandwiches": ["سندوتشات كبدة إسكندراني"],
  fattah: ["فتة"],
  "feteer-meshaltet": ["فطير مشلتت"],
  "ful-medames": ["فول مدمس"],
  hawawshi: ["حواوشي"],
  "kofta-kebab": ["كفتة مشوية"],
  "koftet-roz": ["كفتة رز"],
  koshary: ["كشري"],
  "macarona-bechamel": ["مكرونة بشاميل"],
  "mahshi-filfil": ["محشي فلفل"],
  "mahshi-kromb": ["محشي كرنب"],
  "molokhia-rabbit": ["ملوخية بالأرانب"],
  "roz-meammar": ["أرز معمر"],
  sayadeya: ["صيادية"],
  taameya: ["طعمية"],
  "taagen-kofta": ["طاجن كفتة"],
  "waraq-enab": ["ورق عنب"]
};

const EGYPTIAN_SUPPLEMENT: readonly CuisineDish[] = [
  egyptianDish("roz-bel-shaareya", ["Roz Bel Shaareya", "Egyptian Vermicelli Rice"], ["أرز بالشعرية"], "Egypt", "Rice cooked with toasted vermicelli", ["rice", "vermicelli", "butter"], ["stock", "salt"], ["lunch", "dinner"], 84),
  egyptianDish("fatta-kaware", ["Fatta Kaware"], ["فتة كوارع"], "Egypt", "Fattah served with slow-cooked trotters and garlic vinegar sauce", ["bread", "rice", "meat feet"], ["garlic", "vinegar", "tomato"], ["lunch", "dinner"], 82),
  egyptianDish("kaware-soup", ["Kaware Soup"], ["شوربة كوارع"], "Egypt", "Slow-simmered trotters soup with aromatics", ["meat feet", "onion", "garlic"], ["lemon", "rice"], ["lunch", "dinner", "soup"], 76),
  egyptianDish("torly-bel-lahma", ["Torly Bel Lahma"], ["تورلي باللحمة"], "Egypt", "Mixed vegetable stew with meat", ["meat", "potato", "eggplant"], ["zucchini", "tomato", "onion"], ["lunch", "dinner"], 78),
  egyptianDish("egyptian-shakshuka", ["Egyptian Shakshuka"], ["شكشوكة مصرية"], "Egypt", "Eggs cooked in tomato and pepper sauce", ["egg", "tomato", "pepper"], ["onion", "garlic"], ["breakfast", "lunch"], 84),
  egyptianDish("batates-mahshi", ["Batates Mahshi", "Stuffed Potatoes"], ["بطاطس محشية"], "Egypt", "Potatoes stuffed with spiced minced meat", ["potato", "ground meat", "tomato"], ["onion", "garlic"], ["lunch", "dinner"], 76),
  egyptianDish("sabanekh-bel-lahma", ["Sabanekh Bel Lahma"], ["سبانخ باللحمة"], "Egypt", "Spinach stew with meat and tomato", ["spinach", "meat", "tomato"], ["garlic", "onion", "rice"], ["lunch", "dinner"], 78),
  egyptianDish("qolqas", ["Qolqas", "Egyptian Taro Stew"], ["قلقاس"], "Egypt", "Taro stew with garlic and coriander greens", ["taro", "garlic", "coriander"], ["meat", "rice"], ["lunch", "dinner"], 78),
  egyptianDish("molokhia-chicken", ["Chicken Molokhia"], ["ملوخية بالدجاج"], "Egypt", "Molokhia soup served with chicken", ["molokhia", "chicken", "garlic"], ["rice", "coriander"], ["lunch", "dinner"], 88),
  egyptianDish("molokhia-beef", ["Beef Molokhia"], ["ملوخية باللحمة"], "Egypt", "Molokhia soup served with beef or meat broth", ["molokhia", "meat", "garlic"], ["rice", "coriander"], ["lunch", "dinner"], 86),
  egyptianDish("taagen-bamia-bel-lahma", ["Taagen Bamia Bel Lahma"], ["طاجن بامية باللحمة"], "Egypt", "Okra tagine with meat and tomato sauce", ["okra", "meat", "tomato"], ["garlic", "onion"], ["lunch", "dinner"], 80),
  egyptianDish("feteer-cheese", ["Feteer With Cheese"], ["فطير بالجبنة"], "Egypt", "Layered Egyptian pastry filled with cheese", ["flour", "butter", "cheese"], ["milk", "egg"], ["breakfast", "snack"], 78),
  egyptianDish("feteer-honey", ["Feteer With Honey"], ["فطير بالعسل"], "Egypt", "Layered Egyptian pastry served with honey", ["flour", "butter", "honey"], ["cream", "milk"], ["breakfast", "dessert", "snack"], 78),
  egyptianDish("sogo-iskandarani", ["Sogo Iskandarani", "Alexandrian Sausage"], ["سجق إسكندراني"], "Alexandria", "Sausage cooked with peppers, tomato, and spices", ["sausage", "pepper", "tomato"], ["onion", "garlic"], ["lunch", "dinner", "street_food"], 82),
  egyptianDish("sogo-bel-bayd", ["Sogo Bel Bayd", "Sausage and Eggs"], ["سجق بالبيض"], "Egypt", "Eggs cooked with spiced sausage", ["sausage", "egg", "pepper"], ["tomato", "onion"], ["breakfast", "lunch"], 76),
  egyptianDish("hawawshi-iskandarani", ["Alexandrian Hawawshi"], ["حواوشي إسكندراني"], "Alexandria", "Alexandrian-style spiced meat baked in dough", ["ground meat", "dough", "onion"], ["pepper", "tomato", "herbs"], ["lunch", "dinner", "street_food"], 88),
  egyptianDish("hawawshi-baladi", ["Baladi Hawawshi"], ["حواوشي بلدي"], "Egypt", "Spiced minced meat baked inside baladi bread", ["ground meat", "baladi bread", "onion"], ["pepper", "tomato"], ["lunch", "dinner", "street_food"], 88),
  egyptianDish("daoud-basha", ["Daoud Basha"], ["داود باشا"], "Egypt", "Meatballs cooked in tomato sauce", ["ground meat", "tomato", "onion"], ["rice", "pine nuts"], ["lunch", "dinner"], 78),
  egyptianDish("macarona-salsa", ["Macarona Salsa", "Egyptian Tomato Pasta"], ["مكرونة بالصلصة"], "Egypt", "Egyptian pasta with tomato sauce", ["pasta", "tomato", "garlic"], ["onion", "ground meat"], ["lunch", "dinner"], 78),
  egyptianDish("macarona-bechamel-chicken", ["Chicken Macarona Bechamel"], ["مكرونة بشاميل بالفراخ"], "Egypt", "Egyptian bechamel pasta with chicken", ["pasta", "chicken", "milk"], ["flour", "butter", "cheese"], ["lunch", "dinner"], 80),
  egyptianDish("mesaqaa", ["Mesaqaa", "Egyptian Moussaka"], ["مسقعة"], "Egypt", "Fried eggplant cooked with tomato and pepper sauce", ["eggplant", "tomato", "pepper"], ["ground meat", "garlic"], ["lunch", "dinner"], 82),
  egyptianDish("ful-bel-bayd", ["Ful Bel Bayd", "Ful With Eggs"], ["فول بالبيض"], "Egypt", "Ful medames topped or cooked with eggs", ["fava bean", "egg", "cumin"], ["lemon", "olive oil"], ["breakfast", "lunch"], 82),
  egyptianDish("ful-bel-tahina", ["Ful Bel Tahina", "Ful With Tahini"], ["فول بالطحينة"], "Egypt", "Ful medames mixed with tahini and lemon", ["fava bean", "tahini", "lemon"], ["cumin", "garlic"], ["breakfast", "lunch"], 80),
  egyptianDish("taameya-sandwich", ["Taameya Sandwich"], ["ساندوتش طعمية"], "Egypt", "Egyptian falafel sandwich in baladi bread", ["taameya", "bread", "salad"], ["tahini", "pickles"], ["breakfast", "street_food", "snack"], 82),
  egyptianDish("kishk", ["Kishk"], ["كشك"], "Egypt", "Yogurt and flour porridge or soup with fried onions", ["yogurt", "flour", "onion"], ["chicken", "rice"], ["lunch", "soup"], 76),
  egyptianDish("konafa", ["Konafa"], ["كنافة"], "Egypt", "Shredded pastry dessert with syrup", ["konafa pastry", "butter", "syrup"], ["cream", "nuts"], ["dessert"], 88),
  egyptianDish("balah-el-sham", ["Balah El Sham"], ["بلح الشام"], "Egypt", "Fried choux pastry soaked in syrup", ["flour", "egg", "syrup"], ["vanilla", "oil"], ["dessert"], 82),
  egyptianDish("semolina-basbousa", ["Semolina Basbousa"], ["بسبوسة بالسميد"], "Egypt", "Semolina cake soaked in syrup", ["semolina", "yogurt", "syrup"], ["coconut", "almond"], ["dessert"], 84),
  egyptianDish("rice-kofta-tomato-sauce", ["Rice Kofta in Tomato Sauce"], ["كفتة رز بالصلصة"], "Egypt", "Rice kofta simmered in tomato sauce", ["ground meat", "rice", "tomato"], ["herbs", "garlic", "onion"], ["lunch", "dinner"], 82)
];

function egyptianDish(
  id: string,
  english: string[],
  native: string[],
  region: string,
  description: string,
  primaryIngredients: string[],
  optionalIngredients: string[],
  mealTypes: CuisineDish["mealTypes"],
  iconicScore: number
): CuisineDish {
  return {
    cuisine: "egyptian",
    description,
    iconicScore,
    id,
    mealTypes,
    names: { english, native },
    optionalIngredients,
    primaryIngredients,
    region
  };
}

const SOURCE_CATALOGS: Record<CuisineKey, readonly CuisineDish[]> = {
  american: [...AMERICAN_DISHES, ...getSupplementDishes("american")],
  asian: [...ASIAN_DISHES, ...ASIAN_EXPANSION],
  egyptian: [...EGYPTIAN_DISHES, ...EGYPTIAN_EXPANSION, ...EGYPTIAN_SUPPLEMENT],
  indian: [...INDIAN_DISHES, ...getSupplementDishes("indian")],
  italian: [...ITALIAN_DISHES, ...ITALIAN_EXPANSION, ...getSupplementDishes("italian")],
  mediterranean: [...MEDITERRANEAN_DISHES, ...getSupplementDishes("mediterranean")],
  mexican: [...MEXICAN_DISHES, ...MEXICAN_EXPANSION, ...getSupplementDishes("mexican")],
  middleEastern: [...MIDDLE_EASTERN_DISHES, ...MIDDLE_EASTERN_EXPANSION, ...getSupplementDishes("middleEastern")],
  thai: THAI_DISHES,
  turkish: [...TURKISH_DISHES, ...TURKISH_EXPANSION, ...getSupplementDishes("turkish")]
};

function getSupplementDishes(cuisine: CuisineKey) {
  return LIVER_SPECIALTY_DISHES.filter((dish) => dish.cuisine === cuisine);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const manifest: CuisineCatalogV2Manifest = {
    cuisines: {
      american: "american.json",
      asian: "asian.json",
      egyptian: "egyptian.json",
      indian: "indian.json",
      italian: "italian.json",
      mediterranean: "mediterranean.json",
      mexican: "mexican.json",
      middleEastern: "middleEastern.json",
      thai: "thai.json",
      turkish: "turkish.json"
    },
    generatedAt: GENERATED_AT,
    version: 2
  };

  for (const [cuisine, dishes] of Object.entries(SOURCE_CATALOGS) as Array<[CuisineKey, readonly CuisineDish[]]>) {
    const entries = buildEntries(dishes);
    const file: CuisineCatalogV2File = {
      cuisine,
      entries,
      generatedAt: GENERATED_AT,
      source: "completeCatalogs.ts",
      version: 2
    };
    validateCatalogFile(file);
    await writeJson(path.join(OUT_DIR, `${cuisine}.json`), file);
  }

  await writeJson(path.join(OUT_DIR, "manifest.json"), manifest);
  console.log(`Built cuisine catalog v2: ${Object.keys(SOURCE_CATALOGS).join(", ")}`);
}

function buildEntries(dishes: readonly CuisineDish[]): CuisineCatalogV2Entry[] {
  const seenIds = new Set<string>();
  const entries: CuisineCatalogV2Entry[] = [];

  for (const dish of dishes) {
    if (seenIds.has(dish.id)) continue;
    seenIds.add(dish.id);
    const names = {
      english: normalizeStringArray(dish.names.english),
      native: getCleanNativeNames(dish),
      ...(dish.names.other?.length ? { other: normalizeStringArray(dish.names.other) } : {})
    };
    const confidence = getDishConfidence(dish, names.native);

    entries.push({
      authenticity: {
        confidence,
        hardGate: confidence === "high"
      },
      cuisine: dish.cuisine,
      description: dish.description,
      id: dish.id,
      ingredients: {
        optional: normalizeStringArray(dish.optionalIngredients),
        required: normalizeStringArray(dish.primaryIngredients)
      },
      kind: "canonical",
      mealTypes: dish.mealTypes,
      names,
      region: dish.region,
      score: dish.iconicScore,
      subCuisine: dish.subCuisine
    });
  }

  return entries;
}

function getDishConfidence(dish: CuisineDish, nativeNames: string[]): CatalogConfidence {
  if (dish.iconicScore >= 82 && dish.primaryIngredients.length >= 2 && dish.names.english.length && nativeNames.length) {
    return "high";
  }
  if (dish.iconicScore >= 65 && dish.primaryIngredients.length >= 1 && dish.names.english.length) {
    return "medium";
  }
  return "low";
}

function getCleanNativeNames(dish: CuisineDish) {
  const overrides = NATIVE_NAME_OVERRIDES[dish.id];
  if (overrides?.length) return overrides;
  return normalizeStringArray(dish.names.native).filter((name) => !isMojibake(name));
}

function isMojibake(value: string) {
  return /[ØÙÃÄÅ]/.test(value);
}

function validateCatalogFile(file: CuisineCatalogV2File) {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const entry of file.entries) {
    if (seenIds.has(entry.id)) {
      errors.push(`Duplicate dish id: ${entry.id}`);
    }
    seenIds.add(entry.id);

    if (!entry.names.english.length) errors.push(`${entry.id}: missing English name`);
    if (entry.authenticity.confidence === "high" && !entry.names.native.length) {
      errors.push(`${entry.id}: high-confidence dish needs native names`);
    }
    if (!entry.ingredients.required.length) errors.push(`${entry.id}: missing required ingredients`);
    if (entry.score < 1 || entry.score > 100) errors.push(`${entry.id}: score must be 1-100`);
    if (entry.kind === "variant" && !entry.parentId) errors.push(`${entry.id}: variant missing parentId`);
  }

  if (errors.length) {
    throw new Error(`Catalog v2 validation failed:\n${errors.join("\n")}`);
  }
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeStringArray(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

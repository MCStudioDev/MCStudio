export interface FoodDictionaryIngredient {
  id: string;
  canonicalEnglishName: string;
  canonicalArabicName: string;
  aliases: string[];
  synonyms: string[];
  pluralForms: string[];
  ocrMistakes: string[];
  spellingMistakes: string[];
  category?: string;
  cookingVerbs?: string[];
  cuisineVocabulary?: string[];
  dishNames?: string[];
  kitchenTools?: string[];
  units?: string[];
}

export interface FoodDictionaryTerm {
  en: string;
  ar: string;
  aliases?: string[];
}

export interface FoodDictionary {
  cuisines: FoodDictionaryTerm[];
  cookingVerbs: FoodDictionaryTerm[];
  dishNames: FoodDictionaryTerm[];
  ingredients: FoodDictionaryIngredient[];
  kitchenTools: FoodDictionaryTerm[];
  placeholderPalettes: Record<string, [number, number, number]>;
  units: FoodDictionaryTerm[];
}

export const FOOD_DICTIONARY: FoodDictionary = {
  cuisines: [
    { en: "American", ar: "\u0623\u0645\u0631\u064a\u0643\u064a" },
    { en: "Asian", ar: "\u0622\u0633\u064a\u0648\u064a" },
    { en: "Egyptian", ar: "\u0645\u0635\u0631\u064a" },
    { en: "Greek", ar: "\u064a\u0648\u0646\u0627\u0646\u064a" },
    { en: "Indian", ar: "\u0647\u0646\u062f\u064a" },
    { en: "Italian", ar: "\u0625\u064a\u0637\u0627\u0644\u064a", aliases: ["Italian-American"] },
    { en: "Mediterranean", ar: "\u0645\u062a\u0648\u0633\u0637\u064a" },
    { en: "Mexican", ar: "\u0645\u0643\u0633\u064a\u0643\u064a" },
    { en: "Middle Eastern", ar: "\u0634\u0631\u0642 \u0623\u0648\u0633\u0637\u064a" },
    { en: "Thai", ar: "\u062a\u0627\u064a\u0644\u0646\u062f\u064a" },
    { en: "Turkish", ar: "\u062a\u0631\u0643\u064a" },
    { en: "Global", ar: "\u0639\u0627\u0644\u0645\u064a", aliases: ["Unknown"] }
  ],
  cookingVerbs: [
    { en: "bake", ar: "\u0627\u062e\u0628\u0632", aliases: ["baked", "oven bake"] },
    { en: "boil", ar: "\u0627\u0633\u0644\u0642", aliases: ["boiled"] },
    { en: "braise", ar: "\u0627\u0637\u0647 \u0628\u0628\u0637\u0621", aliases: ["braised"] },
    { en: "brown", ar: "\u062d\u0645\u0631" },
    { en: "fry", ar: "\u0627\u0642\u0644", aliases: ["fried"] },
    { en: "grill", ar: "\u0627\u0634\u0648", aliases: ["grilled"] },
    { en: "roast", ar: "\u0627\u0634\u0648", aliases: ["roasted"] },
    { en: "saute", ar: "\u0634\u0648\u062d", aliases: ["sauté", "sautéed", "sauteed"] },
    { en: "simmer", ar: "\u0627\u0637\u0647 \u0639\u0644\u0649 \u0646\u0627\u0631 \u0647\u0627\u062f\u0626\u0629" },
    { en: "stir fry", ar: "\u0634\u0648\u062d \u0633\u0631\u064a\u0639\u0627", aliases: ["stir-fry"] }
  ],
  dishNames: [
    { en: "Chicken Cacciatore", ar: "\u062f\u062c\u0627\u062c \u0643\u0627\u062a\u0634\u0627\u062a\u0648\u0631\u064a \u0628\u0635\u0648\u0635 \u0627\u0644\u0637\u0645\u0627\u0637\u0645" },
    { en: "Chicken Parmesan", ar: "\u062f\u062c\u0627\u062c \u0628\u0635\u0644\u0635\u0629 \u0627\u0644\u0637\u0645\u0627\u0637\u0645 \u0648\u0627\u0644\u0628\u0627\u0631\u0645\u064a\u0632\u0627\u0646" },
    { en: "Chicken Shawarma", ar: "\u0634\u0627\u0648\u0631\u0645\u0627 \u062f\u062c\u0627\u062c" },
    { en: "Egyptian Hawawshi", ar: "\u062d\u0648\u0627\u0648\u0634\u064a \u0645\u0635\u0631\u064a", aliases: ["Hawawshi"] },
    { en: "Kofta", ar: "\u0643\u0641\u062a\u0629", aliases: ["Kofte", "Kafta"] },
    { en: "Macarona Bechamel", ar: "\u0645\u0643\u0631\u0648\u0646\u0629 \u0628\u0634\u0627\u0645\u064a\u0644" },
    { en: "Pad Krapow Gai", ar: "\u062f\u062c\u0627\u062c \u0628\u0627\u0644\u0631\u064a\u062d\u0627\u0646 \u0627\u0644\u062a\u0627\u064a\u0644\u0646\u062f\u064a" },
    { en: "Shakshuka", ar: "\u0634\u0643\u0634\u0648\u0643\u0629" },
    { en: "Tavuk Sote", ar: "\u062a\u0627\u0641\u0648\u0643 \u0633\u0648\u062a\u064a\u0647" },
    { en: "Teriyaki Chicken", ar: "\u062f\u062c\u0627\u062c \u062a\u0631\u064a\u0627\u0643\u064a" }
  ],
  ingredients: [
    {
      id: "ground_beef",
      canonicalEnglishName: "ground beef",
      canonicalArabicName: "\u0644\u062d\u0645 \u0628\u0642\u0631\u064a \u0645\u0641\u0631\u0648\u0645",
      category: "protein",
      aliases: [
        "ground beef",
        "ground meat",
        "ground chuck",
        "ground round",
        "hamburger",
        "hamburger meat",
        "minced beef",
        "beef mince",
        "lean beef",
        "lean ground beef",
        "extra lean beef",
        "extra lean ground beef",
        "ground sirloin",
        "minced meat",
        "\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645",
        "\u0644\u062d\u0645\u0629 \u0645\u0641\u0631\u0648\u0645\u0629",
        "\u0644\u062d\u0645\u0647 \u0645\u0641\u0631\u0648\u0645\u0647",
        "\u0644\u062d\u0645 \u0628\u0642\u0631\u064a \u0645\u0641\u0631\u0648\u0645"
      ],
      synonyms: [],
      pluralForms: ["hamburgers"],
      ocrMistakes: ["ground beel", "gr0und beef", "ground be ef"],
      spellingMistakes: ["groud beef", "groundbeef", "mince beef", "minced beaf"],
      cookingVerbs: ["brown", "saute", "grill", "bake", "simmer"],
      dishNames: ["hawawshi", "kofta", "kofte", "keema", "meatballs", "lahmacun"],
      units: ["lb", "g", "serving"]
    },
    {
      id: "chicken",
      canonicalEnglishName: "chicken",
      canonicalArabicName: "\u062f\u062c\u0627\u062c",
      category: "protein",
      aliases: ["chicken", "chicken breast", "chicken breasts", "boneless chicken", "skinless chicken", "chicken thigh", "chicken thighs", "\u062f\u062c\u0627\u062c", "\u0641\u0631\u0627\u062e", "\u0635\u062f\u0631 \u062f\u062c\u0627\u062c", "\u0635\u062f\u0648\u0631 \u062f\u062c\u0627\u062c"],
      synonyms: [],
      pluralForms: ["chickens"],
      ocrMistakes: ["ch1cken"],
      spellingMistakes: ["chiken", "chikcen", "chciken", "cheicken"],
      cookingVerbs: ["grill", "bake", "roast", "saute", "fry", "simmer"],
      dishNames: ["chicken parmesan", "chicken cacciatore", "chicken shawarma", "teriyaki chicken", "tavuk sote"],
      units: ["breasts", "thighs", "lb", "g", "serving"]
    },
    {
      id: "beef",
      canonicalEnglishName: "beef",
      canonicalArabicName: "\u0644\u062d\u0645 \u0628\u0642\u0631\u064a",
      category: "protein",
      aliases: ["beef", "meat", "beef cubes", "beef chunks", "stew beef", "beef strips", "chuck", "round", "sirloin", "\u0644\u062d\u0645", "\u0644\u062d\u0645\u0629", "\u0644\u062d\u0645\u0647", "\u0644\u062d\u0645 \u0628\u0642\u0631\u064a"],
      synonyms: [],
      pluralForms: ["beefs"],
      ocrMistakes: [],
      spellingMistakes: ["beeef", "beaf"],
      cookingVerbs: ["sear", "braise", "stew", "grill", "roast", "stir fry"],
      dishNames: ["beef stew", "mongolian beef", "beef stroganoff", "pepper steak"],
      units: ["lb", "g", "serving"]
    },
    {
      id: "rice",
      canonicalEnglishName: "rice",
      canonicalArabicName: "\u0623\u0631\u0632",
      category: "grain",
      aliases: ["rice", "white rice", "brown rice", "basmati rice", "jasmine rice", "\u0623\u0631\u0632", "\u0627\u0631\u0632", "\u0631\u0632"],
      synonyms: [],
      pluralForms: [],
      ocrMistakes: ["rlce"],
      spellingMistakes: ["riice", "rise"],
      cookingVerbs: ["boil", "steam", "simmer", "bake"],
      dishNames: ["fried rice", "rice pilaf", "koshary", "biryani", "sayadeya"],
      units: ["cup", "g"]
    },
    {
      id: "egg",
      canonicalEnglishName: "egg",
      canonicalArabicName: "\u0628\u064a\u0636",
      category: "protein",
      aliases: ["egg", "eggs", "\u0628\u064a\u0636", "\u0628\u064a\u0636\u0629"],
      synonyms: [],
      pluralForms: ["eggs"],
      ocrMistakes: [],
      spellingMistakes: ["eg"],
      cookingVerbs: ["fry", "scramble", "poach", "bake", "boil"],
      dishNames: ["shakshuka", "omelette", "eggah", "menemen"],
      units: ["eggs", "piece"]
    },
    {
      id: "tomato",
      canonicalEnglishName: "tomato",
      canonicalArabicName: "\u0637\u0645\u0627\u0637\u0645",
      category: "vegetable",
      aliases: ["tomato", "tomatoes", "fresh tomato", "canned tomatoes", "tinned tomatoes", "tomato sauce", "\u0637\u0645\u0627\u0637\u0645", "\u0628\u0646\u062f\u0648\u0631\u0629"],
      synonyms: [],
      pluralForms: ["tomatoes"],
      ocrMistakes: ["tornato"],
      spellingMistakes: ["tomatos", "tamato"],
      cookingVerbs: ["simmer", "roast", "stew", "saute"],
      dishNames: ["pomodoro", "cacciatore", "shakshuka", "fasolia"],
      units: ["cup", "whole", "can"]
    },
    {
      id: "potato",
      canonicalEnglishName: "potato",
      canonicalArabicName: "\u0628\u0637\u0627\u0637\u0633",
      category: "starch",
      aliases: ["potato", "potatoes", "white potato", "baking potato", "\u0628\u0637\u0627\u0637\u0633", "\u0628\u0637\u0627\u0637\u0627"],
      synonyms: [],
      pluralForms: ["potatoes"],
      ocrMistakes: [],
      spellingMistakes: ["potatos", "paotatos"],
      cookingVerbs: ["roast", "boil", "fry", "mash", "bake"],
      dishNames: ["hash", "potato tray", "roasted potatoes"],
      units: ["whole", "cup", "g"]
    },
    {
      id: "onion",
      canonicalEnglishName: "onion",
      canonicalArabicName: "\u0628\u0635\u0644",
      category: "vegetable",
      aliases: ["onion", "onions", "yellow onion", "white onion", "red onion", "shallot", "\u0628\u0635\u0644"],
      synonyms: [],
      pluralForms: ["onions"],
      ocrMistakes: [],
      spellingMistakes: ["onoin", "oinon"],
      cookingVerbs: ["saute", "caramelize", "fry", "simmer"],
      dishNames: ["onion gravy", "fried onion garnish"],
      units: ["whole", "cup"]
    },
    {
      id: "bell_pepper",
      canonicalEnglishName: "bell pepper",
      canonicalArabicName: "\u0641\u0644\u0641\u0644 \u0631\u0648\u0645\u064a",
      category: "vegetable",
      aliases: ["bell pepper", "bell peppers", "capsicum", "sweet pepper", "green pepper", "red pepper", "yellow pepper", "\u0641\u0644\u0641\u0644", "\u0641\u0644\u0641\u0644 \u0631\u0648\u0645\u064a"],
      synonyms: [],
      pluralForms: ["peppers", "bell peppers"],
      ocrMistakes: ["bell pepoer"],
      spellingMistakes: ["bell peper", "capsicm"],
      cookingVerbs: ["saute", "roast", "stuff", "grill"],
      dishNames: ["stuffed peppers", "fajitas", "pepper steak"],
      units: ["whole", "cup"]
    }
  ],
  kitchenTools: [
    { en: "baking dish", ar: "\u0635\u064a\u0646\u064a\u0629 \u062e\u0628\u0632", aliases: ["oven dish"] },
    { en: "grill pan", ar: "\u0645\u0642\u0644\u0627\u0629 \u0634\u0648\u064a" },
    { en: "pot", ar: "\u0642\u062f\u0631" },
    { en: "sheet pan", ar: "\u0635\u064a\u0646\u064a\u0629 \u0641\u0631\u0646" },
    { en: "skillet", ar: "\u0645\u0642\u0644\u0627\u0629" }
  ],
  placeholderPalettes: {
    american: [188, 22, 270],
    asian: [32, 192, 276],
    egyptian: [168, 42, 205],
    global: [188, 22, 270],
    greek: [146, 8, 214],
    indian: [32, 192, 276],
    italian: [146, 8, 214],
    mediterranean: [168, 42, 205],
    mexican: [22, 150, 205],
    middle_eastern: [168, 42, 205],
    thai: [32, 192, 276],
    turkish: [168, 42, 205]
  },
  units: [
    { en: "breasts", ar: "\u0635\u062f\u0648\u0631", aliases: ["breast"] },
    { en: "can", ar: "\u0639\u0644\u0628\u0629", aliases: ["cans"] },
    { en: "cup", ar: "\u0643\u0648\u0628", aliases: ["cups"] },
    { en: "eggs", ar: "\u0628\u064a\u0636\u0627\u062a", aliases: ["egg"] },
    { en: "g", ar: "\u062c\u0631\u0627\u0645", aliases: ["gram", "grams"] },
    { en: "lb", ar: "\u0631\u0637\u0644", aliases: ["pound", "pounds"] },
    { en: "piece", ar: "\u0642\u0637\u0639\u0629", aliases: ["pieces"] },
    { en: "serving", ar: "\u062d\u0635\u0629", aliases: ["servings"] },
    { en: "tbsp", ar: "\u0645\u0644\u0639\u0642\u0629 \u0643\u0628\u064a\u0631\u0629", aliases: ["tablespoon", "tablespoons"] },
    { en: "tsp", ar: "\u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629", aliases: ["teaspoon", "teaspoons"] },
    { en: "whole", ar: "\u062d\u0628\u0629" }
  ]
};

export function getFoodDictionaryIngredient(id: string) {
  return FOOD_DICTIONARY.ingredients.find((ingredient) => ingredient.id === id) ?? null;
}

export function getCuisinePlaceholderPalette(cuisine: string | undefined): [number, number, number] | null {
  const key = toDictionaryKey(cuisine ?? "");
  return FOOD_DICTIONARY.placeholderPalettes[key] ?? null;
}

export function buildFoodDictionaryLocalizationLookups() {
  const englishToArabic: Record<string, string> = {};
  const arabicToEnglish: Record<string, string> = {};
  const add = (en: string, ar: string, aliases: string[] = []) => {
    const cleanEn = en.trim();
    const cleanAr = ar.trim();
    if (!cleanEn || !cleanAr) return;
    englishToArabic[normalizeDictionaryLookupKey(cleanEn)] = cleanAr;
    arabicToEnglish[normalizeDictionaryLookupKey(cleanAr)] = cleanEn;
    aliases.forEach((alias) => {
      const cleanAlias = alias.trim();
      if (!cleanAlias) return;
      if (/[\u0600-\u06ff]/u.test(cleanAlias)) {
        arabicToEnglish[normalizeDictionaryLookupKey(cleanAlias)] = cleanEn;
      } else {
        englishToArabic[normalizeDictionaryLookupKey(cleanAlias)] = cleanAr;
      }
    });
  };

  FOOD_DICTIONARY.ingredients.forEach((ingredient) => {
    add(ingredient.canonicalEnglishName, ingredient.canonicalArabicName, [
      ...ingredient.aliases,
      ...ingredient.synonyms,
      ...ingredient.pluralForms,
      ...ingredient.ocrMistakes,
      ...ingredient.spellingMistakes
    ]);
  });
  [
    ...FOOD_DICTIONARY.cuisines,
    ...FOOD_DICTIONARY.cookingVerbs,
    ...FOOD_DICTIONARY.dishNames,
    ...FOOD_DICTIONARY.kitchenTools,
    ...FOOD_DICTIONARY.units
  ].forEach((term) => add(term.en, term.ar, term.aliases));

  return { arabicToEnglish, englishToArabic };
}

export function getDictionaryDishFamiliesForIngredientIds(ids: string[]) {
  const families = ids.flatMap((id) => getFoodDictionaryIngredient(id)?.dishNames ?? []);
  return Array.from(new Set(families.map((family) => family.trim()).filter(Boolean)));
}

export function normalizeDictionaryLookupKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDictionaryKey(value: string) {
  return normalizeDictionaryLookupKey(value).replace(/\s+/g, "_");
}

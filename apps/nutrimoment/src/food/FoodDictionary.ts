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
    { en: "chop", ar: "\u0641\u0631\u0645", aliases: ["chopped"] },
    { en: "dice", ar: "\u0642\u0637\u0639 \u0645\u0643\u0639\u0628\u0627\u062a", aliases: ["diced"] },
    { en: "fold", ar: "\u0642\u0644\u0628 \u0628\u0631\u0641\u0642", aliases: ["folded"] },
    { en: "fry", ar: "\u0627\u0642\u0644", aliases: ["fried"] },
    { en: "grill", ar: "\u0627\u0634\u0648", aliases: ["grilled"] },
    { en: "marinate", ar: "\u062a\u0628\u0644", aliases: ["marinated"] },
    { en: "mince", ar: "\u0627\u0641\u0631\u0645 \u0646\u0627\u0639\u0645\u0627", aliases: ["minced"] },
    { en: "roast", ar: "\u0627\u0634\u0648", aliases: ["roasted"] },
    { en: "saute", ar: "\u0634\u0648\u062d", aliases: ["sauté", "sautéed", "sauteed"] },
    { en: "simmer", ar: "\u0627\u0637\u0647 \u0639\u0644\u0649 \u0646\u0627\u0631 \u0647\u0627\u062f\u0626\u0629" },
    { en: "steam", ar: "\u0627\u0637\u0647 \u0639\u0644\u0649 \u0627\u0644\u0628\u062e\u0627\u0631", aliases: ["steamed"] },
    { en: "stir fry", ar: "\u0634\u0648\u062d \u0633\u0631\u064a\u0639\u0627", aliases: ["stir-fry"] },
    { en: "whisk", ar: "\u0627\u062e\u0641\u0642", aliases: ["whisked"] }
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
      aliases: ["beef", "meat", "steak", "beef steak", "beef cubes", "beef chunks", "stew beef", "beef strips", "chuck", "round", "sirloin", "\u0644\u062d\u0645", "\u0644\u062d\u0645\u0629", "\u0644\u062d\u0645\u0647", "\u0644\u062d\u0645 \u0628\u0642\u0631\u064a", "\u0633\u062a\u064a\u0643", "\u0627\u0633\u062a\u064a\u0643", "\u0644\u062d\u0645\u0629 \u0633\u062a\u064a\u0643", "\u0644\u062d\u0645\u0647 \u0633\u062a\u064a\u0643"],
      synonyms: [],
      pluralForms: ["beefs"],
      ocrMistakes: [],
      spellingMistakes: ["beeef", "beaf"],
      cookingVerbs: ["sear", "braise", "stew", "grill", "roast", "stir fry"],
      dishNames: ["beef stew", "mongolian beef", "beef stroganoff", "pepper steak"],
      units: ["lb", "g", "serving"]
    },
    {
      id: "liver",
      canonicalEnglishName: "liver",
      canonicalArabicName: "\u0643\u0628\u062f\u0629",
      category: "protein",
      aliases: ["liver", "beef liver", "chicken liver", "\u0643\u0628\u062f\u0629", "\u0643\u0628\u062f\u0647", "\u0643\u0628\u062f\u0629 \u062f\u062c\u0627\u062c", "\u0643\u0628\u062f\u0647 \u062f\u062c\u0627\u062c"],
      synonyms: [],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ["livr"],
      cookingVerbs: ["saute", "fry", "grill"],
      dishNames: ["alexandrian liver", "fried liver", "liver shawarma"],
      units: ["lb", "g", "serving"]
    },
    {
      id: "fish",
      canonicalEnglishName: "fish",
      canonicalArabicName: "\u0633\u0645\u0643",
      category: "protein",
      aliases: ["fish", "white fish", "fish fillet", "fish fillets", "tilapia", "cod", "sea bass", "\u0633\u0645\u0643", "\u0633\u0645\u0643\u0629", "\u0633\u0645\u0643 \u0641\u064a\u0644\u064a\u0647", "\u0627\u0633\u0645\u0627\u0643", "\u0623\u0633\u0645\u0627\u0643"],
      synonyms: ["seafood"],
      pluralForms: ["fishes"],
      ocrMistakes: [],
      spellingMistakes: ["fsh"],
      cookingVerbs: ["bake", "grill", "fry", "steam", "simmer"],
      dishNames: ["sayadeya", "fish curry", "fish tacos", "blackened fish"],
      units: ["fillet", "lb", "g", "serving"]
    },
    {
      id: "shrimp",
      canonicalEnglishName: "shrimp",
      canonicalArabicName: "\u062c\u0645\u0628\u0631\u064a",
      category: "protein",
      aliases: ["shrimp", "shrimps", "prawn", "prawns", "seafood", "\u062c\u0645\u0628\u0631\u064a", "\u062c\u0645\u0628\u0631\u0649", "\u0631\u0648\u0628\u064a\u0627\u0646", "\u0642\u0631\u064a\u062f\u0633", "\u0633\u064a \u0641\u0648\u062f"],
      synonyms: [],
      pluralForms: ["prawns"],
      ocrMistakes: [],
      spellingMistakes: ["shrip", "shimp"],
      cookingVerbs: ["saute", "grill", "fry", "boil", "simmer"],
      dishNames: ["shrimp scampi", "alexandrian shrimp", "shrimp fajitas", "shrimp curry"],
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
    },
    {
      id: "cheese",
      canonicalEnglishName: "cheese",
      canonicalArabicName: "\u062c\u0628\u0646\u0629",
      category: "dairy",
      aliases: ["cheese", "parmesan", "parmesan cheese", "mozzarella", "mozzarella cheese", "feta", "\u062c\u0628\u0646", "\u062c\u0628\u0646\u0629", "\u062c\u0628\u0646\u0647", "\u0645\u0648\u062a\u0632\u0627\u0631\u064a\u0644\u0627", "\u0628\u0627\u0631\u0645\u064a\u0632\u0627\u0646"],
      synonyms: [],
      pluralForms: ["cheeses"],
      ocrMistakes: [],
      spellingMistakes: ["chease"],
      cookingVerbs: ["bake", "melt", "top", "stuff"],
      dishNames: ["chicken parmesan", "baked feta", "pizza", "alfredo"],
      units: ["cup", "g", "serving"]
    },
    {
      id: "milk",
      canonicalEnglishName: "milk",
      canonicalArabicName: "\u0644\u0628\u0646",
      category: "dairy",
      aliases: ["milk", "whole milk", "skim milk", "low fat milk", "coconut milk", "oat milk", "almond milk", "\u0644\u0628\u0646", "\u062d\u0644\u064a\u0628", "\u0644\u0628\u0646 \u062d\u0644\u064a\u0628"],
      synonyms: [],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ["mlik"],
      cookingVerbs: ["simmer", "whisk", "bake"],
      dishNames: ["bechamel", "alfredo", "oatmeal"],
      units: ["cup", "ml"]
    },
    {
      id: "yogurt",
      canonicalEnglishName: "yogurt",
      canonicalArabicName: "\u0632\u0628\u0627\u062f\u064a",
      category: "dairy",
      aliases: ["yogurt", "plain yogurt", "greek yogurt", "yoghurt", "\u0632\u0628\u0627\u062f\u064a", "\u0632\u0628\u0627\u062f\u0649", "\u064a\u0648\u063a\u0631\u062a"],
      synonyms: [],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ["yougurt"],
      cookingVerbs: ["mix", "marinate", "top"],
      dishNames: ["yogurt bowl", "raita", "tzatziki", "fattah"],
      units: ["cup", "g", "serving"]
    },
    {
      id: "spinach",
      canonicalEnglishName: "spinach",
      canonicalArabicName: "\u0633\u0628\u0627\u0646\u062e",
      category: "vegetable",
      aliases: ["spinach", "baby spinach", "greens", "\u0633\u0628\u0627\u0646\u062e", "\u0633\u0628\u0627\u0646\u062e\u0629"],
      synonyms: ["greens"],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ["spinich"],
      cookingVerbs: ["saute", "wilt", "bake", "simmer"],
      dishNames: ["spinach pasta", "spinach chicken", "spanakopita"],
      units: ["cup", "g", "bunch"]
    },
    {
      id: "eggplant",
      canonicalEnglishName: "eggplant",
      canonicalArabicName: "\u0628\u0627\u0630\u0646\u062c\u0627\u0646",
      category: "vegetable",
      aliases: ["eggplant", "aubergine", "\u0628\u0627\u0630\u0646\u062c\u0627\u0646", "\u0628\u062a\u0646\u062c\u0627\u0646", "\u0628\u0627\u062a\u0646\u062c\u0627\u0646"],
      synonyms: [],
      pluralForms: ["eggplants"],
      ocrMistakes: [],
      spellingMistakes: ["egplant"],
      cookingVerbs: ["roast", "fry", "stuff", "bake", "simmer"],
      dishNames: ["moussaka", "baba ganoush", "imam bayildi"],
      units: ["whole", "cup", "g"]
    },
    {
      id: "carrot",
      canonicalEnglishName: "carrot",
      canonicalArabicName: "\u062c\u0632\u0631",
      category: "vegetable",
      aliases: ["carrot", "carrots", "\u062c\u0632\u0631", "\u062c\u0632\u0631\u0629"],
      synonyms: [],
      pluralForms: ["carrots"],
      ocrMistakes: [],
      spellingMistakes: ["carot"],
      cookingVerbs: ["roast", "boil", "saute", "simmer"],
      dishNames: ["vegetable soup", "stew", "roasted carrots"],
      units: ["whole", "cup", "g"]
    },
    {
      id: "peas",
      canonicalEnglishName: "peas",
      canonicalArabicName: "\u0628\u0633\u0644\u0629",
      category: "vegetable",
      aliases: ["peas", "green peas", "pea", "\u0628\u0633\u0644\u0629", "\u0628\u0633\u0644\u0647", "\u0628\u0627\u0632\u0644\u0627\u0621"],
      synonyms: [],
      pluralForms: ["peas"],
      ocrMistakes: [],
      spellingMistakes: ["pease"],
      cookingVerbs: ["boil", "simmer", "saute", "stew"],
      dishNames: ["peas and carrots", "keema matar", "vegetable stew"],
      units: ["cup", "g"]
    },
    {
      id: "lettuce",
      canonicalEnglishName: "lettuce",
      canonicalArabicName: "\u062e\u0633",
      category: "vegetable",
      aliases: ["lettuce", "romaine", "iceberg lettuce", "greens", "\u062e\u0633", "\u062e\u0633 \u0643\u0627\u0628\u0648\u062a\u0634\u0627"],
      synonyms: ["salad greens"],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ["letuce"],
      cookingVerbs: ["chop", "serve", "toss"],
      dishNames: ["salad", "lettuce cups", "tacos"],
      units: ["cup", "head", "leaf"]
    },
    {
      id: "cucumber",
      canonicalEnglishName: "cucumber",
      canonicalArabicName: "\u062e\u064a\u0627\u0631",
      category: "vegetable",
      aliases: ["cucumber", "cucumbers", "\u062e\u064a\u0627\u0631", "\u062e\u064a\u0627\u0631\u0629"],
      synonyms: [],
      pluralForms: ["cucumbers"],
      ocrMistakes: [],
      spellingMistakes: ["cumcumber"],
      cookingVerbs: ["chop", "slice", "toss"],
      dishNames: ["salad", "yogurt cucumber toast", "tzatziki"],
      units: ["whole", "cup", "g"]
    },
    {
      id: "zucchini",
      canonicalEnglishName: "zucchini",
      canonicalArabicName: "\u0643\u0648\u0633\u0629",
      category: "vegetable",
      aliases: ["zucchini", "courgette", "\u0643\u0648\u0633\u0629", "\u0643\u0648\u0633\u0627"],
      synonyms: [],
      pluralForms: ["zucchinis"],
      ocrMistakes: [],
      spellingMistakes: ["zuccini"],
      cookingVerbs: ["saute", "roast", "stuff", "bake"],
      dishNames: ["briam", "ratatouille", "stuffed zucchini"],
      units: ["whole", "cup", "g"]
    },
    {
      id: "lentils",
      canonicalEnglishName: "lentils",
      canonicalArabicName: "\u0639\u062f\u0633",
      category: "legume",
      aliases: ["lentil", "lentils", "red lentils", "brown lentils", "\u0639\u062f\u0633", "\u0639\u062f\u0633 \u0627\u0635\u0641\u0631", "\u0639\u062f\u0633 \u0623\u0635\u0641\u0631"],
      synonyms: [],
      pluralForms: ["lentils"],
      ocrMistakes: [],
      spellingMistakes: ["lentils"],
      cookingVerbs: ["boil", "simmer", "stew"],
      dishNames: ["lentil soup", "koshary", "mujadara"],
      units: ["cup", "g"]
    },
    {
      id: "bread",
      canonicalEnglishName: "bread",
      canonicalArabicName: "\u062e\u0628\u0632",
      category: "grain",
      aliases: ["bread", "toast", "pita", "pita bread", "baladi bread", "\u062e\u0628\u0632", "\u0639\u064a\u0634", "\u0639\u064a\u0634 \u0628\u0644\u062f\u064a", "\u062e\u0628\u0632 \u0628\u0644\u062f\u064a"],
      synonyms: [],
      pluralForms: ["breads"],
      ocrMistakes: [],
      spellingMistakes: [],
      cookingVerbs: ["toast", "bake", "serve"],
      dishNames: ["toast", "fattah", "sandwich"],
      units: ["piece", "slice", "serving"]
    },
    {
      id: "pasta",
      canonicalEnglishName: "pasta",
      canonicalArabicName: "\u0645\u0643\u0631\u0648\u0646\u0629",
      category: "grain",
      aliases: ["pasta", "macaroni", "spaghetti", "penne", "fettuccine", "\u0645\u0643\u0631\u0648\u0646\u0629", "\u0645\u0639\u0643\u0631\u0648\u0646\u0629"],
      synonyms: [],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ["pastaa"],
      cookingVerbs: ["boil", "bake", "toss"],
      dishNames: ["pasta", "alfredo", "macarona bechamel", "pomodoro"],
      units: ["cup", "g"]
    },
    {
      id: "oats",
      canonicalEnglishName: "oats",
      canonicalArabicName: "\u0634\u0648\u0641\u0627\u0646",
      category: "grain",
      aliases: ["oats", "oatmeal", "rolled oats", "\u0634\u0648\u0641\u0627\u0646"],
      synonyms: [],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ["oat"],
      cookingVerbs: ["cook", "boil", "simmer"],
      dishNames: ["oatmeal", "overnight oats", "granola bowl"],
      units: ["cup", "g"]
    },
    {
      id: "banana",
      canonicalEnglishName: "banana",
      canonicalArabicName: "\u0645\u0648\u0632",
      category: "fruit",
      aliases: ["banana", "bananas", "\u0645\u0648\u0632", "\u0645\u0648\u0632\u0629"],
      synonyms: [],
      pluralForms: ["bananas"],
      ocrMistakes: [],
      spellingMistakes: ["bananna"],
      cookingVerbs: ["slice", "mash", "top"],
      dishNames: ["banana oatmeal", "smoothie", "fruit bowl"],
      units: ["whole", "cup"]
    },
    {
      id: "apple",
      canonicalEnglishName: "apple",
      canonicalArabicName: "\u062a\u0641\u0627\u062d",
      category: "fruit",
      aliases: ["apple", "apples", "\u062a\u0641\u0627\u062d", "\u062a\u0641\u0627\u062d\u0629"],
      synonyms: [],
      pluralForms: ["apples"],
      ocrMistakes: [],
      spellingMistakes: ["appel"],
      cookingVerbs: ["slice", "bake", "chop"],
      dishNames: ["fruit bowl", "apple oats", "salad"],
      units: ["whole", "cup"]
    },
    {
      id: "orange",
      canonicalEnglishName: "orange",
      canonicalArabicName: "\u0628\u0631\u062a\u0642\u0627\u0644",
      category: "fruit",
      aliases: ["orange", "oranges", "\u0628\u0631\u062a\u0642\u0627\u0644", "\u0628\u0631\u062a\u0642\u0627\u0644\u0629"],
      synonyms: ["citrus"],
      pluralForms: ["oranges"],
      ocrMistakes: [],
      spellingMistakes: ["oragne"],
      cookingVerbs: ["slice", "zest", "juice"],
      dishNames: ["fruit bowl", "citrus salad"],
      units: ["whole", "cup"]
    }
  ],
  kitchenTools: [
    { en: "baking dish", ar: "\u0635\u064a\u0646\u064a\u0629 \u062e\u0628\u0632", aliases: ["oven dish"] },
    { en: "blender", ar: "\u062e\u0644\u0627\u0637" },
    { en: "bowl", ar: "\u0648\u0639\u0627\u0621" },
    { en: "cutting board", ar: "\u0644\u0648\u062d \u062a\u0642\u0637\u064a\u0639" },
    { en: "grill pan", ar: "\u0645\u0642\u0644\u0627\u0629 \u0634\u0648\u064a" },
    { en: "knife", ar: "\u0633\u0643\u064a\u0646" },
    { en: "mixing bowl", ar: "\u0648\u0639\u0627\u0621 \u062e\u0644\u0637" },
    { en: "oven", ar: "\u0641\u0631\u0646" },
    { en: "pot", ar: "\u0642\u062f\u0631" },
    { en: "saucepan", ar: "\u0642\u062f\u0631 \u0635\u063a\u064a\u0631" },
    { en: "sheet pan", ar: "\u0635\u064a\u0646\u064a\u0629 \u0641\u0631\u0646" },
    { en: "skillet", ar: "\u0645\u0642\u0644\u0627\u0629" },
    { en: "strainer", ar: "\u0645\u0635\u0641\u0627\u0629" },
    { en: "whisk", ar: "\u0645\u0636\u0631\u0628 \u064a\u062f\u0648\u064a" }
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
    { en: "kg", ar: "\u0643\u064a\u0644\u0648\u062c\u0631\u0627\u0645", aliases: ["kilogram", "kilograms"] },
    { en: "l", ar: "\u0644\u062a\u0631", aliases: ["liter", "liters", "litre", "litres"] },
    { en: "lb", ar: "\u0631\u0637\u0644", aliases: ["pound", "pounds"] },
    { en: "ml", ar: "\u0645\u0644", aliases: ["milliliter", "milliliters", "millilitre", "millilitres"] },
    { en: "oz", ar: "\u0623\u0648\u0646\u0635\u0629", aliases: ["ounce", "ounces"] },
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

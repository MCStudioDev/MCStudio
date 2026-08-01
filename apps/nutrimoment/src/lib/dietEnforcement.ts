/**
 * Deterministic, ingredient-based diet/allergen enforcement.
 *
 * Why this exists: the AI prompt asks Gemini to respect diet rules, but Gemini
 * still occasionally returns yogurt for a vegan request or shrimp for a
 * vegetarian. The catalog rankRecipes flow filters by `dietTags` on the
 * catalog document, but AI-generated recipes don't carry `dietTags`, so they
 * slip through. This module inspects raw ingredient text against a forbidden
 * list per active diet/allergen and rejects any recipe that contains a match.
 *
 * The check is intentionally over-broad on the diet side (better to drop a
 * legitimate vegan recipe than to serve yogurt to a vegan user) and the
 * patterns are case-insensitive substring matches against normalized strings.
 *
 * Localisation note: Arabic ingredient strings are normalised by the upstream
 * `arabicRecipeLocalization` helpers before they reach the recipe, but raw
 * Gemini output can still contain Arabic terms in some fields. We match
 * against both English forbidden patterns and a small set of common Arabic
 * counterparts so a milk-free user does not see لبن or زبادي.
 */

export type ForbiddenReason =
  | { kind: "diet"; diet: string; match: string }
  | { kind: "allergen"; allergen: string; match: string };

interface ForbiddenPatternSet {
  english: string[];
  arabic: string[];
}

/** Maps the user-selected diet ID to ingredient patterns that disqualify a recipe. */
const DIET_FORBIDDEN_PATTERNS: Record<string, ForbiddenPatternSet> = {
  vegan: {
    english: [
      "meat",
      "beef",
      "veal",
      "lamb",
      "mutton",
      "pork",
      "bacon",
      "ham",
      "sausage",
      "salami",
      "chorizo",
      "prosciutto",
      "pepperoni",
      "chicken",
      "turkey",
      "duck",
      "goose",
      "quail",
      "rabbit",
      "liver",
      "kebda",
      "kidney",
      "tripe",
      "shawarma",
      "kofta",
      "kebab",
      "fish",
      "salmon",
      "tuna",
      "tilapia",
      "cod",
      "sardine",
      "anchovy",
      "mackerel",
      "trout",
      "shrimp",
      "prawn",
      "crab",
      "lobster",
      "oyster",
      "mussel",
      "clam",
      "scallop",
      "calamari",
      "squid",
      "octopus",
      "seafood",
      "egg",
      "eggs",
      "omelette",
      "omelet",
      "frittata",
      "milk",
      "buttermilk",
      "cream",
      "butter",
      "ghee",
      "yogurt",
      "yoghurt",
      "labneh",
      "cheese",
      "feta",
      "halloumi",
      "ricotta",
      "mozzarella",
      "parmesan",
      "paneer",
      "kunafa cheese",
      "honey",
      "gelatin",
      "lard",
      "tallow",
      "anchovy paste",
      "fish sauce",
      "oyster sauce",
      "shrimp paste",
      "whey",
      "casein",
      "ghee",
      "evaporated milk",
      "condensed milk"
    ],
    arabic: [
      "بيض",
      "بيضة",
      "بيضات",
      "بياض البيض",
      "صفار البيض",
      "أومليت",
      "أوملت",
      "شكشوكة",
      "عجة",
      "مايونيز",
      "لحم",
      "لحمة",
      "لحمه",
      "لحوم",
      "بقري",
      "ضاني",
      "خروف",
      "كبدة",
      "كباب",
      "كفتة",
      "شاورما",
      "دجاج",
      "فراخ",
      "ديك",
      "بط",
      "سمك",
      "تونة",
      "سلمون",
      "جمبري",
      "روبيان",
      "قريدس",
      "كابوريا",
      "حبار",
      "بيض",
      "بيضة",
      "أومليت",
      "حليب",
      "لبن",
      "زبدة",
      "سمنة",
      "قشطة",
      "كريمة",
      "زبادي",
      "لبنة",
      "جبنة",
      "جبن",
      "فيتا",
      "حلوم",
      "موتزاريلا",
      "بارميزان",
      "عسل",
      "جيلاتين"
    ]
  },
  vegetarian: {
    english: [
      "meat",
      "beef",
      "veal",
      "lamb",
      "mutton",
      "pork",
      "bacon",
      "ham",
      "sausage",
      "salami",
      "chorizo",
      "prosciutto",
      "pepperoni",
      "chicken",
      "turkey",
      "duck",
      "goose",
      "quail",
      "rabbit",
      "liver",
      "kebda",
      "kidney",
      "tripe",
      "shawarma",
      "kofta",
      "kebab",
      "fish",
      "salmon",
      "tuna",
      "tilapia",
      "cod",
      "sardine",
      "anchovy",
      "mackerel",
      "trout",
      "shrimp",
      "prawn",
      "crab",
      "lobster",
      "oyster",
      "mussel",
      "clam",
      "scallop",
      "calamari",
      "squid",
      "octopus",
      "seafood",
      "gelatin",
      "lard",
      "tallow",
      "anchovy paste",
      "fish sauce",
      "oyster sauce",
      "shrimp paste"
    ],
    arabic: [
      "لحم",
      "لحمة",
      "لحمه",
      "لحوم",
      "بقري",
      "ضاني",
      "خروف",
      "كبدة",
      "كباب",
      "كفتة",
      "شاورما",
      "دجاج",
      "فراخ",
      "ديك",
      "بط",
      "سمك",
      "تونة",
      "سلمون",
      "جمبري",
      "روبيان",
      "قريدس",
      "كابوريا",
      "حبار",
      "جيلاتين"
    ]
  },
  dairyFree: {
    english: [
      "milk",
      "buttermilk",
      "cream",
      "heavy cream",
      "sour cream",
      "whipping cream",
      "butter",
      "ghee",
      "yogurt",
      "yoghurt",
      "labneh",
      "cheese",
      "feta",
      "halloumi",
      "ricotta",
      "mozzarella",
      "parmesan",
      "cheddar",
      "paneer",
      "kunafa cheese",
      "whey",
      "casein",
      "evaporated milk",
      "condensed milk",
      "milk powder",
      "milk solids",
      "ice cream",
      "kashk",
      "smen"
    ],
    arabic: [
      "بيض",
      "بيضة",
      "بيضات",
      "بياض البيض",
      "صفار البيض",
      "أومليت",
      "أوملت",
      "شكشوكة",
      "عجة",
      "مايونيز",
      "حليب",
      "لبن",
      "زبدة",
      "سمنة",
      "قشطة",
      "كريمة",
      "زبادي",
      "لبنة",
      "جبنة",
      "جبن",
      "فيتا",
      "حلوم",
      "موتزاريلا",
      "بارميزان",
      "شيدر",
      "آيس كريم",
      "بوظة"
    ]
  },
  glutenFree: {
    english: [
      "wheat",
      "wheat flour",
      "all-purpose flour",
      "all purpose flour",
      "bread flour",
      "semolina",
      "couscous",
      "bulgur",
      "freekeh",
      "farro",
      "barley",
      "rye",
      "spelt",
      "pita",
      "bread",
      "toast",
      "baguette",
      "naan",
      "tortilla",
      "pasta",
      "spaghetti",
      "penne",
      "macaroni",
      "fettuccine",
      "lasagna",
      "ravioli",
      "noodle",
      "noodles",
      "ramen",
      "udon",
      "soba",
      "phyllo",
      "filo",
      "kataifi",
      "panko",
      "breadcrumb",
      "breadcrumbs",
      "soy sauce",
      "teriyaki sauce",
      "beer"
    ],
    arabic: [
      "قمح",
      "دقيق",
      "طحين",
      "سميد",
      "كسكس",
      "برغل",
      "فريك",
      "شعير",
      "خبز",
      "عيش",
      "خبز بلدي",
      "خبز عربي",
      "بيتا",
      "نان",
      "تورتيلا",
      "مكرونة",
      "معكرونة",
      "اسباجتي",
      "اسباغيتي",
      "لازانيا",
      "نودلز",
      "رمن",
      "فيلو",
      "فطير"
    ]
  },
  paleo: {
    english: [
      "bean",
      "beans",
      "lentil",
      "lentils",
      "chickpea",
      "chickpeas",
      "pea",
      "peas",
      "peanut",
      "peanuts",
      "soy",
      "tofu",
      "tempeh",
      "edamame",
      "rice",
      "oat",
      "oats",
      "oatmeal",
      "wheat",
      "barley",
      "bulgur",
      "couscous",
      "quinoa",
      "corn",
      "flour",
      "bread",
      "toast",
      "pasta",
      "noodle",
      "noodles",
      "milk",
      "cream",
      "butter",
      "ghee",
      "yogurt",
      "yoghurt",
      "cheese",
      "whey",
      "casein",
      "sugar"
    ],
    arabic: []
  },
  pescatarian: {
    // Pescatarian: allows fish and seafood, forbids only meat and poultry.
    english: [
      "meat",
      "beef",
      "veal",
      "lamb",
      "mutton",
      "pork",
      "bacon",
      "ham",
      "sausage",
      "salami",
      "chorizo",
      "prosciutto",
      "pepperoni",
      "chicken",
      "turkey",
      "duck",
      "goose",
      "quail",
      "rabbit",
      "liver",
      "kebda",
      "kidney",
      "tripe",
      "shawarma",
      "kofta",
      "kebab",
      "gelatin",
      "lard",
      "tallow"
    ],
    arabic: [
      "لحم",
      "لحمة",
      "لحمه",
      "لحوم",
      "بقري",
      "ضاني",
      "خروف",
      "كبدة",
      "كباب",
      "كفتة",
      "شاورما",
      "دجاج",
      "فراخ",
      "ديك",
      "بط",
      "جيلاتين"
    ]
  },
  keto: {
    english: [
      "rice",
      "oat",
      "oats",
      "oatmeal",
      "pasta",
      "spaghetti",
      "macaroni",
      "noodle",
      "noodles",
      "bread",
      "toast",
      "pita",
      "tortilla",
      "wrap",
      "flour",
      "wheat",
      "barley",
      "bulgur",
      "couscous",
      "quinoa",
      "potato",
      "sweet potato",
      "corn",
      "bean",
      "beans",
      "lentil",
      "lentils",
      "chickpea",
      "chickpeas",
      "apple",
      "banana",
      "date",
      "dates",
      "honey",
      "sugar"
    ],
    arabic: []
  }
};

const MILK_ALLERGEN_FORBIDDEN_PATTERNS: ForbiddenPatternSet = {
  english: [
    "milk",
    "buttermilk",
    "cream",
    "heavy cream",
    "sour cream",
    "whipping cream",
    "butter",
    "ghee",
    "yogurt",
    "yoghurt",
    "labneh",
    "cheese",
    "feta",
    "halloumi",
    "ricotta",
    "mozzarella",
    "parmesan",
    "cheddar",
    "paneer",
    "kunafa cheese",
    "whey",
    "casein",
    "evaporated milk",
    "condensed milk",
    "milk powder",
    "milk solids",
    "ice cream",
    "kashk",
    "smen"
  ],
  arabic: [
    "حليب",
    "لبن",
    "زبدة",
    "سمنة",
    "قشطة",
    "كريمة",
    "زبادي",
    "لبنة",
    "جبنة",
    "جبن",
    "فيتا",
    "حلوم",
    "موتزاريلا",
    "بارميزان",
    "شيدر",
    "آيس كريم",
    "بوظة"
  ]
};

const ALLERGEN_FORBIDDEN_PATTERNS: Record<string, ForbiddenPatternSet> = {
  dairy: MILK_ALLERGEN_FORBIDDEN_PATTERNS,
  milk: MILK_ALLERGEN_FORBIDDEN_PATTERNS,
  gluten: DIET_FORBIDDEN_PATTERNS.glutenFree,
  tomato: {
    english: ["tomato", "tomatoes", "tomato sauce", "tomato paste", "tomato puree"],
    arabic: ["طماطم", "الطماطم", "بندورة", "البندورة", "صلصة طماطم", "معجون طماطم"]
  },
  eggs: {
    english: ["egg", "eggs", "omelette", "omelet", "frittata", "shakshuka", "meringue"],
    arabic: ["بيض", "بيضة", "بيضات", "أومليت", "أوملت", "شكشوكة"]
  },
  fish: {
    english: [
      "fish",
      "salmon",
      "tuna",
      "tilapia",
      "cod",
      "sardine",
      "anchovy",
      "mackerel",
      "trout",
      "sea bass",
      "snapper",
      "halibut",
      "fish sauce",
      "anchovy paste"
    ],
    arabic: ["سمك", "تونة", "سلمون", "بوري", "بلطي", "قاروس", "ماكريل", "سردين"]
  },
  shellfish: {
    english: [
      "shrimp",
      "prawn",
      "crab",
      "lobster",
      "oyster",
      "mussel",
      "clam",
      "scallop",
      "calamari",
      "squid",
      "octopus",
      "seafood",
      "shrimp paste",
      "oyster sauce"
    ],
    arabic: ["جمبري", "روبيان", "قريدس", "كابوريا", "حبار", "أخطبوط", "محار"]
  },
  nuts: {
    english: [
      "almond",
      "almonds",
      "walnut",
      "walnuts",
      "pecan",
      "pecans",
      "cashew",
      "cashews",
      "pistachio",
      "pistachios",
      "hazelnut",
      "hazelnuts",
      "macadamia",
      "brazil nut",
      "pine nut",
      "pine nuts",
      "almond butter",
      "peanut butter",
      "peanut",
      "peanuts"
    ],
    arabic: ["لوز", "جوز", "بقان", "كاجو", "فستق", "بندق", "صنوبر", "فول سوداني"]
  },
  soy: {
    english: ["soy", "soybean", "tofu", "tempeh", "edamame", "soy sauce", "teriyaki sauce", "miso"],
    arabic: ["صويا", "توفو", "تيمبيه"]
  },
  sesame: {
    english: ["sesame", "tahini", "tahina", "halva", "halawa"],
    arabic: ["سمسم", "طحينة", "حلاوة", "حلاوه"]
  }
};

const ALLERGEN_KEY_ALIASES: Record<string, string> = {
  "الحليب": "milk",
  "حليب": "milk",
  "اللبن": "milk",
  "لبن": "milk",
  "زبادي": "milk",
  "الزبادي": "milk",
  "ديري": "dairy",
  "ألبان": "dairy",
  "البان": "dairy",
  "الالبان": "dairy",
  "منتجات الألبان": "dairy",
  "منتجات الالبان": "dairy",
  "الطماطم": "tomato",
  "طماطم": "tomato",
  "بندورة": "tomato",
  "البندورة": "tomato",
  "بيض": "eggs",
  "البيض": "eggs",
  "سمك": "fish",
  "السمك": "fish",
  "جمبري": "shellfish",
  "روبيان": "shellfish",
  "مأكولات بحرية": "shellfish",
  "مأكولات بحريه": "shellfish",
  "sea food": "shellfish",
  "seafood": "shellfish",
  "milk": "milk",
  "dairy": "dairy",
  "tomatoes": "tomato",
  "egg": "eggs",
  "shell fish": "shellfish"
};

const ARABIC_MEAT_POULTRY_TERMS = [
  "لحم",
  "لحمة",
  "لحمه",
  "لحوم",
  "لحم مفروم",
  "لحمة مفرومة",
  "بقري",
  "بقرى",
  "ضاني",
  "ضانى",
  "خروف",
  "كبدة",
  "كبده",
  "كباب",
  "كفتة",
  "كفته",
  "شاورما",
  "دجاج",
  "فراخ",
  "ديك",
  "بط",
  "بطة"
];

const ARABIC_SEAFOOD_TERMS = [
  "سمك",
  "تونة",
  "تونه",
  "سلمون",
  "جمبري",
  "جمبرى",
  "روبيان",
  "قريدس",
  "كابوريا",
  "حبار",
  "أخطبوط",
  "اخطبوط",
  "محار",
  "مأكولات بحرية"
];

const ARABIC_DAIRY_EGG_TERMS = [
  "بيض",
  "بيضة",
  "بيضات",
  "بياض البيض",
  "صفار البيض",
  "أومليت",
  "اومليت",
  "أوملت",
  "اوملت",
  "فريتاتا",
  "شكشوكة",
  "عجة",
  "مايونيز",
  "حليب",
  "لبن",
  "زبادي",
  "زبدة",
  "سمنة",
  "قشطة",
  "كريمة",
  "لبنة",
  "جبنة",
  "جبن",
  "فيتا",
  "حلومي",
  "موتزاريلا",
  "بارميزان",
  "شيدر"
];

const ARABIC_DIET_FORBIDDEN_ALIASES: Partial<Record<string, string[]>> = {
  vegan: [
    ...ARABIC_MEAT_POULTRY_TERMS,
    ...ARABIC_SEAFOOD_TERMS,
    ...ARABIC_DAIRY_EGG_TERMS,
    "عسل",
    "جيلاتين"
  ],
  vegetarian: [...ARABIC_MEAT_POULTRY_TERMS, ...ARABIC_SEAFOOD_TERMS, "جيلاتين"],
  dairyFree: ARABIC_DAIRY_EGG_TERMS.filter((term) => !/بيض|أوم|اوم|فريتاتا|شكشوكة|عجة|مايونيز/.test(term)),
  pescatarian: [...ARABIC_MEAT_POULTRY_TERMS, "جيلاتين"],
  glutenFree: [
    "قمح",
    "دقيق",
    "طحين",
    "سميد",
    "كسكس",
    "برغل",
    "فريك",
    "شعير",
    "خبز",
    "عيش",
    "خبز بلدي",
    "خبز عربي",
    "بيتا",
    "نان",
    "تورتيلا",
    "مكرونة",
    "معكرونة",
    "اسباجتي",
    "اسباغيتي",
    "لازانيا",
    "نودلز",
    "فيلو",
    "فطير"
  ]
};

const ARABIC_ALLERGEN_FORBIDDEN_ALIASES: Record<string, string[]> = {
  dairy: ARABIC_DAIRY_EGG_TERMS.filter((term) => !/بيض|أوم|اوم|فريتاتا|شكشوكة|عجة|مايونيز/.test(term)),
  milk: ARABIC_DAIRY_EGG_TERMS.filter((term) => !/بيض|أوم|اوم|فريتاتا|شكشوكة|عجة|مايونيز/.test(term)),
  eggs: ARABIC_DAIRY_EGG_TERMS.filter((term) => /بيض|أوم|اوم|فريتاتا|شكشوكة|عجة|مايونيز/.test(term)),
  fish: ["سمك", "تونة", "تونه", "سلمون", "بوري", "بورى", "بلطي", "بلطى", "قاروص", "ماكريل", "سردين"],
  shellfish: ["جمبري", "جمبرى", "روبيان", "قريدس", "كابوريا", "حبار", "أخطبوط", "اخطبوط", "محار"],
  tomato: ["طماطم", "بندورة", "بندوره", "صلصة طماطم", "معجون طماطم"],
  gluten: ARABIC_DIET_FORBIDDEN_ALIASES.glutenFree ?? [],
  nuts: ["لوز", "جوز", "بقان", "كاجو", "فستق", "بندق", "صنوبر", "فول سوداني"],
  soy: ["صويا", "توفو", "تمبيه"],
  sesame: ["سمسم", "طحينة", "طحينه", "حلاوة", "حلاوه"]
};

const ARABIC_ALLERGEN_KEY_ALIASES: Record<string, string> = {
  الحليب: "milk",
  حليب: "milk",
  اللبن: "milk",
  لبن: "milk",
  زبادي: "milk",
  الزبادي: "milk",
  البان: "dairy",
  الالبان: "dairy",
  "منتجات الالبان": "dairy",
  البيض: "eggs",
  بيض: "eggs",
  السمك: "fish",
  سمك: "fish",
  جمبري: "shellfish",
  جمبرى: "shellfish",
  روبيان: "shellfish",
  "ماكولات بحريه": "shellfish",
  "مأكولات بحرية": "shellfish",
  قمح: "gluten",
  جلوتين: "gluten",
  سمسم: "sesame",
  صويا: "soy"
};

const ADAPTABLE_DISH_FAMILY_BLOCKLIST_TERMS = new Set(["shawarma", "kofta", "kebab"]);
const ARABIC_ADAPTABLE_DISH_FAMILY_BLOCKLIST_TERMS = new Set(["شاورما", "كفتة", "كفته", "كباب"]);

function mergeForbiddenPatterns(base: ForbiddenPatternSet, extraArabic: string[] = []): ForbiddenPatternSet {
  return {
    english: base.english,
    arabic: Array.from(new Set([...base.arabic, ...extraArabic]))
  };
}

function resolveDietForbiddenPatterns(diet: string): ForbiddenPatternSet | null {
  const base = DIET_FORBIDDEN_PATTERNS[diet];
  if (!base) return null;
  const merged = mergeForbiddenPatterns(base, ARABIC_DIET_FORBIDDEN_ALIASES[diet]);
  if (!["vegan", "vegetarian", "pescatarian"].includes(diet)) return merged;

  return {
    english: merged.english.filter((term) => !ADAPTABLE_DISH_FAMILY_BLOCKLIST_TERMS.has(term)),
    arabic: merged.arabic.filter((term) => !ARABIC_ADAPTABLE_DISH_FAMILY_BLOCKLIST_TERMS.has(term))
  };
}

export interface DietEnforcementContext {
  diets: string[];
  allergens: string[];
  preferredProteinIngredients?: string[];
}

function resolveAllergenForbiddenPatterns(allergen: string): ForbiddenPatternSet | null {
  const normalized = normalizeForMatch(allergen);
  const normalizedArabic = normalizeArabicForMatchSafe(allergen);
  const key =
    ALLERGEN_KEY_ALIASES[normalized] ??
    ARABIC_ALLERGEN_KEY_ALIASES[normalizedArabic] ??
    ALLERGEN_KEY_ALIASES[normalizedArabic] ??
    normalized;
  const known = ALLERGEN_FORBIDDEN_PATTERNS[key];
  if (known) return mergeForbiddenPatterns(known, ARABIC_ALLERGEN_FORBIDDEN_ALIASES[key]);

  const arabic = normalizedArabic && /[\u0600-\u06FF]/.test(normalizedArabic) ? [allergen, normalizedArabic] : [];
  const english = normalized && !/[\u0600-\u06FF]/.test(normalized) ? [normalized] : [];
  if (!arabic.length && !english.length) return null;

  return { english, arabic };
}

export function hasActiveDietConstraints(ctx: DietEnforcementContext): boolean {
  return ctx.diets.some((diet) => {
    const patterns = resolveDietForbiddenPatterns(diet);
    return Boolean(patterns?.english.length || patterns?.arabic.length);
  })
    || ctx.allergens.some((allergen) => Boolean(resolveAllergenForbiddenPatterns(allergen)));
}

/**
 * Lowercase + normalize whitespace so substring matching is consistent.
 * Arabic characters are preserved as-is — we match the Arabic pattern set
 * against them separately.
 */
function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function removeKetoLowCarbSubstitutes(value: string) {
  return value
    .replace(/\b(cauliflower|broccoli|cabbage)\s+rice\b/g, " ")
    .replace(/\b(zucchini|shirataki|konjac|kohlrabi|cucumber)\s+noodles?\b/g, " ")
    .replace(/\b(lettuce|collard|cabbage)\s+wraps?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePlantBasedDairyAlternatives(value: string) {
  return value
    .replace(/\b(?:vegan|dairy free|dairy-free|plant based|plant-based)\s+(?:[a-z]+\s+){0,4}(?:milk|cream|butter|ghee|yogurt|yoghurt|labneh|cheese|feta|halloumi|ricotta|mozzarella|parmesan|cheddar|paneer)\b/g, "safe named dish")
    .replace(/\b(almond|oat|soy|coconut|cashew|hemp|pea|rice|hazelnut|macadamia)\s+milk\b/g, " ")
    .replace(/\b(coconut|cashew|oat|soy|almond)\s+cream\b/g, " ")
    .replace(/\b(vegan|plant based|plant-based|dairy free|dairy-free)\s+(?:unsweetened\s+)?(cheese|yogurt|yoghurt|cream|butter)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePlantBasedDairyAlternativesArabic(value: string) {
  return value
    .replace(/(?:\u062d\u0644\u064a\u0628|\u0645\u0634\u0631\u0648\u0628)\s+(?:\u0627\u0644\u0644\u0648\u0632|\u0627\u0644\u0635\u0648\u064a\u0627|\u062c\u0648\u0632\s+\u0627\u0644\u0647\u0646\u062f|\u0627\u0644\u0643\u0627\u062c\u0648)(?:\s+\u063a\u064a\u0631\s+\u0645\u062d\u0644\u0649)?/gu, " ")
    .replace(/\u0643\u0631\u064a\u0645\u0629\s+(?:\u062c\u0648\u0632\s+\u0647\u0646\u062f|\u062c\u0648\u0632\s+\u0627\u0644\u0647\u0646\u062f|\u0643\u0627\u062c\u0648)(?:\s+\u063a\u064a\u0631\s+\u0645\u062d\u0644\u0627\u0629)?/gu, " ")
    .replace(/\u0632\u0628\u0627\u062f\u064a\s+\u0646\u0628\u0627\u062a\u064a(?:\s+\u063a\u064a\u0631\s+\u0645\u062d\u0644\u0649)?/gu, " ")
    .replace(/\u0628\u062f\u064a\u0644\s+\u062c\u0628\u0646\s+\u0646\u0628\u0627\u062a\u064a/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check whether `text` contains a whole-word match for any of the english
 * patterns. We use a word-boundary regex so "ham" doesn't false-positive on
 * "shamrock" or "sesame". Multi-word patterns ("oyster sauce") match as
 * substrings since they are already specific.
 */
function matchesEnglishPattern(text: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (!pattern) continue;
    if (pattern.includes(" ")) {
      if (text.includes(pattern)) return pattern;
      continue;
    }
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}s?\\b`, "i");
    if (regex.test(text)) return pattern;
  }
  return null;
}

function matchesArabicPattern(text: string, patterns: string[]): string | null {
  const normalizedText = normalizeArabicForMatchSafe(text);
  const tokens = extractArabicTokens(normalizedText);
  for (const pattern of patterns) {
    if (!pattern) continue;
    const normalizedPattern = normalizeArabicForMatchSafe(pattern);
    if (!normalizedPattern) continue;
    if (normalizedPattern.includes(" ")) {
      const escaped = normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|[^\\p{Script=Arabic}\\p{L}\\p{N}])${escaped}($|[^\\p{Script=Arabic}\\p{L}\\p{N}])`, "u");
      if (regex.test(normalizedText)) return pattern;
      continue;
    }
    if (tokens.some((token) => arabicTokenVariantsSafe(token).has(normalizedPattern))) return pattern;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function normalizeArabicForMatch(value: string): string {
  return value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArabicTokens(value: string): string[] {
  return value.match(/[\p{Script=Arabic}]+/gu) ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function arabicTokenVariants(token: string): Set<string> {
  const variants = new Set<string>([token]);
  const prefixes = ["وال", "بال", "كال", "فال", "لل", "ال", "و", "ب", "ك", "ف", "ل"];

  for (const prefix of prefixes) {
    if (token.startsWith(prefix) && token.length > prefix.length + 1) {
      const stripped = token.slice(prefix.length);
      variants.add(stripped);
      if (stripped.startsWith("ال") && stripped.length > 3) {
        variants.add(stripped.slice(2));
      }
    }
  }

  return variants;
}

function normalizeArabicForMatchSafe(value: string): string {
  return value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function arabicTokenVariantsSafe(token: string): Set<string> {
  const variants = new Set<string>([token]);
  const prefixes = ["وال", "بال", "كال", "فال", "لل", "ال", "و", "ب", "ك", "ف", "ل"];

  for (const prefix of prefixes) {
    if (token.startsWith(prefix) && token.length > prefix.length + 1) {
      const stripped = token.slice(prefix.length);
      variants.add(stripped);
      if (stripped.startsWith("ال") && stripped.length > 3) {
        variants.add(stripped.slice(2));
      }
    }
  }

  return variants;
}

interface RecipeLike {
  title?: string;
  name?: string;
  cuisine?: string;
  ingredients?: Array<string | { canonical?: string; name?: string }>;
  missing_ingredients?: Array<string | { canonical?: string; name?: string }>;
  steps?: string[];
  dishIntent?: { dish_name?: string; visual_keywords?: string[] };
  dish_intent?: { dish_name?: string; visual_keywords?: string[] };
}

export function adaptRecipeForDietRestrictions<T extends RecipeLike>(
  recipe: T,
  ctx: DietEnforcementContext
): T {
  let adaptedRecipe = recipe;
  if (ctx.diets.some((diet) => diet === "glutenFree" || diet === "gluten")) {
    adaptedRecipe = adaptRecipeText(recipe, makeGlutenSourcesExplicitlySafe);
  }
  if (ctx.diets.includes("pescatarian")) {
    const replacement = choosePescatarianProteinReplacement(adaptedRecipe, ctx.preferredProteinIngredients ?? []);
    adaptedRecipe = adaptRecipeText(
      adaptedRecipe,
      (value) => makePescatarianSourcesExplicitlySafe(value, replacement)
    );
  }
  if (ctx.diets.includes("dairyFree") || ctx.diets.includes("vegan")) {
    adaptedRecipe = adaptRecipeText(
      adaptedRecipe,
      makeDairySourcesExplicitlySafe,
      (value) => makeDairyRecipeTitleExplicitlySafe(value, ctx.diets.includes("vegan"))
    );
  }
  if (ctx.diets.includes("vegan")) {
    const replacement = chooseVeganProteinReplacement(ctx.preferredProteinIngredients ?? []);
    adaptedRecipe = adaptRecipeText(adaptedRecipe, (value) => makeAnimalSourcesExplicitlyVegan(value, replacement));
  }
  if (ctx.diets.includes("keto")) {
    adaptedRecipe = adaptRecipeText(adaptedRecipe, makeKetoCarriersExplicitlySafe);
  }
  return adaptedRecipe;
}

function adaptRecipeText<T extends RecipeLike>(
  recipe: T,
  transform: (value: string) => string,
  titleTransform: (value: string) => string = transform
): T {
  const adaptList = (values?: Array<string | { canonical?: string; name?: string }>) =>
    values?.map((value) => {
      if (typeof value === "string") return transform(value);
      return {
        ...value,
        ...(value.name ? { name: transform(value.name) } : {}),
        ...(value.canonical ? { canonical: transform(value.canonical) } : {})
      };
    });
  const adaptIntent = (intent?: RecipeLike["dish_intent"]) => intent
    ? {
        ...intent,
        ...(intent.dish_name ? { dish_name: transform(intent.dish_name) } : {}),
        ...(intent.visual_keywords
          ? { visual_keywords: intent.visual_keywords.map(transform) }
          : {})
      }
    : intent;

  return {
    ...recipe,
    ...(recipe.title ? { title: titleTransform(recipe.title) } : {}),
    ...(recipe.name ? { name: titleTransform(recipe.name) } : {}),
    ...(recipe.ingredients ? { ingredients: adaptList(recipe.ingredients) } : {}),
    ...(recipe.missing_ingredients ? { missing_ingredients: adaptList(recipe.missing_ingredients) } : {}),
    ...(recipe.steps ? { steps: recipe.steps.map(transform) } : {}),
    ...(recipe.dish_intent ? { dish_intent: adaptIntent(recipe.dish_intent) } : {}),
    ...(recipe.dishIntent ? { dishIntent: adaptIntent(recipe.dishIntent) } : {})
  } as T;
}

function choosePescatarianProteinReplacement(recipe: RecipeLike, preferredIngredients: string[]) {
  const haystack = [
    ...preferredIngredients,
    ...collectInspectionStrings(recipe)
  ].join(" ").toLowerCase();
  if (/\b(shrimp|prawn|scampi)\b|\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646/u.test(haystack)) {
    return { ar: "\u062c\u0645\u0628\u0631\u064a", en: "shrimp" };
  }
  if (/\b(salmon)\b|\u0633\u0644\u0645\u0648\u0646/u.test(haystack)) {
    return { ar: "\u0633\u0644\u0645\u0648\u0646", en: "salmon" };
  }
  return { ar: "\u0633\u0645\u0643 \u0623\u0628\u064a\u0636", en: "firm white fish" };
}

function makePescatarianSourcesExplicitlySafe(
  value: string,
  replacement: { ar: string; en: string }
) {
  const usesArabic = /[\u0600-\u06FF]/u.test(value);
  const protein = usesArabic ? replacement.ar : replacement.en;
  const vegetableStock = usesArabic ? "\u0645\u0631\u0642 \u062e\u0636\u0631\u0648\u0627\u062a \u0642\u0644\u064a\u0644 \u0627\u0644\u0635\u0648\u062f\u064a\u0648\u0645" : "low-sodium vegetable stock";
  const savoryAlternative = usesArabic ? "\u0641\u0637\u0631 \u0645\u062f\u062e\u0646" : "smoked mushrooms";

  return value
    .replace(/\b(?:beef|chicken|pork|lamb|mutton|turkey|duck|meat)\s+(?:broth|bouillon|stock)\b/gi, vegetableStock)
    .replace(/\b(?:bacon|ham|prosciutto|pepperoni|salami|sausage|chorizo)\b/gi, savoryAlternative)
    .replace(/\b(?:beef|veal|chicken|pork|lamb|mutton|turkey|duck|goose|rabbit|meat)\b/gi, protein)
    .replace(/\u0644\u062d\u0645\s+(?:\u0627\u0644)?\u062e\u0646\u0632\u064a\u0631/gu, protein)
    .replace(/\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e|\u0644\u062d\u0645|\u0628\u0642\u0631\u064a|\u0636\u0627\u0646\u064a|\u062e\u0631\u0648\u0641|\u062f\u064a\u0643\s+\u0631\u0648\u0645\u064a/gu, protein);
}

function makeDairySourcesExplicitlySafe(value: string): string {
  const protectedTerms: string[] = [];
  const protectedValue = value.replace(
    /\b(?:(?:unsweetened\s+)?(?:almond|soy|coconut|cashew|hemp|pea|rice|hazelnut|macadamia)\s+(?:milk|cream)|(?:vegan|plant[- ]based|dairy[- ]free)\s+(?:unsweetened\s+)?(?:cheese|yogurt|yoghurt|cream|butter))\b/gi,
    (match) => {
      protectedTerms.push(match);
      return `dairyalternativetoken${protectedTerms.length - 1}`;
    }
  );

  const adapted = protectedValue
    .replace(/\b(?:evaporated|condensed)\s+milk\b/gi, "dairynewmilktoken")
    .replace(/\b(?:heavy|whipping|sour)\s+cream\b/gi, "dairynewcreamtoken")
    .replace(/\b(?:buttermilk|milk\s+powder|milk\s+solids)\b/gi, "dairynewmilktoken")
    .replace(/\b(?:yogurt|yoghurt|labneh|kashk)\b/gi, "dairynewyogurttoken")
    .replace(/\b(?:feta|halloumi|ricotta|mozzarella|parmesan|cheddar|paneer|cheese)\b/gi, "dairynewcheesetoken")
    .replace(/\b(?:butter|ghee|smen)\b/gi, "olive oil")
    .replace(/\bmilk\b/gi, "dairynewmilktoken")
    .replace(/\bcream\b/gi, "dairynewcreamtoken")
    .replace(/\u062d\u0644\u064a\u0628|\u0644\u0628\u0646/gu, "\u062d\u0644\u064a\u0628 \u0644\u0648\u0632 \u063a\u064a\u0631 \u0645\u062d\u0644\u0649")
    .replace(/\u0643\u0631\u064a\u0645\u0629|\u0642\u0634\u0637\u0629/gu, "\u0643\u0631\u064a\u0645\u0629 \u062c\u0648\u0632 \u0647\u0646\u062f \u063a\u064a\u0631 \u0645\u062d\u0644\u0627\u0629")
    .replace(/\u0632\u0628\u0627\u062f\u064a|\u0644\u0628\u0646\u0629/gu, "\u0632\u0628\u0627\u062f\u064a \u0646\u0628\u0627\u062a\u064a \u063a\u064a\u0631 \u0645\u062d\u0644\u0649")
    .replace(/\u062c\u0628\u0646\u0629|\u062c\u0628\u0646|\u0641\u064a\u062a\u0627|\u062d\u0644\u0648\u0645|\u0645\u0648\u0632\u0627\u0631\u064a\u0644\u0627|\u0628\u0627\u0631\u0645\u064a\u0632\u0627\u0646|\u0634\u064a\u062f\u0631/gu, "\u0628\u062f\u064a\u0644 \u062c\u0628\u0646 \u0646\u0628\u0627\u062a\u064a")
    .replace(/\u0632\u0628\u062f\u0629|\u0633\u0645\u0646\u0629/gu, "\u0632\u064a\u062a \u0632\u064a\u062a\u0648\u0646");

  return adapted
    .replace(/dairynewmilktoken/g, "unsweetened almond milk")
    .replace(/dairynewcreamtoken/g, "unsweetened coconut cream")
    .replace(/dairynewyogurttoken/g, "dairy-free unsweetened yogurt")
    .replace(/dairynewcheesetoken/g, "dairy-free cheese")
    .replace(/dairyalternativetoken(\d+)/g, (_, index: string) => protectedTerms[Number(index)] ?? "");
}

function makeDairyRecipeTitleExplicitlySafe(value: string, vegan: boolean) {
  const containsDairyIdentity = /\b(?:milk|cream|butter|ghee|yogurt|yoghurt|labneh|cheese|feta|halloumi|ricotta|mozzarella|parmesan|cheddar|paneer)\b/i.test(value);
  if (!containsDairyIdentity || /\b(?:vegan|dairy[- ]free|plant[- ]based)\b/i.test(value)) return value;
  return `${vegan ? "Vegan" : "Dairy-Free"} ${value}`;
}

function chooseVeganProteinReplacement(preferredIngredients: string[]) {
  const source = preferredIngredients.join(" ").toLowerCase();
  if (/\bchickpeas?\b|\u062d\u0645\u0635/u.test(source)) return "chickpeas";
  if (/\blentils?\b|\u0639\u062f\u0633/u.test(source)) return "lentils";
  if (/\btofu\b/u.test(source)) return "firm tofu";
  return "chickpeas";
}

function makeAnimalSourcesExplicitlyVegan(value: string, protein: string): string {
  return value
    .replace(/\b(?:fish|oyster)\s+sauce\b/gi, "soy sauce")
    .replace(/\b(?:beef|chicken|pork|lamb|mutton|turkey|duck|fish)\s+(?:broth|bouillon|stock)\b/gi, "low-sodium vegetable stock")
    .replace(/\b(?:bacon|ham|prosciutto|pepperoni|salami|sausage|chorizo)\b/gi, "smoked mushrooms")
    .replace(/\b(?:beef|veal|chicken|pork|lamb|mutton|turkey|duck|goose|rabbit|fish|salmon|tuna|shrimp|prawn|crab|lobster|seafood|meat)\b/gi, protein)
    .replace(/\b(?:egg|eggs)\b/gi, "ground flaxseed slurry")
    .replace(/\b(?:honey)\b/gi, "maple syrup")
    .replace(/\b(?:gelatin)\b/gi, "agar agar")
    .replace(/\b(?:lard|tallow)\b/gi, "olive oil")
    .replace(/\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e|\u0644\u062d\u0645|\u0633\u0645\u0643|\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646/gu, "\u062d\u0645\u0635")
    .replace(/\u0628\u064a\u0636(?:\u0629|\u0627\u062a)?/gu, "\u062e\u0644\u064a\u0637 \u0628\u0630\u0648\u0631 \u0643\u062a\u0627\u0646 \u0645\u0637\u062d\u0648\u0646\u0629")
    .replace(/\u0639\u0633\u0644/gu, "\u0634\u0631\u0627\u0628 \u0642\u064a\u0642\u0628")
    .replace(/\u062c\u064a\u0644\u0627\u062a\u064a\u0646/gu, "\u0623\u062c\u0627\u0631 \u0623\u062c\u0627\u0631");
}

function makeKetoCarriersExplicitlySafe(value: string): string {
  const protectedTerms: string[] = [];
  const protectedValue = value.replace(
    /\b(?:(?:cauliflower|broccoli|cabbage)\s+rice|(?:zucchini|shirataki|konjac|kohlrabi|cucumber)\s+noodles?|(?:lettuce|collard|cabbage)\s+wraps?|low[- ]carb\s+flatbread)\b/gi,
    (match) => {
      protectedTerms.push(match);
      return `ketosubstitutetoken${protectedTerms.length - 1}`;
    }
  );

  const adapted = protectedValue
    .replace(/\b(?:rice\s+noodles?|spaghetti|macaroni|pasta|noodles?)\b/gi, "zucchini noodles")
    .replace(/\b(?:sweet\s+potato(?:es)?|potato(?:es)?)\b/gi, "cauliflower florets")
    .replace(/\b(?:wheat\s+flour|all[- ]purpose\s+flour|bread\s+flour|flour|wheat)\b/gi, "finely ground almonds")
    .replace(/\b(?:breadcrumbs?|bread|toast|pita|tortillas?|wraps?)\b/gi, "low-carb flatbread")
    .replace(/\b(?:brown\s+rice|white\s+rice|rice|oatmeal|oats?|barley|bulgur|couscous|quinoa)\b/gi, "cauliflower rice")
    .replace(/\b(?:beans?|lentils?|chickpeas?)\b/gi, "diced zucchini")
    .replace(/\b(?:corn)\b/gi, "diced bell pepper")
    .replace(/\b(?:honey|sugar|dates?)\b/gi, "monk fruit sweetener")
    .replace(/\b(?:apples?|bananas?)\b/gi, "berries");

  return adapted.replace(/ketosubstitutetoken(\d+)/g, (_, index: string) => protectedTerms[Number(index)] ?? "");
}

function makeGlutenSourcesExplicitlySafe(value: string): string {
  const protectedTerms: string[] = [];
  const protectedValue = value.replace(
    /\b(?:certified\s+)?gluten[- ]free\s+(?:wheat|flours?|breads?|breadcrumbs?|pastas?|spaghetti|macaroni|lasagn[ae]|noodles?|ravioli|crusts?|tortillas?|crackers?|couscous|bulgur|semolina)\b/gi,
    (match) => {
      protectedTerms.push(match);
      return `gfsubstitutetoken${protectedTerms.length - 1}`;
    }
  );
  const adapted = protectedValue.replace(
    /\b(wheat|flours?|breads?|breadcrumbs?|pastas?|spaghetti|macaroni|lasagn[ae]|noodles?|ravioli|crusts?|tortillas?|crackers?|couscous|bulgur|semolina)\b/gi,
    (match) => `gluten-free ${match.toLowerCase()}`
  );
  return adapted.replace(/gfsubstitutetoken(\d+)/g, (_, index: string) => protectedTerms[Number(index)] ?? "");
}

function collectIngredientStrings(values?: Array<string | { canonical?: string; name?: string }>): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .flatMap((value) => {
      if (typeof value === "string") return [value];
      return [value.name, value.canonical];
    })
    .filter((value): value is string => Boolean(value && value.trim()));
}

function collectInspectionStrings(recipe: RecipeLike): string[] {
  const parts: string[] = [];
  if (recipe.title) parts.push(recipe.title);
  if (recipe.name) parts.push(recipe.name);
  if (recipe.dish_intent?.dish_name) parts.push(recipe.dish_intent.dish_name);
  if (recipe.dishIntent?.dish_name) parts.push(recipe.dishIntent.dish_name);
  parts.push(...collectIngredientStrings(recipe.ingredients));
  parts.push(...collectIngredientStrings(recipe.missing_ingredients));
  if (Array.isArray(recipe.steps)) parts.push(...recipe.steps.filter((s): s is string => Boolean(s)));
  if (Array.isArray(recipe.dish_intent?.visual_keywords)) parts.push(...(recipe.dish_intent?.visual_keywords ?? []));
  if (Array.isArray(recipe.dishIntent?.visual_keywords)) parts.push(...(recipe.dishIntent?.visual_keywords ?? []));
  return parts.filter((value): value is string => Boolean(value && value.trim()));
}

/**
 * Check whether `recipe` violates any active diet/allergen constraint.
 * Inspects the recipe's name, dish identity, ingredients, missing ingredients,
 * and visual keywords. Missing ingredients are included because a vegan user
 * should not see a recipe whose missing list is "yogurt, butter, parmesan"
 * even if those words don't appear in `ingredients`.
 */
export function findRecipeDietViolation(
  recipe: RecipeLike,
  ctx: DietEnforcementContext
): ForbiddenReason | null {
  if (!hasActiveDietConstraints(ctx)) return null;

  const parts = collectInspectionStrings(recipe);
  if (!parts.length) return null;

  const englishHaystack = parts.map(normalizeForMatch).join(" | ");
  const arabicHaystack = parts.join(" | ");

  for (const diet of ctx.diets) {
    const patterns = resolveDietForbiddenPatterns(diet);
    if (!patterns) continue;
    let dietEnglishHaystack =
      diet === "keto" || diet === "paleo"
        ? removeKetoLowCarbSubstitutes(englishHaystack)
        : englishHaystack;
    if (diet === "glutenFree" || diet === "gluten") {
      dietEnglishHaystack = removeGlutenFreeSubstitutes(dietEnglishHaystack);
    }
    if (diet === "vegan" || diet === "vegetarian" || diet === "pescatarian") {
      dietEnglishHaystack = removePlantBasedProteinFalsePositives(dietEnglishHaystack);
    }
    if (diet === "vegan" || diet === "dairyFree") {
      dietEnglishHaystack = removePlantBasedDairyAlternatives(dietEnglishHaystack);
    }
    const dietArabicHaystack = diet === "vegan" || diet === "dairyFree"
      ? removePlantBasedDairyAlternativesArabic(arabicHaystack)
      : arabicHaystack;
    const englishHit = matchesEnglishPattern(dietEnglishHaystack, patterns.english);
    if (englishHit) return { kind: "diet", diet, match: englishHit };
    const arabicHit = matchesArabicPattern(dietArabicHaystack, patterns.arabic);
    if (arabicHit) return { kind: "diet", diet, match: arabicHit };
  }

  for (const allergen of ctx.allergens) {
    const patterns = resolveAllergenForbiddenPatterns(allergen);
    if (!patterns) continue;
    const allergenEnglishHaystack = /^(dairy|milk)$/i.test(allergen)
      ? removePlantBasedDairyAlternatives(englishHaystack)
      : englishHaystack;
    const allergenArabicHaystack = /^(dairy|milk)$/i.test(allergen)
      ? removePlantBasedDairyAlternativesArabic(arabicHaystack)
      : arabicHaystack;
    const englishHit = matchesEnglishPattern(allergenEnglishHaystack, patterns.english);
    if (englishHit) return { kind: "allergen", allergen, match: englishHit };
    const arabicHit = matchesArabicPattern(allergenArabicHaystack, patterns.arabic);
    if (arabicHit) return { kind: "allergen", allergen, match: arabicHit };
  }

  return null;
}

function removePlantBasedProteinFalsePositives(value: string): string {
  return value
    .replace(/\bkidney\s+beans?\b/g, "beans")
    .replace(/\boyster\s+mushrooms?\b/g, "mushrooms");
}

function removeGlutenFreeSubstitutes(value: string): string {
  return value
    .replace(
      /\b(?:certified\s+)?gluten[- ]free\s+(?:wheat|flours?|breads?|breadcrumbs?|pastas?|spaghetti|macaroni|lasagn[ae]|noodles?|ravioli|crusts?|tortillas?|crackers?|couscous|bulgur|semolina)\b/g,
      "safe substitute"
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function findIngredientDietViolation(
  ingredient: string,
  ctx: DietEnforcementContext
): ForbiddenReason | null {
  if (!ingredient.trim()) return null;
  return findRecipeDietViolation(
    {
      ingredients: [ingredient],
      name: ingredient
    },
    ctx
  );
}

export interface DietFilterResult<T> {
  allowed: T[];
  rejected: Array<{ recipe: T; reason: ForbiddenReason }>;
}

export function filterRecipesByDiet<T extends RecipeLike>(
  recipes: T[],
  ctx: DietEnforcementContext
): DietFilterResult<T> {
  if (!hasActiveDietConstraints(ctx)) {
    return { allowed: recipes, rejected: [] };
  }

  const allowed: T[] = [];
  const rejected: Array<{ recipe: T; reason: ForbiddenReason }> = [];
  for (const recipe of recipes) {
    const violation = findRecipeDietViolation(recipe, ctx);
    if (violation) {
      rejected.push({ recipe, reason: violation });
    } else {
      allowed.push(recipe);
    }
  }
  return { allowed, rejected };
}

/**
 * Build a short, prompt-friendly description of what each active diet must
 * avoid. Used to inject an explicit forbidden-ingredient line near the top of
 * the AI prompt so Gemini does not bury the rule under unrelated cuisine
 * guidance.
 */
export function buildPromptForbiddenIngredientsLine(ctx: DietEnforcementContext): string {
  if (!hasActiveDietConstraints(ctx)) return "";

  const lines: string[] = [];
  for (const diet of ctx.diets) {
    const patterns = resolveDietForbiddenPatterns(diet);
    if (!patterns || (!patterns.english.length && !patterns.arabic.length)) continue;
    const sample = patterns.english.join(", ");
    lines.push(`Diet "${diet}" forbids: ${sample}.`);
  }
  for (const allergen of ctx.allergens) {
    const patterns = resolveAllergenForbiddenPatterns(allergen);
    if (!patterns) continue;
    const sample = patterns.english.join(", ");
    lines.push(`Allergen "${allergen}" forbids: ${sample}.`);
  }

  if (!lines.length) return "";

  return [
    "HARD DIET / ALLERGEN GATE — this overrides every cuisine, variety, and dish-family rule below.",
    "Do not output any recipe whose name, dish_intent, ingredients, missing_ingredients, steps, or visual_keywords contains the items listed here for any active rule. A safer substitute must be chosen at the dish-family level; do not output a forbidden dish and call it 'adapted'.",
    ...lines
  ].join(" ");
}

/**
 * Build a forbidden-ingredient summary suited for the weekly meal-plan
 * prompt. Same semantics as the recipe variant but phrased per-meal.
 */
export function buildPromptForbiddenMealPlanLine(ctx: DietEnforcementContext): string {
  if (!hasActiveDietConstraints(ctx)) return "";

  const lines: string[] = [];
  for (const diet of ctx.diets) {
    const patterns = resolveDietForbiddenPatterns(diet);
    if (!patterns || (!patterns.english.length && !patterns.arabic.length)) continue;
    const sample = patterns.english.join(", ");
    lines.push(`Diet "${diet}" forbids: ${sample}.`);
  }
  for (const allergen of ctx.allergens) {
    const patterns = resolveAllergenForbiddenPatterns(allergen);
    if (!patterns) continue;
    const sample = patterns.english.join(", ");
    lines.push(`Allergen "${allergen}" forbids: ${sample}.`);
  }

  if (!lines.length) return "";

  return [
    "HARD DIET / ALLERGEN GATE for every breakfast, lunch, and dinner slot in this weekly plan. This overrides every cuisine, variety, and dish-family rule below.",
    "Each meal's name, ingredients, steps, and visual keywords must avoid the items below. A safer substitute must be chosen at the dish-family level — do not output a forbidden meal and call it 'adapted'.",
    ...lines
  ].join(" ");
}

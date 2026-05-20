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
      "smen",
      "egg",
      "eggs",
      "egg white",
      "egg yolk",
      "omelette",
      "omelet",
      "frittata",
      "shakshuka",
      "eggah",
      "meringue",
      "mayonnaise",
      "mayo"
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
      "wheat",
      "wheat flour",
      "all-purpose flour",
      "all purpose flour",
      "bread flour",
      "flour",
      "semolina",
      "couscous",
      "bulgur",
      "freekeh",
      "farro",
      "barley",
      "rye",
      "spelt",
      "oats",
      "oatmeal",
      "rice",
      "quinoa",
      "corn",
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
      "bean",
      "beans",
      "lentil",
      "lentils",
      "chickpea",
      "chickpeas",
      "garbanzo",
      "fava",
      "pea",
      "peas",
      "soy",
      "soybean",
      "tofu",
      "tempeh",
      "edamame",
      "peanut",
      "peanuts",
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
      "whey",
      "casein",
      "sugar",
      "brown sugar",
      "white sugar",
      "corn syrup",
      "candy",
      "soda"
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
      "شوفان",
      "أرز",
      "ارز",
      "ذرة",
      "خبز",
      "عيش",
      "مكرونة",
      "معكرونة",
      "نودلز",
      "فاصوليا",
      "لوبيا",
      "عدس",
      "حمص",
      "فول",
      "بازلاء",
      "صويا",
      "توفو",
      "فول سوداني",
      "حليب",
      "لبن",
      "زبدة",
      "سمنة",
      "قشطة",
      "كريمة",
      "زبادي",
      "جبنة",
      "جبن",
      "سكر"
    ]
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
      "sugar",
      "brown sugar",
      "white sugar",
      "corn syrup",
      "high fructose corn syrup",
      "honey",
      "maple syrup",
      "molasses",
      "agave",
      "candy",
      "soda",
      "juice",
      "wheat",
      "wheat flour",
      "all-purpose flour",
      "all purpose flour",
      "bread flour",
      "flour",
      "semolina",
      "couscous",
      "bulgur",
      "freekeh",
      "farro",
      "barley",
      "rye",
      "spelt",
      "oats",
      "oatmeal",
      "cereal",
      "granola",
      "rice",
      "quinoa",
      "corn",
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
      "potato",
      "potatoes",
      "sweet potato",
      "sweet potatoes",
      "yam",
      "yams",
      "bean",
      "beans",
      "lentil",
      "lentils",
      "chickpea",
      "chickpeas",
      "garbanzo",
      "fava",
      "pea",
      "peas",
      "banana",
      "apple",
      "dates",
      "date syrup",
      "grapes",
      "mango"
    ],
    arabic: [
      "سكر",
      "عسل",
      "عصير",
      "قمح",
      "دقيق",
      "طحين",
      "سميد",
      "كسكس",
      "برغل",
      "فريك",
      "شعير",
      "شوفان",
      "أرز",
      "ارز",
      "ذرة",
      "خبز",
      "عيش",
      "مكرونة",
      "معكرونة",
      "نودلز",
      "بطاطس",
      "بطاطا",
      "فاصوليا",
      "لوبيا",
      "عدس",
      "حمص",
      "فول",
      "بازلاء",
      "موز",
      "تفاح",
      "تمر",
      "عنب",
      "مانجو"
    ]
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
  dairyFree: ARABIC_DAIRY_EGG_TERMS,
  paleo: DIET_FORBIDDEN_PATTERNS.paleo.arabic,
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
  ],
  keto: DIET_FORBIDDEN_PATTERNS.keto.arabic
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
  الطماطم: "tomato",
  طماطم: "tomato",
  بندوره: "tomato",
  بندورة: "tomato",
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

const PLANT_MILK_PREFIX_PATTERN =
  "(?:almond|oat|oatmeal|coconut|soy|soya|cashew|rice|hemp|pea|macadamia|hazelnut|plant[- ]?based|non[- ]?dairy|dairy[- ]?free|vegan)";
const PLANT_CREAM_PREFIX_PATTERN =
  "(?:coconut|cashew|oat|soy|soya|almond|plant[- ]?based|non[- ]?dairy|dairy[- ]?free|vegan)";
const PLANT_YOGURT_PREFIX_PATTERN =
  "(?:coconut|almond|soy|soya|cashew|oat|plant[- ]?based|non[- ]?dairy|dairy[- ]?free|vegan)";
const PLANT_BUTTER_PREFIX_PATTERN =
  "(?:almond|peanut|cashew|sunflower|sesame|seed|nut|cocoa)";

function isAllowedPlantDairyAlternative(text: string, pattern: string, matchStart: number): boolean {
  const prefix = text.slice(Math.max(0, matchStart - 48), matchStart);
  const suffix = text.slice(matchStart, matchStart + 48);

  if (pattern === "milk") {
    return new RegExp(`${PLANT_MILK_PREFIX_PATTERN}\\s+$`, "i").test(prefix);
  }
  if (pattern === "cream") {
    return new RegExp(`${PLANT_CREAM_PREFIX_PATTERN}\\s+$`, "i").test(prefix);
  }
  if (pattern === "yogurt" || pattern === "yoghurt") {
    return new RegExp(`${PLANT_YOGURT_PREFIX_PATTERN}\\s+$`, "i").test(prefix);
  }
  if (pattern === "butter") {
    return new RegExp(`${PLANT_BUTTER_PREFIX_PATTERN}\\s+$`, "i").test(prefix);
  }
  if (pattern === "rice") {
    return /(?:cauliflower|konjac|miracle)\s+$/i.test(prefix);
  }
  if (pattern === "flour") {
    return /(?:almond|coconut|hazelnut|flaxseed|sunflower seed|pumpkin seed)\s+$/i.test(prefix);
  }
  if (pattern === "noodle" || pattern === "noodles" || pattern === "pasta" || pattern === "spaghetti") {
    return /(?:zucchini|konjac|shirataki|palmini|heart of palm|hearts of palm)\s+$/i.test(prefix) ||
      (pattern === "spaghetti" && /^spaghetti\s+squash/i.test(suffix));
  }
  if (pattern === "tortilla") {
    return /(?:lettuce|cheese|almond flour|coconut flour)\s+$/i.test(prefix);
  }

  return false;
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
    const regex = new RegExp(`\\b${escaped}s?\\b`, "gi");
    const matches = [...text.matchAll(regex)];
    if (!matches.length) continue;
    if (matches.some((match) => !isAllowedPlantDairyAlternative(text, pattern, match.index ?? 0))) return pattern;
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
    const englishHit = matchesEnglishPattern(englishHaystack, patterns.english);
    if (englishHit) return { kind: "diet", diet, match: englishHit };
    const arabicHit = matchesArabicPattern(arabicHaystack, patterns.arabic);
    if (arabicHit) return { kind: "diet", diet, match: arabicHit };
  }

  for (const allergen of ctx.allergens) {
    const patterns = resolveAllergenForbiddenPatterns(allergen);
    if (!patterns) continue;
    const englishHit = matchesEnglishPattern(englishHaystack, patterns.english);
    if (englishHit) return { kind: "allergen", allergen, match: englishHit };
    const arabicHit = matchesArabicPattern(arabicHaystack, patterns.arabic);
    if (arabicHit) return { kind: "allergen", allergen, match: arabicHit };
  }

  return null;
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

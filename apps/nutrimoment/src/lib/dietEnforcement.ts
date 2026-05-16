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
    // Paleo is a strong preference, not strict in our codebase. We treat it as
    // a soft hint at the prompt level only; no server-side filter to avoid
    // dropping otherwise reasonable recipes.
    english: [],
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
    // Keto enforcement is calorie/macro-based, not ingredient-based, so leave
    // this empty and let `nutritionGoals.maxCarbs` in rankingService handle it.
    english: [],
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

export interface DietEnforcementContext {
  diets: string[];
  allergens: string[];
}

function resolveAllergenForbiddenPatterns(allergen: string): ForbiddenPatternSet | null {
  const normalized = normalizeForMatch(allergen);
  const normalizedArabic = normalizeArabicForMatch(allergen);
  const key = ALLERGEN_KEY_ALIASES[normalized] ?? ALLERGEN_KEY_ALIASES[normalizedArabic] ?? normalized;
  const known = ALLERGEN_FORBIDDEN_PATTERNS[key];
  if (known) return known;

  const arabic = normalizedArabic && /[\u0600-\u06FF]/.test(normalizedArabic) ? [allergen, normalizedArabic] : [];
  const english = normalized && !/[\u0600-\u06FF]/.test(normalized) ? [normalized] : [];
  if (!arabic.length && !english.length) return null;

  return { english, arabic };
}

export function hasActiveDietConstraints(ctx: DietEnforcementContext): boolean {
  return ctx.diets.some((diet) => DIET_FORBIDDEN_PATTERNS[diet]?.english.length || DIET_FORBIDDEN_PATTERNS[diet]?.arabic.length)
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
  const normalizedText = normalizeArabicForMatch(text);
  const tokens = extractArabicTokens(normalizedText);
  for (const pattern of patterns) {
    if (!pattern) continue;
    const normalizedPattern = normalizeArabicForMatch(pattern);
    if (!normalizedPattern) continue;
    if (normalizedPattern.includes(" ")) {
      const escaped = normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|[^\\p{Script=Arabic}\\p{L}\\p{N}])${escaped}($|[^\\p{Script=Arabic}\\p{L}\\p{N}])`, "u");
      if (regex.test(normalizedText)) return pattern;
      continue;
    }
    if (tokens.some((token) => arabicTokenVariants(token).has(normalizedPattern))) return pattern;
  }
  return null;
}

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
    const patterns = DIET_FORBIDDEN_PATTERNS[diet];
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
    const patterns = DIET_FORBIDDEN_PATTERNS[diet];
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
    const patterns = DIET_FORBIDDEN_PATTERNS[diet];
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

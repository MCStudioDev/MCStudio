export interface RecipePhotoIdentity {
  alternateSignatures: string[];
  beanTypeKey?: string;
  canonicalDishKey?: string;
  cleanQuery: string;
  cookingMethodKey?: string;
  coreTokens: string[];
  cuisineKey?: string;
  familyKey?: string;
  mainIngredientKey?: string;
  mealTypeKey?: string;
  sauceKey?: string;
  searchQueries: string[];
  starchKey?: string;
  signature: string;
}

export interface KnownDishDefinition {
  aliases: RegExp[];
  canonicalName: string;
  cuisineKey?: string;
  imageUrl?: string;
  key: string;
}

const ARABIC = {
  balila: "\u0628\u0644\u064a\u0644\u0629",
  bean: "\u0641\u0627\u0635\u0648\u0644\u064a\u0627",
  besara: "\u0628\u0635\u0627\u0631\u0629",
  egg: "\u0628\u064a\u0636",
  egypt: "\u0645\u0635\u0631\u064a",
  egyptAdj: "\u0645\u0635\u0631\u064a\u0629",
  fava: "\u0641\u0648\u0644",
  loubia: "\u0644\u0648\u0628\u064a\u0627",
  middleEast: "\u0634\u0631\u0642 \u0623\u0648\u0633\u0637\u064a\u0629",
  middleEastAlt: "\u0634\u0631\u0642 \u0627\u0648\u0633\u0637\u064a\u0629",
  chickpea: "\u062d\u0645\u0635",
  lentil: "\u0639\u062f\u0633",
  rice: "\u0631\u0632",
  shakshuka: "\u0634\u0643\u0634\u0648\u0643\u0629"
} as const;

const TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bkposhary\b/gi, "koshary"],
  [/\bkoshari\b/gi, "koshary"],
  [/\bkushari\b/gi, "koshary"],
  [/\bborghol\b/gi, "bulgur"],
  [/\bburghul\b/gi, "bulgur"],
  [/\bburghol\b/gi, "bulgur"],
  [/\bkofta\b/gi, "kafta"],
  [/\bkofte\b/gi, "kafta"],
  [/\bkefta\b/gi, "kafta"],
  [/\bkufta\b/gi, "kafta"],
  [/\bfoul\b/gi, "ful"],
  [/\bfuul\b/gi, "ful"],
  [/\bshakshouka\b/gi, "shakshuka"],
  [/\bfasoulia\b/gi, "fasolia"],
  [/\bfasoolia\b/gi, "fasolia"],
  [/\blubia\b/gi, "loubia"],
  [/\bbessara\b/gi, "besara"]
];

const QUERY_NOISE_PATTERNS = [
  /\b(food plated|prepared food|prepared|recipe|dish|meal|food)\b/gi,
  /\b\d+(?:\/\d+)?\s*(?:g|gram|grams|kg|lb|lbs|oz|cup|cups|tbsp|tsp|large|small|medium|can|cans)\b/gi,
  /[()[\]"]/g
];

export const KNOWN_DISHES: KnownDishDefinition[] = [
  {
    aliases: [/\b(kafta|kebab|kabab)\b/i],
    canonicalName: "kafta kebab",
    cuisineKey: "middle-eastern",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg/960px-Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg",
    key: "kafta"
  },
  {
    aliases: [/\b(koshary|koshari|kushari)\b/i],
    canonicalName: "koshary",
    cuisineKey: "egyptian",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Egyptian_food_Koshary.jpg/960px-Egyptian_food_Koshary.jpg",
    key: "koshary"
  },
  {
    aliases: [/\b(ful|medames)\b/i, /\bfava bean/i, new RegExp(ARABIC.fava, "iu")],
    canonicalName: "ful medames",
    cuisineKey: "egyptian",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bf/Ful_medames_%28arabic_meal%29.jpg",
    key: "ful-medames"
  },
  {
    aliases: [/\bmujadara\b/i, /\bmujaddara\b/i],
    canonicalName: "mujadara",
    cuisineKey: "middle-eastern",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Mujaddara.jpg/960px-Mujaddara.jpg",
    key: "mujadara"
  },
  {
    aliases: [/\bshakshuka\b/i, new RegExp(ARABIC.shakshuka, "iu")],
    canonicalName: "shakshuka",
    cuisineKey: "middle-eastern",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Shakshuka%202025.jpg",
    key: "shakshuka"
  },
  {
    aliases: [/\bbesara\b/i, new RegExp(ARABIC.besara, "iu")],
    canonicalName: "besara",
    cuisineKey: "egyptian",
    key: "besara"
  },
  {
    aliases: [/\bbalila\b/i, new RegExp(ARABIC.balila, "iu")],
    canonicalName: "balila",
    cuisineKey: "middle-eastern",
    key: "balila"
  },
  {
    aliases: [/\bfasolia\b/i, new RegExp(ARABIC.bean, "iu")],
    canonicalName: "fasolia",
    cuisineKey: "middle-eastern",
    key: "fasolia"
  },
  {
    aliases: [/\bloubia\b/i, new RegExp(ARABIC.loubia, "iu")],
    canonicalName: "loubia bzeit",
    cuisineKey: "middle-eastern",
    key: "loubia-bzeit"
  }
];

const CUISINE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "egyptian", pattern: new RegExp(`\\begyptian\\b|${ARABIC.egyptAdj}|${ARABIC.egypt}`, "iu") },
  {
    key: "middle-eastern",
    pattern: new RegExp(`\\bmiddle eastern\\b|${ARABIC.middleEast}|${ARABIC.middleEastAlt}`, "iu")
  },
  { key: "mediterranean", pattern: /\bmediterranean\b/iu },
  { key: "indian", pattern: /\bindian\b/iu },
  { key: "italian", pattern: /\bitalian\b/iu },
  { key: "asian", pattern: /\basian\b/iu },
  { key: "mexican", pattern: /\bmexican\b|tex[- ]?mex|southwestern/iu },
  { key: "american", pattern: /\bamerican\b/iu },
  { key: "international", pattern: /\binternational\b/iu },
  { key: "general", pattern: /\bgeneral\b/iu }
];

const MAIN_INGREDIENT_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "chicken", pattern: /\bchicken\b/iu },
  { key: "shrimp", pattern: /\bshrimp|prawn\b/iu },
  { key: "lamb", pattern: /\blamb\b/iu },
  { key: "beef", pattern: /\bbeef|steak|meat\b/iu },
  { key: "veal", pattern: /\bveal\b/iu },
  { key: "fish", pattern: /\bwhite fish|fish|cod|tilapia|sea bass|snapper|salmon\b/iu },
  { key: "tuna", pattern: /\btuna\b/iu },
  { key: "tofu", pattern: /\btofu\b/iu },
  { key: "yogurt", pattern: /\byogurt|labneh\b/iu },
  { key: "egg", pattern: new RegExp(`\\begg\\b|${ARABIC.egg}`, "iu") },
  { key: "chickpea", pattern: new RegExp(`\\bchickpea|chickpeas\\b|${ARABIC.chickpea}`, "iu") },
  { key: "lentil", pattern: new RegExp(`\\blentil|lentils\\b|${ARABIC.lentil}`, "iu") },
  { key: "bean", pattern: new RegExp(`\\bbean|beans|fava\\b|${ARABIC.fava}|${ARABIC.bean}|${ARABIC.loubia}`, "iu") },
  { key: "rice", pattern: new RegExp(`\\brice\\b|${ARABIC.rice}`, "iu") }
];

const BEAN_TYPE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "white-bean", pattern: /\bwhite bean|white beans|cannellini|navy bean|navy beans\b/iu },
  { key: "green-bean", pattern: /\bgreen bean|green beans\b/iu },
  { key: "black-bean", pattern: /\bblack bean|black beans\b/iu },
  { key: "fava-bean", pattern: new RegExp(`\\bfava|fava bean|fava beans\\b|${ARABIC.fava}`, "iu") },
  { key: "chickpea", pattern: new RegExp(`\\bchickpea|chickpeas\\b|${ARABIC.chickpea}`, "iu") }
];

const SAUCE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "red-sauce", pattern: /\bred sauce|tomato sauce|marinara|pomodoro|tomato basil\b/iu },
  { key: "white-sauce", pattern: /\bwhite sauce|alfredo|cream sauce|creamy sauce|creamy\b/iu },
  { key: "pesto", pattern: /\bpesto\b/iu },
  { key: "soy-garlic", pattern: /\bsoy garlic|garlic soy|soy sauce\b/iu },
  { key: "curry", pattern: /\bcurry sauce|curry\b/iu }
];

const STARCH_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "pasta", pattern: /\bpasta|spaghetti|penne|fettuccine|macaroni\b/iu },
  { key: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/iu },
  { key: "rice", pattern: new RegExp(`\\brice\\b|${ARABIC.rice}`, "iu") },
  { key: "bulgur", pattern: /\bbulgur|burghul|borghol\b/iu },
  { key: "potato", pattern: /\bpotato|potatoes\b/iu },
  { key: "bread", pattern: /\bbread|toast|bun|roll|wrap\b/iu }
];

const COOKING_METHOD_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "grilled", pattern: /\bgrilled|chargrilled\b/iu },
  { key: "fried", pattern: /\bfried|crispy|breaded|crunchy\b/iu },
  { key: "baked", pattern: /\bbaked\b/iu },
  { key: "roasted", pattern: /\broasted\b/iu },
  { key: "stir-fry", pattern: /\bstir[- ]?fry\b/iu },
  { key: "pan-seared", pattern: /\bpan[- ]seared|seared\b/iu }
];

const MEAL_TYPE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "pasta", pattern: /\bpasta|spaghetti|penne|fettuccine|macaroni\b/iu },
  { key: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/iu },
  { key: "salad", pattern: /\bsalad\b/iu },
  { key: "soup", pattern: /\bsoup\b/iu },
  { key: "stew", pattern: /\bstew\b/iu },
  { key: "skillet", pattern: /\bskillet\b/iu },
  { key: "stir-fry", pattern: /\bstir[- ]?fry\b/iu },
  { key: "chili", pattern: /\bchili\b/iu },
  { key: "dip", pattern: /\bdip\b/iu },
  { key: "pilaf", pattern: /\bpilaf\b|\bplov\b/iu },
  { key: "bowl", pattern: /\bbowl\b/iu },
  { key: "omelet", pattern: /\bomelet|omelette\b/iu },
  { key: "scramble", pattern: /\bscramble|scrambled\b/iu },
  { key: "tagine", pattern: /\btagine\b/iu },
  { key: "grill", pattern: /\bgrilled|grill\b/iu },
  { key: "kofta", pattern: /\bkafta\b|كفتة/iu },
  { key: "shakshuka", pattern: new RegExp(`\\bshakshuka\\b|${ARABIC.shakshuka}`, "iu") }
];

const CORE_TOKEN_STOP_WORDS = new Set([
  "adapted",
  "and",
  "baked",
  "bowl",
  "food",
  "general",
  "healthy",
  "inspired",
  "international",
  "lighter",
  "meal",
  "middle",
  "eastern",
  "mediterranean",
  "prepared",
  "recipe",
  "roasted",
  "sauteed",
  "simple",
  "spiced",
  "style",
  "traditional",
  "with"
]);

export function buildRecipePhotoIdentity(query: string): RecipePhotoIdentity {
  const cleanQuery = normalizeRecipePhotoQuery(query);
  const knownDish = findKnownDish(cleanQuery);
  const cuisineKey = knownDish?.cuisineKey ?? detectCuisine(cleanQuery);
  const mainIngredientKey = detectMainIngredient(cleanQuery);
  const beanTypeKey = detectBeanType(cleanQuery);
  const sauceKey = detectSauce(cleanQuery);
  const starchKey = detectStarch(cleanQuery);
  const cookingMethodKey = detectCookingMethod(cleanQuery);
  const mealTypeKey = detectMealType(cleanQuery);
  const familyKey =
    knownDish?.key ??
    detectRecipePhotoFamily(cleanQuery, {
      beanTypeKey,
      cuisineKey,
      mainIngredientKey,
      mealTypeKey
    });
  const coreTokens = getCoreTokens(cleanQuery, knownDish?.canonicalName);
  const searchQueries = buildSearchQueries(cleanQuery, {
    beanTypeKey,
    canonicalName: knownDish?.canonicalName,
    cookingMethodKey,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    starchKey
  });
  const signature = buildRecipePhotoSignature({
    canonicalDishKey: knownDish?.key,
    cookingMethodKey,
    coreTokens,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    starchKey
  });
  const alternateSignatures = buildAlternateRecipePhotoSignatures({
    beanTypeKey,
    canonicalDishKey: knownDish?.key,
    cookingMethodKey,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    starchKey
  }).filter((candidate) => candidate !== signature);

  return {
    alternateSignatures,
    beanTypeKey,
    canonicalDishKey: knownDish?.key,
    cleanQuery,
    cookingMethodKey,
    coreTokens,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    searchQueries,
    starchKey,
    signature
  };
}

export function findKnownDish(query: string) {
  const normalized = normalizeRecipePhotoQuery(query);
  return KNOWN_DISHES.find((dish) => dish.aliases.some((alias) => alias.test(normalized))) ?? null;
}

export function normalizeRecipePhotoQuery(query: string) {
  const replaced = TOKEN_REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), query);
  const clean = QUERY_NOISE_PATTERNS.reduce((value, pattern) => value.replace(pattern, " "), replaced)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return clean || "food";
}

function detectCuisine(query: string) {
  return CUISINE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectMainIngredient(query: string) {
  return MAIN_INGREDIENT_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectBeanType(query: string) {
  return BEAN_TYPE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectSauce(query: string) {
  return SAUCE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectStarch(query: string) {
  return STARCH_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectCookingMethod(query: string) {
  return COOKING_METHOD_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectMealType(query: string) {
  return MEAL_TYPE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function getCoreTokens(query: string, canonicalName?: string) {
  const source = canonicalName ? `${canonicalName} ${query}` : query;
  const tokens = source
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((token) => token.length >= 3 && !CORE_TOKEN_STOP_WORDS.has(token));

  return Array.from(new Set(tokens)).slice(0, 6);
}

function detectRecipePhotoFamily(
  cleanQuery: string,
  details: {
    beanTypeKey?: string;
    cuisineKey?: string;
    mainIngredientKey?: string;
    mealTypeKey?: string;
  }
) {
  if (details.mealTypeKey === "shakshuka") return "shakshuka";
  if (/\bbesara\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.besara)) return "besara";
  if (/\bbalila\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.balila)) return "balila";
  if (/\bfasolia\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.bean)) return "fasolia";
  if (/\bloubia\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.loubia)) return "loubia-bzeit";
  if (details.mealTypeKey === "kofta") return "kafta";
  if (/\blabneh\b/iu.test(cleanQuery)) return "labneh-bowl";
  if (/\bgreek yogurt\b/iu.test(cleanQuery) || (details.mainIngredientKey === "yogurt" && /\bberries|walnuts|chia\b/iu.test(cleanQuery))) {
    return "yogurt-bowl";
  }
  if (details.mainIngredientKey === "egg" && details.mealTypeKey === "omelet") return "vegetable-omelet";
  if (details.mainIngredientKey === "egg" && (details.mealTypeKey === "scramble" || /\bscramble|scrambled\b/iu.test(cleanQuery))) {
    return "egg-scramble";
  }
  if (/\bshawarma\b/iu.test(cleanQuery) && details.mainIngredientKey === "chicken") return "chicken-shawarma-bowl";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "tagine") return "chicken-tagine";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "grill") return "grilled-chicken";
  if (details.mainIngredientKey === "fish" && details.mealTypeKey === "salad") return "salmon-salad";
  if (details.mainIngredientKey === "fish") return "baked-fish";
  if (details.mealTypeKey === "pilaf" && details.mainIngredientKey === "chicken") return "chicken-rice-pilaf";
  if (details.mealTypeKey === "pilaf" && (details.mainIngredientKey === "fish" || details.mainIngredientKey === "tuna")) {
    return "fish-rice-pilaf";
  }
  if (details.mealTypeKey === "pilaf") return "rice-pilaf";
  if (details.mainIngredientKey === "tuna" && details.mealTypeKey === "salad") return "tuna-rice-salad";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "salad") {
    return "chicken-rice-salad";
  }

  if (details.beanTypeKey === "white-bean" && details.mealTypeKey === "salad") return "white-bean-salad";
  if (details.beanTypeKey === "white-bean" && ["soup", "stew", "skillet", "stir-fry"].includes(details.mealTypeKey ?? "")) {
    return "white-bean-stew";
  }

  if (details.mainIngredientKey === "bean" && details.mealTypeKey === "salad") return "bean-salad";
  if (details.mainIngredientKey === "bean" && details.mealTypeKey === "soup") return "bean-soup";
  if (details.mainIngredientKey === "bean" && ["stew", "skillet", "stir-fry"].includes(details.mealTypeKey ?? "")) {
    return "bean-stew";
  }
  if (details.mainIngredientKey === "bean" && details.mealTypeKey === "chili") return "bean-chili";
  if (details.mainIngredientKey === "chickpea" && details.mealTypeKey === "salad") return "chickpea-salad";

  return undefined;
}

function buildSearchQueries(
  cleanQuery: string,
  details: {
    beanTypeKey?: string;
    canonicalName?: string;
    cookingMethodKey?: string;
    cuisineKey?: string;
    familyKey?: string;
    mainIngredientKey?: string;
    mealTypeKey?: string;
    sauceKey?: string;
    starchKey?: string;
  }
) {
  const familySearchQueries = getFamilySearchQueries(details.familyKey, details.cuisineKey);
  const detailedVariant = [details.cookingMethodKey, details.mainIngredientKey, details.sauceKey, details.starchKey ?? details.mealTypeKey]
    .filter(Boolean)
    .join(" ");
  const proteinVariant = [details.mainIngredientKey, details.sauceKey, details.starchKey ?? details.mealTypeKey]
    .filter(Boolean)
    .join(" ");
  const cuisineVariant = [details.cuisineKey, details.mainIngredientKey, details.sauceKey, details.starchKey ?? details.mealTypeKey]
    .filter(Boolean)
    .join(" ");

  const candidates = [
    details.canonicalName ? [details.canonicalName, details.cuisineKey].filter(Boolean).join(" ") : "",
    details.canonicalName || "",
    ...familySearchQueries,
    cleanQuery,
    cleanQuery.replace(/\s+with\s+.+$/i, ""),
    detailedVariant,
    proteinVariant,
    cuisineVariant,
    [details.cuisineKey, details.beanTypeKey ?? details.mainIngredientKey, details.familyKey ?? details.canonicalName]
      .filter(Boolean)
      .join(" "),
    cleanQuery
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .slice(0, 6)
      .join(" ")
  ]
    .map((candidate) => candidate.trim().replace(/\s+/g, " "))
    .filter((candidate) => candidate.length >= 3);

  return Array.from(new Set(candidates));
}

function getFamilySearchQueries(familyKey?: string, cuisineKey?: string) {
  const withCuisine = (value: string) => [value, cuisineKey].filter(Boolean).join(" ").trim();

  switch (familyKey) {
    case "white-bean-salad":
      return [withCuisine("white bean salad"), withCuisine("bean salad")];
    case "white-bean-stew":
      return [withCuisine("white bean stew"), withCuisine("bean stew"), withCuisine("fasolia")];
    case "bean-salad":
      return [withCuisine("bean salad")];
    case "bean-soup":
      return [withCuisine("bean soup")];
    case "bean-stew":
      return [withCuisine("bean stew"), withCuisine("bean tomato stew")];
    case "bean-chili":
      return [withCuisine("bean chili"), withCuisine("chili")];
    case "chickpea-salad":
      return [withCuisine("chickpea salad")];
    case "yogurt-bowl":
      return [withCuisine("greek yogurt berries"), withCuisine("yogurt bowl"), withCuisine("breakfast yogurt bowl")];
    case "labneh-bowl":
      return [withCuisine("labneh"), withCuisine("labneh cucumber zaatar"), withCuisine("middle eastern yogurt dip")];
    case "vegetable-omelet":
      return [withCuisine("vegetable omelet"), withCuisine("spinach omelet"), withCuisine("bell pepper omelet")];
    case "egg-scramble":
      return [withCuisine("scrambled eggs spinach"), withCuisine("egg scramble"), withCuisine("breakfast eggs")];
    case "chicken-shawarma-bowl":
      return [
        withCuisine("chicken shawarma"),
        withCuisine("chicken shawarma bowl"),
        withCuisine("shawarma plate"),
        withCuisine("shawarma wrap")
      ];
    case "chicken-tagine":
      return [withCuisine("chicken tagine"), withCuisine("moroccan chicken"), withCuisine("chicken vegetable tagine")];
    case "grilled-chicken":
      return [withCuisine("grilled chicken plate"), withCuisine("grilled chicken breast"), withCuisine("roasted chicken vegetables")];
    case "salmon-salad":
      return [withCuisine("salmon salad"), withCuisine("fish salad"), withCuisine("grilled salmon salad")];
    case "baked-fish":
      return [withCuisine("baked fish plate"), withCuisine("white fish vegetables"), withCuisine("roasted fish")];
    case "rice-pilaf":
      return [withCuisine("rice pilaf"), withCuisine("pilaf"), withCuisine("plov")];
    case "chicken-rice-pilaf":
      return [withCuisine("chicken rice pilaf"), withCuisine("chicken and rice"), withCuisine("pilaf")];
    case "fish-rice-pilaf":
      return [withCuisine("fish rice"), withCuisine("fish and rice"), withCuisine("pilaf")];
    case "tuna-rice-salad":
      return [withCuisine("tuna salad"), withCuisine("rice salad"), withCuisine("tuna rice")];
    case "chicken-rice-salad":
      return [withCuisine("chicken rice salad"), withCuisine("salad with rice"), withCuisine("chicken salad")];
    case "shakshuka":
      return [withCuisine("shakshuka")];
    case "besara":
      return [withCuisine("besara"), withCuisine("fava bean soup")];
    case "balila":
      return [withCuisine("balila"), withCuisine("chickpea bowl")];
    case "fasolia":
      return [withCuisine("fasolia"), withCuisine("white bean stew")];
    case "loubia-bzeit":
      return [withCuisine("loubia bzeit"), withCuisine("green bean stew")];
    case "kafta":
      return [withCuisine("kafta kebab")];
    default:
      return [];
  }
}

function buildRecipePhotoSignature({
  canonicalDishKey,
  cookingMethodKey,
  coreTokens,
  cuisineKey,
  familyKey,
  mainIngredientKey,
  mealTypeKey,
  sauceKey,
  starchKey
}: Pick<
  RecipePhotoIdentity,
  | "canonicalDishKey"
  | "cookingMethodKey"
  | "coreTokens"
  | "cuisineKey"
  | "familyKey"
  | "mainIngredientKey"
  | "mealTypeKey"
  | "sauceKey"
  | "starchKey"
>) {
  if (canonicalDishKey) {
    return `${canonicalDishKey}|${cuisineKey ?? "general"}`;
  }

  if (familyKey) {
    return `${familyKey}|${cuisineKey ?? "general"}|${mainIngredientKey ?? "general"}|${sauceKey ?? starchKey ?? "general"}`;
  }

  const coreSlug = slugify(coreTokens.slice(0, 5).join("-")) || "meal";
  return `${coreSlug}|${cuisineKey ?? "general"}|${mainIngredientKey ?? "general"}|${mealTypeKey ?? starchKey ?? "general"}|${sauceKey ?? cookingMethodKey ?? "general"}`;
}

function buildAlternateRecipePhotoSignatures({
  beanTypeKey,
  canonicalDishKey,
  cookingMethodKey,
  cuisineKey,
  familyKey,
  mainIngredientKey,
  mealTypeKey,
  sauceKey,
  starchKey
}: Pick<
  RecipePhotoIdentity,
  | "beanTypeKey"
  | "canonicalDishKey"
  | "cookingMethodKey"
  | "cuisineKey"
  | "familyKey"
  | "mainIngredientKey"
  | "mealTypeKey"
  | "sauceKey"
  | "starchKey"
>) {
  if (canonicalDishKey) {
    return [];
  }

  const candidates = [
    familyKey ? `${familyKey}|${cuisineKey ?? "general"}` : "",
    [beanTypeKey ?? mainIngredientKey, mealTypeKey, cuisineKey].filter(Boolean).join("|"),
    [mainIngredientKey, mealTypeKey, cuisineKey].filter(Boolean).join("|"),
    [mainIngredientKey, sauceKey, starchKey].filter(Boolean).join("|"),
    [mainIngredientKey, cookingMethodKey, starchKey].filter(Boolean).join("|"),
    [familyKey, mealTypeKey].filter(Boolean).join("|")
  ]
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length >= 3);

  return Array.from(new Set(candidates));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

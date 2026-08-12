import { normalizeRecipeReferenceCuisineKey, normalizeRecipeReferenceIngredient } from "@/lib/recipeReferenceNormalization";
import type { RecipeReferenceTaxonomy } from "@/lib/recipeReferenceTypes";

type ClassifierInput = {
  directions: string[];
  ingredientCanonicals: string[];
  ingredients: string[];
  mainIngredients: string[];
  title: string;
};

type CuisineRule = {
  cuisine: string;
  ingredientWeights?: Array<[RegExp, number, string]>;
  titleWeights?: Array<[RegExp, number, string]>;
};

export interface RecipeCuisineClassifierInput {
  title: string;
  ingredients: string[];
  directions: string[];
}

export interface RecipeCuisineClassification {
  cuisine: string;
  confidence: number;
  signals: string[];
  candidates: Array<{ cuisine: string; score: number }>;
  needsReview: boolean;
}

const CULINARY_SIGNAL_RULES: Array<{
  cuisine: string;
  kind: "technique" | "sauce" | "herb";
  pattern: RegExp;
  weight: number;
  signal: string;
}> = [
  { cuisine: "Egyptian", kind: "technique", pattern: /\b(stew|stuffed|mahshi|braise)\b/i, weight: 8, signal: "egyptian technique marker" },
  { cuisine: "Egyptian", kind: "herb", pattern: /\b(dill|parsley|coriander)\b/i, weight: 5, signal: "egyptian herb marker" },
  { cuisine: "Turkish", kind: "technique", pattern: /\b(grill|skewer|stuffed|bake)\b/i, weight: 6, signal: "turkish technique marker" },
  { cuisine: "Turkish", kind: "herb", pattern: /\b(dill|mint|parsley)\b/i, weight: 5, signal: "turkish herb marker" },
  { cuisine: "Indian", kind: "technique", pattern: /\b(tandoor|temper|tadka|curry|simmer)\b/i, weight: 12, signal: "indian technique marker" },
  { cuisine: "Indian", kind: "sauce", pattern: /\b(curry sauce|masala sauce|makhani)\b/i, weight: 10, signal: "indian sauce marker" },
  { cuisine: "Indian", kind: "herb", pattern: /\b(cilantro|coriander leaves|curry leaves)\b/i, weight: 7, signal: "indian herb marker" },
  { cuisine: "Mexican", kind: "technique", pattern: /\b(grill|char|roast|fry)\b/i, weight: 5, signal: "mexican technique marker" },
  { cuisine: "Mexican", kind: "sauce", pattern: /\b(salsa|mole|adobo)\b/i, weight: 12, signal: "mexican sauce marker" },
  { cuisine: "Mexican", kind: "herb", pattern: /\b(cilantro)\b/i, weight: 7, signal: "mexican herb marker" },
  { cuisine: "Italian", kind: "technique", pattern: /\b(risotto|braise|bake|roast)\b/i, weight: 8, signal: "italian technique marker" },
  { cuisine: "Italian", kind: "sauce", pattern: /\b(bechamel|marinara|pesto|alfredo)\b/i, weight: 12, signal: "italian sauce marker" },
  { cuisine: "Italian", kind: "herb", pattern: /\b(basil|oregano|parsley)\b/i, weight: 7, signal: "italian herb marker" },
  { cuisine: "Mediterranean", kind: "technique", pattern: /\b(grill|roast|stuffed|tagine|tajine)\b/i, weight: 6, signal: "mediterranean technique marker" },
  { cuisine: "Mediterranean", kind: "sauce", pattern: /\b(tahini|harissa|tzatziki)\b/i, weight: 10, signal: "mediterranean sauce marker" },
  { cuisine: "Mediterranean", kind: "herb", pattern: /\b(mint|dill|parsley|oregano)\b/i, weight: 6, signal: "mediterranean herb marker" },
  { cuisine: "Thai", kind: "technique", pattern: /\b(stir fry|stir-fry|wok|curry)\b/i, weight: 8, signal: "thai technique marker" },
  { cuisine: "Thai", kind: "sauce", pattern: /\b(fish sauce|coconut curry)\b/i, weight: 10, signal: "thai sauce marker" },
  { cuisine: "Thai", kind: "herb", pattern: /\b(thai basil|cilantro)\b/i, weight: 6, signal: "thai herb marker" }
];

const CUISINE_RULES: CuisineRule[] = [
  {
    cuisine: "Egyptian",
    titleWeights: [
      [/\b(egyptian|koshary|koshari|ful medames|foul medames|taameya|ta'?ameya|molokhia|mulukhiyah|hawawshi|bessara|besara|sayadeya|sayadieh|kebda|kibda|dukkah|basbousa|umm ali|om ali|roz bel laban)\b/i, 95, "egyptian named dish"],
      [/\b(alexandrian|iskandarani|eskandarani)\b/i, 90, "egyptian region"]
    ],
    ingredientWeights: [
      [/\b(molokhia|fava beans?|broad beans?|ghee|baladi bread|dukkah)\b/i, 28, "egyptian pantry marker"],
      [/\b(rice|lentils?|chickpeas?|tomato|onion|garlic|cumin)\b/i, 8, "egyptian support ingredient"]
    ]
  },
  {
    cuisine: "Turkish",
    titleWeights: [
      [/\b(turkish|lahmacun|borek|börek|manti|mantı|menemen|imam bayildi|imam bayıldı|adana kebab|iskender kebab|doner|döner|pide|kofte|köfte|kisir|kısır|mucver|mücver|sutlac|sütlaç|lokum)\b/i, 92, "turkish named dish"]
    ],
    ingredientWeights: [
      [/\b(yogurt|sumac|eggplant|lamb|mint|bulgur|pomegranate molasses)\b/i, 12, "turkish support ingredient"]
    ]
  },
  {
    cuisine: "Indian",
    titleWeights: [
      [/\b(indian|tandoori|tikka masala|chicken tikka|biryani|chana masala|rogan josh|aloo gobi|palak paneer|saag paneer|rajma|samosa|pakora|kheer|gulab jamun|pav bhaji|dhokla|dosa|idli|vindaloo|korma)\b/i, 92, "indian named dish"],
      [/\b(curry|masala)\b/i, 40, "indian method or spice family"]
    ],
    ingredientWeights: [
      [/\b(garam masala|turmeric|cumin|coriander|cardamom|fenugreek|mustard seed|curry leaves|paneer|ghee|naan|basmati)\b/i, 25, "indian pantry marker"],
      [/\b(yogurt|ginger|garlic|chili|lentils?|chickpeas?)\b/i, 8, "indian support ingredient"]
    ]
  },
  {
    cuisine: "Mexican",
    titleWeights: [
      [/\b(mexican|tex[-\s]?mex|enchiladas?|tacos?|burritos?|quesadillas?|guacamole|tamales?|chiles rellenos?|carne asada|pozole|posole|mole poblano|al pastor|calabacitas|chilaquiles|huevos rancheros|pico de gallo|tostadas?|fajitas?|elote)\b/i, 90, "mexican named dish"],
      [/\b(veracruzana|oaxacan|yucatecan)\b/i, 92, "mexican region"]
    ],
    ingredientWeights: [
      [/\b(tortillas?|masa harina|hominy|tomatillo|poblano|jalapeno|jalapeño|cilantro|lime|salsa verde|salsa roja|chipotle|black beans?)\b/i, 22, "mexican pantry marker"],
      [/\b(cumin|corn|avocado|chili|queso|cotija)\b/i, 8, "mexican support ingredient"]
    ]
  },
  {
    cuisine: "Italian",
    titleWeights: [
      [/\b(italian|tuscan|sicilian|neapolitan|napolitana|calabrian|roman|bolognese|genovese|milanese|venetian|lasagn[ae]|ravioli|minestrone|tiramisu|cacciatore|pasta primavera|panzanella|pasta e fagioli|carbonara|parmigiana|chicken parmesan|eggplant parmesan|pizza margherita|risotto|bruschetta|gnocchi|osso buco|caprese|alfredo|florentine|piccata|scampi|manicotti|cannoli|focaccia|ziti|marsala)\b/i, 90, "italian named dish"]
    ],
    ingredientWeights: [
      [/\b(parmesan|parmigiano|basil|oregano|marinara|mozzarella|ricotta|prosciutto|pesto|arborio|olive oil|tomato sauce)\b/i, 22, "italian pantry marker"],
      [/\b(pasta|spaghetti|linguine|fettuccine|penne|macaroni|garlic|tomato)\b/i, 8, "italian support ingredient"]
    ]
  },
  {
    cuisine: "Mediterranean",
    titleWeights: [
      [/\b(mediterranean|greek|lebanese|levantine|moroccan|tunisian|hummus|falafel|tabbouleh|tabouli|fattoush|baba ganoush|baba ghanoush|tzatziki|greek salad|moussaka|spanakopita|souvlaki|shakshuka|ratatouille|bouillabaisse|nicoise|paella|gazpacho|couscous|tagine|tajine|dolma|dolmades|kibbeh|labneh|muhammara|halloumi|shawarma)\b/i, 88, "mediterranean named dish"]
    ],
    ingredientWeights: [
      [/\b(tahini|feta|olives?|olive oil|sumac|za'?atar|chickpeas?|eggplant|cucumber|lemon|parsley|mint|harissa)\b/i, 16, "mediterranean pantry marker"]
    ]
  },
  {
    cuisine: "East Asian",
    titleWeights: [
      [/\b(chinese|japanese|korean|teriyaki|kung pao|mapo tofu|miso|ramen|udon|bibimbap|bulgogi|kimchi|dumplings?)\b/i, 88, "east asian named dish"]
    ],
    ingredientWeights: [
      [/\b(soy sauce|sesame oil|ginger|rice vinegar|miso|gochujang|nori|tofu|scallions?)\b/i, 18, "east asian pantry marker"]
    ]
  },
  {
    cuisine: "Thai",
    titleWeights: [
      [/\b(thai|pad thai|tom yum|tom kha|green curry|red curry|panang|larb|som tam)\b/i, 90, "thai named dish"]
    ],
    ingredientWeights: [
      [/\b(fish sauce|lemongrass|kaffir|galangal|thai basil|coconut milk|lime leaves?)\b/i, 22, "thai pantry marker"]
    ]
  },
  {
    cuisine: "American",
    titleWeights: [
      [/\b(american|southern|bbq|barbecue|burger|meatloaf|sloppy joe|pot pie|mac and cheese|fried chicken|cobb salad|clam chowder)\b/i, 78, "american named dish"]
    ],
    ingredientWeights: [
      [/\b(ketchup|mustard|cheddar|bacon|ranch|barbecue sauce|hot dog buns?)\b/i, 12, "american pantry marker"]
    ]
  }
];

const PROTEIN_RULES: Array<[RegExp, string, string]> = [
  [/\b(ground chicken|chicken mince|minced chicken)\b/i, "Ground Chicken", "ground chicken"],
  [/\b(chicken|hen|poultry|drumsticks?|thighs?|wings?|chicken breast|chicken cutlets?)\b/i, "Chicken", "chicken"],
  [/\b(ground beef|minced beef|hamburger meat|hamburger)\b/i, "Ground Beef", "ground beef"],
  [/\b(steak|sirloin|ribeye|beef tenderloin)\b/i, "Steak", "steak"],
  [/\b(beef|brisket|chuck roast|pot roast|veal)\b/i, "Beef", "beef"],
  [/\b(lamb|mutton)\b/i, "Lamb", "lamb"],
  [/\b(liver|kebda|kibda|calf liver|beef liver|chicken liver)\b/i, "Liver", "liver"],
  [/\b(shrimp|prawns?)\b/i, "Shrimp", "shrimp"],
  [/\b(salmon)\b/i, "Salmon", "salmon"],
  [/\b(fish|cod|tilapia|halibut|snapper|bass|tuna)\b/i, "Fish", "fish"],
  [/\b(egg|eggs)\b/i, "Egg", "egg"],
  [/\b(tofu)\b/i, "Tofu", "tofu"],
  [/\b(chickpeas?|lentils?|beans?|fava)\b/i, "Legumes", "legumes"],
  [/\b(cheese|paneer|yogurt|cream)\b/i, "Dairy", "dairy"]
];

export function classifyRecipeReferenceTaxonomy(input: ClassifierInput): RecipeReferenceTaxonomy {
  const titleText = normalizeFreeText(input.title);
  const ingredientText = normalizeFreeText(input.ingredients.join(" "));
  const directionText = normalizeFreeText(input.directions.join(" "));
  const allText = `${titleText} ${ingredientText} ${directionText}`;
  const cuisineResult = classifyRecipeCuisine({
    title: input.title,
    ingredients: input.ingredients,
    directions: input.directions
  });
  const protein = detectProtein(input, allText);
  const cookingMethod = detectCookingMethod(titleText, directionText, allText);
  const mealType = detectMealType(titleText, ingredientText);
  const difficulty = detectDifficulty(input.ingredients.length, input.directions.length, allText);
  const flavorProfile = detectFlavorProfile(allText);
  const tags = detectTags(input, allText, cuisineResult.confidence);
  const estimatedCalories = estimateCalories(input, allText);
  const ingredientIds = detectIngredientIds(input);
  const techniques = detectTechniques(cookingMethod, allText);
  const estimatedPrepMinutes = estimatePrepMinutes(input, allText);
  const estimatedCookMinutes = estimateCookMinutes(cookingMethod, allText);
  const commonAllergens = detectCommonAllergens(allText);
  const validationWarnings = validateRecipeIntelligence(input, allText);
  const publishStatus = validationWarnings.some((warning) =>
    ["missing-title", "too-few-ingredients", "too-few-steps", "missing-real-cooking-action"].includes(warning)
  )
    ? "needs_review"
    : "ready";
  const imagePrompt = buildRecipeImagePrompt({
    cookingMethod,
    cuisine: cuisineResult.cuisine,
    flavorProfile,
    protein: protein?.label,
    title: input.title
  });

  return {
    cuisine: cuisineResult.cuisine,
    cuisineKey: normalizeRecipeReferenceCuisineKey(cuisineResult.cuisine),
    cuisineConfidence: cuisineResult.confidence,
    cuisineSignals: cuisineResult.signals,
    protein: protein?.label,
    proteinKey: protein?.key,
    mealType,
    cookingMethod,
    difficulty,
    flavorProfile,
    tags,
    estimatedCalories,
    ingredientIds,
    techniques,
    estimatedPrepMinutes,
    estimatedCookMinutes,
    commonAllergens,
    imagePrompt,
    publishStatus,
    validationWarnings,
    classifierSource: "rule_engine",
    needsClassifierReview: cuisineResult.confidence < 75 || cuisineResult.cuisine === "Global"
  };
}

export function buildRecipeReferenceTaxonomyBuckets(taxonomy: RecipeReferenceTaxonomy, mainIngredients: string[]) {
  const cuisineKey = taxonomy.cuisineKey || "global";
  const keys = new Set<string>([
    `cuisine::${cuisineKey}`,
    `meal::${taxonomy.mealType}`,
    `method::${taxonomy.cookingMethod}`,
    `difficulty::${taxonomy.difficulty}`,
    `status::${taxonomy.publishStatus}`,
    ...taxonomy.flavorProfile.map((tag) => `flavor::${toKey(tag)}`),
    ...taxonomy.tags.map((tag) => `tag::${toKey(tag)}`),
    ...taxonomy.techniques.map((technique) => `technique::${toKey(technique)}`),
    ...taxonomy.commonAllergens.map((allergen) => `allergen::${toKey(allergen)}`),
    ...taxonomy.ingredientIds.map((ingredientId) => `ingredient-id::${ingredientId}`)
  ]);

  if (taxonomy.proteinKey) {
    keys.add(`protein::${taxonomy.proteinKey}`);
    keys.add(`${cuisineKey}::protein::${taxonomy.proteinKey}`);
  }

  mainIngredients.map(normalizeRecipeReferenceIngredient).filter(Boolean).forEach((ingredient) => {
    keys.add(`ingredient::${ingredient}`);
    keys.add(`${cuisineKey}::ingredient::${ingredient}`);
  });

  return Array.from(keys).slice(0, 60);
}

export function classifyRecipeCuisine(input: RecipeCuisineClassifierInput): RecipeCuisineClassification {
  const titleText = normalizeFreeText(input.title);
  const ingredientText = normalizeFreeText(input.ingredients.join(" "));
  const directionText = normalizeFreeText(input.directions.join(" "));
  const scores = CUISINE_RULES.map((rule) => {
    let score = 0;
    const signals: string[] = [];
    for (const [pattern, weight, signal] of rule.titleWeights ?? []) {
      if (pattern.test(titleText)) {
        score += weight;
        signals.push(signal);
      }
    }
    const ingredientDirectionText = `${ingredientText} ${directionText}`;
    for (const [pattern, weight, signal] of rule.ingredientWeights ?? []) {
      if (pattern.test(ingredientDirectionText)) {
        score += weight;
        signals.push(signal);
      }
    }
    for (const signalRule of CULINARY_SIGNAL_RULES.filter((candidate) => candidate.cuisine === rule.cuisine)) {
      const source = signalRule.kind === "technique" ? directionText : ingredientDirectionText;
      if (signalRule.pattern.test(source)) {
        score += signalRule.weight;
        signals.push(signalRule.signal);
      }
    }
    return { cuisine: rule.cuisine, score, signals };
  }).sort((left, right) => right.score - left.score);

  const best = scores[0];
  const second = scores[1];
  if (!best || best.score < 35) {
    return {
      cuisine: "Global",
      confidence: 0,
      signals: [],
      candidates: scores.filter((candidate) => candidate.score > 0).slice(0, 5).map(({ cuisine, score }) => ({ cuisine, score })),
      needsReview: true
    };
  }

  const confidence = Math.max(0, Math.min(100, Math.round(best.score - Math.max(0, (second?.score ?? 0) * 0.35))));
  const cuisine = confidence >= 55 ? best.cuisine : "Global";
  return {
    cuisine,
    confidence,
    signals: best.signals.slice(0, 8),
    candidates: scores.filter((candidate) => candidate.score > 0).slice(0, 5).map(({ cuisine, score }) => ({ cuisine, score })),
    needsReview: cuisine === "Global" || confidence < 75
  };
}

function detectProtein(input: ClassifierInput, allText: string) {
  const prioritized = [
    input.title,
    input.mainIngredients.join(" "),
    input.ingredientCanonicals.join(" "),
    input.ingredients.join(" "),
    allText
  ].map(normalizeFreeText);

  for (const source of prioritized) {
    for (const [pattern, label, key] of PROTEIN_RULES) {
      if (pattern.test(source)) return { label, key };
    }
  }
  return null;
}

function detectMealType(titleText: string, ingredientText: string) {
  const source = `${titleText} ${ingredientText}`;
  if (/\b(breakfast|brunch|pancake|waffle|oatmeal|granola|smoothie|omelet|omelette|eggs benedict)\b/i.test(source)) return "breakfast";
  if (/\b(salad|sandwich|wrap|toast|lunch)\b/i.test(source)) return "lunch";
  if (/\b(dessert|cake|cookie|pie|pudding|ice cream|brownie|tiramisu|baklava|basbousa|cannoli)\b/i.test(source)) return "dessert";
  if (/\b(snack|dip|appetizer|chips|salsa|hummus)\b/i.test(source)) return "snack";
  return "dinner";
}

function detectCookingMethod(titleText: string, directionText: string, allText: string) {
  const source = `${titleText} ${directionText}`;
  if (/\b(no bake|no-bake|chilled|refrigerate)\b/i.test(source)) return "no-cook";
  if (/\b(grill|grilled|barbecue|bbq|broil)\b/i.test(source)) return "grilled";
  if (/\b(stir fry|stir-fry|wok)\b/i.test(source)) return "stir-fry";
  if (/\b(deep fry|deep-fry|fried|fry)\b/i.test(source)) return "fried";
  if (/\b(roast|roasted)\b/i.test(source)) return "roasted";
  if (/\b(bake|baked|oven|casserole)\b/i.test(source)) return "baked";
  if (/\b(soup|broth|chowder)\b/i.test(allText)) return "soup";
  if (/\b(stew|braise|simmer|slow cooker|crock pot|crockpot)\b/i.test(source)) return "stew";
  if (/\b(curry|masala|korma|vindaloo)\b/i.test(allText)) return "curry";
  if (/\b(salad|slaw)\b/i.test(allText)) return "salad";
  if (/\b(sandwich|wrap|taco|burrito|fajita|fajitas|pita|toast)\b/i.test(allText)) return "sandwich-wrap";
  if (/\b(saute|sauté|sear|skillet|pan)\b/i.test(source)) return "pan-seared";
  return "mixed";
}

function detectDifficulty(ingredientCount: number, stepCount: number, allText: string) {
  if (ingredientCount >= 14 || stepCount >= 9 || /\b(marinate overnight|rise|proof|laminate|stuff|roll out|braise|slow cooker)\b/i.test(allText)) return "hard";
  if (ingredientCount >= 8 || stepCount >= 5 || /\b(bake|roast|simmer|grill|fry)\b/i.test(allText)) return "medium";
  return "easy";
}

function detectFlavorProfile(allText: string) {
  const flavors: Array<[RegExp, string]> = [
    [/\b(cream|creamy|alfredo|bechamel|cheese|cheesy|yogurt|sour cream)\b/i, "Creamy"],
    [/\b(spicy|chili|jalapeno|cayenne|hot sauce|harissa|sriracha)\b/i, "Spicy"],
    [/\b(sweet|honey|maple|brown sugar|molasses|caramel)\b/i, "Sweet"],
    [/\b(lemon|lime|vinegar|pickled|tamarind)\b/i, "Tangy"],
    [/\b(garlic|onion|mushroom|soy sauce|miso|parmesan|umami)\b/i, "Savory"],
    [/\b(smoked|smoky|bbq|barbecue|paprika)\b/i, "Smoky"],
    [/\b(herb|basil|parsley|cilantro|mint|dill|oregano|thyme|rosemary)\b/i, "Herby"]
  ];
  return flavors.filter(([pattern]) => pattern.test(allText)).map(([, label]) => label).slice(0, 5);
}

function detectTags(input: ClassifierInput, allText: string, cuisineConfidence: number) {
  const tags = new Set<string>();
  if (cuisineConfidence >= 75) tags.add("Cuisine-Classified");
  if (/\b(chicken|beef|steak|lamb|fish|shrimp|salmon|tuna|egg|tofu|lentils?|beans?)\b/i.test(allText)) tags.add("Protein");
  if (/\b(cream|creamy|cheese|alfredo|bechamel)\b/i.test(allText)) tags.add("Creamy");
  if (/\b(grilled|grill|roasted|baked|steamed)\b/i.test(allText)) tags.add("Lighter Method");
  if (/\b(quick|easy|simple|30 minute|30-minute)\b/i.test(allText) || input.directions.length <= 4) tags.add("Quick");
  if (/\b(vegetarian|tofu|beans|lentils|chickpeas|vegetable)\b/i.test(allText) && !/\b(chicken|beef|lamb|fish|shrimp|pork)\b/i.test(allText)) tags.add("Vegetarian");
  if (/\b(low fat|light|healthy|skinless|lean)\b/i.test(allText)) tags.add("Health-Oriented");
  return Array.from(tags).slice(0, 10);
}

function estimateCalories(input: ClassifierInput, allText: string) {
  let calories = 420;
  if (/\b(cream|cheese|butter|oil|fried|sausage|bacon|nuts|peanut butter)\b/i.test(allText)) calories += 120;
  if (/\b(rice|pasta|bread|potato|tortilla|flour|sugar)\b/i.test(allText)) calories += 80;
  if (/\b(chicken|fish|shrimp|tofu|beans|lentils|egg)\b/i.test(allText)) calories += 70;
  if (/\b(beef|steak|lamb)\b/i.test(allText)) calories += 110;
  if (input.ingredients.length <= 4) calories -= 70;
  if (/\b(salad|soup|steamed|grilled|light|low fat)\b/i.test(allText)) calories -= 60;
  return Math.max(220, Math.min(900, Math.round(calories / 10) * 10));
}

function detectIngredientIds(input: ClassifierInput) {
  return Array.from(
    new Set(
      [...input.mainIngredients, ...input.ingredientCanonicals]
        .map(normalizeRecipeReferenceIngredient)
        .map((ingredient) => ingredient.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
        .map((ingredient) => ingredient.replace(/^(c|tbsp|tsp|oz|lb|pkg)_/, ""))
        .filter((ingredient) => ingredient.length >= 2)
    )
  ).slice(0, 30);
}

function detectTechniques(cookingMethod: string, allText: string) {
  const techniques = new Set<string>();
  if (cookingMethod && cookingMethod !== "mixed") techniques.add(cookingMethod);
  addTechniqueIf(techniques, allText, /\b(marinat|brine)\b/i, "marinated");
  addTechniqueIf(techniques, allText, /\b(bread|breadcrumb|panko|coat in flour|dredge)\b/i, "breaded");
  addTechniqueIf(techniques, allText, /\b(simmer|reduce|sauce|gravy)\b/i, "sauced");
  addTechniqueIf(techniques, allText, /\b(stuff|filled|filling)\b/i, "stuffed");
  addTechniqueIf(techniques, allText, /\b(steam|steamed)\b/i, "steamed");
  addTechniqueIf(techniques, allText, /\b(char|smoke|smoked)\b/i, "smoky-charred");
  addTechniqueIf(techniques, allText, /\b(chill|refrigerate|no bake|no-bake)\b/i, "chilled");
  return Array.from(techniques).slice(0, 8);
}

function estimatePrepMinutes(input: ClassifierInput, allText: string) {
  let minutes = input.ingredients.length >= 10 ? 20 : 10;
  if (/\b(chop|dice|mince|slice|grate|shred)\b/i.test(allText)) minutes += 10;
  if (/\b(stuff|roll out|shape|skewer)\b/i.test(allText)) minutes += 15;
  if (/\b(marinat|brine)\b/i.test(allText)) minutes += /\bovernight\b/i.test(allText) ? 60 : 20;
  return Math.max(5, Math.min(120, minutes));
}

function estimateCookMinutes(cookingMethod: string, allText: string) {
  const explicitDurations = extractDurationMinutes(allText);
  if (explicitDurations.length) {
    return Math.max(5, Math.min(360, explicitDurations.reduce((sum, minutes) => sum + minutes, 0)));
  }

  switch (cookingMethod) {
    case "fried":
    case "stir-fry":
    case "pan-seared":
      return 25;
    case "grilled":
      return 30;
    case "baked":
    case "roasted":
      return 45;
    case "stew":
    case "curry":
      return 75;
    case "soup":
      return 50;
    case "no-cook":
    case "salad":
      return 10;
    default:
      return 35;
  }
}

function extractDurationMinutes(allText: string) {
  const durations: number[] = [];
  for (const match of allText.matchAll(/\b(\d+)\s*(?:to|-)?\s*(\d+)?\s*(minutes?|mins?)\b/giu)) {
    durations.push(Number(match[2] ?? match[1]));
  }
  for (const match of allText.matchAll(/\b(\d+)\s*(?:to|-)?\s*(\d+)?\s*(hours?|hrs?)\b/giu)) {
    durations.push(Number(match[2] ?? match[1]) * 60);
  }
  return durations.slice(0, 6).filter((minutes) => Number.isFinite(minutes) && minutes > 0);
}

function detectCommonAllergens(allText: string) {
  const allergens = new Set<string>();
  addTechniqueIf(allergens, allText, /\b(milk|cream|cheese|butter|yogurt|yoghurt|whey|casein)\b/i, "milk");
  addTechniqueIf(allergens, allText, /\b(egg|eggs|mayonnaise)\b/i, "egg");
  addTechniqueIf(allergens, allText, /\b(wheat|flour|bread|pasta|noodles?|breadcrumbs?|panko|tortilla)\b/i, "wheat");
  addTechniqueIf(allergens, allText, /\b(shrimp|prawns?|crab|lobster|shellfish)\b/i, "shellfish");
  addTechniqueIf(allergens, allText, /\b(fish|salmon|tuna|cod|tilapia|anchov)\b/i, "fish");
  addTechniqueIf(allergens, allText, /\b(peanut|peanuts)\b/i, "peanut");
  addTechniqueIf(allergens, allText, /\b(almond|walnut|pecan|cashew|pistachio|hazelnut|nuts?)\b/i, "tree-nut");
  addTechniqueIf(allergens, allText, /\b(soy sauce|soybean|tofu|miso)\b/i, "soy");
  addTechniqueIf(allergens, allText, /\b(sesame|tahini)\b/i, "sesame");
  return Array.from(allergens).slice(0, 10);
}

function validateRecipeIntelligence(input: ClassifierInput, allText: string) {
  const warnings: string[] = [];
  if (!input.title.trim()) warnings.push("missing-title");
  if (input.ingredients.length < 3) warnings.push("too-few-ingredients");
  if (input.directions.length < 2) warnings.push("too-few-steps");
  if (!/\b(cook|bake|grill|roast|fry|saute|simmer|boil|broil|steam|mix|stir|marinate|chill)\b/i.test(allText)) {
    warnings.push("missing-real-cooking-action");
  }
  if (!extractDurationMinutes(allText).length) warnings.push("missing-explicit-time");
  if (!input.mainIngredients.length) warnings.push("missing-main-ingredient");
  return warnings;
}

function buildRecipeImagePrompt(input: {
  cookingMethod: string;
  cuisine: string;
  flavorProfile: string[];
  protein?: string;
  title: string;
}) {
  const cuisine = input.cuisine && input.cuisine !== "Global" ? `${input.cuisine} ` : "";
  const protein = input.protein ? `${input.protein.toLowerCase()} ` : "";
  const flavor = input.flavorProfile.length ? `${input.flavorProfile.join(", ").toLowerCase()} ` : "";
  return [
    `Professional food photograph of the finished plated ${cuisine}${input.title}.`,
    `Show a ${flavor}${protein}dish prepared in a ${formatCookingMethodForPrompt(input.cookingMethod)} style, with final sauce, starch, vegetables, and garnish visible only if they are part of the completed recipe.`,
    "No raw ingredients, no prep tools, no hands, no packaging, no cooking process."
  ].join(" ");
}

function addTechniqueIf(target: Set<string>, allText: string, pattern: RegExp, value: string) {
  if (pattern.test(allText)) target.add(value);
}

function formatCookingMethodForPrompt(value: string) {
  switch (value) {
    case "no-cook":
      return "ready-to-serve";
    case "stir-fry":
      return "stir-fried";
    case "sandwich-wrap":
      return "assembled sandwich or wrap";
    default:
      return value.replace(/-/g, " ");
  }
}

function normalizeFreeText(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function toKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

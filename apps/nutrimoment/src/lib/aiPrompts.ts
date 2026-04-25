import { buildPreferenceProfile, type NutritionGoals } from "@/lib/preferences";
import { getCuisineDishReferenceText, getCuisinePantryAnchors } from "@/lib/cuisineDishCatalog";

export interface RecipePromptIngredient {
  name: string;
  quantity?: string;
}

export interface RecipePromptOptions {
  recipeLanguage: string;
  preferredCuisine: string;
  calorieTarget: number;
  maxMissingIngredients: number;
  diets: string[];
  conditions: string[];
  allergens?: string[];
}

export interface MealPlanPromptOptions {
  pantry: string[];
  pantryItems?: { name: string; quantity?: string }[];
  diets: string[];
  conditions: string[];
  allergens?: string[];
  recipeLanguage?: string;
  preferredCuisine?: string;
  calorieTarget?: number;
}

const CUISINE_PROMPT_GUIDANCE: Record<string, string[]> = {
  any: [
    "When no cuisine is preferred, choose the cuisine whose real dish families best match the pantry ingredients, cooking style, and meal context.",
    "Prefer authentic, recognizable dishes over vague fusion unless the ingredient set clearly supports a fusion result."
  ],
  egyptian: [
    "Use clearly Egyptian dish logic, not just generic Middle Eastern labeling.",
    "Prefer real Egyptian dish families when the ingredients fit, such as ful medames, taameya or tameya, shakshuka or shakshouka, eggah, koshary, lentil soup, fasolia, molokhia, hawawshi, kofta kebab, macarona bechamel, or rice-based stews.",
    "Egyptian breakfast patterns often center on eggs with tomato and pepper, ful, taameya, cheese, tomato, cucumber, bread, and legumes; lunch and dinner often center on rice, legumes, tomato-based stews, grilled meats, kofta, or baked casseroles.",
    "Taameya is traditionally made with fava beans; do not call a recipe taameya unless fava beans or a clearly Egyptian taameya-style base is plausible.",
    "Use Egyptian flavor logic such as onion, garlic, tomato, cumin, coriander, parsley, cilantro, lemon, tahini, rice, vermicelli, lentils, and fava beans where appropriate."
  ],
  italian: [
    "Use clearly Italian or Italian-American dish families only when the ingredients support them.",
    "Prefer specific dishes such as pasta al pomodoro, arrabbiata, aglio e olio, frittata, minestrone, risotto, caprese salad, baked pasta, chicken piccata, or chicken parmesan when those structures genuinely fit.",
    "Distinguish tomato pasta from creamy pasta, risotto from plain rice, and Italian from Italian-American; for example, creamy chicken pasta should not be labeled as a classic Italian dish unless the structure really fits.",
    "Use Italian pantry logic such as olive oil, garlic, onion, basil, oregano, parsley, tomato, parmesan, mozzarella, pasta shapes, arborio rice, beans, zucchini, eggplant, and lemon where appropriate."
  ],
  middleeastern: [
    "Use real Middle Eastern or Levantine dish families, not a generic healthy bowl with a regional label.",
    "Prefer dishes such as mujadara, lentil soup, fasolia, kofta, shawarma plates, grilled kebabs, shakshuka, chickpea salad, fattoush, tabbouleh, hummus plates, baked fish with tahini, or rice and lentil dishes when ingredients fit.",
    "Use regional staple logic such as chickpeas, lentils, fava beans, tahini, yogurt, parsley, mint, lemon, cumin, coriander, garlic, tomato, onion, bulgur, pita, and rice."
  ],
  mediterranean: [
    "Use a clearly Mediterranean pattern centered on olive oil, vegetables, legumes, seafood or grilled proteins, yogurt, herbs, grains, and salads.",
    "Prefer dishes such as Greek salad, baked fish with vegetables, chickpea bowls, lentil salad, grilled chicken with rice, stuffed vegetables, shakshuka-style eggs, bean stew, or mezze-inspired plates when ingredients fit.",
    "Do not call a dish Mediterranean if it is structurally closer to a different cuisine family without Mediterranean staples."
  ],
  indian: [
    "Use clearly Indian dish families and naming, not a generic curry label.",
    "Prefer dishes such as dal, chana masala, rajma, egg bhurji, paneer curry, palak paneer, vegetable pulao, chicken curry, keema, upma, poha, or masala omelette when ingredients fit.",
    "Use Indian flavor logic such as onion, tomato, ginger, garlic, cumin, coriander, turmeric, chili, garam masala, lentils, chickpeas, rice, yogurt, spinach, paneer, and cilantro where appropriate."
  ],
  mexican: [
    "Use clearly Mexican dish families and naming rather than generic wraps or bowls.",
    "Prefer dishes such as huevos rancheros, chilaquiles, quesadillas, tacos, enchiladas, arroz con pollo, sopa de fideo, frijoles, fajitas, or caldos when ingredients fit.",
    "Use Mexican pantry logic such as corn tortillas, beans, tomato, onion, jalapeno, cilantro, lime, queso, rice, avocado, and roasted or stewed salsas where appropriate."
  ],
  american: [
    "Use clearly American home-style or diner-style dish families when that cuisine is selected.",
    "Prefer dishes such as scrambled eggs and toast, breakfast hash, oatmeal bowls, chicken salad, grilled cheese and soup, skillet chicken, meatloaf-style plates, mac and cheese, burgers, or sheet-pan dinners when ingredients fit.",
    "Avoid labeling a dish American if it is more specifically Italian, Mexican, Indian, or Middle Eastern in structure."
  ],
  asian: [
    "Treat Asian as a broad umbrella. When ingredients point clearly to a substyle such as Chinese, Japanese, Korean, Thai, or Vietnamese, choose that substyle and reflect it in the recipe name and cuisine field.",
    "Prefer dishes such as fried rice, noodle stir fry, congee, teriyaki chicken, vegetable stir fry, rice bowls, miso-style soups, or bibimbap-inspired bowls when ingredients fit.",
    "Use Asian flavor logic such as soy sauce, sesame, ginger, garlic, scallion, rice, noodles, mushrooms, chili, and broths where appropriate."
  ],
  thai: [
    "Use clearly Thai dish families and bright Thai balance rather than a generic Asian stir-fry label.",
    "Prefer dishes such as pad krapow, basil chicken, fried rice, red curry, green curry, tom yum style soup, larb, noodle stir fry, or Thai omelette when ingredients fit.",
    "Use Thai flavor logic such as garlic, chili, lime, fish sauce, basil, coconut milk, curry paste, rice, rice noodles, cilantro, and lemongrass where appropriate."
  ]
};

interface CuisineKnowledge {
  substyles?: string[];
  stapleProteins?: string[];
  stapleStarches?: string[];
  stapleAromatics?: string[];
  stapleSauces?: string[];
  visualAnchors?: string[];
  breakfastPatterns?: string[];
  lunchDinnerPatterns?: string[];
  dishTriggers?: string[];
  substitutionRules?: string[];
  guardrails?: string[];
}

const CUISINE_KNOWLEDGE: Record<string, CuisineKnowledge> = {
  egyptian: {
    substyles: ["Cairene street food", "home-style breakfast plates", "rice-and-stew comfort dishes", "grilled meat plates"],
    stapleProteins: ["egg", "ground beef", "ground lamb", "chicken", "fava bean", "lentil"],
    stapleStarches: ["baladi bread", "rice", "vermicelli rice", "pasta", "lentils"],
    stapleAromatics: ["onion", "garlic", "tomato", "cumin", "coriander", "parsley", "cilantro"],
    stapleSauces: ["tomato sauce", "bechamel", "tahini", "lemon-garlic dressing"],
    visualAnchors: ["golden taameya patties", "stuffed bread wedges", "baked bechamel pasta squares", "tomato-rich breakfast skillets", "rice with browned vermicelli"],
    breakfastPatterns: [
      "ful medames with bread and vegetables",
      "taameya with herbs and aromatics",
      "shakshuka with egg, tomato, and pepper",
      "eggah-style skillet egg dishes"
    ],
    lunchDinnerPatterns: [
      "kofta with rice or tomato sauce",
      "hawawshi with stuffed bread",
      "macarona bechamel with ground meat",
      "koshary with lentils, rice, pasta, and tomato sauce",
      "fasolia or tomato-based bean stews"
    ],
    dishTriggers: [
      "ground meat + parsley/onion/garlic -> kofta",
      "ground meat + bread/pita -> hawawshi",
      "ground meat + pasta + milk or flour or butter -> macarona bechamel",
      "egg + tomato + bell pepper/onion -> shakshuka",
      "fava bean + herbs + onion/garlic -> taameya",
      "lentil + rice + pasta -> koshary"
    ],
    substitutionRules: [
      "If a classic Egyptian dish is close but missing one or two supporting items, keep the authentic dish family and place the missing staples in missing_ingredients.",
      "Prefer fava bean dishes over generic bean patties when fava beans are present; use chickpea only if fava beans are absent and do not mislabel it as taameya unless clearly Egyptian in structure."
    ],
    guardrails: [
      "Do not label a dish taameya unless a fava-bean or clearly Egyptian herb-bean fritter base is plausible.",
      "Do not call a meat-and-bread recipe hawawshi unless the meat is stuffed into bread or clearly baked in bread.",
      "Do not call a pasta dish macarona bechamel unless it genuinely includes a bechamel-style creamy baked structure."
    ]
  },
  italian: {
    substyles: ["southern tomato-forward pasta", "Roman-style simple pasta", "Italian-American baked comfort dishes"],
    stapleProteins: ["egg", "chicken", "white fish", "beans", "mozzarella", "parmesan"],
    stapleStarches: ["pasta", "risotto rice", "bread", "polenta"],
    stapleAromatics: ["garlic", "onion", "basil", "oregano", "parsley", "lemon"],
    stapleSauces: ["pomodoro", "arrabbiata", "cream sauce", "pesto", "butter sauce"],
    visualAnchors: ["red tomato-coated pasta", "creamy white-sauce pasta", "golden baked pasta tops", "herb-finished skillet chicken"],
    breakfastPatterns: ["frittata", "ricotta toast", "savory egg skillet"],
    lunchDinnerPatterns: ["tomato pasta", "creamy pasta", "risotto", "minestrone", "baked pasta", "piccata-style skillet dishes"],
    dishTriggers: [
      "pasta + tomato -> pomodoro/arrabbiata/baked tomato pasta",
      "pasta + dairy -> creamy pasta or alfredo-style family",
      "egg + vegetables + cheese -> frittata",
      "rice + broth + parmesan -> risotto"
    ],
    substitutionRules: [
      "If parmesan is missing but the structure is otherwise Italian, keep the dish family and list parmesan or pecorino as missing.",
      "If basil is missing, parsley or oregano may support Italian identity, but do not invent pesto unless the herb, nuts, and cheese structure fits."
    ],
    guardrails: [
      "Do not call creamy chicken pasta a classic Italian dish unless the rest of the structure supports it; otherwise use Italian-American when appropriate.",
      "Do not label plain rice as risotto unless broth-based creamy risotto technique is plausible."
    ]
  },
  middleeastern: {
    substyles: ["Levantine mezze plates", "grill-house meat dishes", "legume-and-rice comfort meals"],
    stapleProteins: ["chickpea", "lentil", "fava bean", "chicken", "lamb", "beef", "yogurt"],
    stapleStarches: ["rice", "bulgur", "pita", "flatbread"],
    stapleAromatics: ["onion", "garlic", "parsley", "mint", "lemon", "cumin", "coriander"],
    stapleSauces: ["tahini", "yogurt sauce", "tomato stew base"],
    visualAnchors: ["tahini-drizzled plates", "charred kebabs", "lentil-and-rice mounds", "herb-heavy salads", "warm pita service"],
    breakfastPatterns: ["shakshuka", "hummus plate", "labneh plate", "bean breakfast dishes"],
    lunchDinnerPatterns: ["mujadara", "kofta", "shawarma plate", "lentil soup", "bean stew", "grilled kebabs"],
    dishTriggers: [
      "lentil + rice -> mujadara",
      "chickpea + tahini/lemon/garlic -> hummus family",
      "ground meat + parsley/onion/spices -> kofta",
      "chicken + garlic + yogurt/spices -> shawarma or grilled chicken plate"
    ],
    substitutionRules: [
      "Keep dishes within Levantine or broader Middle Eastern families when the pantry strongly fits one regional branch.",
      "If tahini is missing, keep the dish family and list tahini as missing instead of renaming the dish to a generic salad or bowl."
    ],
    guardrails: [
      "Do not label a dish shawarma unless the seasoning and sliced/protein plate structure fit.",
      "Do not call any lentil-and-rice dish mujadara unless onion-led Levantine structure is plausible."
    ]
  },
  mediterranean: {
    substyles: ["Greek-inspired salads and bakes", "eastern Mediterranean grill plates", "olive-oil vegetable dishes"],
    stapleProteins: ["fish", "chicken", "egg", "chickpea", "lentil", "yogurt", "feta"],
    stapleStarches: ["rice", "orzo", "bread", "potato"],
    stapleAromatics: ["olive oil", "lemon", "garlic", "oregano", "parsley", "mint", "tomato"],
    stapleSauces: ["olive oil-lemon dressing", "yogurt sauce", "tomato braise"],
    visualAnchors: ["olive-oil gloss", "lemon-herb grilled proteins", "feta-topped salads", "roasted vegetables"],
    breakfastPatterns: ["egg and tomato skillets", "yogurt bowls", "feta and vegetable plates"],
    lunchDinnerPatterns: ["grilled fish", "stuffed vegetables", "bean salad", "lentil salad", "grilled chicken with rice", "vegetable stew"],
    dishTriggers: [
      "fish + lemon + herbs -> baked or grilled Mediterranean fish",
      "chickpea + cucumber/tomato/herbs -> Mediterranean chickpea salad",
      "yogurt + cucumber/garlic -> yogurt sauce plate",
      "egg + tomato + feta -> Mediterranean egg skillet"
    ],
    substitutionRules: [
      "Use olive-oil, herb, vegetable-forward structures before heavy cream sauces when Mediterranean is selected.",
      "If seafood is absent, legumes or grilled chicken can carry the cuisine identity."
    ],
    guardrails: [
      "Do not use Mediterranean as a vague fallback when a more specific cuisine family clearly fits better."
    ]
  },
  indian: {
    substyles: ["North Indian masala gravies", "home-style dal meals", "breakfast skillet and grain dishes"],
    stapleProteins: ["lentil", "chickpea", "kidney bean", "paneer", "egg", "chicken", "ground meat"],
    stapleStarches: ["rice", "flatbread", "poha", "semolina"],
    stapleAromatics: ["onion", "tomato", "ginger", "garlic", "cumin", "coriander", "turmeric", "chili"],
    stapleSauces: ["masala gravy", "yogurt marinade", "spinach gravy"],
    visualAnchors: ["deep orange-red masala", "tempered lentils", "cilantro finish", "rice with curry spooned over"],
    breakfastPatterns: ["poha", "upma", "masala omelette", "egg bhurji"],
    lunchDinnerPatterns: ["dal", "chana masala", "rajma", "paneer curry", "keema", "chicken curry", "pulao"],
    dishTriggers: [
      "lentil + cumin/turmeric/aromatics -> dal",
      "chickpea + tomato/onion/ginger/garlic -> chana masala",
      "kidney bean + tomato/onion/aromatics -> rajma",
      "ground meat + peas/spices -> keema",
      "paneer + spinach -> palak paneer"
    ],
    substitutionRules: [
      "If paneer is missing but spinach and dairy are present, list paneer as missing rather than renaming the dish generically.",
      "Use curry names only when the spice-and-gravy structure genuinely fits."
    ],
    guardrails: [
      "Do not call every saucy dish curry; prefer dal, masala, bhurji, pulao, or keema when those structures are more exact."
    ]
  },
  mexican: {
    substyles: ["street taco and tortilla dishes", "home-style rice-and-bean plates", "salsa-led breakfast dishes"],
    stapleProteins: ["egg", "beans", "chicken", "beef", "cheese"],
    stapleStarches: ["corn tortilla", "flour tortilla", "rice", "fideo"],
    stapleAromatics: ["tomato", "onion", "jalapeno", "cilantro", "lime", "garlic"],
    stapleSauces: ["salsa roja", "salsa verde", "chipotle-tomato base"],
    visualAnchors: ["charred tortillas", "salsa spooned eggs", "rice-and-bean sides", "cilantro-lime garnish"],
    breakfastPatterns: ["huevos rancheros", "chilaquiles", "breakfast tacos", "bean and egg plates"],
    lunchDinnerPatterns: ["tacos", "quesadillas", "enchiladas", "fajitas", "arroz con pollo", "sopa de fideo"],
    dishTriggers: [
      "egg + tortilla + salsa -> huevos rancheros or breakfast tacos",
      "tortilla + cheese -> quesadilla family",
      "chicken + rice + tomato -> arroz con pollo",
      "fideo + tomato broth -> sopa de fideo"
    ],
    substitutionRules: [
      "If tortillas are missing, keep taco or enchilada families only when tortillas can reasonably appear in missing_ingredients.",
      "Prefer beans, salsa, and tortilla logic over generic wraps."
    ],
    guardrails: [
      "Do not call a dish tacos or enchiladas without tortillas.",
      "Do not label any bean-and-rice bowl Mexican unless the salsa, tortilla, or Mexican pantry structure fits."
    ]
  },
  american: {
    substyles: ["diner breakfast", "weeknight skillet comfort food", "baked casserole comfort dishes"],
    stapleProteins: ["egg", "chicken", "ground beef", "turkey", "cheddar"],
    stapleStarches: ["bread", "potato", "pasta", "oats", "rice"],
    stapleAromatics: ["onion", "garlic", "mustard", "celery", "black pepper"],
    stapleSauces: ["gravy", "cheese sauce", "barbecue sauce", "pan sauce"],
    visualAnchors: ["golden cheese tops", "hash-browned potatoes", "stacked sandwiches", "sheet-pan roasted trays"],
    breakfastPatterns: ["scrambled eggs and toast", "breakfast hash", "oatmeal bowl", "omelette"],
    lunchDinnerPatterns: ["meatloaf-style plates", "burgers", "mac and cheese", "skillet chicken", "sheet-pan dinners", "grilled cheese and soup"],
    dishTriggers: [
      "ground beef + bread buns -> burger family",
      "pasta + cheddar/milk -> mac and cheese",
      "potato + egg + onion -> breakfast hash",
      "ground meat + breadcrumbs + onion -> meatloaf-style bake"
    ],
    substitutionRules: [
      "Use American as a fallback only when another cuisine family does not fit more precisely.",
      "If the structure is diner-style or home-style comfort food, American can be appropriate even with simple pantry ingredients."
    ],
    guardrails: [
      "Do not label a clearly Italian, Mexican, Indian, or Middle Eastern dish as American just because the pantry is broad."
    ]
  },
  asian: {
    substyles: ["Chinese-style stir-fry and fried rice", "Japanese-inspired rice and noodle bowls", "Korean-style savory rice dishes", "Thai-style basil and curry dishes", "Vietnamese noodle and herb dishes"],
    stapleProteins: ["egg", "chicken", "beef", "tofu", "shrimp"],
    stapleStarches: ["rice", "rice noodle", "wheat noodle"],
    stapleAromatics: ["soy sauce", "ginger", "garlic", "scallion", "sesame", "chili"],
    stapleSauces: ["soy-ginger sauce", "oyster-style sauce", "broth", "teriyaki-style glaze"],
    visualAnchors: ["glossy stir-fry finish", "scallion and sesame garnish", "brothy noodle bowls", "rice topped with sliced protein"],
    breakfastPatterns: ["congee", "savory egg rice bowls"],
    lunchDinnerPatterns: ["fried rice", "stir-fried noodles", "rice bowls", "brothy noodle soups", "teriyaki-style proteins"],
    dishTriggers: [
      "rice + egg + soy/scallion -> fried rice family",
      "noodle + soy/ginger/garlic -> stir-fried noodle family",
      "rice + broth + aromatics -> congee or rice soup family"
    ],
    substitutionRules: [
      "When ingredients point clearly to Thai, Chinese, Japanese, Korean, or Vietnamese patterns, choose that substyle explicitly.",
      "If the pantry lacks defining substyle markers, keep the cuisine label broad as Asian but still use a real Asian dish family."
    ],
    guardrails: [
      "Do not call a dish teriyaki, ramen, pad thai, or bibimbap unless that structure clearly fits."
    ]
  },
  thai: {
    substyles: ["basil-chili stir-fries", "coconut curries", "lime-forward herb salads", "rice-noodle wok dishes"],
    stapleProteins: ["chicken", "shrimp", "egg", "tofu"],
    stapleStarches: ["jasmine rice", "rice noodle"],
    stapleAromatics: ["garlic", "chili", "lime", "fish sauce", "basil", "cilantro", "lemongrass"],
    stapleSauces: ["red curry", "green curry", "fish sauce-lime dressing", "coconut curry base"],
    visualAnchors: ["holy basil and chili flecks", "coconut-rich curry bowls", "lime wedges", "rice noodle wok-char"],
    breakfastPatterns: ["Thai omelette with rice", "savory rice-based breakfasts"],
    lunchDinnerPatterns: ["pad krapow", "fried rice", "curry", "larb", "tom yum style soups", "rice noodle stir fry"],
    dishTriggers: [
      "rice noodle + egg/protein + lime/fish sauce -> Thai noodle stir fry family",
      "ground meat + basil + chili -> pad krapow style dish",
      "coconut milk + curry aromatics + protein -> Thai curry family",
      "lime + chili + herbs + minced meat -> larb-style salad"
    ],
    substitutionRules: [
      "If fish sauce is missing, keep Thai identity only when enough other Thai markers remain or place fish sauce in missing_ingredients.",
      "Use basil-chili-garlic logic before generic soy stir-fry when Thai is selected and the pantry supports it."
    ],
    guardrails: [
      "Do not call a dish pad thai unless tamarind/noodle/egg/Thai stir-fry structure fits.",
      "Do not label any coconut stew Thai curry unless curry aromatics or Thai markers are plausible."
    ]
  }
};

export function buildRecipeGenerationPrompt(ingredients: RecipePromptIngredient[], options: RecipePromptOptions) {
  const cuisineHint = options.preferredCuisine === "Any" ? "Use any cuisine." : `Prefer ${options.preferredCuisine} cuisine.`;
  const cuisineSpecificGuidance = buildCuisineSpecificGuidance(options.preferredCuisine);
  const cuisineKnowledgeGuidance = buildCuisineKnowledgeGuidance(options.preferredCuisine);
  const cuisineDishCatalogGuidance = buildCuisineDishCatalogGuidance(options.preferredCuisine);
  const languageOutputGuidance = buildLanguageOutputGuidance(options.recipeLanguage);
  const substyleGuidance = buildCuisineSubstyleGuidance(options.preferredCuisine, ingredients);
  const mealTypeRoutingGuidance = buildMealTypeRoutingGuidance(options.preferredCuisine, ingredients);
  const imageGuidance = buildCuisineImageGuidance(options.preferredCuisine);
  const ingredientDrivenCuisineGuidance = buildIngredientDrivenCuisineGuidance(options.preferredCuisine, ingredients);
  const sparseIngredientGuidance = buildSparseIngredientGuidance(ingredients, options.preferredCuisine);
  const preferenceBrief = buildPromptPreferenceBrief({
    preferredCuisine: options.preferredCuisine,
    calorieTarget: options.calorieTarget,
    diets: options.diets,
    conditions: options.conditions,
    allergens: options.allergens ?? []
  });
  const ingredientNames = ingredients.map((item) => item.name).filter(Boolean);
  const ingredientQuantities = ingredients
    .map((item) => [item.name, item.quantity].filter(Boolean).join(" - "))
    .filter(Boolean);
  const perMealCalories = Math.round(options.calorieTarget / 3);

  return [
    "You are NutriMoment's recipe generation assistant.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Generate exactly 5 practical recipes.",
    "Priority order: first satisfy diet rules and health-condition nutrition targets, second stay near the calorie target, third use available pantry ingredients and minimize missing items.",
    "Order the 5 recipes from best to worst by: most available pantry ingredients used, fewest missing ingredients, strongest dietary and health preference match, closest calorie target.",
    "Use clear, searchable meal names. Prefer canonical dish or meal-family names over creative marketing titles.",
    "Cuisine must be structurally authentic. Do not assign a cuisine label unless the recipe's core ingredients, cooking method, starch, sauce, and dish family genuinely fit that cuisine.",
    "When a preferred cuisine is provided, at least 4 of the 5 recipes should clearly belong to that cuisine unless the pantry makes that impossible. If you must go outside it, stay as close as possible and explain the compromise in preference_hits.",
    "Avoid filler adjectives like simple, hearty, lean, classic, spiced, vibrant, or loaded unless they are essential to distinguish the dish.",
    "When a recipe resembles a known dish family, use that family name in the title, for example: shakshuka, fasolia, ful medames, mujadara, koshary, kafta, white bean stew, bean salad, lentil soup, or chickpea salad.",
    "If the pantry points to a more specific regional branch or substyle inside the selected cuisine, choose that substyle explicitly and reflect it in the recipe name, cuisine label, and image search phrases.",
    "Do ingredient-to-dish reasoning before generating recipes. First infer which authentic dish families are most plausible from the pantry ingredients, then generate recipes from those families.",
    "When the pantry strongly matches a known cuisine-specific dish, prefer that exact dish family over a generic fallback. Example: Egyptian plus ground meat should bias toward kofta, hawawshi, or macarona bechamel when the supporting starches and aromatics fit.",
    "Infer meal context when possible. If the pantry strongly suggests breakfast ingredients, prefer real breakfast dishes from the selected cuisine; if it suggests grilled meats, rice, stews, or pasta, prefer lunch or dinner families from that cuisine.",
    cuisineSpecificGuidance,
    cuisineKnowledgeGuidance,
    cuisineDishCatalogGuidance,
    substyleGuidance,
    mealTypeRoutingGuidance,
    ingredientDrivenCuisineGuidance,
    sparseIngredientGuidance,
    "For every recipe also output image_search_indices: an array of 3 to 5 short English food-photo search phrases tuned for Unsplash first and Pexels second, ordered from most exact to broader backup searches.",
    "Each image_search_indices item should be 2 to 6 words, use canonical dish nouns first, add cuisine, protein, sauce, cooking method, or starch only when they improve image accuracy, and avoid quantities, health claims, macro words, filler adjectives, and branding.",
    "When the dish has an important visual variant, encode it in the search phrases. Examples: use red sauce pasta vs white sauce pasta, grilled chicken vs fried chicken, rice noodles vs pasta, tomato soup vs creamy soup.",
    imageGuidance,
    "Also include image_search_index as the first/best string from image_search_indices for backward compatibility.",
    "Examples of good image_search_indices values: [\"mujadara\",\"lentils and rice\",\"middle eastern lentils rice\"], [\"white bean stew\",\"fasolia\",\"bean tomato stew\"], [\"grilled chicken red sauce pasta\",\"chicken tomato pasta\",\"grilled chicken pasta\"], [\"creamy chicken pasta\",\"white sauce pasta\",\"chicken alfredo pasta\"], [\"greek yogurt berries\",\"yogurt bowl\",\"breakfast yogurt bowl\"].",
    "Do not use a pantry ingredient when it conflicts with the user's diet or health profile; choose a safer substitute and list it as a missing ingredient instead.",
    "The ingredients array must contain ONLY items explicitly listed in Available pantry ingredients. Any other ingredient, seasoning, garnish, sauce, or produce item must go in missing_ingredients.",
    `Available pantry ingredients: ${ingredientNames.join(", ") || "none provided"}.`,
    `Available ingredient quantities: ${ingredientQuantities.join(", ") || "not provided"}.`,
    preferenceBrief,
    cuisineHint,
    `Recipe language: ${options.recipeLanguage}.`,
    languageOutputGuidance,
    `Target calories per meal: approximately ${perMealCalories} kcal; keep each recipe within about 15% unless the health profile requires a tighter limit.`,
    `Maximum missing ingredients allowed per recipe: ${options.maxMissingIngredients}.`,
    "Missing ingredients must be compatible with the diet and health rules. Be strict: never put cucumber, herbs, spices, oil, sauces, or staple ingredients in ingredients unless they are in Available pantry ingredients.",
    "Avoid medical claims; describe meals as compatible with the stated profile, not as treatment.",
    "Step detail requirement: every recipe steps array must contain 7 to 10 detailed home-cooking steps.",
    "Every step string must include: the action, exact ingredient quantities used in that step, pan/oven/heat level when relevant, timing in minutes, and the target visual or texture cue.",
    "Use the available ingredient quantities when provided. If quantity is not provided, choose realistic single-meal quantities and make them explicit inside the step text.",
    "Do not write vague steps like 'cook until done', 'season to taste', or 'serve'. Replace them with specific timing, doneness cues, and quantities.",
    "Include prep, cooking, finishing, and plating steps; if a sauce, dressing, spice mix, or garnish is needed, tell the user exactly when and how much to add.",
    "Return a JSON array, not an object.",
    "Each recipe object must include: name, cuisine, image_search_index, image_search_indices, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, fiber, sugar, sodium, cook_time, difficulty, preference_hits.",
    "ingredients and missing_ingredients must be arrays of strings. steps must be an array of detailed strings with timing and quantities. preference_hits must name the diet, health, calorie, or pantry rules the recipe satisfies. image_search_index must be a single short English string and image_search_indices must be an array of 3 to 5 short English strings."
  ].join(" ");
}

export function buildMealPlanPrompt({
  pantry,
  pantryItems = [],
  diets,
  conditions,
  allergens = [],
  recipeLanguage = "English",
  preferredCuisine = "Any",
  calorieTarget = 2000
}: MealPlanPromptOptions) {
  const pantryWithQuantities = pantryItems
    .map((item) => [item.name, item.quantity].filter(Boolean).join(" - "))
    .filter(Boolean);
  const pantryIngredients = pantryItems.length
    ? pantryItems.map((item) => ({ name: item.name, quantity: item.quantity }))
    : pantry.map((name) => ({ name }));
  const cuisineSpecificGuidance = buildCuisineSpecificGuidance(preferredCuisine);
  const cuisineKnowledgeGuidance = buildCuisineKnowledgeGuidance(preferredCuisine);
  const cuisineDishCatalogGuidance = buildCuisineDishCatalogGuidance(preferredCuisine);
  const languageOutputGuidance = buildLanguageOutputGuidance(recipeLanguage);
  const substyleGuidance = buildCuisineSubstyleGuidance(preferredCuisine, pantryIngredients);
  const mealTypeRoutingGuidance = buildMealTypeRoutingGuidance(preferredCuisine, pantryIngredients);
  const imageGuidance = buildCuisineImageGuidance(preferredCuisine);
  const ingredientDrivenCuisineGuidance = buildIngredientDrivenCuisineGuidance(preferredCuisine, pantryIngredients);
  const preferenceBrief = buildPromptPreferenceBrief({
    preferredCuisine,
    calorieTarget,
    diets,
    conditions,
    allergens
  });

  return [
    "You are NutriMoment's premium weekly meal planning assistant.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Generate a 7-day meal plan.",
    "Priority order: first satisfy diet rules and health-condition nutrition targets, second stay near the daily calorie target, third use pantry ingredients and minimize extra shopping.",
    "Use clear, searchable meal names. Prefer canonical dish or meal-family names over creative titles.",
    "Cuisine must be structurally authentic. Do not assign a cuisine label unless the meal's core ingredients, cooking method, starch, sauce, and dish family genuinely fit that cuisine.",
    "When a preferred cuisine is provided, breakfast, lunch, and dinner should mostly stay within that cuisine or its direct regional family unless pantry constraints make that impossible.",
    "Avoid filler adjectives like simple, hearty, lean, classic, spiced, or loaded unless they are essential.",
    "When a meal matches a known family, title it that way, for example: shakshuka, fasolia, ful medames, mujadara, koshary, kafta, white bean stew, bean salad, lentil soup, or chickpea salad.",
    "If the pantry points to a more specific regional branch or substyle inside the selected cuisine, choose that substyle explicitly and reflect it in the meal name, cuisine label, and image search phrases.",
    "Do ingredient-to-dish reasoning before planning the week. Infer which authentic dish families the pantry best supports, then build breakfast, lunch, and dinner around those families.",
    "Use breakfast, lunch, and dinner patterns that make sense for the selected cuisine rather than repeating the same generic bowl structure every day.",
    cuisineSpecificGuidance,
    cuisineKnowledgeGuidance,
    cuisineDishCatalogGuidance,
    substyleGuidance,
    mealTypeRoutingGuidance,
    ingredientDrivenCuisineGuidance,
    "For every breakfast, lunch, and dinner object also output image_search_indices: an array of 3 to 5 short English food-photo search phrases tuned for Unsplash first and Pexels second, ordered from most exact to broader backup searches.",
    "Each image_search_indices item should be 2 to 6 words, use canonical dish nouns first, add cuisine, protein, sauce, cooking method, or starch only when it improves accuracy, and avoid quantities, health claims, macro words, filler adjectives, and branding.",
    "When the meal has an important visual variant, encode it in the search phrases. Examples: grilled chicken rice bowl, white sauce pasta, tomato noodle stir fry.",
    imageGuidance,
    "Also include image_search_index as the first/best string from image_search_indices for backward compatibility.",
    "Examples of good image_search_indices values: [\"mujadara\",\"lentils and rice\",\"middle eastern lentils rice\"], [\"chicken shawarma bowl\",\"chicken shawarma\",\"shawarma plate\"], [\"baked white fish\",\"white fish vegetables\",\"roasted fish plate\"], [\"grilled chicken red sauce pasta\",\"chicken tomato pasta\",\"grilled chicken pasta\"].",
    "Do not use a pantry ingredient when it conflicts with the user's diet or health profile; choose a safer substitute and include the substitute in shoppingList.",
    `Pantry items: ${pantry.join(", ") || "none provided"}.`,
    `Pantry quantities (use these to decide what is actually needed for the week): ${pantryWithQuantities.join(", ") || "not provided"}.`,
    preferenceBrief,
    `Preferred cuisine: ${preferredCuisine}.`,
    `Recipe language: ${recipeLanguage}.`,
    languageOutputGuidance,
    `Daily calorie target: ${calorieTarget}; make breakfast about 25%, lunch about 35%, and dinner about 40% of the target, with the day total within about 10% unless the health profile requires tighter limits.`,
    "Every meal must be compatible with the diet and health-condition targets, not just one meal per day.",
    "Avoid medical claims; describe meals as compatible with the stated profile, not as treatment.",
    "Return an object with exactly these top-level keys: plan, shoppingList.",
    "plan must be an array of 7 days.",
    "Each day must use this exact shape: {\"day\":\"Monday\",\"breakfast\":{\"name\":\"…\",\"ingredients\":[\"…\"],\"steps\":[\"…\"],\"calories\":400,\"protein\":\"20g\",\"carbs\":\"45g\",\"fat\":\"12g\"},\"lunch\":{\"name\":\"…\",\"ingredients\":[\"…\"],\"steps\":[\"…\"],\"calories\":550,\"protein\":\"30g\",\"carbs\":\"60g\",\"fat\":\"18g\"},\"dinner\":{\"name\":\"…\",\"ingredients\":[\"…\"],\"steps\":[\"…\"],\"calories\":650,\"protein\":\"35g\",\"carbs\":\"55g\",\"fat\":\"22g\"}}.",
    "Each meal MUST include an ingredients array of short canonical lowercase names that lists every ingredient the meal uses, including pantry items the diner already owns. This is needed for shopping coverage display.",
    "Each meal MUST also include a steps array with 7 to 10 detailed preparation instructions suitable for home cooking.",
    "Every meal step string must include the action, exact ingredient quantities used in that step, heat level or tool when relevant, timing in minutes, and the visual/texture cue for moving to the next step.",
    "Use pantry quantities when provided and choose realistic per-meal quantities for missing ingredients. Be specific enough that a beginner can cook without guessing.",
    "Do not use vague meal-plan steps like 'cook the chicken', 'prepare vegetables', 'mix together', or 'serve'. Break prep, cooking, finishing, and plating into separate explicit steps.",
    "Include image_search_index and image_search_indices inside every breakfast, lunch, and dinner object, for example: breakfast {\"name\":\"Greek Yogurt Bowl\",\"image_search_index\":\"greek yogurt berries\",\"image_search_indices\":[\"greek yogurt berries\",\"yogurt bowl\",\"breakfast yogurt bowl\"],...}.",
    "shoppingList must be an array of strings with only missing items needed after pantry ingredients are used.",
    "Every shoppingList item must include summed quantity and unit, for example: \"rice - 4 cup\" or \"tomato - 8 whole\"."
  ].join(" ");
}

function buildPromptPreferenceBrief(snapshot: {
  preferredCuisine: string;
  calorieTarget: number;
  diets: string[];
  conditions: string[];
  allergens: string[];
}) {
  const resolved = buildPreferenceProfile(snapshot);
  const dietLabels = resolved.promptDietLabels.length ? resolved.promptDietLabels.join(", ") : "none";
  const conditionLabels = resolved.promptConditionLabels.length ? resolved.promptConditionLabels.join(", ") : "none";
  const selectedDiets = snapshot.diets.length ? snapshot.diets.join(", ") : "none";
  const selectedConditions = snapshot.conditions.length ? snapshot.conditions.join(", ") : "none";
  const requiredDietTags = resolved.requiredDietTags.length ? resolved.requiredDietTags.join(", ") : "none";
  const preferredDietTags = resolved.preferredDietTags.length ? resolved.preferredDietTags.join(", ") : "none";
  const allergens = resolved.allergens?.length ? resolved.allergens.join(", ") : "none";
  const nutritionTargets = formatNutritionGoals(resolved.nutritionGoals);

  return [
    `Selected diet setting IDs: ${selectedDiets}.`,
    `Selected health condition setting IDs: ${selectedConditions}.`,
    `Dietary preferences: ${dietLabels}.`,
    `Health conditions to respect: ${conditionLabels}.`,
    `Required diet compatibility: ${requiredDietTags}.`,
    `Preferred diet compatibility: ${preferredDietTags}.`,
    `Known allergens to avoid: ${allergens}.`,
    `Nutrition targets derived from the profile: ${nutritionTargets}.`
  ].join(" ");
}

function buildCuisineSpecificGuidance(preferredCuisine: string) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const guidance = CUISINE_PROMPT_GUIDANCE[normalized] ?? [];

  if (!guidance.length) {
    return preferredCuisine && preferredCuisine !== "Any"
      ? `Preferred cuisine guidance: use real, recognizable ${preferredCuisine} dish families, staple ingredients, and cooking methods rather than generic recipes with a cuisine label.`
      : CUISINE_PROMPT_GUIDANCE.any.join(" ");
  }

  return guidance.join(" ");
}

function buildCuisineKnowledgeGuidance(preferredCuisine: string) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const knowledge = CUISINE_KNOWLEDGE[normalized];

  if (!knowledge) {
    return preferredCuisine && preferredCuisine !== "Any"
      ? `Cuisine knowledge: use authentic staples, meal patterns, substitutions, and dish-family guardrails for ${preferredCuisine}.`
      : "";
  }

  const sections = [
    knowledge.stapleProteins?.length
      ? `Typical proteins for this cuisine: ${knowledge.stapleProteins.join(", ")}.`
      : "",
    knowledge.stapleStarches?.length
      ? `Typical starches for this cuisine: ${knowledge.stapleStarches.join(", ")}.`
      : "",
    knowledge.stapleAromatics?.length
      ? `Typical aromatics and flavor anchors: ${knowledge.stapleAromatics.join(", ")}.`
      : "",
    knowledge.stapleSauces?.length
      ? `Typical sauces or bases: ${knowledge.stapleSauces.join(", ")}.`
      : "",
    knowledge.breakfastPatterns?.length
      ? `Typical breakfast families: ${knowledge.breakfastPatterns.join("; ")}.`
      : "",
    knowledge.lunchDinnerPatterns?.length
      ? `Typical lunch and dinner families: ${knowledge.lunchDinnerPatterns.join("; ")}.`
      : "",
    knowledge.dishTriggers?.length
      ? `Dish-family triggers to use when ingredients fit: ${knowledge.dishTriggers.join("; ")}.`
      : "",
    knowledge.substitutionRules?.length
      ? `Cuisine-aware substitution rules: ${knowledge.substitutionRules.join(" ")}`
      : "",
    knowledge.guardrails?.length
      ? `Mislabeling guardrails: ${knowledge.guardrails.join(" ")}`
      : ""
  ].filter(Boolean);

  return sections.join(" ");
}

function buildLanguageOutputGuidance(recipeLanguage: string) {
  if (recipeLanguage.toLowerCase() !== "arabic") {
    return "Write all user-facing recipe text in the requested recipe language. Keep image_search_index and image_search_indices in English.";
  }

  return [
    "Arabic output rule: write every user-facing field in Arabic, including name, cuisine, ingredients, missing_ingredients, steps, cook_time, difficulty, preference_hits, shoppingList, day labels, and scan_match_explanation.",
    "Keep only image_search_index and image_search_indices in English because those fields are used for public image search.",
    "Do not mix English dish names into Arabic text unless the dish has no common Arabic rendering; in that case use an Arabic transliteration.",
    "Use natural Arabic cooking language, not word-for-word translation."
  ].join(" ");
}

function buildCuisineDishCatalogGuidance(preferredCuisine: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return "";

  const referenceDishes = getCuisineDishReferenceText(preferredCuisine, 50);
  if (!referenceDishes) return "";

  return [
    `Famous ${preferredCuisine} dish reference set for authenticity and recall: ${referenceDishes}.`,
    "Use this reference set as the target dish universe when naming recipes.",
    "When the pantry is sparse, choose the closest authentic dish family from this cuisine reference set instead of inventing a generic bowl, skillet, wrap, or salad.",
    "If the pantry only supports part of a classic dish, keep the authentic dish family and move the missing support items into missing_ingredients."
  ].join(" ");
}

function buildCuisineSubstyleGuidance(
  preferredCuisine: string,
  ingredients: Array<{ name: string; quantity?: string }>
) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const knowledge = CUISINE_KNOWLEDGE[normalized];
  if (!knowledge?.substyles?.length) return "";

  const pantry = buildNormalizedPantrySet(ingredients);
  const candidates = knowledge.substyles.join(", ");

  if (normalized === "asian") {
    if (hasAny(pantry, ["fish sauce", "lime", "basil", "coconut milk", "lemongrass"])) {
      return `Substyle routing: the pantry leans Thai, so prefer Thai dish families and say Thai in the cuisine field when appropriate. Other available substyles are ${candidates}.`;
    }
    if (hasAny(pantry, ["soy sauce", "sesame", "scallion", "ginger"])) {
      return `Substyle routing: the pantry leans East Asian stir-fry or rice-bowl cooking, so choose the clearest substyle rather than leaving every dish broadly labeled Asian. Other available substyles are ${candidates}.`;
    }

    return `Substyle routing: Asian is a broad umbrella. Select the best-fitting substyle from these options based on the pantry: ${candidates}.`;
  }

  return `Substyle routing: if the pantry clearly matches one of these branches, prefer it explicitly: ${candidates}.`;
}

function buildMealTypeRoutingGuidance(
  preferredCuisine: string,
  ingredients: Array<{ name: string; quantity?: string }>
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  if (!pantry.size) return "";

  const breakfastSignals = countPantryMatches(pantry, [
    "egg", "eggs", "fava bean", "broad bean", "ful", "yogurt", "feta", "cheese", "bread", "pita", "bell pepper", "tomato"
  ]);
  const dinnerSignals = countPantryMatches(pantry, [
    "ground meat", "ground beef", "lamb", "chicken", "rice", "pasta", "noodle", "lentil", "kidney bean", "chickpea", "coconut milk"
  ]);

  const normalizedCuisine = normalizeCuisinePromptKey(preferredCuisine);
  const mealBias =
    breakfastSignals >= Math.max(2, dinnerSignals + 1)
      ? "The pantry is breakfast-leaning, so at least some top recipes should be authentic breakfast dishes."
      : dinnerSignals >= 2
        ? "The pantry is lunch/dinner-leaning, so prioritize full plated meals, skillets, stews, rice dishes, pasta dishes, or baked mains over breakfast plates."
        : "The pantry is mixed, so balance breakfast-style and lunch/dinner-style dish families according to the strongest authentic match.";

  if (normalizedCuisine === "egyptian") {
    return `${mealBias} For Egyptian cuisine, breakfast should lean toward ful, taameya, shakshuka, or eggah; lunch and dinner should lean toward kofta, hawawshi, fasolia, koshary, rice plates, or baked casseroles.`;
  }

  if (normalizedCuisine === "italian") {
    return `${mealBias} For Italian cuisine, breakfast should stay light like frittata or toast-based dishes, while lunch and dinner should lean toward pasta, risotto, soups, skillets, or baked dishes.`;
  }

  if (normalizedCuisine === "indian") {
    return `${mealBias} For Indian cuisine, breakfast can lean toward bhurji, poha, upma, or masala omelette, while lunch and dinner should lean toward dal, pulao, curry, keema, rajma, or chana masala.`;
  }

  return mealBias;
}

function buildCuisineImageGuidance(preferredCuisine: string) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const knowledge = CUISINE_KNOWLEDGE[normalized];
  if (!knowledge?.visualAnchors?.length) return "";

  return `Image-search guidance: prefer search phrases that reflect the dish's visible form. Favor these visual anchors when relevant: ${knowledge.visualAnchors.join(", ")}. Do not reuse the same broad photo phrase for visually different recipes.`;
}

function normalizeCuisinePromptKey(value: string) {
  if (!value || value === "Any") return "any";
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function buildIngredientDrivenCuisineGuidance(
  preferredCuisine: string,
  ingredients: Array<{ name: string; quantity?: string }>
) {
  const pantry = buildNormalizedPantrySet(ingredients);

  if (!pantry.size) return "";

  const cuisineKey = normalizeCuisinePromptKey(preferredCuisine);
  const hints: string[] = [];

  if (cuisineKey === "egyptian") {
    if (hasAny(pantry, ["ground meat", "minced meat", "beef mince", "lamb mince", "mince"])) {
      hints.push("Egyptian ingredient reasoning: when ground meat is present, consider kofta first if onion, parsley, cilantro, garlic, or rice are available.");

      if (hasAny(pantry, ["bread", "pita", "baladi bread", "flatbread"])) {
        hints.push("Egyptian ingredient reasoning: ground meat plus bread or pita should strongly suggest hawawshi or arayes-style stuffed bread before generic meat sandwiches.");
      }

      if (hasAny(pantry, ["pasta", "penne", "macaroni", "spaghetti"]) && hasAny(pantry, ["milk", "butter", "flour", "bechamel", "cream"])) {
        hints.push("Egyptian ingredient reasoning: ground meat plus pasta plus milk, butter, flour, or bechamel components should strongly suggest macarona bechamel before generic pasta bake.");
      }

      if (hasAny(pantry, ["tomato", "tomato sauce", "passata"]) && hasAny(pantry, ["rice", "vermicelli"])) {
        hints.push("Egyptian ingredient reasoning: ground meat plus tomato and rice can support kofta with rice or meat kofta in tomato sauce.");
      }
    }

    if (hasAny(pantry, ["fava bean", "broad bean", "ful"])) {
      hints.push("Egyptian ingredient reasoning: fava beans strongly suggest ful medames for breakfast or taameya-style dishes when herbs and aromatics fit.");
      if (hasAny(pantry, ["onion", "garlic"]) && hasAny(pantry, ["cilantro", "coriander", "parsley", "dill"])) {
        hints.push("Egyptian ingredient reasoning: fava beans plus onion, garlic, and fresh herbs should strongly suggest taameya instead of generic bean patties.");
      }
    }

    if (hasAny(pantry, ["egg", "eggs"]) && hasAny(pantry, ["tomato", "tomato sauce"]) && hasAny(pantry, ["bell pepper", "pepper", "onion"])) {
      hints.push("Egyptian ingredient reasoning: eggs plus tomato plus pepper or onion should strongly suggest shakshuka or shakshouka for breakfast.");
    }

    if (hasAny(pantry, ["lentil", "brown lentil"]) && hasAny(pantry, ["rice"]) && hasAny(pantry, ["pasta", "macaroni", "spaghetti"])) {
      hints.push("Egyptian ingredient reasoning: lentils plus rice plus pasta strongly suggest koshary, especially if tomato sauce, chickpeas, or fried onion are plausible missing ingredients.");
    }
  }

  if (cuisineKey === "italian") {
    if (hasAny(pantry, ["pasta", "spaghetti", "penne", "macaroni"]) && hasAny(pantry, ["tomato", "tomato sauce", "passata"])) {
      hints.push("Italian ingredient reasoning: pasta plus tomato should favor pomodoro, arrabbiata, baked pasta, or tomato-based pasta families instead of generic noodles.");
    }
    if (hasAny(pantry, ["pasta", "spaghetti", "penne", "macaroni"]) && hasAny(pantry, ["milk", "cream", "parmesan", "mozzarella", "butter"])) {
      hints.push("Italian ingredient reasoning: pasta plus dairy should favor creamy pasta or baked pasta families and should be clearly distinguished from red sauce pasta.");
    }
  }

  if (cuisineKey === "indian") {
    if (hasAny(pantry, ["lentil", "red lentil", "yellow lentil", "masoor dal", "moong dal"])) {
      hints.push("Indian ingredient reasoning: lentils should favor dal families before generic lentil soup when the cuisine is Indian.");
    }
    if (hasAny(pantry, ["chickpea", "garbanzo"]) && hasAny(pantry, ["tomato", "onion", "garlic", "ginger"])) {
      hints.push("Indian ingredient reasoning: chickpeas plus tomato, onion, and aromatics should favor chana masala-style dishes.");
    }
  }

  if (cuisineKey === "thai") {
    if (hasAny(pantry, ["rice noodle", "noodle"]) && hasAny(pantry, ["egg", "shrimp", "chicken", "bean sprout"])) {
      hints.push("Thai ingredient reasoning: rice noodles plus protein and egg should favor Thai noodle families rather than generic stir-fry noodles.");
    }
    if (hasAny(pantry, ["coconut milk"]) && hasAny(pantry, ["chicken", "shrimp", "vegetable"])) {
      hints.push("Thai ingredient reasoning: coconut milk plus protein or vegetables should favor curry or coconut soup families when the rest of the pantry fits.");
    }
  }

  return hints.join(" ");
}

function buildSparseIngredientGuidance(
  ingredients: Array<{ name: string; quantity?: string }>,
  preferredCuisine: string
) {
  if (ingredients.length > 2) return "";

  const normalizedCuisine = normalizeCuisinePromptKey(preferredCuisine);
  const pantry = buildNormalizedPantrySet(ingredients);
  const pantryAnchors = getCuisinePantryAnchors(preferredCuisine);
  const ingredientList = ingredients.map((item) => item.name).filter(Boolean).join(", ") || "the provided ingredients";
  const baseGuidance = [
    `Sparse pantry guidance: the user only provided ${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"} (${ingredientList}).`,
    "Start from the strongest authentic dish family that naturally centers those ingredients, then list missing support items in missing_ingredients instead of forcing a generic recipe.",
    "When only one or two ingredients are available, it is acceptable for missing_ingredients to carry the aromatics, sauce components, starches, bread, herbs, or garnish that make the dish authentic.",
    "Do not pretend the user already owns support ingredients. Keep ingredients strictly limited to the provided pantry items, but still choose the most recognizable real dish family those items suggest.",
    "For image_search_indices in sparse-pantries, keep the first phrase exact if a real iconic dish family fits, then add one or two broader ingredient-led food-photo phrases so image lookup can still succeed."
  ];

  if (pantryAnchors.length) {
    baseGuidance.push(
      `Sparse pantry anchors for ${preferredCuisine}: ${pantryAnchors.join(", ")}. When one of these staples appears, strongly prefer authentic dishes built around it.`
    );
  }

  if (normalizedCuisine === "egyptian") {
    if (hasAny(pantry, ["ground meat", "minced meat", "beef mince", "lamb mince", "mince"])) {
      baseGuidance.push(
        "Sparse Egyptian logic: ground meat alone can still justify kofta, hawawshi, or macarona bechamel if the missing aromatics, bread, pasta, or bechamel staples are listed in missing_ingredients."
      );
    }

    if (hasAny(pantry, ["egg", "eggs"])) {
      baseGuidance.push(
        "Sparse Egyptian logic: eggs alone or eggs with tomato/pepper can still justify shakshuka or eggah-style families if the missing vegetables, herbs, or bread are listed explicitly."
      );
    }

    if (hasAny(pantry, ["fava bean", "broad bean", "ful"])) {
      baseGuidance.push(
        "Sparse Egyptian logic: fava beans alone can still justify ful medames or taameya-style dishes if the missing aromatics and herbs are listed explicitly."
      );
    }
  }

  return baseGuidance.join(" ");
}

function buildNormalizedPantrySet(ingredients: Array<{ name: string; quantity?: string }>) {
  return new Set(
    ingredients
      .map((item) => normalizePantryIngredient(item.name))
      .filter(Boolean)
  );
}

function hasAny(pantry: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizePantryIngredient(candidate);
    return Array.from(pantry).some(
      (ingredient) =>
        ingredient === normalizedCandidate ||
        ingredient.includes(normalizedCandidate) ||
        normalizedCandidate.includes(ingredient)
    );
  });
}

function countPantryMatches(pantry: Set<string>, candidates: string[]) {
  return candidates.reduce((count, candidate) => count + (hasAny(pantry, [candidate]) ? 1 : 0), 0);
}

function normalizePantryIngredient(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\b(cup|cups|tbsp|tsp|g|gram|grams|kg|lb|oz|bag|bottle|jar|can|cans|carton|pack|package|whole|fresh|dried|dry|frozen|cooked|raw|minced|chopped|diced|sliced)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNutritionGoals(goals: NutritionGoals) {
  const entries = [
    goals.minCalories ? `minimum calories ${goals.minCalories} kcal per meal` : "",
    goals.maxCalories ? `maximum calories ${goals.maxCalories} kcal per meal` : "",
    goals.minProtein ? `minimum protein ${goals.minProtein}g per meal` : "",
    goals.maxCarbs ? `maximum carbs ${goals.maxCarbs}g per meal` : "",
    goals.maxSugar ? `maximum sugar ${goals.maxSugar}g per meal` : "",
    goals.maxSodium ? `maximum sodium ${goals.maxSodium}mg per meal` : "",
    goals.minSodium ? `minimum sodium ${goals.minSodium}mg per meal` : "",
    goals.maxFat ? `maximum fat ${goals.maxFat}g per meal` : "",
    goals.minFiber ? `minimum fiber ${goals.minFiber}g per meal` : ""
  ].filter(Boolean);

  return entries.length ? entries.join("; ") : "standard balanced meals aligned to calorie target";
}

export function buildIngredientVisionPrompt(language = "English") {
  return [
    "You are NutriMoment's food vision assistant.",
    "Analyze the image and identify the clearly visible food ingredients or dominant grocery components in it.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact format: {\"ingredients\":[\"ingredient1\",\"ingredient2\"]}.",
    "Only include actual food ingredients. Use short canonical grocery names in singular form when possible.",
    "If the image shows a cooked dish instead of loose ingredients, list only the dominant visible components such as chicken breast, pasta, rice, noodles, tomato sauce, white sauce, cheese, spinach, or mushrooms. Do not invent hidden seasonings or full recipes.",
    "Never output brand names, packaging text, cookware, plates, utensils, or vague labels like food, meal, dish, sauce, or seasoning unless the ingredient itself is visually clear.",
    `Use ${language}.`
  ].join(" ");
}

export function buildIngredientNameArrayVisionPrompt(language = "English", isPantry = false) {
  return [
    "You are NutriMoment's food vision assistant.",
    isPantry
      ? "Identify distinct grocery or pantry items visible in the image, including jars, cans, packaged goods, fresh produce, and staples."
      : "Identify the clearly visible food ingredients or dominant grocery components in the image.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    isPantry
      ? "Return a JSON array of short item names, for example: [\"olive oil\",\"rice\",\"canned tomatoes\"]."
      : "Return a JSON array of short canonical ingredient names, for example: [\"tomato\",\"onion\",\"chicken breast\"].",
    isPantry
      ? "Prefer generic grocery names over brands, and include packaged foods only when the food type is clear."
      : "If the image shows a plated meal, output only the dominant visible components such as grilled chicken, pasta, egg noodles, tomato sauce, white sauce, rice, broccoli, or mushrooms. Prefer the ingredient form over the recipe title.",
    "Do not include quantities, brands, cookware, tableware, or speculative ingredients that are not visually clear.",
    `Use ${language}.`
  ].join(" ");
}

export function buildPlateRecipeMatchVisionPrompt(language = "English") {
  const languageOutputGuidance = buildLanguageOutputGuidance(language);

  return [
    "You are NutriMoment's plated-dish reconstruction assistant.",
    "Analyze the uploaded image and decide whether it shows a plated prepared meal that can be recreated as a recipe.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact top-level shape: {\"isPlatedDish\":true,\"recipe\":{...}} or {\"isPlatedDish\":false,\"reason\":\"...\"}.",
    "If the image is not a plated meal, or it is too ambiguous to infer a likely recipe, return isPlatedDish false.",
    "If it is a plated meal, return exactly one likely recipe that recreates the visible dish as closely as possible.",
    "Prefer canonical dish names over generic names. Example: use chicken alfredo pasta, shakshuka, fried rice, grilled salmon with rice, not delicious dinner bowl.",
    "Base the recipe on clearly visible food components and likely cooking structure. It is acceptable to infer a small number of support ingredients when they are necessary to recreate the dish faithfully.",
    "Visible dominant components should go in ingredients. Likely but not clearly visible support items should go in missing_ingredients.",
    "Do not include brands, cookware, plates, utensils, tables, garnish guesses with low confidence, or speculative hidden ingredients that are not needed to reconstruct the dish.",
    "Return 7 to 10 detailed recipe steps that are practical for home cooking.",
    "Every step string must include the action, exact ingredient quantities used in that step, heat level or tool when relevant, timing in minutes, and the visual/texture cue for moving on.",
    "Also include image_search_index and image_search_indices so photo lookup can find the same dish style later.",
    languageOutputGuidance,
    "Set scan_match_explanation to one short sentence explaining why this recipe matches the plated dish visually.",
    "The recipe object must include exactly these keys: name, cuisine, recipe_origin, scan_match_explanation, image_search_index, image_search_indices, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, fiber, sugar, sodium, cook_time, difficulty, match_quality, preference_hits.",
    "Set recipe_origin to exact_scan_match.",
    "Set match_quality to great when the dish family is clear, good when plausible, possible when somewhat uncertain.",
    "Return ingredients and missing_ingredients as arrays of short strings. Return steps as an array of detailed strings with timing and quantities. Return preference_hits as an empty array if none apply.",
    `Use ${language}.`
  ].join(" ");
}

export function buildPantryInventoryVisionPrompt(language = "English") {
  return [
    "You are NutriMoment's pantry inventory assistant.",
    "Analyze the pantry or grocery image and identify visible food items with approximate quantities.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact format: {\"items\":[{\"name\":\"rice\",\"quantity\":\"1 bag\"},{\"name\":\"olive oil\",\"quantity\":\"1 bottle\"}]}",
    "Estimate quantity approximately using simple units like \"1 jar\", \"2 cans\", \"half bag\", \"1 bunch\", or \"1 carton\".",
    "Use short singular item names where possible. Only include food or pantry items that are reasonably visible. If uncertain, provide a cautious approximate quantity.",
    `Use ${language}.`
  ].join(" ");
}

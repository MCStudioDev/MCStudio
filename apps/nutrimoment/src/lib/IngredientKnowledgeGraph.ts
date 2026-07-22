/**
 * Deterministic culinary knowledge for ranking and validating recipe candidates.
 * This intentionally describes established ingredient relationships; it does
 * not generate recipes or replace the source-recipe catalog.
 */

export type IngredientCategory =
  | "protein"
  | "seafood"
  | "vegetable"
  | "aromatic"
  | "dairy"
  | "grain"
  | "starch"
  | "legume";

export type Seasonality = "all_year" | "spring" | "summer" | "autumn" | "winter";

export interface CuisineConnection {
  cuisine: string;
  strength: "core" | "common";
  regionalVariations: string[];
}

export interface CookingTechnique {
  name: string;
  typicalMinutes: { active: number; total: number };
  difficulty: "easy" | "medium" | "advanced";
  notes: string;
}

export interface IngredientSubstitution {
  ingredient: string;
  useWhen: string;
  avoidWhen?: string;
}

/** A named, culturally coherent route from an ingredient to a dish family. */
export interface CulinaryPath {
  cuisine: string;
  dishFamily: string;
  technique: string;
  flavorPairings: string[];
  herbs: string[];
  spices: string[];
  starches: string[];
  sauces: string[];
  supportIngredients: string[];
  typicalMinutes: { minimum: number; maximum: number };
  difficulty: "easy" | "medium" | "advanced";
  regionalVariation: string;
}

export interface IngredientKnowledgeNode {
  ingredient: string;
  category: IngredientCategory;
  cuisines: CuisineConnection[];
  cookingTechniques: CookingTechnique[];
  flavorPairings: string[];
  commonHerbs: string[];
  commonSpices: string[];
  sauces: string[];
  cookingTime: { minimum: number; maximum: number; notes: string };
  difficulty: "easy" | "medium" | "advanced";
  seasonality: Seasonality[];
  regionalVariations: string[];
  substitutions: IngredientSubstitution[];
  culinaryPaths?: CulinaryPath[];
}

export interface IngredientKnowledgeMatch {
  requested: string;
  canonical: string;
  knowledge: IngredientKnowledgeNode;
}

export interface IngredientKnowledgeProfile {
  matches: IngredientKnowledgeMatch[];
  unmatched: string[];
  sharedCuisines: string[];
  suggestedTechniques: CookingTechnique[];
  flavorPairings: string[];
  herbs: string[];
  spices: string[];
  sauces: string[];
  culinaryPaths: CulinaryPath[];
}

const ALL_YEAR: Seasonality[] = ["all_year"];
const PROTEIN_CUISINES: CuisineConnection[] = [
  { cuisine: "egyptian", strength: "common", regionalVariations: ["Cairo", "Alexandria"] },
  { cuisine: "turkish", strength: "common", regionalVariations: ["Anatolia", "Southeastern Turkey"] },
  { cuisine: "italian", strength: "common", regionalVariations: ["Sicily", "Central Italy"] },
  { cuisine: "indian", strength: "common", regionalVariations: ["North India", "South India"] },
  { cuisine: "mexican", strength: "common", regionalVariations: ["Central Mexico", "Northern Mexico"] },
  { cuisine: "mediterranean", strength: "common", regionalVariations: ["Greek", "Levantine"] }
];

function cuisines(...entries: CuisineConnection[]) {
  return entries;
}

function technique(
  name: string,
  active: number,
  total: number,
  difficulty: CookingTechnique["difficulty"],
  notes: string
): CookingTechnique {
  return { name, typicalMinutes: { active, total }, difficulty, notes };
}

const NODES: Record<string, IngredientKnowledgeNode> = {
  chicken: {
    ingredient: "chicken",
    category: "protein",
    cuisines: PROTEIN_CUISINES,
    cookingTechniques: [
      technique("grill", 15, 25, "easy", "Use boneless pieces or skewers; cook to 74C / 165F."),
      technique("bake", 10, 30, "easy", "Bake cutlets, thighs, or a tray dish until fully cooked."),
      technique("braise", 20, 50, "medium", "Brown first, then simmer gently in sauce or stock."),
      technique("stir_fry", 12, 18, "easy", "Use thin slices and cook quickly over high heat.")
    ],
    flavorPairings: ["tomato", "onion", "garlic", "lemon", "yogurt", "rice", "bell pepper", "mushroom"],
    commonHerbs: ["parsley", "basil", "oregano", "cilantro", "mint"],
    commonSpices: ["paprika", "cumin", "coriander", "black pepper", "turmeric", "garam masala"],
    sauces: ["tomato sauce", "yogurt marinade", "lemon garlic sauce", "cream sauce", "tahini sauce"],
    cookingTime: { minimum: 15, maximum: 60, notes: "Timing depends on cut and method; verify an internal temperature of 74C / 165F." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian chicken shawarma", "Turkish shish tavuk", "Italian chicken cacciatore", "Indian tandoori chicken", "Mexican chicken fajitas"],
    substitutions: [
      { ingredient: "turkey", useWhen: "A lean poultry substitution is needed." },
      { ingredient: "firm tofu", useWhen: "A vegetarian protein is required.", avoidWhen: "The recipe depends on chicken-specific stock or cooking time." }
    ],
    culinaryPaths: [
      {
        cuisine: "egyptian",
        dishFamily: "chicken molokhia with rice",
        technique: "braise",
        flavorPairings: ["garlic", "coriander", "chicken stock"],
        herbs: ["cilantro"],
        spices: ["cumin", "black pepper"],
        starches: ["egyptian rice"],
        sauces: ["molokhia broth"],
        supportIngredients: ["molokhia", "garlic", "coriander", "rice"],
        typicalMinutes: { minimum: 45, maximum: 75 },
        difficulty: "medium",
        regionalVariation: "Egyptian home-style molokhia"
      },
      {
        cuisine: "turkish",
        dishFamily: "shish tavuk with rice",
        technique: "grill",
        flavorPairings: ["yogurt", "lemon", "garlic"],
        herbs: ["parsley"],
        spices: ["paprika", "cumin", "black pepper"],
        starches: ["rice pilaf", "lavash"],
        sauces: ["yogurt marinade"],
        supportIngredients: ["yogurt", "lemon", "garlic", "rice"],
        typicalMinutes: { minimum: 35, maximum: 90 },
        difficulty: "easy",
        regionalVariation: "Turkish shish tavuk"
      },
      {
        cuisine: "italian",
        dishFamily: "chicken cacciatore",
        technique: "braise",
        flavorPairings: ["tomato", "onion", "bell pepper", "olive"],
        herbs: ["oregano", "parsley"],
        spices: ["black pepper", "chili"],
        starches: ["pasta", "polenta", "bread"],
        sauces: ["tomato sauce"],
        supportIngredients: ["tomato", "onion", "bell pepper", "olive oil"],
        typicalMinutes: { minimum: 45, maximum: 70 },
        difficulty: "medium",
        regionalVariation: "Central Italian hunter-style chicken"
      },
      {
        cuisine: "indian",
        dishFamily: "tandoori chicken",
        technique: "bake",
        flavorPairings: ["yogurt", "lemon", "ginger", "garlic"],
        herbs: ["cilantro"],
        spices: ["garam masala", "cumin", "coriander", "turmeric", "chili"],
        starches: ["basmati rice", "naan"],
        sauces: ["yogurt marinade"],
        supportIngredients: ["yogurt", "ginger", "garlic", "lemon"],
        typicalMinutes: { minimum: 45, maximum: 150 },
        difficulty: "medium",
        regionalVariation: "North Indian tandoori-style chicken"
      },
      {
        cuisine: "mexican",
        dishFamily: "chicken fajitas",
        technique: "saute",
        flavorPairings: ["bell pepper", "onion", "lime"],
        herbs: ["cilantro"],
        spices: ["cumin", "paprika", "chili"],
        starches: ["corn tortilla", "flour tortilla", "rice"],
        sauces: ["salsa", "lime crema"],
        supportIngredients: ["bell pepper", "onion", "lime", "tortilla"],
        typicalMinutes: { minimum: 20, maximum: 35 },
        difficulty: "easy",
        regionalVariation: "Northern Mexican fajita-style chicken"
      }
    ]
  },
  beef: {
    ingredient: "beef",
    category: "protein",
    cuisines: cuisines(...PROTEIN_CUISINES, { cuisine: "american", strength: "common", regionalVariations: ["Southern", "Cajun"] }),
    cookingTechniques: [
      technique("grill", 10, 20, "medium", "Use tender cuts; rest after cooking."),
      technique("stew", 20, 120, "medium", "Sear cubes, then simmer until fork-tender."),
      technique("roast", 20, 75, "medium", "Use an intact roast and rest before slicing."),
      technique("stir_fry", 10, 18, "easy", "Slice thinly across the grain.")
    ],
    flavorPairings: ["onion", "garlic", "tomato", "mushroom", "potato", "bell pepper"],
    commonHerbs: ["parsley", "thyme", "rosemary", "oregano"],
    commonSpices: ["black pepper", "cumin", "paprika", "allspice", "coriander"],
    sauces: ["tomato sauce", "mushroom sauce", "pepper sauce", "yogurt marinade"],
    cookingTime: { minimum: 10, maximum: 180, notes: "Tender cuts cook quickly; stewing cuts need a long, gentle simmer." },
    difficulty: "medium",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian beef tagine", "Turkish beef guvec", "Italian beef ragu", "Indian beef curry", "Mexican carne guisada"],
    substitutions: [
      { ingredient: "lamb", useWhen: "A richer red-meat alternative fits the dish." },
      { ingredient: "mushroom", useWhen: "A plant-forward filling or sauce is needed.", avoidWhen: "The dish requires a braised meat texture." }
    ]
  },
  "ground beef": {
    ingredient: "ground beef",
    category: "protein",
    cuisines: cuisines(...PROTEIN_CUISINES, { cuisine: "american", strength: "core", regionalVariations: ["Midwest", "Southern"] }),
    cookingTechniques: [
      technique("pan_brown", 10, 15, "easy", "Break into small crumbles and brown until no pink remains."),
      technique("grill", 15, 25, "medium", "Shape into kofta, kebab, or patties and handle gently."),
      technique("bake", 15, 40, "easy", "Works for meatballs, casseroles, and meatloaf."),
      technique("simmer_in_sauce", 15, 40, "easy", "Brown first, then finish in tomato or spiced sauce.")
    ],
    flavorPairings: ["onion", "garlic", "tomato", "rice", "bread", "bell pepper"],
    commonHerbs: ["parsley", "mint", "cilantro", "oregano"],
    commonSpices: ["cumin", "paprika", "allspice", "coriander", "black pepper"],
    sauces: ["tomato sauce", "tahini sauce", "yogurt sauce", "barbecue sauce"],
    cookingTime: { minimum: 10, maximum: 45, notes: "Cook to 71C / 160F; mince only from an intact cut when the recipe explicitly directs it." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian kofta", "Turkish kofte", "Italian meatballs", "Mexican picadillo", "Indian keema"],
    substitutions: [
      { ingredient: "ground turkey", useWhen: "A leaner mince is preferred." },
      { ingredient: "lentils", useWhen: "A vegetarian filling or sauce is required." }
    ]
  },
  fish: {
    ingredient: "fish",
    category: "seafood",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "core", regionalVariations: ["Alexandria", "Port Said"] },
      { cuisine: "turkish", strength: "common", regionalVariations: ["Aegean", "Black Sea"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Sicily", "Liguria"] },
      { cuisine: "mediterranean", strength: "core", regionalVariations: ["Greek", "Levantine"] },
      { cuisine: "indian", strength: "common", regionalVariations: ["Kerala", "Goa"] }
    ),
    cookingTechniques: [
      technique("grill", 8, 18, "easy", "Oil the grill and turn delicate fillets once."),
      technique("bake", 8, 22, "easy", "Bake until opaque and flakes easily."),
      technique("pan_sear", 8, 15, "easy", "Start presentation-side down and avoid moving too soon."),
      technique("stew", 15, 35, "medium", "Add fish near the end so it stays intact.")
    ],
    flavorPairings: ["lemon", "tomato", "garlic", "rice", "onion", "bell pepper"],
    commonHerbs: ["parsley", "dill", "cilantro", "mint"],
    commonSpices: ["cumin", "coriander", "paprika", "turmeric", "black pepper"],
    sauces: ["lemon herb sauce", "tomato sauce", "tahini sauce", "yogurt sauce"],
    cookingTime: { minimum: 8, maximum: 35, notes: "Most fillets cook quickly; avoid long boiling unless using a firm fish in a stew." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian sayadeya", "Turkish grilled fish", "Italian fish cacciatore", "Mediterranean baked fish", "Indian fish curry"],
    substitutions: [
      { ingredient: "shrimp", useWhen: "A quick-cooking seafood substitution is suitable." },
      { ingredient: "firm tofu", useWhen: "A vegetarian protein is needed in a curry or sauce." }
    ]
  },
  shrimp: {
    ingredient: "shrimp",
    category: "seafood",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "core", regionalVariations: ["Alexandria"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Coastal Italy"] },
      { cuisine: "thai", strength: "core", regionalVariations: ["Central Thailand", "Southern Thailand"] },
      { cuisine: "mexican", strength: "common", regionalVariations: ["Baja California", "Yucatan"] },
      { cuisine: "mediterranean", strength: "common", regionalVariations: ["Greek", "Levantine"] }
    ),
    cookingTechniques: [
      technique("saute", 5, 8, "easy", "Cook just until pink and curled; overcooking makes shrimp tough."),
      technique("grill", 6, 12, "easy", "Use skewers or a grill basket for even cooking."),
      technique("stir_fry", 5, 10, "easy", "Add shrimp after aromatics and vegetables are nearly ready."),
      technique("curry", 10, 20, "easy", "Simmer sauce first, then add shrimp for the final few minutes.")
    ],
    flavorPairings: ["garlic", "lemon", "lime", "tomato", "rice", "bell pepper"],
    commonHerbs: ["cilantro", "parsley", "basil", "mint"],
    commonSpices: ["paprika", "cumin", "chili", "coriander", "turmeric"],
    sauces: ["garlic lemon sauce", "sweet chili sauce", "tomato sauce", "coconut curry sauce"],
    cookingTime: { minimum: 4, maximum: 20, notes: "Shrimp cooks rapidly and should be added last to soups, curries, and sauces." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Alexandrian shrimp", "Turkish karides guvec", "Italian shrimp linguine", "Thai shrimp curry", "Mexican shrimp tacos"],
    substitutions: [
      { ingredient: "firm white fish", useWhen: "A seafood swap is needed in a curry or stew." },
      { ingredient: "chicken", useWhen: "A non-seafood protein is needed; extend cooking time accordingly." }
    ]
  },
  egg: {
    ingredient: "egg",
    category: "protein",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "common", regionalVariations: ["Cairo"] },
      { cuisine: "turkish", strength: "core", regionalVariations: ["Anatolia"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Rome"] },
      { cuisine: "mexican", strength: "common", regionalVariations: ["Central Mexico"] },
      { cuisine: "indian", strength: "common", regionalVariations: ["North India"] }
    ),
    cookingTechniques: [
      technique("scramble", 5, 8, "easy", "Cook gently and remove while still glossy."),
      technique("fry", 4, 7, "easy", "Set the white fully; cook yolk to preference."),
      technique("bake", 10, 25, "easy", "Use for frittata, eggah, and casseroles."),
      technique("poach", 5, 8, "medium", "Use barely simmering water and fresh eggs.")
    ],
    flavorPairings: ["tomato", "onion", "bell pepper", "cheese", "bread", "spinach"],
    commonHerbs: ["parsley", "cilantro", "dill", "mint"],
    commonSpices: ["cumin", "paprika", "black pepper", "chili"],
    sauces: ["tomato sauce", "yogurt sauce", "tahini sauce", "herb butter"],
    cookingTime: { minimum: 4, maximum: 25, notes: "Use gentle heat for tender eggs and cook egg dishes until safely set." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian eggah", "Turkish menemen", "Italian frittata", "Mexican huevos rancheros", "Indian egg curry"],
    substitutions: [
      { ingredient: "chickpea flour", useWhen: "A vegan omelet-style dish is required." },
      { ingredient: "tofu", useWhen: "A vegan scramble is needed." }
    ]
  },
  tomato: {
    ingredient: "tomato",
    category: "vegetable",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "core", regionalVariations: ["Cairo", "Alexandria"] },
      { cuisine: "turkish", strength: "core", regionalVariations: ["Anatolia"] },
      { cuisine: "italian", strength: "core", regionalVariations: ["Naples", "Sicily"] },
      { cuisine: "indian", strength: "common", regionalVariations: ["North India"] },
      { cuisine: "mexican", strength: "core", regionalVariations: ["Central Mexico"] },
      { cuisine: "mediterranean", strength: "core", regionalVariations: ["Greek", "Levantine"] }
    ),
    cookingTechniques: [
      technique("raw", 5, 5, "easy", "Use ripe tomatoes for salads, salsa, and garnish."),
      technique("sauce", 15, 45, "easy", "Cook down with aromatics until the raw taste is gone."),
      technique("roast", 10, 35, "easy", "Roasting deepens sweetness and concentrates flavor."),
      technique("stuff", 15, 50, "medium", "Hollow carefully and bake until the filling is cooked.")
    ],
    flavorPairings: ["onion", "garlic", "olive oil", "rice", "bread", "cheese"],
    commonHerbs: ["basil", "parsley", "oregano", "cilantro", "mint"],
    commonSpices: ["black pepper", "cumin", "paprika", "chili", "coriander"],
    sauces: ["tomato sauce", "salsa", "shakshuka sauce", "tomato curry sauce"],
    cookingTime: { minimum: 5, maximum: 60, notes: "Fresh tomatoes are quick; sauces and stuffed dishes need longer cooking." },
    difficulty: "easy",
    seasonality: ["summer", "autumn"],
    regionalVariations: ["Egyptian tomato sauce", "Turkish menemen base", "Italian sugo", "Indian masala base", "Mexican salsa"],
    substitutions: [
      { ingredient: "canned tomato", useWhen: "A cooked sauce or stew is being made." },
      { ingredient: "red bell pepper", useWhen: "A tomato-free roasted vegetable sauce is needed." }
    ]
  },
  "bell pepper": {
    ingredient: "bell pepper",
    category: "vegetable",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "common", regionalVariations: ["Cairo"] },
      { cuisine: "turkish", strength: "common", regionalVariations: ["Anatolia"] },
      { cuisine: "mexican", strength: "core", regionalVariations: ["Northern Mexico"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Sicily"] },
      { cuisine: "mediterranean", strength: "common", regionalVariations: ["Greek"] }
    ),
    cookingTechniques: [
      technique("saute", 8, 15, "easy", "Slice evenly and cook until tender-crisp."),
      technique("roast", 10, 35, "easy", "Roast until charred and sweet, then peel if needed."),
      technique("stuff", 15, 55, "medium", "Hollow peppers and cook filling until hot through."),
      technique("grill", 8, 18, "easy", "Grill broad pieces until lightly charred.")
    ],
    flavorPairings: ["chicken", "beef", "onion", "tomato", "rice", "cheese"],
    commonHerbs: ["parsley", "oregano", "cilantro", "basil"],
    commonSpices: ["paprika", "cumin", "black pepper", "chili"],
    sauces: ["tomato sauce", "salsa", "yogurt sauce", "pepper sauce"],
    cookingTime: { minimum: 8, maximum: 55, notes: "Quick for a saute; longer when stuffed or roasted whole." },
    difficulty: "easy",
    seasonality: ["summer", "autumn"],
    regionalVariations: ["Egyptian pepper with tomato", "Turkish biber dolmasi", "Mexican fajita peppers", "Italian peperonata"],
    substitutions: [
      { ingredient: "poblano pepper", useWhen: "A Mexican dish needs a deeper pepper flavor." },
      { ingredient: "zucchini", useWhen: "A mild vegetable is needed in a saute or tray bake." }
    ]
  },
  onion: aromaticNode("onion", ["tomato", "garlic", "beef", "chicken", "rice", "lentils"], ["parsley", "cilantro", "thyme"], ["cumin", "black pepper", "paprika"], ["tomato sauce", "onion gravy", "yogurt sauce"], ["Egyptian koshari", "Turkish piyaz", "Italian soffritto", "Indian curry base", "Mexican salsa"], [
    { ingredient: "shallot", useWhen: "A milder allium is suitable." },
    { ingredient: "leek", useWhen: "A soup, stew, or baked dish can support a softer allium flavor." }
  ]),
  garlic: aromaticNode("garlic", ["lemon", "tomato", "chicken", "shrimp", "olive oil", "yogurt"], ["parsley", "cilantro", "basil", "dill"], ["black pepper", "paprika", "cumin", "coriander"], ["garlic lemon sauce", "tomato sauce", "aioli", "yogurt sauce"], ["Egyptian kebda", "Turkish cacik", "Italian aglio e olio", "Indian garlic curry", "Mexican mojo"], [
    { ingredient: "garlic powder", useWhen: "Fresh garlic is unavailable; use less because it is concentrated." },
    { ingredient: "ginger", useWhen: "A compatible aromatic is needed in Asian or Indian dishes." }
  ]),
  yogurt: {
    ingredient: "yogurt",
    category: "dairy",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "common", regionalVariations: ["Cairo"] },
      { cuisine: "turkish", strength: "core", regionalVariations: ["Anatolia"] },
      { cuisine: "indian", strength: "core", regionalVariations: ["North India"] },
      { cuisine: "mediterranean", strength: "core", regionalVariations: ["Greek", "Levantine"] }
    ),
    cookingTechniques: [
      technique("marinate", 10, 120, "easy", "Acidity tenderizes poultry; keep seafood marinades brief."),
      technique("cold_sauce", 8, 8, "easy", "Whisk with herbs, garlic, and lemon."),
      technique("gentle_simmer", 10, 20, "medium", "Temper and avoid boiling hard to prevent splitting.")
    ],
    flavorPairings: ["chicken", "cucumber", "garlic", "lemon", "mint", "rice"],
    commonHerbs: ["mint", "dill", "cilantro", "parsley"],
    commonSpices: ["cumin", "paprika", "sumac", "garam masala", "black pepper"],
    sauces: ["tzatziki", "raita", "garlic yogurt sauce", "tahini yogurt sauce"],
    cookingTime: { minimum: 8, maximum: 120, notes: "Use cold or gently heated; avoid a hard boil." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian yogurt marinade", "Turkish cacik", "Indian raita", "Greek tzatziki"],
    substitutions: [
      { ingredient: "lactose-free yogurt", useWhen: "Lactose must be avoided." },
      { ingredient: "unsweetened plant yogurt", useWhen: "A dairy-free cold sauce or marinade is needed." }
    ]
  },
  rice: {
    ingredient: "rice",
    category: "grain",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "core", regionalVariations: ["Cairo", "Alexandria"] },
      { cuisine: "turkish", strength: "core", regionalVariations: ["Anatolia"] },
      { cuisine: "indian", strength: "core", regionalVariations: ["North India", "South India"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Northern Italy"] },
      { cuisine: "mexican", strength: "common", regionalVariations: ["Central Mexico"] }
    ),
    cookingTechniques: [
      technique("absorption", 5, 25, "easy", "Rinse when appropriate, then cook covered until liquid is absorbed."),
      technique("pilaf", 10, 35, "easy", "Toast rice in fat, then add measured hot stock."),
      technique("risotto", 25, 35, "medium", "Add warm stock gradually and stir regularly."),
      technique("fried_rice", 10, 18, "easy", "Use chilled cooked rice so grains stay separate.")
    ],
    flavorPairings: ["chicken", "fish", "shrimp", "tomato", "onion", "lentils"],
    commonHerbs: ["parsley", "cilantro", "dill", "mint"],
    commonSpices: ["cumin", "turmeric", "saffron", "cinnamon", "cardamom"],
    sauces: ["tomato sauce", "curry sauce", "yogurt sauce", "broth"],
    cookingTime: { minimum: 18, maximum: 45, notes: "Cooking time varies by variety; use a measured liquid ratio." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian rice", "Turkish pilav", "Indian biryani rice", "Italian risotto", "Mexican red rice"],
    substitutions: [
      { ingredient: "quinoa", useWhen: "A higher-protein grain is preferred." },
      { ingredient: "cauliflower rice", useWhen: "A lower-carbohydrate base is required." }
    ]
  },
  pasta: {
    ingredient: "pasta",
    category: "starch",
    cuisines: cuisines(
      { cuisine: "italian", strength: "core", regionalVariations: ["Naples", "Rome", "Sicily"] },
      { cuisine: "mediterranean", strength: "common", regionalVariations: ["Greek"] },
      { cuisine: "american", strength: "common", regionalVariations: ["Italian American"] }
    ),
    cookingTechniques: [
      technique("boil_and_toss", 12, 20, "easy", "Boil in well-seasoned water and finish in the sauce."),
      technique("bake", 20, 45, "easy", "Assemble with sauce and bake until hot and browned."),
      technique("one_pot", 15, 30, "easy", "Simmer with measured liquid, stirring to prevent sticking.")
    ],
    flavorPairings: ["tomato", "garlic", "cheese", "chicken", "shrimp", "mushroom"],
    commonHerbs: ["basil", "parsley", "oregano", "thyme"],
    commonSpices: ["black pepper", "chili", "nutmeg", "paprika"],
    sauces: ["tomato sauce", "cream sauce", "pesto", "cheese sauce"],
    cookingTime: { minimum: 10, maximum: 50, notes: "Cook to the package timing, then finish with the sauce." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Italian pasta al pomodoro", "Italian chicken cacciatore pasta", "Greek pastitsio", "American baked pasta"],
    substitutions: [
      { ingredient: "whole-wheat pasta", useWhen: "More fiber is preferred." },
      { ingredient: "gluten-free pasta", useWhen: "Gluten must be avoided." }
    ]
  },
  bread: {
    ingredient: "bread",
    category: "starch",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "core", regionalVariations: ["baladi bread"] },
      { cuisine: "turkish", strength: "core", regionalVariations: ["lavash", "pide"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["focaccia"] },
      { cuisine: "mexican", strength: "common", regionalVariations: ["tortilla"] },
      { cuisine: "middleEastern", strength: "core", regionalVariations: ["pita", "flatbread"] }
    ),
    cookingTechniques: [
      technique("toast", 5, 10, "easy", "Toast until crisp and warm."),
      technique("stuff_and_bake", 15, 35, "easy", "Use fillings that are already cooked or will fully cook in the oven."),
      technique("wrap", 5, 10, "easy", "Warm briefly so it folds without tearing.")
    ],
    flavorPairings: ["chicken", "ground beef", "egg", "tomato", "cheese", "yogurt"],
    commonHerbs: ["parsley", "mint", "oregano"],
    commonSpices: ["zaatar", "sumac", "paprika", "black pepper"],
    sauces: ["tahini sauce", "garlic sauce", "tomato sauce", "yogurt sauce"],
    cookingTime: { minimum: 5, maximum: 35, notes: "Timing depends on whether bread is a wrap, toast, or baked stuffed dish." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations: ["Egyptian hawawshi", "Turkish pide", "Italian bruschetta", "Mexican tortilla", "Levantine shawarma wrap"],
    substitutions: [
      { ingredient: "whole-wheat bread", useWhen: "More fiber is preferred." },
      { ingredient: "gluten-free flatbread", useWhen: "Gluten must be avoided." }
    ]
  },
  potato: {
    ingredient: "potato",
    category: "starch",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "common", regionalVariations: ["Cairo"] },
      { cuisine: "turkish", strength: "common", regionalVariations: ["Anatolia"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Northern Italy"] },
      { cuisine: "indian", strength: "common", regionalVariations: ["North India"] },
      { cuisine: "mexican", strength: "common", regionalVariations: ["Northern Mexico"] }
    ),
    cookingTechniques: [
      technique("roast", 10, 45, "easy", "Cut evenly and roast until crisp outside and tender inside."),
      technique("boil", 5, 30, "easy", "Simmer until a knife enters easily."),
      technique("stew", 10, 60, "easy", "Add early enough to become tender without disintegrating."),
      technique("fry", 15, 30, "medium", "Dry thoroughly and cook in controlled hot oil.")
    ],
    flavorPairings: ["chicken", "beef", "tomato", "onion", "yogurt", "cheese"],
    commonHerbs: ["parsley", "dill", "rosemary", "oregano"],
    commonSpices: ["paprika", "cumin", "turmeric", "black pepper", "chili"],
    sauces: ["tomato sauce", "yogurt sauce", "garlic sauce", "cheese sauce"],
    cookingTime: { minimum: 20, maximum: 60, notes: "Size and method determine timing; cut pieces evenly." },
    difficulty: "easy",
    seasonality: ["autumn", "winter"],
    regionalVariations: ["Egyptian potato tagine", "Turkish kumpir", "Italian potato gnocchi", "Indian aloo curry", "Mexican potato tacos"],
    substitutions: [
      { ingredient: "sweet potato", useWhen: "A sweeter, higher-fiber root vegetable is suitable." },
      { ingredient: "cauliflower", useWhen: "A lower-carbohydrate mash or roast is required." }
    ]
  },
  chickpeas: legumeNode("chickpeas", ["tomato", "onion", "garlic", "lemon", "rice", "yogurt"], ["parsley", "cilantro", "mint"], ["cumin", "coriander", "paprika", "sumac"], ["tahini sauce", "tomato sauce", "yogurt sauce"], ["Egyptian chickpea stew", "Turkish nohut", "Indian chana masala", "Italian ceci soup", "Mediterranean hummus"], [
    { ingredient: "white beans", useWhen: "A creamy legume is suitable in a stew or salad." },
    { ingredient: "lentils", useWhen: "A faster-cooking legume is needed." }
  ]),
  lentils: legumeNode("lentils", ["onion", "garlic", "tomato", "rice", "carrot", "lemon"], ["parsley", "cilantro", "mint"], ["cumin", "coriander", "turmeric", "black pepper"], ["tomato sauce", "lemon dressing", "yogurt sauce"], ["Egyptian lentil soup", "Turkish mercimek corbasi", "Indian dal", "Italian lentil stew", "Mediterranean mujaddara"], [
    { ingredient: "chickpeas", useWhen: "A firmer legume suits the recipe." },
    { ingredient: "brown rice", useWhen: "A grain-based protein complement is needed." }
  ]),
  spinach: vegetableNode("spinach", ["chicken", "egg", "cheese", "garlic", "tomato", "yogurt"], ["dill", "parsley", "basil"], ["nutmeg", "black pepper", "cumin", "chili"], ["cream sauce", "tomato sauce", "yogurt sauce"], ["Egyptian spinach stew", "Turkish spinach yogurt", "Italian spinach pasta", "Indian palak curry", "Greek spanakopita"], [
    { ingredient: "kale", useWhen: "A sturdier leafy green is acceptable." },
    { ingredient: "swiss chard", useWhen: "A cooked leafy green is needed." }
  ]),
  mushroom: vegetableNode("mushroom", ["chicken", "beef", "pasta", "rice", "garlic", "cream"], ["parsley", "thyme", "oregano"], ["black pepper", "paprika", "nutmeg"], ["cream sauce", "mushroom sauce", "tomato sauce"], ["Egyptian mushroom tagine", "Turkish mushroom saute", "Italian mushroom risotto", "Indian mushroom masala", "Mediterranean mushroom bake"], [
    { ingredient: "eggplant", useWhen: "A substantial vegetable is needed in a stew or sauce." },
    { ingredient: "zucchini", useWhen: "A lighter vegetable substitute is suitable." }
  ])
};

const ALIASES: Record<string, string> = {
  "chicken breast": "chicken",
  "chicken thigh": "chicken",
  "chicken thighs": "chicken",
  "chicken breasts": "chicken",
  "ground meat": "ground beef",
  "minced meat": "ground beef",
  "beef mince": "ground beef",
  "prawns": "shrimp",
  "bell peppers": "bell pepper",
  peppers: "bell pepper",
  tomatoes: "tomato",
  onions: "onion",
  cloves: "garlic",
  "chicken stock": "chicken",
  "white fish": "fish",
  "firm white fish": "fish",
  "basmati rice": "rice",
  "brown rice": "rice",
  spaghetti: "pasta",
  penne: "pasta",
  macaroni: "pasta",
  pita: "bread",
  flatbread: "bread",
  lavash: "bread",
  tortillas: "bread",
  potatoes: "potato",
  garbanzo: "chickpeas",
  "garbanzo beans": "chickpeas",
  "chick pea": "chickpeas"
};

function aromaticNode(
  ingredient: string,
  flavorPairings: string[],
  commonHerbs: string[],
  commonSpices: string[],
  sauces: string[],
  regionalVariations: string[],
  substitutions: IngredientSubstitution[]
): IngredientKnowledgeNode {
  return {
    ingredient,
    category: "aromatic",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "core", regionalVariations: ["Cairo", "Alexandria"] },
      { cuisine: "turkish", strength: "core", regionalVariations: ["Anatolia"] },
      { cuisine: "italian", strength: "core", regionalVariations: ["Central Italy"] },
      { cuisine: "indian", strength: "core", regionalVariations: ["North India", "South India"] },
      { cuisine: "mexican", strength: "core", regionalVariations: ["Central Mexico"] },
      { cuisine: "mediterranean", strength: "core", regionalVariations: ["Greek", "Levantine"] }
    ),
    cookingTechniques: [
      technique("saute", 3, 8, "easy", "Cook gently until fragrant; avoid burning."),
      technique("roast", 5, 35, "easy", "Roasting mellows sharp allium flavor."),
      technique("blend_into_sauce", 5, 30, "easy", "Cook into a sauce base before blending when appropriate.")
    ],
    flavorPairings,
    commonHerbs,
    commonSpices,
    sauces,
    cookingTime: { minimum: 3, maximum: 35, notes: "Aromatics provide the flavor base and are usually cooked before proteins or sauces." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations,
    substitutions
  };
}

function legumeNode(
  ingredient: string,
  flavorPairings: string[],
  commonHerbs: string[],
  commonSpices: string[],
  sauces: string[],
  regionalVariations: string[],
  substitutions: IngredientSubstitution[]
): IngredientKnowledgeNode {
  return {
    ingredient,
    category: "legume",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "common", regionalVariations: ["Cairo"] },
      { cuisine: "turkish", strength: "common", regionalVariations: ["Anatolia"] },
      { cuisine: "indian", strength: "core", regionalVariations: ["North India", "South India"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Central Italy"] },
      { cuisine: "mediterranean", strength: "core", regionalVariations: ["Levantine", "Greek"] }
    ),
    cookingTechniques: [
      technique("simmer", 10, 45, "easy", "Use cooked canned legumes or simmer dried legumes until tender."),
      technique("stew", 15, 60, "easy", "Build flavor with aromatics and spices before adding legumes."),
      technique("blend", 10, 20, "easy", "Blend cooked legumes with seasoning for a puree or dip."),
      technique("roast", 8, 35, "easy", "Dry well and roast for crisp texture.")
    ],
    flavorPairings,
    commonHerbs,
    commonSpices,
    sauces,
    cookingTime: { minimum: 15, maximum: 90, notes: "Canned legumes are quick; dried legumes require soaking and longer cooking." },
    difficulty: "easy",
    seasonality: ALL_YEAR,
    regionalVariations,
    substitutions
  };
}

function vegetableNode(
  ingredient: string,
  flavorPairings: string[],
  commonHerbs: string[],
  commonSpices: string[],
  sauces: string[],
  regionalVariations: string[],
  substitutions: IngredientSubstitution[]
): IngredientKnowledgeNode {
  return {
    ingredient,
    category: "vegetable",
    cuisines: cuisines(
      { cuisine: "egyptian", strength: "common", regionalVariations: ["Cairo"] },
      { cuisine: "turkish", strength: "common", regionalVariations: ["Anatolia"] },
      { cuisine: "italian", strength: "common", regionalVariations: ["Central Italy"] },
      { cuisine: "indian", strength: "common", regionalVariations: ["North India"] },
      { cuisine: "mediterranean", strength: "common", regionalVariations: ["Greek", "Levantine"] }
    ),
    cookingTechniques: [
      technique("saute", 6, 15, "easy", "Cook only until tender; leafy vegetables need very little time."),
      technique("roast", 8, 35, "easy", "Roast in a single layer for browning."),
      technique("simmer", 10, 35, "easy", "Add at the point that preserves the intended texture."),
      technique("stuff", 15, 55, "medium", "Use only when the vegetable shape supports a filled dish.")
    ],
    flavorPairings,
    commonHerbs,
    commonSpices,
    sauces,
    cookingTime: { minimum: 5, maximum: 55, notes: "Timing depends on density and whether the vegetable is stuffed, roasted, or used in sauce." },
    difficulty: "easy",
    seasonality: ["spring", "summer", "autumn"],
    regionalVariations,
    substitutions
  };
}

export const IngredientKnowledgeGraph = Object.freeze(NODES);

export function resolveIngredientKnowledge(ingredient: string): IngredientKnowledgeMatch | null {
  const requested = ingredient.trim();
  const normalized = normalizeIngredientKey(requested);
  const canonical = NODES[normalized] ? normalized : ALIASES[normalized];
  const knowledge = canonical ? NODES[canonical] : undefined;
  return knowledge ? { requested, canonical, knowledge } : null;
}

export function buildIngredientKnowledgeProfile(ingredients: string[]): IngredientKnowledgeProfile {
  const matches = ingredients
    .map(resolveIngredientKnowledge)
    .filter((match): match is IngredientKnowledgeMatch => Boolean(match));
  const matchedRequested = new Set(matches.map((match) => normalizeIngredientKey(match.requested)));
  const unmatched = ingredients.filter((ingredient) => !matchedRequested.has(normalizeIngredientKey(ingredient)));
  const cuisineCounts = new Map<string, number>();

  for (const match of matches) {
    for (const cuisine of match.knowledge.cuisines) {
      cuisineCounts.set(cuisine.cuisine, (cuisineCounts.get(cuisine.cuisine) ?? 0) + 1);
    }
  }

  return {
    matches,
    unmatched,
    sharedCuisines: Array.from(cuisineCounts.entries())
      .filter(([, count]) => count > 1 || matches.length === 1)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([cuisine]) => cuisine),
    suggestedTechniques: uniqueBy(matches.flatMap((match) => match.knowledge.cookingTechniques), (item) => item.name),
    flavorPairings: uniqueStrings(matches.flatMap((match) => match.knowledge.flavorPairings)),
    herbs: uniqueStrings(matches.flatMap((match) => match.knowledge.commonHerbs)),
    spices: uniqueStrings(matches.flatMap((match) => match.knowledge.commonSpices)),
    sauces: uniqueStrings(matches.flatMap((match) => match.knowledge.sauces)),
    culinaryPaths: matches.flatMap((match) => match.knowledge.culinaryPaths ?? [])
  };
}

export function getIngredientSubstitutions(ingredient: string) {
  return resolveIngredientKnowledge(ingredient)?.knowledge.substitutions ?? [];
}

/**
 * Returns candidate dish pathways before recipe search. A cuisine filter keeps
 * discovery deterministic while still allowing Any-cuisine variety upstream.
 */
export function getIngredientCulinaryPaths(ingredient: string, cuisine?: string) {
  const paths = resolveIngredientKnowledge(ingredient)?.knowledge.culinaryPaths ?? [];
  const normalizedCuisine = cuisine?.trim().toLocaleLowerCase();
  return normalizedCuisine && normalizedCuisine !== "any"
    ? paths.filter((path) => path.cuisine === normalizedCuisine)
    : paths;
}

function normalizeIngredientKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

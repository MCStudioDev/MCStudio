import { expandIngredientFamilies } from "@/lib/ingredientFamilies";
import {
  ensureArabicRecipeLanguage,
  isArabicRecipeLanguage,
  translateIngredientToEnglish
} from "@/lib/arabicRecipeLocalization";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { Recipe } from "@/lib/types";

export interface ScanRecipeGuardContext {
  allergens?: string[];
  calorieTarget?: number;
  conditions?: string[];
  diets?: string[];
  inputIngredients: string[];
  preferredCuisine?: string;
  recipeCount: number;
  recipeLanguage?: string;
  scoringIngredients?: string[];
}

export function repairScanRecipesWithGuard(recipes: Recipe[], context: ScanRecipeGuardContext): Recipe[] {
  if (!context.inputIngredients.some((ingredient) => ingredient.trim())) {
    return recipes.slice(0, context.recipeCount);
  }

  const wantsArabic = isArabicRecipeLanguage(context.recipeLanguage);
  const signals = buildIngredientSignals(context);
  const dietContext = {
    diets: context.diets ?? [],
    allergens: context.allergens ?? []
  };
  const repaired = recipes
    .map((recipe) => repairIngredientOwnership(recipe, signals, wantsArabic))
    .filter((recipe) => !findRecipeDietViolation(recipe, dietContext))
    .filter((recipe) => !findRecipeHealthViolation(recipe, context.conditions ?? []));

  const prefersSpecificCuisine = Boolean(context.preferredCuisine && context.preferredCuisine !== "Any");
  const cuisineMatchedRecipes = prefersSpecificCuisine
    ? repaired.filter((recipe) => recipeMatchesPreferredCuisine(recipe, context.preferredCuisine))
    : repaired;
  const requestedSeafood = signals.some((signal) => signal.kind === "seafood");
  const seafoodMinimum = requestedSeafood
    ? Math.min(context.recipeCount, Math.max(1, Math.ceil(context.recipeCount * 0.4)))
    : 0;
  const seafoodCount = cuisineMatchedRecipes.filter(recipeContainsSeafood).length;
  const cuisineGap = prefersSpecificCuisine ? Math.max(0, context.recipeCount - cuisineMatchedRecipes.length) : 0;
  const fallbackCount = Math.max(0, seafoodMinimum - seafoodCount, cuisineGap);
  const canUseSeafoodFallback = requestedSeafood && dietAllowsSeafoodFallback(dietContext);
  const fallbackRecipes =
    canUseSeafoodFallback && fallbackCount > 0
      ? filterRecipesByGuardRules(buildSeafoodFallbackRecipes(context, fallbackCount, wantsArabic), context, dietContext)
      : [];

  let merged = dedupeRecipes(orderDiverseRecipes([
    ...cuisineMatchedRecipes.filter(recipeContainsSeafood),
    ...repaired.filter((recipe) => recipeContainsSeafood(recipe) && !cuisineMatchedRecipes.includes(recipe)),
    ...fallbackRecipes,
    ...cuisineMatchedRecipes.filter((recipe) => !recipeContainsSeafood(recipe)),
    ...repaired.filter((recipe) => !cuisineMatchedRecipes.includes(recipe))
  ]));

  if (canUseSeafoodFallback && merged.length < context.recipeCount) {
    merged = dedupeRecipes(orderDiverseRecipes([
      ...merged,
      ...filterRecipesByGuardRules(
        buildSeafoodFallbackRecipes(context, context.recipeCount - merged.length, wantsArabic),
        context,
        dietContext
      )
    ]));
  }

  if (merged.length < context.recipeCount) {
    merged = dedupeRecipes(orderDiverseRecipes([
      ...merged,
      ...filterRecipesByGuardRules(
        buildIngredientFallbackRecipes(context, signals, context.recipeCount - merged.length),
        context,
        dietContext
      )
    ]));
  }

  return merged.slice(0, context.recipeCount);
}

function dietAllowsSeafoodFallback(dietContext: { diets: string[]; allergens: string[] }) {
  const selectedDiets = new Set(dietContext.diets.map((diet) => diet.trim().toLowerCase()));
  if (!selectedDiets.has("pescatarian")) return false;

  return !findRecipeDietViolation({
    name: "Seafood fallback probe",
    cuisine: "Seafood",
    ingredients: ["shrimp", "fish"],
    missing_ingredients: [],
    steps: ["Probe only."]
  }, dietContext);
}

function filterRecipesByGuardRules(
  recipes: Recipe[],
  context: ScanRecipeGuardContext,
  dietContext: { diets: string[]; allergens: string[] }
) {
  return recipes
    .filter((recipe) => !findRecipeDietViolation(recipe, dietContext))
    .filter((recipe) => !findRecipeHealthViolation(recipe, context.conditions ?? []));
}

interface IngredientSignal {
  aliases: string[];
  display: string;
  kind: "dairy" | "fruit" | "protein" | "seafood" | "starch" | "vegetable" | "other";
}

function buildIngredientSignals(context: ScanRecipeGuardContext): IngredientSignal[] {
  const rawIngredients = [...context.inputIngredients, ...(context.scoringIngredients ?? [])];
  const seen = new Set<string>();
  const signals: IngredientSignal[] = [];

  for (const ingredient of rawIngredients) {
    const canonical = normalizeIngredientSignal(ingredient);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    signals.push({
      aliases: Array.from(new Set([canonical, ...expandIngredientFamilies([canonical]).map(normalizeIngredientSignal)]))
        .filter(Boolean),
      display: ingredient,
      kind: getIngredientKind(canonical)
    });
  }

  return signals;
}

function repairIngredientOwnership(recipe: Recipe, signals: IngredientSignal[], wantsArabic: boolean): Recipe {
  const owned = [...recipe.ingredients];
  const missing: string[] = [];

  for (const ingredient of recipe.missing_ingredients) {
    if (signals.some((signal) => ingredientMatchesSignal(ingredient, signal))) {
      owned.push(ingredient);
    } else {
      missing.push(ingredient);
    }
  }

  const repaired: Recipe = {
    ...recipe,
    ingredients: dedupeByNormalizedIngredient(owned),
    missing_ingredients: dedupeByNormalizedIngredient(missing)
  };

  return wantsArabic ? ensureArabicRecipeLanguage(repaired) : repaired;
}

function buildSeafoodFallbackRecipes(context: ScanRecipeGuardContext, count: number, wantsArabic: boolean): Recipe[] {
  const preferredCuisine = context.preferredCuisine && context.preferredCuisine !== "Any"
    ? context.preferredCuisine
    : "Egyptian";
  const targetCalories = Math.max(320, Math.round((context.calorieTarget ?? 1650) / 3));
  const hasRice = [...context.inputIngredients, ...(context.scoringIngredients ?? [])].some((ingredient) =>
    normalizeIngredientSignal(ingredient) === "rice"
  );
  const hasShrimp = [...context.inputIngredients, ...(context.scoringIngredients ?? [])].some((ingredient) =>
    normalizeIngredientSignal(ingredient) === "shrimp"
  );
  const shrimp = wantsArabic ? "جمبري" : "shrimp";
  const rice = wantsArabic ? "رز" : "rice";
  const owned = [hasShrimp ? shrimp : shrimp, hasRice ? rice : rice];
  const cuisine = wantsArabic ? translateCuisineForFallback(preferredCuisine) : preferredCuisine;

  const templates = wantsArabic
    ? [
        {
          name: "أرز صيادية بالجمبري",
          dishName: "shrimp sayadeya rice",
          missing: ["بصل", "طماطم", "ثوم", "كمون", "ليمون"],
          searches: ["egyptian shrimp sayadeya rice", "shrimp sayadeya", "seafood sayadeya rice"]
        },
        {
          name: "جمبري إسكندراني بالثوم مع الأرز",
          dishName: "alexandrian shrimp rice",
          missing: ["ثوم", "فلفل أخضر", "ليمون", "كزبرة", "زيت زيتون"],
          searches: ["alexandrian shrimp rice", "egyptian garlic shrimp", "shrimp eskandarani"]
        },
        {
          name: "طاجن جمبري بالطماطم والأرز",
          dishName: "egyptian shrimp tagine rice",
          missing: ["طماطم", "بصل", "ثوم", "فلفل", "بقدونس"],
          searches: ["egyptian shrimp tagine rice", "shrimp tomato tagine", "egyptian seafood tagine"]
        },
        {
          name: "جمبري مشوي مع أرز بالشبت",
          dishName: "grilled shrimp dill rice",
          missing: ["شبت", "ليمون", "ثوم", "سلطة خضراء", "زيت زيتون"],
          searches: ["egyptian grilled shrimp rice", "grilled shrimp dill rice", "shrimp rice plate"]
        },
        {
          name: "وعاء أرز مصري بالجمبري والحمص",
          dishName: "egyptian shrimp rice bowl",
          missing: ["حمص", "خيار", "طماطم", "طحينة", "ليمون"],
          searches: ["egyptian shrimp rice bowl", "shrimp chickpea rice", "healthy shrimp rice bowl"]
        },
        {
          name: "جمبري بالكزبرة مع أرز مصري",
          dishName: "egyptian coriander shrimp rice",
          missing: ["كزبرة", "ثوم", "ليمون", "فلفل", "زيت زيتون"],
          searches: ["egyptian coriander shrimp rice", "shrimp coriander rice", "garlic coriander shrimp"]
        },
        {
          name: "أرز بحري مصري بالجمبري",
          dishName: "egyptian seafood rice shrimp",
          missing: ["بصل", "صلصة طماطم", "كمون", "شبت", "ليمون"],
          searches: ["egyptian seafood rice shrimp", "shrimp seafood rice", "middle eastern seafood rice"]
        },
        {
          name: "شوربة أرز بالجمبري على الطريقة المصرية",
          dishName: "egyptian shrimp rice soup",
          missing: ["مرق خضار", "جزر", "كرفس", "ليمون", "بقدونس"],
          searches: ["egyptian shrimp rice soup", "shrimp rice soup", "seafood rice soup"]
        },
        {
          name: "جمبري بصوص الطماطم مع الأرز",
          dishName: "egyptian tomato shrimp rice",
          missing: ["صلصة طماطم", "ثوم", "بصل", "فلفل", "كزبرة"],
          searches: ["egyptian tomato shrimp rice", "shrimp tomato rice", "middle eastern shrimp tomato"]
        },
        {
          name: "جمبري بالكمون والليمون مع رز",
          dishName: "cumin lemon shrimp rice",
          missing: ["كمون", "ليمون", "ثوم", "بقدونس", "زيت زيتون"],
          searches: ["cumin lemon shrimp rice", "egyptian lemon shrimp", "shrimp rice cumin lemon"]
        }
      ]
    : [
        {
          name: "Egyptian Shrimp Sayadeya Rice",
          dishName: "shrimp sayadeya rice",
          missing: ["onion", "tomato", "garlic", "cumin", "lemon"],
          searches: ["egyptian shrimp sayadeya rice", "shrimp sayadeya", "seafood sayadeya rice"]
        },
        {
          name: "Alexandrian Garlic Shrimp With Rice",
          dishName: "alexandrian shrimp rice",
          missing: ["garlic", "green pepper", "lemon", "cilantro", "olive oil"],
          searches: ["alexandrian shrimp rice", "egyptian garlic shrimp", "shrimp eskandarani"]
        },
        {
          name: "Egyptian Shrimp Tomato Tagine With Rice",
          dishName: "egyptian shrimp tagine rice",
          missing: ["tomato", "onion", "garlic", "pepper", "parsley"],
          searches: ["egyptian shrimp tagine rice", "shrimp tomato tagine", "egyptian seafood tagine"]
        },
        {
          name: "Grilled Shrimp With Dill Rice",
          dishName: "grilled shrimp dill rice",
          missing: ["dill", "lemon", "garlic", "green salad", "olive oil"],
          searches: ["egyptian grilled shrimp rice", "grilled shrimp dill rice", "shrimp rice plate"]
        },
        {
          name: "Egyptian Shrimp Chickpea Rice Bowl",
          dishName: "egyptian shrimp rice bowl",
          missing: ["chickpeas", "cucumber", "tomato", "tahini", "lemon"],
          searches: ["egyptian shrimp rice bowl", "shrimp chickpea rice", "healthy shrimp rice bowl"]
        },
        {
          name: "Egyptian Coriander Shrimp With Rice",
          dishName: "egyptian coriander shrimp rice",
          missing: ["cilantro", "garlic", "lemon", "pepper", "olive oil"],
          searches: ["egyptian coriander shrimp rice", "shrimp coriander rice", "garlic coriander shrimp"]
        },
        {
          name: "Egyptian Seafood Rice With Shrimp",
          dishName: "egyptian seafood rice shrimp",
          missing: ["onion", "tomato sauce", "cumin", "dill", "lemon"],
          searches: ["egyptian seafood rice shrimp", "shrimp seafood rice", "middle eastern seafood rice"]
        },
        {
          name: "Egyptian Shrimp Rice Soup",
          dishName: "egyptian shrimp rice soup",
          missing: ["vegetable broth", "carrot", "celery", "lemon", "parsley"],
          searches: ["egyptian shrimp rice soup", "shrimp rice soup", "seafood rice soup"]
        },
        {
          name: "Tomato Shrimp With Rice",
          dishName: "egyptian tomato shrimp rice",
          missing: ["tomato sauce", "garlic", "onion", "pepper", "cilantro"],
          searches: ["egyptian tomato shrimp rice", "shrimp tomato rice", "middle eastern shrimp tomato"]
        },
        {
          name: "Cumin Lemon Shrimp With Rice",
          dishName: "cumin lemon shrimp rice",
          missing: ["cumin", "lemon", "garlic", "parsley", "olive oil"],
          searches: ["cumin lemon shrimp rice", "egyptian lemon shrimp", "shrimp rice cumin lemon"]
        }
      ];

  const diversifiedTemplates = diversifySeafoodFallbackTemplates(templates, rice);

  return diversifiedTemplates.slice(0, Math.max(0, count)).map((template, index) => {
    const templateOwned = "ingredients" in template && Array.isArray(template.ingredients) ? template.ingredients : owned;

    return {
    name: template.name,
    cuisine,
    recipe_origin: "similar_ingredients",
    dish_intent: {
      dish_name: template.dishName,
      cuisine: preferredCuisine,
      meal_type: "dinner",
      diet_type: "pescatarian dairy-free",
      cooking_method: "home cooking",
      visual_keywords: template.searches,
      exclude_keywords: ["chicken", "beef", "meat"]
    },
    image_search_index: template.searches[0],
    image_search_indices: template.searches,
    ingredients: templateOwned,
    missing_ingredients: template.missing,
    steps: buildFallbackSteps(wantsArabic, template.name),
    calories: targetCalories + index * 15,
    protein: "28g",
    carbs: "48g",
    fat: "12g",
    fiber: "5g",
    sugar: "5g",
    sodium: "520mg",
    cook_time: wantsArabic ? "35 دقيقة" : "35 mins",
    difficulty: wantsArabic ? "متوسط" : "Medium",
    match_quality: "good",
    preference_hits: wantsArabic
      ? ["يستخدم الجمبري والأرز من مكونات المسح.", "مناسب لنظام بيسكاتاريان وخال من الألبان."]
      : ["Uses the scanned shrimp and rice.", "Fits pescatarian and dairy-free."]
    };
  });
}

function buildIngredientFallbackRecipes(
  context: ScanRecipeGuardContext,
  signals: IngredientSignal[],
  count: number
): Recipe[] {
  if (count <= 0) return [];

  const targetCalories = Math.max(320, Math.round((context.calorieTarget ?? 1650) / 3));
  const preferredCuisine = context.preferredCuisine && context.preferredCuisine !== "Any"
    ? context.preferredCuisine
    : "Mediterranean";
  const seafoodSignals = signals.filter((signal) => signal.kind === "seafood");
  const dairySignals = signals.filter((signal) => signal.kind === "dairy");
  const fruitSignals = signals.filter((signal) => signal.kind === "fruit");
  const proteinSignals = signals.filter((signal) => signal.kind === "protein");
  const starchSignals = signals.filter((signal) => signal.kind === "starch");
  const vegetableSignals = signals.filter((signal) => signal.kind === "vegetable" || signal.kind === "other");
  const primary = proteinSignals[0] ?? starchSignals[0] ?? vegetableSignals[0] ?? signals[0];
  if (!primary) return [];

  const protein = proteinSignals[0]?.display;
  const secondProtein = proteinSignals[1]?.display;
  const starch = starchSignals[0]?.display;
  const secondStarch = starchSignals[1]?.display;
  const vegetables = vegetableSignals.slice(0, 3).map((signal) => signal.display);
  const vegetableOne = vegetables[0] ?? "tomato";
  const vegetableTwo = vegetables[1] ?? "onion";
  const vegetableThree = vegetables[2] ?? "pepper";
  const baseOwned = Array.from(new Set([primary.display, protein, starch, vegetableOne, vegetableTwo].filter(Boolean) as string[]));
  const templates: Recipe[] = [];
  const add = (input: {
    carbs?: string;
    cuisine?: string;
    dishName: string;
    fat?: string;
    ingredients: string[];
    missing: string[];
    name: string;
    protein?: string;
    searches: string[];
    sodium?: string;
  }) => {
    templates.push({
      name: input.name,
      cuisine: input.cuisine ?? preferredCuisine,
      recipe_origin: "similar_ingredients",
      dish_intent: {
        dish_name: input.dishName,
        cuisine: input.cuisine ?? preferredCuisine,
        meal_type: "dinner",
        diet_type: buildFallbackDietLabel(context),
        cooking_method: "home cooking",
        visual_keywords: input.searches,
        exclude_keywords: ["cheese", "cream", "butter", "sausage", "bacon", "deep fried"]
      },
      image_search_index: input.searches[0],
      image_search_indices: input.searches,
      ingredients: Array.from(new Set(input.ingredients.filter(Boolean))),
      missing_ingredients: input.missing.filter((ingredient) => !signals.some((signal) => ingredientMatchesSignal(ingredient, signal))),
      steps: [
        "Prep the scanned ingredients and slice any vegetables into even pieces.",
        "Cook the main ingredient with garlic, herbs, citrus, and a small amount of olive oil.",
        "Add the vegetables or starch and simmer, roast, or toss until the dish is cohesive.",
        "Taste with lemon, herbs, and pepper instead of relying on heavy salt.",
        "Serve warm with a fresh garnish."
      ],
      calories: targetCalories,
      protein: input.protein ?? (protein ? "30g" : "18g"),
      carbs: input.carbs ?? (starch ? "52g" : "34g"),
      fat: input.fat ?? "14g",
      fiber: "6g",
      sugar: "6g",
      sodium: input.sodium ?? "520mg",
      cook_time: "35 mins",
      difficulty: "Easy",
      match_quality: "possible",
      preference_hits: [
        "Uses the scanned ingredients as the center of the card.",
        "Filled from pantry-first templates because the curated catalog did not have enough distinct safe matches."
      ]
    });
  };

  const hasBread = signals.some((signal) => /\b(bread|pita|flatbread|toast|tortilla|baladi)\b/i.test(normalizeText(signal.display)));
  const hasOnion = signals.some((signal) => /\bonions?\b/i.test(normalizeText(signal.display)));
  const proteinDisplays = Array.from(new Set([protein, secondProtein].filter(Boolean) as string[]));
  if (hasBread && hasOnion && proteinDisplays.length) {
    for (const proteinDisplay of proteinDisplays) {
      const titleProtein = toTitleCase(proteinDisplay);
      const leanPrefix = /\b(beef|meat|lamb|steak)\b/i.test(proteinDisplay) ? "Lean " : "";
      add({
        carbs: "38g",
        dishName: `${proteinDisplay} shawarma style flatbread`,
        fat: "13g",
        ingredients: [proteinDisplay, "bread", "onion"],
        missing: ["garlic", "lemon", "cumin", "parsley", "cucumber"],
        name: `${leanPrefix}${titleProtein} Shawarma-Style Flatbread`,
        protein: "34g",
        searches: [`${proteinDisplay} shawarma flatbread`, `${proteinDisplay} onion flatbread`, `${proteinDisplay} shawarma style wrap`],
        sodium: "540mg"
      });
      add({
        carbs: "32g",
        dishName: `${proteinDisplay} grilled onion plate`,
        fat: "12g",
        ingredients: [proteinDisplay, "onion"],
        missing: ["lemon", "garlic", "parsley", "olive oil", "green salad"],
        name: `${leanPrefix}Grilled ${titleProtein} Onion Plate`,
        protein: "36g",
        searches: [`grilled ${proteinDisplay} onion plate`, `${proteinDisplay} grilled onions`, `${proteinDisplay} lemon herb grill`],
        sodium: "500mg"
      });
      add({
        carbs: "42g",
        dishName: `${proteinDisplay} bbq style sliced sandwich`,
        fat: "14g",
        ingredients: [proteinDisplay, "bread", "onion"],
        missing: ["tomato", "lettuce", "vinegar", "paprika", "garlic"],
        name: `${leanPrefix}BBQ-Style Sliced ${titleProtein} Sandwich`,
        protein: "34g",
        searches: [`bbq style sliced ${proteinDisplay} sandwich`, `sliced ${proteinDisplay} onion sandwich`, `${proteinDisplay} flatbread sandwich`],
        sodium: "580mg"
      });
      add({
        carbs: "26g",
        dishName: `${proteinDisplay} smoked paprika slices`,
        fat: "12g",
        ingredients: [proteinDisplay, "onion"],
        missing: ["smoked paprika", "garlic", "lemon", "parsley", "olive oil"],
        name: `${leanPrefix}Smoked-Paprika ${titleProtein} Slices`,
        protein: "36g",
        searches: [`smoked paprika ${proteinDisplay} slices`, `${proteinDisplay} paprika onions`, `sliced ${proteinDisplay} paprika plate`],
        sodium: "500mg"
      });
      add({
        carbs: "30g",
        dishName: `${proteinDisplay} onion stew`,
        fat: "13g",
        ingredients: [proteinDisplay, "onion"],
        missing: ["tomato", "carrot", "garlic", "parsley", "low-sodium broth"],
        name: `${leanPrefix}${titleProtein} Onion Stew`,
        protein: "32g",
        searches: [`${proteinDisplay} onion stew`, `${proteinDisplay} tomato onion stew`, `${proteinDisplay} vegetable stew`],
        sodium: "560mg"
      });
      add({
        carbs: "24g",
        dishName: `${proteinDisplay} vegetable soup`,
        fat: "10g",
        ingredients: [proteinDisplay, "onion"],
        missing: ["carrot", "celery", "tomato", "parsley", "low-sodium broth"],
        name: `${titleProtein} Vegetable Soup`,
        protein: "30g",
        searches: [`${proteinDisplay} vegetable soup`, `${proteinDisplay} onion soup`, `${proteinDisplay} tomato broth soup`],
        sodium: "520mg"
      });
      add({
        carbs: "34g",
        dishName: `${proteinDisplay} baked onion tray`,
        fat: "12g",
        ingredients: [proteinDisplay, "onion", vegetableOne],
        missing: ["garlic", "lemon", "pepper", "parsley", "olive oil"],
        name: `${leanPrefix}Baked ${titleProtein} Onion Tray`,
        protein: "35g",
        searches: [`baked ${proteinDisplay} onion tray`, `${proteinDisplay} onion bake`, `${proteinDisplay} roasted onion tray`],
        sodium: "510mg"
      });
    }
  }

  for (const seafood of seafoodSignals.slice(0, 2).map((signal) => signal.display)) {
    const titleSeafood = toTitleCase(seafood);
    add({
      carbs: "28g",
      dishName: `${seafood} lemon herb grill`,
      fat: "11g",
      ingredients: [seafood, vegetableOne, vegetableTwo],
      missing: ["lemon", "garlic", "parsley", "olive oil"],
      name: `Grilled ${titleSeafood} Lemon Herb Plate`,
      protein: "34g",
      searches: [`grilled ${seafood} lemon herbs`, `${seafood} herb grill`, `${seafood} vegetable plate`],
      sodium: "480mg"
    });
    add({
      carbs: "30g",
      dishName: `${seafood} tomato stew`,
      fat: "10g",
      ingredients: [seafood, vegetableOne, vegetableTwo],
      missing: ["tomato", "garlic", "low-sodium broth", "parsley"],
      name: `${titleSeafood} Tomato Stew`,
      protein: "32g",
      searches: [`${seafood} tomato stew`, `${seafood} vegetable stew`, `${seafood} tomato broth`],
      sodium: "520mg"
    });
    add({
      carbs: "22g",
      dishName: `${seafood} vegetable soup`,
      fat: "8g",
      ingredients: [seafood, vegetableTwo],
      missing: ["carrot", "celery", "tomato", "low-sodium broth", "lemon"],
      name: `${titleSeafood} Vegetable Soup`,
      protein: "30g",
      searches: [`${seafood} vegetable soup`, `${seafood} soup`, `${seafood} broth vegetables`],
      sodium: "500mg"
    });
    add({
      carbs: "34g",
      dishName: `baked ${seafood} tray`,
      fat: "11g",
      ingredients: [seafood, vegetableOne, vegetableTwo],
      missing: ["garlic", "lemon", "pepper", "olive oil"],
      name: `Baked ${titleSeafood} Vegetable Tray`,
      protein: "34g",
      searches: [`baked ${seafood} vegetable tray`, `${seafood} oven tray`, `${seafood} roasted vegetables`],
      sodium: "500mg"
    });
  }

  for (const dairy of dairySignals.slice(0, 2).map((signal) => signal.display)) {
    const titleDairy = toTitleCase(dairy);
    add({
      carbs: "38g",
      dishName: `${dairy} fruit parfait`,
      fat: "7g",
      ingredients: [dairy, ...(fruitSignals[0] ? [fruitSignals[0].display] : [])],
      missing: ["berries", "oats", "chia seeds", "cinnamon"],
      name: `${titleDairy} Fruit Parfait`,
      protein: "20g",
      searches: [`${dairy} fruit parfait`, `${dairy} berries oats`, `${dairy} breakfast bowl`],
      sodium: "180mg"
    });
    add({
      carbs: "34g",
      dishName: `${dairy} smoothie bowl`,
      fat: "6g",
      ingredients: [dairy, ...(fruitSignals[0] ? [fruitSignals[0].display] : [])],
      missing: ["banana", "berries", "oats", "flaxseed"],
      name: `${titleDairy} Smoothie Bowl`,
      protein: "18g",
      searches: [`${dairy} smoothie bowl`, `${dairy} fruit smoothie`, `${dairy} oat smoothie bowl`],
      sodium: "160mg"
    });
    add({
      carbs: "28g",
      dishName: `${dairy} herb sauce plate`,
      fat: "8g",
      ingredients: [dairy, vegetableOne, vegetableTwo],
      missing: ["cucumber", "lemon", "garlic", "fresh herbs"],
      name: `${titleDairy} Herb Sauce Vegetable Plate`,
      protein: "18g",
      searches: [`${dairy} herb sauce vegetables`, `${dairy} cucumber herb plate`, `${dairy} vegetable dip plate`],
      sodium: "260mg"
    });
  }

  for (const vegetable of vegetableSignals.slice(0, 2).map((signal) => signal.display)) {
    const titleVegetable = toTitleCase(vegetable);
    add({
      carbs: "30g",
      dishName: `${vegetable} roasted tray`,
      fat: "10g",
      ingredients: [vegetable, vegetableTwo],
      missing: ["garlic", "lemon", "parsley", "olive oil"],
      name: `Roasted ${titleVegetable} Herb Tray`,
      protein: protein ? "24g" : "12g",
      searches: [`roasted ${vegetable} herb tray`, `${vegetable} roasted vegetables`, `${vegetable} lemon herbs`],
      sodium: "360mg"
    });
    add({
      carbs: "32g",
      dishName: `${vegetable} soup`,
      fat: "7g",
      ingredients: [vegetable, vegetableTwo],
      missing: ["carrot", "celery", "tomato", "low-sodium broth"],
      name: `${titleVegetable} Vegetable Soup`,
      protein: protein ? "22g" : "10g",
      searches: [`${vegetable} vegetable soup`, `${vegetable} soup`, `${vegetable} tomato broth`],
      sodium: "430mg"
    });
    add({
      carbs: "42g",
      dishName: `${vegetable} grain bowl`,
      fat: "11g",
      ingredients: [vegetable, ...(starch ? [starch] : [])],
      missing: ["quinoa", "lemon", "parsley", "tahini"],
      name: `${titleVegetable} Grain Bowl`,
      protein: protein ? "24g" : "13g",
      searches: [`${vegetable} grain bowl`, `${vegetable} quinoa bowl`, `${vegetable} lemon herb bowl`],
      sodium: "420mg"
    });
  }

  for (const fruit of fruitSignals.slice(0, 2).map((signal) => signal.display)) {
    const titleFruit = toTitleCase(fruit);
    add({
      carbs: "42g",
      dishName: `${fruit} oat bowl`,
      fat: "7g",
      ingredients: [fruit],
      missing: ["oats", "cinnamon", "chia seeds", "low-fat yogurt"],
      name: `${titleFruit} Oat Bowl`,
      protein: "16g",
      searches: [`${fruit} oat bowl`, `${fruit} oatmeal`, `${fruit} yogurt oats`],
      sodium: "140mg"
    });
    add({
      carbs: "36g",
      dishName: `${fruit} yogurt plate`,
      fat: "6g",
      ingredients: [fruit],
      missing: ["low-fat yogurt", "berries", "flaxseed", "cinnamon"],
      name: `${titleFruit} Yogurt Plate`,
      protein: "18g",
      searches: [`${fruit} yogurt plate`, `${fruit} yogurt bowl`, `${fruit} fruit yogurt`],
      sodium: "130mg"
    });
    add({
      carbs: "44g",
      dishName: `baked ${fruit} cinnamon`,
      fat: "6g",
      ingredients: [fruit],
      missing: ["oats", "cinnamon", "walnuts", "low-fat yogurt"],
      name: `Baked ${titleFruit} Cinnamon Oats`,
      protein: "14g",
      searches: [`baked ${fruit} cinnamon oats`, `${fruit} baked oats`, `${fruit} breakfast bake`],
      sodium: "150mg"
    });
  }

  for (const grain of starchSignals.slice(0, 2).map((signal) => signal.display)) {
    const titleGrain = toTitleCase(grain);
    add({
      carbs: "50g",
      dishName: `${grain} pilaf`,
      fat: "9g",
      ingredients: [grain, vegetableTwo],
      missing: ["parsley", "lemon", "garlic", "olive oil"],
      name: `${titleGrain} Herb Pilaf`,
      protein: protein ? "24g" : "12g",
      searches: [`${grain} herb pilaf`, `${grain} vegetable pilaf`, `${grain} parsley lemon`],
      sodium: "380mg"
    });
    add({
      carbs: "46g",
      dishName: `${grain} soup`,
      fat: "7g",
      ingredients: [grain, vegetableTwo],
      missing: ["tomato", "carrot", "celery", "low-sodium broth"],
      name: `${titleGrain} Vegetable Soup`,
      protein: protein ? "24g" : "11g",
      searches: [`${grain} vegetable soup`, `${grain} soup`, `${grain} tomato broth`],
      sodium: "430mg"
    });
    add({
      carbs: "52g",
      dishName: `${grain} baked tray`,
      fat: "10g",
      ingredients: [grain, vegetableOne, vegetableTwo],
      missing: ["garlic", "parsley", "olive oil", "lemon"],
      name: `Baked ${titleGrain} Vegetable Tray`,
      protein: protein ? "25g" : "13g",
      searches: [`baked ${grain} vegetable tray`, `${grain} vegetable bake`, `${grain} oven tray`],
      sodium: "420mg"
    });
  }

  if (protein) {
    add({
      dishName: `${protein} tomato herb tray`,
      ingredients: [protein, vegetableOne, vegetableTwo],
      missing: ["garlic", "lemon", "parsley", "olive oil"],
      name: `${toTitleCase(protein)} Tomato Herb Tray`,
      searches: [`${protein} tomato herb tray`, `${protein} tomato bake`, `${protein} vegetable tray`]
    });
    add({
      dishName: `${protein} pepper onion skillet`,
      ingredients: [protein, vegetableTwo, vegetableThree],
      missing: ["garlic", "cumin", "lemon", "fresh herbs"],
      name: `${toTitleCase(protein)} Pepper Onion Skillet`,
      searches: [`${protein} pepper onion skillet`, `${protein} vegetable saute`, `${protein} onion pepper plate`]
    });
    add({
      dishName: `${protein} vegetable stew`,
      ingredients: [protein, ...vegetables.slice(0, 2)],
      missing: ["tomato sauce", "garlic", "carrot", "parsley"],
      name: `${toTitleCase(protein)} Vegetable Stew`,
      searches: [`${protein} vegetable stew`, `${protein} tomato stew`, `${protein} vegetables`]
    });
  }

  if (starch) {
    add({
      dishName: `${starch} vegetable pilaf`,
      ingredients: [starch, vegetableOne, vegetableTwo],
      missing: ["garlic", "parsley", "lemon", "olive oil"],
      name: `${toTitleCase(starch)} Vegetable Pilaf`,
      protein: protein ? "24g" : "14g",
      searches: [`${starch} vegetable pilaf`, `${starch} tomato onion pilaf`, `${starch} herb bowl`]
    });
    add({
      dishName: `${starch} pantry bowl`,
      ingredients: [starch, ...(protein ? [protein] : []), ...vegetables.slice(0, 2)],
      missing: ["cucumber", "lemon", "fresh herbs", "tahini"],
      name: `${toTitleCase(starch)} Pantry Bowl`,
      searches: [`${starch} pantry bowl`, `${starch} vegetable bowl`, `${starch} lemon herb bowl`]
    });
  }

  if (protein && starch) {
    add({
      dishName: `${protein} ${starch} bowl`,
      ingredients: [protein, starch, vegetableOne, vegetableTwo],
      missing: ["garlic", "lemon", "parsley"],
      name: `${toTitleCase(protein)} ${toTitleCase(starch)} Bowl`,
      protein: "32g",
      searches: [`${protein} ${starch} bowl`, `${protein} with ${starch}`, `${protein} vegetable ${starch}`]
    });
  }

  if (secondProtein) {
    add({
      dishName: `${secondProtein} garden plate`,
      ingredients: [secondProtein, ...vegetables.slice(0, 2)],
      missing: ["lemon", "garlic", "parsley", "olive oil"],
      name: `${toTitleCase(secondProtein)} Garden Plate`,
      protein: "30g",
      searches: [`${secondProtein} garden plate`, `${secondProtein} vegetable plate`, `${secondProtein} herb vegetables`]
    });
  }

  if (secondStarch) {
    add({
      dishName: `${secondStarch} tomato vegetable bake`,
      ingredients: [secondStarch, vegetableOne, vegetableTwo],
      missing: ["garlic", "parsley", "olive oil", "lemon"],
      name: `${toTitleCase(secondStarch)} Tomato Vegetable Bake`,
      protein: "16g",
      searches: [`${secondStarch} tomato vegetable bake`, `${secondStarch} vegetable casserole`, `${secondStarch} tomato herbs`]
    });
  }

  add({
    dishName: `${primary.display} lemon herb plate`,
    ingredients: baseOwned,
    missing: ["lemon", "garlic", "parsley", "olive oil"],
    name: `${toTitleCase(primary.display)} Lemon Herb Plate`,
    searches: [`${primary.display} lemon herb plate`, `${primary.display} healthy plate`, `${primary.display} herbs`]
  });

  return dedupeRecipes(templates).slice(0, count);
}

function buildFallbackDietLabel(context: ScanRecipeGuardContext) {
  const labels = [
    ...(context.diets ?? []),
    ...(context.conditions?.includes("cholesterol") || context.conditions?.includes("highBloodPressure") ? ["heart friendly"] : []),
    ...(context.allergens ?? []).map((allergen) => `${allergen} free`)
  ].filter(Boolean);

  return labels.join(", ") || "standard";
}

function diversifySeafoodFallbackTemplates<T extends { dishName: string; missing: string[]; name: string; searches: string[] }>(
  templates: T[],
  rice: string
): Array<T | (T & { ingredients: string[] })> {
  const seafoodVariety = [
    {
      name: "Salmon Rice Plate With Tomato Cucumber",
      dishName: "salmon rice plate",
      ingredients: [rice],
      missing: ["salmon", "cucumber", "tomato", "lemon", "olive oil"],
      searches: ["salmon rice plate", "salmon cucumber tomato rice", "mediterranean salmon rice"]
    },
    {
      name: "Baked Tilapia Rice Tray",
      dishName: "baked tilapia rice tray",
      ingredients: [rice],
      missing: ["tilapia", "tomato", "onion", "garlic", "lemon"],
      searches: ["baked tilapia rice", "tilapia tomato tray", "egyptian baked fish tray"]
    },
    {
      name: "Sayadeya Fish Rice",
      dishName: "sayadeya fish rice",
      ingredients: [rice],
      missing: ["white fish", "onion", "cumin", "lemon", "parsley"],
      searches: ["sayadeya fish rice", "egyptian fish rice", "fish sayadeya"]
    },
    {
      name: "Salmon Chickpea Rice Bowl",
      dishName: "salmon chickpea rice bowl",
      ingredients: [rice],
      missing: ["salmon", "chickpeas", "cucumber", "tomato", "tahini"],
      searches: ["salmon chickpea rice bowl", "salmon rice bowl", "healthy salmon chickpea bowl"]
    }
  ] as Array<T & { ingredients: string[] }>;

  return [...templates.slice(0, 4), ...seafoodVariety, ...templates.slice(4)];
}

function buildFallbackSteps(wantsArabic: boolean, recipeName: string) {
  if (wantsArabic) {
    return [
      "اشطف الأرز ثم اتركه جانباً حتى يصبح جاهزاً للطهي.",
      "شوّح البصل والثوم بزيت الزيتون حتى تظهر الرائحة.",
      "أضف الطماطم أو التوابل المناسبة للوصفة واطبخها حتى تتكثف.",
      "أضف الجمبري واطهه حتى يصبح وردي اللون ومتماسكاً.",
      "قدّم الجمبري فوق الأرز وزينه بالليمون والأعشاب."
    ];
  }

  return [
    `Rinse the rice for ${recipeName} and set it aside.`,
    "Saute onion and garlic in olive oil until fragrant.",
    "Add the tomato or spice base and cook until slightly thickened.",
    "Add shrimp and cook until pink and just firm.",
    "Serve the shrimp over rice with lemon and herbs."
  ];
}

function dedupeRecipes(recipes: Recipe[]) {
  const seen = new Set<string>();
  const deduped: Recipe[] = [];

  for (const recipe of recipes) {
    const key = normalizeText([recipe.name, recipe.dish_intent?.dish_name, recipe.image_search_index].filter(Boolean).join(" "));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(recipe);
  }

  return deduped;
}

function orderDiverseRecipes(recipes: Recipe[]) {
  const remaining = [...recipes];
  const ordered: Recipe[] = [];
  const seenVisual = new Set<string>();
  const seenSeafood = new Set<string>();

  const takePass = (strict: boolean) => {
    for (let index = 0; index < remaining.length;) {
      const recipe = remaining[index];
      const visualKey = getRecipeVisualKey(recipe);
      const seafoodKey = getSeafoodProteinKey(recipe);
      if (
        strict &&
        ((visualKey && seenVisual.has(visualKey)) || (seafoodKey && seenSeafood.has(seafoodKey)))
      ) {
        index += 1;
        continue;
      }

      ordered.push(recipe);
      if (visualKey) seenVisual.add(visualKey);
      if (seafoodKey) seenSeafood.add(seafoodKey);
      remaining.splice(index, 1);
    }
  };

  takePass(true);
  takePass(false);
  return ordered;
}

function getRecipeVisualKey(recipe: Recipe) {
  return normalizeText(recipe.image_search_index || recipe.dish_intent?.dish_name || recipe.name);
}

function getSeafoodProteinKey(recipe: Recipe) {
  const source = [
    recipe.name,
    recipe.dish_intent?.dish_name,
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? [])
  ].join(" ");
  const normalized = normalizeIngredientSignal(source);
  if (/\bsalmon\b/.test(normalized)) return "salmon";
  if (/\b(shrimp|prawn)\b/.test(normalized)) return "shrimp";
  if (/\b(tilapia|cod|white fish|fish|sea bass|tuna)\b/.test(normalized)) return "fish";
  return "";
}

function dedupeByNormalizedIngredient(ingredients: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const ingredient of ingredients) {
    const key = normalizeIngredientSignal(ingredient);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(ingredient);
  }

  return deduped;
}

function ingredientMatchesSignal(ingredient: string, signal: IngredientSignal) {
  const normalized = normalizeIngredientSignal(ingredient);
  if (!normalized) return false;

  return signal.aliases.some((alias) =>
    normalized === alias ||
    (alias.length >= 4 && normalized.includes(alias)) ||
    (normalized.length >= 4 && alias.includes(normalized))
  );
}

function recipeContainsSeafood(recipe: Recipe) {
  return [
    recipe.name,
    recipe.dish_intent?.dish_name,
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    ...(recipe.dish_intent?.visual_keywords ?? []),
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? [])
  ]
    .filter(Boolean)
    .some((value) => getIngredientKind(normalizeIngredientSignal(String(value))) === "seafood");
}

function recipeMatchesPreferredCuisine(recipe: Recipe, preferredCuisine?: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return true;
  const preferred = normalizeCuisineForMatch(preferredCuisine);
  const recipeCuisine = normalizeCuisineForMatch(recipe.cuisine);
  const recipeName = normalizeCuisineForMatch(recipe.name);

  return recipeCuisine === preferred || recipeCuisine.includes(preferred) || recipeName.includes(preferred);
}

function normalizeCuisineForMatch(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "egyptian" || /مصري|مصرى/u.test(value)) return "egyptian";
  if (normalized === "middle eastern" || /شرق اوسط|شرقي|شرقى/u.test(value)) return "middleeastern";
  if (normalized === "mediterranean" || /متوسط/u.test(value)) return "mediterranean";
  if (normalized === "mexican" || /مكسيك/u.test(value)) return "mexican";
  if (normalized === "asian" || /اسيوي|اسيوى/u.test(value)) return "asian";
  return normalized.replace(/\s+/g, "");
}

function getIngredientKind(canonical: string): IngredientSignal["kind"] {
  if (/\b(shrimp|prawn|fish|seafood|salmon|tuna|cod|tilapia|sardine|anchovy|crab|lobster|squid|calamari)\b/.test(canonical)) {
    return "seafood";
  }
  if (/\b(milk|yogurt|yoghurt|labneh|kefir|cottage cheese|ricotta|cheese|feta)\b/.test(canonical)) {
    return "dairy";
  }
  if (/\b(apples?|bananas?|berries|strawberries|blueberries|oranges?|mango|grapes?|peaches|pears?|dates?|figs?|melon|watermelon|pineapple)\b/.test(canonical)) {
    return "fruit";
  }
  if (/\b(chicken|beef|meat|lamb|turkey|tofu|tempeh|beans?|lentils?|chickpeas?)\b/.test(canonical)) {
    return "protein";
  }
  if (/\b(rice|pasta|bread|potato|oats?|quinoa|bulgur|barley|farro|couscous|wheat|corn|noodles?|cereal|grain|grains)\b/.test(canonical)) {
    return "starch";
  }
  if (/\b(onions?|tomato|pepper|carrot|celery|zucchini|eggplant|aubergine|broccoli|cauliflower|spinach|lettuce|cucumber|mushrooms?|peas?|green beans?|cabbage|kale|greens?)\b/.test(canonical)) {
    return "vegetable";
  }
  return "other";
}

function normalizeIngredientSignal(value: string): string {
  const translated = translateIngredientToEnglish(value);
  const normalizedArabic = normalizeArabicIngredient(value);
  const source = normalizedArabic || translated || value;

  return normalizeText(source)
    .replace(/\b prawns\b/g, " shrimp")
    .replace(/\bprawn\b/g, "shrimp")
    .replace(/\bshrimps\b/g, "shrimp")
    .replace(/\bfishes\b/g, "fish")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArabicIngredient(value: string) {
  const normalized = value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

  if (/(^|\s)(ارز|رز)(\s|$)/u.test(normalized)) return "rice";
  if (/(جمبري|جندوفلي|روبيان|قريدس)/u.test(normalized)) return "shrimp";
  if (/(سمك|اسماك|تونه|سلمون|سردين|كاليماري|سبيط)/u.test(normalized)) return "fish";
  return "";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function translateCuisineForFallback(preferredCuisine: string) {
  const normalized = normalizeText(preferredCuisine);
  if (normalized === "egyptian") return "مصري";
  if (normalized === "middle eastern") return "شرق أوسطي";
  if (normalized === "mediterranean") return "متوسطي";
  return preferredCuisine;
}

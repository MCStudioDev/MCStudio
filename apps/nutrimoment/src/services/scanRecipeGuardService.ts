import { expandIngredientFamilies } from "@/lib/ingredientFamilies";
import {
  ensureArabicRecipeLanguage,
  isArabicRecipeLanguage,
  translateIngredientToEnglish
} from "@/lib/arabicRecipeLocalization";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
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
    .filter((recipe) => !findRecipeDietViolation(recipe, dietContext));

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
  const fallbackRecipes =
    requestedSeafood && fallbackCount > 0
      ? buildSeafoodFallbackRecipes(context, fallbackCount, wantsArabic)
      : [];

  let merged = dedupeRecipes(orderDiverseRecipes([
    ...cuisineMatchedRecipes.filter(recipeContainsSeafood),
    ...repaired.filter((recipe) => recipeContainsSeafood(recipe) && !cuisineMatchedRecipes.includes(recipe)),
    ...fallbackRecipes,
    ...cuisineMatchedRecipes.filter((recipe) => !recipeContainsSeafood(recipe)),
    ...repaired.filter((recipe) => !cuisineMatchedRecipes.includes(recipe))
  ]));

  if (requestedSeafood && merged.length < context.recipeCount) {
    merged = dedupeRecipes(orderDiverseRecipes([
      ...merged,
      ...buildSeafoodFallbackRecipes(context, context.recipeCount - merged.length, wantsArabic)
    ]));
  }

  return merged.slice(0, context.recipeCount);
}

interface IngredientSignal {
  aliases: string[];
  display: string;
  kind: "seafood" | "protein" | "starch" | "other";
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
  if (/\b(chicken|beef|meat|lamb|turkey|tofu|tempeh|beans?|lentils?|chickpeas?)\b/.test(canonical)) {
    return "protein";
  }
  if (/\b(rice|pasta|bread|potato|oats?|quinoa|bulgur)\b/.test(canonical)) {
    return "starch";
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

function translateCuisineForFallback(preferredCuisine: string) {
  const normalized = normalizeText(preferredCuisine);
  if (normalized === "egyptian") return "مصري";
  if (normalized === "middle eastern") return "شرق أوسطي";
  if (normalized === "mediterranean") return "متوسطي";
  return preferredCuisine;
}

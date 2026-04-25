import { z } from "zod";
import { buildPlateRecipeMatchVisionPrompt, buildRecipeGenerationPrompt } from "@/lib/aiPrompts";
import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { generateFallbackRecipes } from "@/services/fallbackAiService";
import { searchCatalogRecipes } from "@/services/recipeSearchService";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { scoreCuisineFit } from "@/lib/cuisineScoring";
import { findPexelsRecipePhoto, isPexelsRecipePhotoSearchConfigured } from "@/lib/pexelsRecipePhotoSearch";
import { findUnsplashRecipePhoto, isUnsplashRecipePhotoSearchConfigured } from "@/lib/unsplashRecipePhotoSearch";
import { isArabicRecipeLanguage, localizeRecipeForArabic } from "@/lib/arabicRecipeLocalization";
import { ensureDetailedRecipeSteps } from "@/lib/recipeStepDetails";
import type { Recipe } from "@/lib/types";
import { logger } from "@/lib/logger";

const RECIPE_RESULT_COUNT = 5;

const MOCK_RECIPES = {
  recipes: [
    {
      name: "Classic Garlic Chicken with Tomatoes",
      cuisine: "Italian",
      ingredients: ["chicken", "garlic", "tomato", "olive oil", "basil"],
      missing_ingredients: ["parmesan cheese"],
      steps: [
        "Heat olive oil in a large pan over medium heat",
        "Add minced garlic and saute until fragrant (1 minute)",
        "Add chicken pieces and cook until golden (8-10 minutes)",
        "Add chopped tomatoes and simmer for 15 minutes",
        "Season with salt, pepper, and fresh basil",
        "Serve hot with pasta or rice"
      ],
      calories: 450,
      protein: "38g",
      carbs: "12g",
      fat: "28g",
      cook_time: "30 mins",
      difficulty: "Easy"
    },
    {
      name: "Creamy Garlic Chicken Pasta",
      cuisine: "Italian-American",
      ingredients: ["chicken", "garlic", "tomato", "olive oil", "basil", "onion"],
      missing_ingredients: ["cream", "parmesan"],
      steps: [
        "Cook pasta according to package directions",
        "Pan-fry chicken with garlic and onions",
        "Add crushed tomatoes and simmer",
        "Combine pasta with the sauce",
        "Top with fresh basil",
        "Serve immediately"
      ],
      calories: 520,
      protein: "42g",
      carbs: "45g",
      fat: "15g",
      cook_time: "25 mins",
      difficulty: "Easy"
    },
    {
      name: "Tomato and Basil Chicken Skewers",
      cuisine: "Mediterranean",
      ingredients: ["chicken", "tomato", "basil", "garlic", "olive oil"],
      missing_ingredients: ["bell peppers"],
      steps: [
        "Cut chicken into cubes",
        "Thread onto skewers alternating with tomatoes",
        "Brush with garlic-infused olive oil",
        "Grill for 12-15 minutes, turning occasionally",
        "Season with basil, salt and pepper",
        "Rest for 2 minutes before serving"
      ],
      calories: 380,
      protein: "40g",
      carbs: "8g",
      fat: "22g",
      cook_time: "20 mins",
      difficulty: "Medium"
    }
  ]
};

const requestSchema = z.object({
  ingredients: z.array(z.string()).optional(),
  ingredientQuantities: z.array(z.string()).optional(),
  prompt: z.string().min(20).optional(),
  referenceImage: z.string().min(10).optional(),
  recipeLanguage: z.string().optional(),
  preferredCuisine: z.string().optional(),
  calorieTarget: z.number().optional(),
  maxMissingIngredients: z.number().optional(),
  diets: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional()
}).refine((value) => Boolean(value.ingredients?.length || value.prompt), {
  message: "Provide ingredients or a prompt."
});

export async function POST(request: Request) {
  let accessCheck: Awaited<ReturnType<typeof canUseApiFeature>> | null = null;
  try {
    accessCheck = await canUseApiFeature(request, "recipe_generation");
    const rl = applyRateLimit({
      uid: accessCheck.access.uid,
      feature: "recipe_generation",
      isPremium: accessCheck.access.isPremium,
      bypass: accessCheck.access.isAdmin
    });
    if (!rl.decision.allowed) {
      return rateLimitedResponse(rl.decision, rl.config);
    }
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "No ingredients provided" },
        { status: 400 }
      );
    }

    const ingredients = (parsed.data.ingredients ?? extractIngredientsFromPrompt(parsed.data.prompt ?? ""))
      .map((ingredient) => ingredient.trim())
      .filter(Boolean);
    if (!ingredients.length && !parsed.data.referenceImage) {
      return Response.json(
        { error: "No ingredients or reference image provided" },
        { status: 400 }
      );
    }
    const availableIngredients = await buildAvailableIngredientSet(ingredients);
    const shouldLabelSimilarRecipes = Boolean(parsed.data.referenceImage);
    const wantsArabic = isArabicRecipeLanguage(parsed.data.recipeLanguage);
    const prepareRecipes = (recipes: Recipe[]) =>
      (wantsArabic ? recipes.map(localizeRecipeForArabic) : recipes).map((recipe) =>
        ensureDetailedRecipeSteps(recipe, wantsArabic ? "Arabic" : "English")
      );

    if (USE_MOCK && accessCheck.allowed) {
      const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_generation");
      const exactScanMatch = parsed.data.referenceImage
        ? buildMockExactScanRecipe(availableIngredients)
        : null;
      const strictRecipes = rankStrictRecipes(
        applyStrictIngredientOwnership(MOCK_RECIPES.recipes, availableIngredients),
        { ...parsed.data, ingredients }
      );
      const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length);
      const finalRecipes = prepareRecipes(mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes));
      return Response.json({
        recipes: finalRecipes,
        result: JSON.stringify(finalRecipes),
        servedFrom: "mock",
        access: accessPayload(nextAccess)
      });
    }

    const exactScanMatch = accessCheck.allowed && parsed.data.referenceImage
      ? await buildExactScanMatchRecipe({
          availableIngredients,
          image: parsed.data.referenceImage,
          language: parsed.data.recipeLanguage ?? "English"
        })
      : null;

    const searchResult = await searchCatalogRecipes({
      ingredients,
      preferredCuisine: parsed.data.preferredCuisine,
      calorieTarget: parsed.data.calorieTarget,
      diets: parsed.data.diets,
      conditions: parsed.data.conditions,
      allergens: parsed.data.allergens,
      maxResults: RECIPE_RESULT_COUNT
    });

    if (!accessCheck.allowed) {
      logger.info("Recipe generation served from offline catalog because access is not allowed", {
        reason: accessCheck.reason,
        recipeCount: searchResult.recipes.length
      });
      const strictRecipes = rankStrictRecipes(
        applyStrictIngredientOwnership(searchResult.recipes, availableIngredients),
        { ...parsed.data, ingredients }
      );
      const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length);
      const finalRecipes = prepareRecipes(mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes));
      return Response.json({
        result: JSON.stringify(finalRecipes),
        servedFrom: searchResult.servedFrom,
        canLoadMore: searchResult.canLoadMore,
        fallbackNotice: "Your 5 free AI credits are used. These recipes are from the offline catalog.",
        access: accessPayload(accessCheck.access)
      });
    }

    const nextAccess = await consumeFreeAiCredit(accessCheck.access, "recipe_generation");

    try {
      ensureAiAvailable();
      const prompt = ingredients.length
        ? buildRecipeGenerationPrompt(
            ingredients.map((ingredient, index) => ({
              name: ingredient,
              quantity: readIngredientQuantity(parsed.data.ingredientQuantities?.[index])
            })),
            {
              recipeLanguage: parsed.data.recipeLanguage ?? "English",
              preferredCuisine: parsed.data.preferredCuisine ?? "Any",
              calorieTarget: parsed.data.calorieTarget ?? 2000,
              maxMissingIngredients: parsed.data.maxMissingIngredients ?? 3,
              diets: parsed.data.diets ?? [],
              conditions: parsed.data.conditions ?? [],
              allergens: parsed.data.allergens ?? []
            }
          )
        : parsed.data.prompt ?? "";
      const text = await generateFallbackRecipes(prompt);
      const json = extractJson(text);
      const recipes = JSON.parse(json);
      const normalizedRecipes = recipes.recipes ?? recipes;
      if (Array.isArray(normalizedRecipes) && normalizedRecipes.length) {
        const strictRecipes = rankStrictRecipes(
          applyStrictIngredientOwnership(normalizedRecipes, availableIngredients),
          { ...parsed.data, ingredients }
        ).slice(0, RECIPE_RESULT_COUNT);
        const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length);
        const finalRecipes = prepareRecipes(mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes));
        logger.info("Recipe generation served from Gemini fallback AI", {
          recipeCount: finalRecipes.length,
          hasExactScanMatch: Boolean(exactScanMatch)
        });
        return Response.json({
          ...recipes,
          recipes: finalRecipes,
          servedFrom: "fallback_ai",
          result: JSON.stringify(finalRecipes),
          access: accessPayload(nextAccess)
        });
      }
    } catch (aiError) {
      logger.error("AI recipe generation failed; using offline catalog fallback", aiError);
    }

    logger.info("Recipe generation served from offline catalog after AI failure", {
      recipeCount: searchResult.recipes.length,
      canLoadMore: searchResult.canLoadMore
    });
    const strictRecipes = rankStrictRecipes(
      applyStrictIngredientOwnership(searchResult.recipes, availableIngredients),
      { ...parsed.data, ingredients }
    );
    const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length);
    const finalRecipes = prepareRecipes(mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes));
    return Response.json({
      result: JSON.stringify(finalRecipes),
      servedFrom: "offline_catalog",
      canLoadMore: searchResult.canLoadMore,
      fallbackNotice: "AI recipe generation was unavailable, so we used offline catalog matches.",
      access: accessPayload(nextAccess)
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Admin") || error.message.includes("Premium") || error.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(error);
    }
    logger.error("Error generating recipes", error);
    const message = error instanceof Error ? error.message : "Failed to generate recipes";
    return Response.json(
      { error: message },
      { status: message.includes("GEMINI_API_KEY") ? 503 : 500 }
    );
  }
}

function extractIngredientsFromPrompt(prompt: string): string[] {
  const exact = prompt.match(/ingredients:\s*(.+?)\./i);
  if (exact?.[1]) {
    return exact[1].split(",").map((item) => item.trim()).filter(Boolean);
  }

  const broad = prompt.match(/using these ingredients:\s*(.+?)\./i);
  if (broad?.[1]) {
    return broad[1].split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function readIngredientQuantity(value?: string) {
  if (!value) return undefined;
  const [, quantity] = value.split(/\s+-\s+/, 2);
  return quantity?.trim() || undefined;
}

async function buildExactScanMatchRecipe(input: {
  availableIngredients: Set<string>;
  image: string;
  language: string;
}) {
  try {
    ensureAiAvailable();
    const text = await callOpenAIVision(buildPlateRecipeMatchVisionPrompt(input.language), input.image);
    const json = extractJson(text);
    const parsed = JSON.parse(json) as { isPlatedDish?: boolean; recipe?: unknown };

    if (!parsed?.isPlatedDish || !parsed.recipe) {
      return null;
    }

    const exactRecipe = normalizeScannedDishRecipe(parsed.recipe, input.availableIngredients);
    return exactRecipe?.name ? exactRecipe : null;
  } catch (error) {
    logger.warn("Exact scan-match generation failed; continuing with similar-ingredient recipes only", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function buildMockExactScanRecipe(availableIngredients: Set<string>) {
  const [firstRecipe] = applyStrictIngredientOwnership([MOCK_RECIPES.recipes[0]], availableIngredients);
  if (!firstRecipe) return null;

  return {
    ...firstRecipe,
    recipe_origin: "exact_scan_match" as const,
    scan_match_explanation: "Recreated from the plated dish structure in the scan.",
    match_quality: "great" as const,
    preference_hits: Array.isArray(firstRecipe.preference_hits) ? firstRecipe.preference_hits : []
  };
}

function normalizeScannedDishRecipe(recipe: unknown, availableIngredients: Set<string>) {
  const baseRecipe = (recipe ?? {}) as Partial<Recipe>;
  const normalizedName = typeof baseRecipe.name === "string" ? baseRecipe.name.trim() : "";
  if (!normalizedName) return null;

  const coercedRecipe: Recipe = {
    name: normalizedName,
    cuisine: typeof baseRecipe.cuisine === "string" && baseRecipe.cuisine.trim() ? baseRecipe.cuisine.trim() : "Unknown",
    recipe_origin: "exact_scan_match",
    scan_match_explanation:
      typeof baseRecipe.scan_match_explanation === "string" && baseRecipe.scan_match_explanation.trim()
        ? baseRecipe.scan_match_explanation.trim()
        : "Likely recreation of the plated dish from the scan.",
    image_search_index: typeof baseRecipe.image_search_index === "string" ? baseRecipe.image_search_index.trim() : undefined,
    image_search_indices: Array.isArray(baseRecipe.image_search_indices)
      ? baseRecipe.image_search_indices.filter((value): value is string => typeof value === "string" && value.trim().length >= 3)
      : undefined,
    ingredients: Array.isArray(baseRecipe.ingredients)
      ? baseRecipe.ingredients.filter((value): value is string => typeof value === "string")
      : [],
    missing_ingredients: Array.isArray(baseRecipe.missing_ingredients)
      ? baseRecipe.missing_ingredients.filter((value): value is string => typeof value === "string")
      : [],
    steps: Array.isArray(baseRecipe.steps)
      ? baseRecipe.steps.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [],
    calories: typeof baseRecipe.calories === "number" ? baseRecipe.calories : 0,
    protein: typeof baseRecipe.protein === "string" ? baseRecipe.protein : "0g",
    carbs: typeof baseRecipe.carbs === "string" ? baseRecipe.carbs : "0g",
    fat: typeof baseRecipe.fat === "string" ? baseRecipe.fat : "0g",
    fiber: typeof baseRecipe.fiber === "string" ? baseRecipe.fiber : undefined,
    sugar: typeof baseRecipe.sugar === "string" ? baseRecipe.sugar : undefined,
    sodium: typeof baseRecipe.sodium === "string" ? baseRecipe.sodium : undefined,
    cook_time: typeof baseRecipe.cook_time === "string" && baseRecipe.cook_time.trim() ? baseRecipe.cook_time : "30 mins",
    difficulty: typeof baseRecipe.difficulty === "string" && baseRecipe.difficulty.trim() ? baseRecipe.difficulty : "Medium",
    match_quality:
      baseRecipe.match_quality === "great" || baseRecipe.match_quality === "good" || baseRecipe.match_quality === "possible"
        ? baseRecipe.match_quality
        : "good",
    preference_hits: Array.isArray(baseRecipe.preference_hits)
      ? baseRecipe.preference_hits.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : []
  };

  const [strictRecipe] = applyStrictIngredientOwnership([coercedRecipe], availableIngredients);
  if (!strictRecipe) return null;

  const imageSearchIndices = buildRecipePhotoQueryCandidates({
    cuisine: strictRecipe.cuisine,
    imageSearchIndex: strictRecipe.image_search_index,
    imageSearchIndices: strictRecipe.image_search_indices,
    ingredients: strictRecipe.ingredients,
    missingIngredients: strictRecipe.missing_ingredients,
    name: strictRecipe.name
  });

  return {
    ...strictRecipe,
    recipe_origin: "exact_scan_match" as const,
    image_search_index: imageSearchIndices[0],
    image_search_indices: imageSearchIndices.length ? imageSearchIndices : undefined,
    preference_hits: strictRecipe.preference_hits ?? []
  };
}

function mergeRecipeResults(exactRecipe: Recipe | null, similarRecipes: Recipe[], markSimilarOrigins: boolean) {
  const merged: Recipe[] = [];
  const seen = new Set<string>();

  const pushRecipe = (recipe: Recipe, fallbackOrigin?: Recipe["recipe_origin"]) => {
    const key = recipe.id ?? recipe.name.trim().toLowerCase();
    if (!key || seen.has(key) || merged.length >= RECIPE_RESULT_COUNT) return;
    seen.add(key);
    merged.push({
      ...recipe,
      recipe_origin: recipe.recipe_origin ?? fallbackOrigin
    });
  };

  if (exactRecipe) {
    pushRecipe(exactRecipe, "exact_scan_match");
  }

  for (const recipe of similarRecipes) {
    pushRecipe(recipe, markSimilarOrigins ? "similar_ingredients" : undefined);
  }

  return merged;
}

async function buildAvailableIngredientSet(inputIngredients: string[]) {
  const normalized = await normalizeIngredients(inputIngredients);
  return new Set(
    [...inputIngredients, ...normalized.normalized]
      .map(normalizeIngredientForStrictMatch)
      .filter(Boolean)
  );
}

function applyStrictIngredientOwnership(inputRecipes: unknown[], availableIngredients: Set<string>): Recipe[] {
  return inputRecipes.map((recipe) => {
    const baseRecipe = recipe as Recipe & {
      photo_query?: string;
      photo_queries?: string[];
      search_index?: string;
      search_indices?: string[];
    };
    const allRecipeIngredients = dedupeIngredients([
      ...(Array.isArray(baseRecipe.ingredients) ? baseRecipe.ingredients : []),
      ...(Array.isArray(baseRecipe.missing_ingredients) ? baseRecipe.missing_ingredients : [])
    ]);

    const owned: string[] = [];
    const missing: string[] = [];

    for (const ingredient of allRecipeIngredients) {
      const label = getRecipeIngredientLabel(ingredient);
      if (isIngredientAvailable(label, availableIngredients)) {
        owned.push(label);
      } else {
        missing.push(label);
      }
    }

    const imageSearchIndices = buildRecipePhotoQueryCandidates({
      cuisine: typeof baseRecipe.cuisine === "string" ? baseRecipe.cuisine : "",
      imageSearchIndex:
        typeof baseRecipe.image_search_index === "string"
          ? baseRecipe.image_search_index
          : typeof baseRecipe.photo_query === "string"
            ? baseRecipe.photo_query
            : typeof baseRecipe.search_index === "string"
              ? baseRecipe.search_index
              : undefined,
      imageSearchIndices: normalizeImageSearchIndices([
        baseRecipe.image_search_indices,
        baseRecipe.photo_queries,
        baseRecipe.search_indices
      ]),
      ingredients: owned,
      missingIngredients: missing,
      name: typeof baseRecipe.name === "string" ? baseRecipe.name : "recipe"
    });

    return {
      ...baseRecipe,
      image_search_index: imageSearchIndices[0],
      image_search_indices: imageSearchIndices.length ? imageSearchIndices : undefined,
      ingredients: owned,
      missing_ingredients: missing
    };
  });
}

function normalizeImageSearchIndices(values: unknown[]) {
  const indices = values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }

    if (typeof value === "string") {
      return [value];
    }

    return [];
  });

  return Array.from(
    new Set(
      indices
        .map((value) => value.trim())
        .filter((value) => value.length >= 3)
    )
  ).slice(0, 5);
}

function rankStrictRecipes(
  recipes: Recipe[],
  options: {
    ingredients?: string[];
    preferredCuisine?: string;
    calorieTarget?: number;
    maxMissingIngredients?: number;
    diets?: string[];
    conditions?: string[];
  }
) {
  const targetCaloriesPerMeal = Math.round((options.calorieTarget ?? 2000) / 3);
  const preferredCuisine = options.preferredCuisine && options.preferredCuisine !== "Any"
    ? options.preferredCuisine.toLowerCase()
    : "";

  return recipes
    .map((recipe, index) => ({
      recipe,
      index,
      score: scoreStrictRecipe(recipe, {
        targetCaloriesPerMeal,
        preferredCuisine,
        maxMissingIngredients: options.maxMissingIngredients ?? 3,
        hasPreferences: Boolean(options.diets?.length || options.conditions?.length),
        availableIngredients: options.ingredients ?? []
      })
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ recipe }) => recipe)
    .slice(0, RECIPE_RESULT_COUNT);
}

function scoreStrictRecipe(
  recipe: Recipe,
  options: {
    targetCaloriesPerMeal: number;
    preferredCuisine: string;
    maxMissingIngredients: number;
    hasPreferences: boolean;
    availableIngredients: string[];
  }
) {
  const ownedCount = recipe.ingredients.length;
  const missingCount = recipe.missing_ingredients.length;
  const preferenceHitCount = recipe.preference_hits?.length ?? 0;
  const cuisineMatch =
    options.preferredCuisine && recipe.cuisine.toLowerCase().includes(options.preferredCuisine)
      ? 1
      : 0;
  const calorieDistance = Number.isFinite(recipe.calories)
    ? Math.abs(recipe.calories - options.targetCaloriesPerMeal)
    : options.targetCaloriesPerMeal;
  const calorieScore = Math.max(0, 8 - calorieDistance / 50);
  const maxMissingBonus = missingCount <= options.maxMissingIngredients ? 4 : -4;
  const matchQualityScore = getMatchQualityScore(recipe.match_quality);
  const cuisineFit = scoreCuisineFit({
    preferredCuisine: options.preferredCuisine,
    recipeCuisine: recipe.cuisine,
    recipeName: recipe.name,
    availableIngredients: options.availableIngredients,
    recipeIngredients: recipe.ingredients,
    missingIngredients: recipe.missing_ingredients
  });

  return (
    ownedCount * 20 -
    missingCount * 8 +
    preferenceHitCount * (options.hasPreferences ? 7 : 3) +
    cuisineMatch * 5 +
    cuisineFit.score +
    calorieScore +
    maxMissingBonus +
    matchQualityScore
  );
}

function getMatchQualityScore(matchQuality: Recipe["match_quality"]) {
  switch (matchQuality) {
    case "great":
      return 8;
    case "good":
      return 5;
    case "possible":
      return 2;
    case "stretch":
      return -3;
    default:
      return 0;
  }
}

function dedupeIngredients(ingredients: unknown[]) {
  const seen = new Set<string>();
  const deduped: unknown[] = [];

  for (const ingredient of ingredients) {
    const key = normalizeIngredientForStrictMatch(getRecipeIngredientLabel(ingredient));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(ingredient);
  }

  return deduped;
}

function getRecipeIngredientLabel(ingredient: unknown) {
  if (typeof ingredient === "string") return ingredient;

  if (ingredient && typeof ingredient === "object") {
    const maybeIngredient = ingredient as { name?: unknown; quantity?: unknown };
    const name = typeof maybeIngredient.name === "string" ? maybeIngredient.name : "";
    const quantity = typeof maybeIngredient.quantity === "string" ? maybeIngredient.quantity : "";

    return [name, quantity].filter(Boolean).join(" - ") || JSON.stringify(ingredient);
  }

  return String(ingredient);
}

function isIngredientAvailable(ingredient: string, availableIngredients: Set<string>) {
  const normalizedIngredient = normalizeIngredientForStrictMatch(ingredient);
  if (!normalizedIngredient) return false;
  if (availableIngredients.has(normalizedIngredient)) return true;

  for (const available of availableIngredients) {
    if (isSafeIngredientSubsetMatch(normalizedIngredient, available)) return true;
  }

  return false;
}

function isSafeIngredientSubsetMatch(recipeIngredient: string, availableIngredient: string) {
  return (
    (recipeIngredient.length >= 4 && availableIngredient.includes(recipeIngredient)) ||
    (availableIngredient.length >= 4 && recipeIngredient.includes(availableIngredient))
  );
}

function normalizeIngredientForStrictMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+-\s+.*$/, "")
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\b(cup|cups|tbsp|tsp|g|gram|grams|kg|lb|oz|can|cans|large|small|medium|whole|clove|cloves|fresh|cooked|dry|rinsed|drained|chopped|diced|sliced|pressed|crumbled|optional)\b/g, " ")
    .replace(/\b(canned|white|brown|green|red|yellow|firm|low sodium|no salt added|any color)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\bbeans\b/g, "bean")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\s+/g, " ")
    .trim();
}

async function applyImageFirstRecipeRanking(recipes: Recipe[], availableIngredientCount = 0) {
  const scoredRecipes = await Promise.all(
    recipes.map(async (recipe, index) => {
      const resolvedPhoto = await resolveRecipePhotoCandidate(recipe);
      const sparsePantryBonus = availableIngredientCount > 0 && availableIngredientCount <= 2 ? 1.35 : 1;
      const weightedPhotoFitScore = resolvedPhoto.photoFitScore * sparsePantryBonus;

      return {
        index,
        photoFitScore: weightedPhotoFitScore,
        rawPhotoFitScore: resolvedPhoto.photoFitScore,
        recipe: {
          ...recipe,
          ...(resolvedPhoto.recipePatch ?? {})
        }
      };
    })
  );

  const sortedRecipes = scoredRecipes
    .sort((left, right) => right.photoFitScore - left.photoFitScore || left.index - right.index)
    .map(({ rawPhotoFitScore, recipe }, index, all) => ({
      recipe: {
        ...recipe,
        visual_match_label: getVisualMatchLabel(rawPhotoFitScore, index, all[0]?.rawPhotoFitScore ?? 0)
      },
      rawPhotoFitScore
    }));

  return sortedRecipes.map(({ recipe }) => recipe);
}

async function resolveRecipePhotoCandidate(recipe: Recipe) {
  if (recipe.image_url) {
    return {
      photoFitScore: 100,
      recipePatch: null as Partial<Recipe> | null
    };
  }

  const queries = buildRecipePhotoQueriesForRanking(recipe);
  let bestScore = 0;
  let recipePatch: Partial<Recipe> | null = null;

  for (const query of queries) {
    if (isUnsplashRecipePhotoSearchConfigured()) {
      const unsplash = await findUnsplashRecipePhoto(query);
      if (unsplash) {
        const score = unsplash.score + 2;
        if (score > bestScore) {
          bestScore = score;
          recipePatch = {
            image_attribution_name: unsplash.attributionName,
            image_attribution_url: unsplash.attributionUrl,
            image_source: "unsplash",
            image_url: unsplash.imageUrl
          };
        }
      }
    }

    if (bestScore < 1 && isPexelsRecipePhotoSearchConfigured()) {
      const pexels = await findPexelsRecipePhoto(query);
      if (pexels) {
        if (pexels.score > bestScore) {
          bestScore = pexels.score;
          recipePatch = {
            image_source: "search",
            image_url: pexels.imageUrl
          };
        }
      }
    }
  }

  return { photoFitScore: bestScore, recipePatch };
}

function buildRecipePhotoQueriesForRanking(recipe: Recipe) {
  return buildRecipePhotoQueryCandidates({
    cuisine: recipe.cuisine,
    imageSearchIndex: recipe.image_search_index,
    imageSearchIndices: recipe.image_search_indices,
    ingredients: recipe.ingredients,
    missingIngredients: recipe.missing_ingredients,
    name: recipe.name
  }).slice(0, 3);
}

function getVisualMatchLabel(score: number, index: number, topScore: number) {
  if (score <= 0) return undefined;
  if (index === 0 && topScore >= 8) return "Best visual match";
  if (index === 0 && topScore >= 5) return "Top image match";
  if (index > 0 && score >= 8 && score >= topScore - 1) return "Strong visual match";
  return undefined;
}

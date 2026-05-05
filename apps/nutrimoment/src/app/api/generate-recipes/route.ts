import { z } from "zod";
import {
  buildPlateRecipeMatchVisionPrompt,
  buildPromptOnlyRecipeGenerationPrompt,
  buildRecipeGenerationPrompt
} from "@/lib/aiPrompts";
import {
  getClientFacingAiErrorMessage,
  isTransientModelError,
  USE_MOCK,
  callOpenAIVision,
  ensureAiAvailable,
  extractJson
} from "@/lib/openai";
import {
  isFirebaseTransientError,
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { generateFallbackRecipes } from "@/services/fallbackAiService";
import { searchCatalogRecipes } from "@/services/recipeSearchService";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import {
  buildRecipeDishFamilyKey,
  buildRecipeStructureSignature,
  expandIngredientFamilies,
  isPastaLikeIngredient
} from "@/lib/ingredientFamilies";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import { scoreCuisineFit } from "@/lib/cuisineScoring";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import {
  buildCuisineAwareDishCandidates,
  buildDishCandidatePromptSummary,
  enrichRecipeWithDishIntent
} from "@/lib/recipeDishIntelligence";
import { findPexelsRecipePhoto, isPexelsRecipePhotoSearchConfigured } from "@/lib/pexelsRecipePhotoSearch";
import { findUnsplashRecipePhoto, isUnsplashRecipePhotoSearchConfigured } from "@/lib/unsplashRecipePhotoSearch";
import { findFreeRecipePhoto } from "@/lib/freeRecipePhotos";
import { ensureArabicRecipeLanguage, isArabicRecipeLanguage } from "@/lib/arabicRecipeLocalization";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { ensureDetailedRecipeSteps } from "@/lib/recipeStepDetails";
import type { Recipe } from "@/lib/types";
import { logger } from "@/lib/logger";

const DEFAULT_RECIPE_RESULT_COUNT = 5;
const MIN_RECIPE_RESULT_COUNT = 1;
const MAX_SHARED_POOL_RECIPE_RESULT_COUNT = 10;
const AWAIT_SHARED_POOL_CACHE_PERSISTENCE =
  process.env.DISABLE_USER_RECIPE_CACHE === "true" &&
  process.env.DISABLE_SHARED_RECIPE_POOL !== "true";
const MIN_ACCEPTED_PROVIDER_SCORE = {
  wikimedia: 12,
  pexels_search: 11,
  unsplash_search: 11
} as const;
const WIKIMEDIA_FAMILY_ALLOWLIST = new Set([
  "cilbir",
  "shakshuka",
  "mujadara",
  "koshary",
  "besara",
  "balila",
  "fasolia",
  "loubia-bzeit",
  "kafta"
]);

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
  recipeCount: z.number().optional(),
  uiLanguage: z.string().optional(),
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
  const requestId = crypto.randomUUID();
  let accessCheck: Awaited<ReturnType<typeof canUseApiFeature>> | null = null;
  logger.info("Recipe generation HTTP request received", { requestId });
  try {
    accessCheck = await canUseApiFeature(request, "recipe_generation");
    const requestAccess = accessCheck.access;
    const rl = applyRateLimit({
      uid: requestAccess.uid,
      feature: "recipe_generation",
      isPremium: requestAccess.isPremium,
      bypass: requestAccess.isAdmin
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
    const recipeLanguage = recipeLanguageFromUiLanguage(normalizePilotLanguage(parsed.data.uiLanguage, "en"));
    const recipeCount = clampRecipeCount(parsed.data.recipeCount, MAX_SHARED_POOL_RECIPE_RESULT_COUNT);
    if (!ingredients.length && !parsed.data.referenceImage) {
      return Response.json(
        { error: "No ingredients or reference image provided" },
        { status: 400 }
      );
    }
    const ingredientNormalization = await normalizeIngredients(ingredients);
    const normalizedPromptIngredients = ingredientNormalization.resolved.length
      ? ingredientNormalization.resolved
      : ingredients.map((ingredient) => ({
          raw: ingredient,
          normalized: ingredient
        }));
    const normalizedIngredientNames = ingredientNormalization.normalized.length
      ? ingredientNormalization.normalized
      : normalizedPromptIngredients.map((item) => item.normalized);
    const expandedNormalizedIngredientNames = expandIngredientFamilies(normalizedIngredientNames);
    const scoringIngredients = Array.from(new Set([...ingredients, ...expandedNormalizedIngredientNames]));
    const availableIngredients = buildAvailableIngredientSet(ingredients, expandedNormalizedIngredientNames);
    const aiTraceSummary = {
      requestId,
      hadReferenceImage: Boolean(parsed.data.referenceImage),
      repairPassTriggered: false,
      textCallsRequested: 0,
      visionCallsRequested: 0
    };
    const traceTextCall = (phase: string) => {
      aiTraceSummary.textCallsRequested += 1;
      return {
        requestId,
        feature: "recipe_generation",
        phase
      } as const;
    };
    const traceVisionCall = (phase: string) => {
      aiTraceSummary.visionCallsRequested += 1;
      return {
        requestId,
        feature: "recipe_generation",
        phase
      } as const;
    };
    logger.info("Recipe generation request started", {
      requestId,
      ingredientCount: ingredients.length,
      recipeCountRequested: recipeCount,
      hasReferenceImage: aiTraceSummary.hadReferenceImage,
      preferredCuisine: parsed.data.preferredCuisine ?? "Any"
    });
    const candidateDishes = buildCuisineAwareDishCandidates({
      availableIngredients: expandedNormalizedIngredientNames,
      allergens: parsed.data.allergens,
      calorieTarget: parsed.data.calorieTarget,
      conditions: parsed.data.conditions,
      diets: parsed.data.diets,
      preferredCuisine: parsed.data.preferredCuisine
    });
    const candidateDishHints = buildDishCandidatePromptSummary(candidateDishes);
    const requestRestriction = buildHardRequestRestrictionContext(candidateDishes, parsed.data.preferredCuisine);
    const shouldLabelSimilarRecipes = Boolean(parsed.data.referenceImage);
    const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
    const prepareRecipes = (recipes: Recipe[]) =>
      (wantsArabic ? recipes.map(ensureArabicRecipeLanguage) : recipes).map((recipe) =>
        ensureDetailedRecipeSteps(recipe, wantsArabic ? "Arabic" : "English")
      );
    const finalizeRecipes = (recipes: Recipe[]) =>
      prepareRecipes(
        enforceDistinctRecipeVariety(
          enforceHardRequestRecipes(
            parsed.data.preferredCuisine === "Any"
            ? diversifyAnyCuisineRecipes(recipes, recipeCount, scoringIngredients)
            : enforcePreferredCuisineRecipes(
                recipes,
                parsed.data.preferredCuisine,
                parsed.data.referenceImage ? "preserve_exact_scan_match" : "strict",
                recipeCount
              ),
            requestRestriction,
            recipeCount
          ),
          recipeCount
        )
      );
    const deliverRecipes = (recipes: Recipe[]) =>
      requestAccess.isPremium ? stripPremiumDeliveredImages(recipes) : recipes;

    if (USE_MOCK && accessCheck.allowed) {
      const nextAccess = await consumeFreeAiCredit(requestAccess, "recipe_generation");
      const exactScanMatch = parsed.data.referenceImage
        ? buildMockExactScanRecipe(availableIngredients)
        : null;
      const strictRecipes = rankStrictRecipes(
        applyStrictIngredientOwnership(MOCK_RECIPES.recipes, availableIngredients, {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens
        }),
        { ...parsed.data, ingredients: scoringIngredients, recipeCount }
      );
      const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
        allowProviderLookup: !requestAccess.isPremium
      });
      const finalRecipes = deliverRecipes(finalizeRecipes(
        mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
      ));
      await queueRecipeCachePersist({
        uid: requestAccess.uid,
        recipeLanguage,
        recipes: finalRecipes
      });
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
          language: recipeLanguage,
          trace: traceVisionCall("exact_scan_match")
        })
      : null;

    const searchResult = await searchCatalogRecipes({
      ingredients,
      preferredCuisine: parsed.data.preferredCuisine,
      calorieTarget: parsed.data.calorieTarget,
      diets: parsed.data.diets,
      conditions: parsed.data.conditions,
      allergens: parsed.data.allergens,
      maxResults: recipeCount,
      recipeLanguage,
      uid: requestAccess.uid
    });

    if (!accessCheck.allowed) {
      logger.info("Recipe generation served from shared recipe pool because access is not allowed", {
        reason: accessCheck.reason,
        recipeCount: searchResult.recipes.length
      });
      const strictRecipes = rankStrictRecipes(
        applyStrictIngredientOwnership(searchResult.recipes, availableIngredients, {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens
        }),
        { ...parsed.data, ingredients: scoringIngredients, recipeCount }
      );
      const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
        allowProviderLookup: !requestAccess.isPremium
      });
      const finalRecipes = deliverRecipes(finalizeRecipes(
        mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
      ));
      await queueRecipeCachePersist({
        uid: requestAccess.uid,
        recipeLanguage,
        recipes: finalRecipes
      });
      logger.info("Recipe generation request completed", {
        ...aiTraceSummary,
        servedFrom: searchResult.servedFrom,
        recipeCountReturned: finalRecipes.length
      });
      return Response.json({
        result: JSON.stringify(finalRecipes),
        servedFrom: searchResult.servedFrom,
        canLoadMore: searchResult.canLoadMore,
        fallbackNotice: buildRecipeFallbackNotice("credits_used_shared_pool", recipeLanguage),
        access: accessPayload(requestAccess)
      });
    }

    const nextAccess = await consumeFreeAiCredit(requestAccess, "recipe_generation");
    let offlineFallbackKind: "ai_unavailable_shared_pool" | "ai_busy_shared_pool" = "ai_unavailable_shared_pool";

    try {
      ensureAiAvailable();
      const prompt = ingredients.length
        ? buildRecipeGenerationPrompt(
            normalizedPromptIngredients.map((ingredient, index) => ({
              name: ingredient.normalized,
              quantity: readIngredientQuantity(parsed.data.ingredientQuantities?.[index])
            })),
            {
              recipeLanguage,
              preferredCuisine: parsed.data.preferredCuisine ?? "Any",
              calorieTarget: parsed.data.calorieTarget ?? 2000,
              maxMissingIngredients: parsed.data.maxMissingIngredients ?? 3,
              recipeCount,
              diets: parsed.data.diets ?? [],
              conditions: parsed.data.conditions ?? [],
              allergens: parsed.data.allergens ?? [],
              candidateDishHints
            }
          )
        : buildPromptOnlyRecipeGenerationPrompt(parsed.data.prompt ?? "", recipeLanguage, recipeCount);
      const text = await generateFallbackRecipes(prompt, traceTextCall("primary_generation"));
      const recipes = parseAiJsonPayload(text, "recipe_generation");
      const normalizedRecipes = recipes.recipes ?? recipes;
      if (Array.isArray(normalizedRecipes) && normalizedRecipes.length) {
        let strictRecipes = rankStrictRecipes(
          applyStrictIngredientOwnership(normalizedRecipes, availableIngredients, {
            preferredCuisine: parsed.data.preferredCuisine,
            diets: parsed.data.diets,
            conditions: parsed.data.conditions,
            allergens: parsed.data.allergens
          }),
          { ...parsed.data, ingredients: scoringIngredients, recipeCount }
        ).slice(0, recipeCount);

        const hasPantryBalancedRecipe = strictRecipes.some((recipe) => isPantryBalancedRecipe(recipe));
        const shouldRunRepairPass =
          ingredients.length >= 3 &&
          strictRecipes.length < recipeCount &&
          !hasPantryBalancedRecipe;

        if (shouldRunRepairPass) {
          aiTraceSummary.repairPassTriggered = true;
          const repairRecipeCount = Math.min(
            recipeCount,
            Math.max(1, Math.min(5, normalizedIngredientNames.length || ingredients.length || 1))
          );
          logger.info("Retrying scanner recipe generation with strict pantry-balance repair prompt", {
            ingredientCount: ingredients.length,
            recipeCount,
            repairRecipeCount
          });

          const retryText = await generateFallbackRecipes(
            buildScannerPantryBalanceRetryPrompt(prompt, repairRecipeCount),
            traceTextCall("repair_generation")
          );
          const retryRecipes = parseAiJsonPayload(retryText, "recipe_generation");
          const retryNormalizedRecipes = retryRecipes.recipes ?? retryRecipes;

          if (Array.isArray(retryNormalizedRecipes) && retryNormalizedRecipes.length) {
            const repairRecipes = rankStrictRecipes(
              applyStrictIngredientOwnership(retryNormalizedRecipes, availableIngredients, {
                preferredCuisine: parsed.data.preferredCuisine,
                diets: parsed.data.diets,
                conditions: parsed.data.conditions,
                allergens: parsed.data.allergens
              }),
              { ...parsed.data, ingredients: scoringIngredients, recipeCount }
            ).slice(0, recipeCount);
            strictRecipes = mergeRecipeResults(null, [...repairRecipes, ...strictRecipes], false, recipeCount);
          }
        }
        const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
          allowProviderLookup: !requestAccess.isPremium
        });
        const finalRecipes = deliverRecipes(finalizeRecipes(
          mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
        ));
        await queueRecipeCachePersist({
          uid: requestAccess.uid,
          recipeLanguage,
          recipes: finalRecipes
        });
        logger.info("Recipe generation served from Gemini fallback AI", {
          recipeCount: finalRecipes.length,
          hasExactScanMatch: Boolean(exactScanMatch)
        });
        const responsePayload =
          recipes && typeof recipes === "object" && !Array.isArray(recipes) ? recipes : {};
        logger.info("Recipe generation request completed", {
          ...aiTraceSummary,
          servedFrom: "fallback_ai",
          recipeCountReturned: finalRecipes.length
        });
        return Response.json({
          ...responsePayload,
          recipes: finalRecipes,
          servedFrom: "fallback_ai",
          result: JSON.stringify(finalRecipes),
          access: accessPayload(nextAccess)
        });
      }
    } catch (aiError) {
      if (isTransientAiOverload(aiError)) {
        offlineFallbackKind = "ai_busy_shared_pool";
      }
      logger.error("AI recipe generation failed; using shared recipe pool fallback", aiError);
    }

    logger.info("Recipe generation served from shared recipe pool after AI failure", {
      recipeCount: searchResult.recipes.length,
      canLoadMore: searchResult.canLoadMore
    });
    const strictRecipes = rankStrictRecipes(
      applyStrictIngredientOwnership(searchResult.recipes, availableIngredients, {
        preferredCuisine: parsed.data.preferredCuisine,
        diets: parsed.data.diets,
        conditions: parsed.data.conditions,
        allergens: parsed.data.allergens
      }),
      { ...parsed.data, ingredients: scoringIngredients, recipeCount }
    );
    const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
      allowProviderLookup: !requestAccess.isPremium
    });
    const finalRecipes = deliverRecipes(finalizeRecipes(
      mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
    ));
    await queueRecipeCachePersist({
      uid: requestAccess.uid,
      recipeLanguage,
      recipes: finalRecipes
    });
    logger.info("Recipe generation request completed", {
      ...aiTraceSummary,
      servedFrom: "shared_pool",
      recipeCountReturned: finalRecipes.length
    });
    return Response.json({
      result: JSON.stringify(finalRecipes),
      servedFrom: "shared_pool",
      canLoadMore: searchResult.canLoadMore,
      fallbackNotice: buildRecipeFallbackNotice(offlineFallbackKind, recipeLanguage),
      access: accessPayload(nextAccess)
    });
  } catch (error) {
    if (
      isFirebaseTransientError(error) ||
      (error instanceof Error && (
        error.message.includes("Sign in") ||
        error.message.includes("Admin") ||
        error.message.includes("Premium") ||
        error.message.includes("Firebase Admin credentials")
      ))
    ) {
      logger.warn("Recipe generation request failed during access checks", {
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      return accessErrorResponse(error);
    }
    logger.error("Error generating recipes", error, { requestId });
    const message = error instanceof Error ? error.message : "Failed to generate recipes";
    const status = message.includes("GEMINI_API_KEY") ? 503 : isTransientModelError(error) ? 503 : 500;
    const safeMessage = isTransientModelError(error)
      ? getClientFacingAiErrorMessage(error, "Recipe generation is temporarily unavailable. Please try again in a few minutes.")
      : message;
    return Response.json(
      { error: safeMessage },
      { status }
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
  trace?: import("@/lib/openai").AiCallTraceOptions;
}) {
  try {
    ensureAiAvailable();
    const text = await callOpenAIVision(
      buildPlateRecipeMatchVisionPrompt(input.language),
      input.image,
      undefined,
      input.trace
    );
    const parsed = parseAiJsonPayload(text, "scan_match") as { isPlatedDish?: boolean; recipe?: unknown };

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

function parseAiJsonPayload(text: string, context: "recipe_generation" | "scan_match") {
  const directCandidate = extractJson(text);
  const balancedCandidate = extractBalancedJsonCandidate(text);
  const candidates = Array.from(
    new Set(
      [directCandidate, balancedCandidate]
        .flatMap((candidate) => [candidate, cleanJsonCandidate(candidate)])
        .map((candidate) => candidate.trim())
        .filter(Boolean)
    )
  );

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  logger.warn("AI JSON parse failed", {
    context,
    candidateCount: candidates.length,
    preview: text.slice(0, 1200),
    errorMessage: lastError instanceof Error ? lastError.message : String(lastError)
  });

  throw lastError instanceof Error ? lastError : new Error("Failed to parse AI JSON payload");
}

function extractBalancedJsonCandidate(text: string) {
  const source = text.trim();
  const start = source.search(/[\[{]/);
  if (start < 0) return source;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack[stack.length - 1] === expected) {
        stack.pop();
        if (stack.length === 0) {
          return source.slice(start, index + 1);
        }
      }
    }
  }

  return source.slice(start);
}

function cleanJsonCandidate(candidate: string) {
  return candidate
    .replace(/^\uFEFF/, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
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
    localized: normalizeLocalizedRecipeVariants((baseRecipe as { localized?: unknown }).localized),
    preference_hits: Array.isArray(baseRecipe.preference_hits)
      ? baseRecipe.preference_hits.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : []
  };

  const [strictRecipe] = applyStrictIngredientOwnership([coercedRecipe], availableIngredients);
  if (!strictRecipe) return null;

  const imageSearchIndices = buildRecipePhotoQueryCandidates({
    cuisine: strictRecipe.cuisine,
    dishIntent: strictRecipe.dish_intent,
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

function mergeRecipeResults(
  exactRecipe: Recipe | null,
  similarRecipes: Recipe[],
  markSimilarOrigins: boolean,
  recipeCount: number
) {
  const merged: Recipe[] = [];
  const seen = new Set<string>();

  const pushRecipe = (recipe: Recipe, fallbackOrigin?: Recipe["recipe_origin"]) => {
    const key = recipe.id ?? recipe.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
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

  return prioritizePantryBalancedRecipes(merged).slice(0, recipeCount);
}

function buildAvailableIngredientSet(inputIngredients: string[], normalizedIngredients: string[]) {
  return new Set(
    [...inputIngredients, ...normalizedIngredients]
      .map(normalizeIngredientForStrictMatch)
      .filter(Boolean)
  );
}

function applyStrictIngredientOwnership(
  inputRecipes: unknown[],
  availableIngredients: Set<string>,
  context?: {
    allergens?: string[];
    conditions?: string[];
    diets?: string[];
    preferredCuisine?: string;
  }
): Recipe[] {
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

    return enrichRecipeWithDishIntent({
      ...baseRecipe,
      image_search_index: imageSearchIndices[0],
      image_search_indices: imageSearchIndices.length ? imageSearchIndices : undefined,
      ingredients: owned,
      missing_ingredients: missing
    }, {
      availableIngredients: [...owned, ...missing],
      allergens: context?.allergens,
      conditions: context?.conditions,
      diets: context?.diets,
      preferredCuisine: context?.preferredCuisine ?? (typeof baseRecipe.cuisine === "string" ? baseRecipe.cuisine : undefined)
    });
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

function normalizeLocalizedRecipeVariants(value: unknown): Recipe["localized"] {
  if (!value || typeof value !== "object") return undefined;

  const localized = value as Record<string, unknown>;
  const english = normalizeLocalizedRecipeVariant(localized.English);
  const arabic = normalizeLocalizedRecipeVariant(localized.Arabic);

  if (!english && !arabic) return undefined;

  return {
    ...(english ? { English: english } : {}),
    ...(arabic ? { Arabic: arabic } : {})
  };
}

function normalizeLocalizedRecipeVariant(value: unknown): NonNullable<Recipe["localized"]>["English"] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const variant = value as Partial<Recipe>;
  const name = typeof variant.name === "string" ? variant.name.trim() : "";
  const cuisine = typeof variant.cuisine === "string" ? variant.cuisine.trim() : "";
  if (!name || !cuisine) return undefined;

  return {
    name,
    cuisine,
    recipe_origin:
      variant.recipe_origin === "exact_scan_match" || variant.recipe_origin === "similar_ingredients"
        ? variant.recipe_origin
        : undefined,
    scan_match_explanation:
      typeof variant.scan_match_explanation === "string" && variant.scan_match_explanation.trim()
        ? variant.scan_match_explanation.trim()
        : undefined,
    dish_intent: variant.dish_intent,
    image_search_index:
      typeof variant.image_search_index === "string" && variant.image_search_index.trim()
        ? variant.image_search_index.trim()
        : undefined,
    image_search_indices: Array.isArray(variant.image_search_indices)
      ? variant.image_search_indices.filter((entry): entry is string => typeof entry === "string" && entry.trim().length >= 3)
      : undefined,
    ingredients: Array.isArray(variant.ingredients)
      ? variant.ingredients.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    missing_ingredients: Array.isArray(variant.missing_ingredients)
      ? variant.missing_ingredients.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    steps: Array.isArray(variant.steps)
      ? variant.steps.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    calories: typeof variant.calories === "number" ? variant.calories : 0,
    protein: typeof variant.protein === "string" ? variant.protein : "0g",
    carbs: typeof variant.carbs === "string" ? variant.carbs : "0g",
    fat: typeof variant.fat === "string" ? variant.fat : "0g",
    fiber: typeof variant.fiber === "string" ? variant.fiber : undefined,
    sugar: typeof variant.sugar === "string" ? variant.sugar : undefined,
    sodium: typeof variant.sodium === "string" ? variant.sodium : undefined,
    cook_time: typeof variant.cook_time === "string" && variant.cook_time.trim() ? variant.cook_time : "30 mins",
    difficulty: typeof variant.difficulty === "string" && variant.difficulty.trim() ? variant.difficulty.trim() : "Medium",
    image_url: typeof variant.image_url === "string" && variant.image_url.trim() ? variant.image_url.trim() : undefined,
    image_source: variant.image_source,
    image_attribution_name:
      typeof variant.image_attribution_name === "string" && variant.image_attribution_name.trim()
        ? variant.image_attribution_name.trim()
        : undefined,
    image_attribution_url:
      typeof variant.image_attribution_url === "string" && variant.image_attribution_url.trim()
        ? variant.image_attribution_url.trim()
        : undefined,
    preference_hits: Array.isArray(variant.preference_hits)
      ? variant.preference_hits.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : []
  };
}

function rankStrictRecipes(
  recipes: Recipe[],
  options: {
    ingredients?: string[];
    preferredCuisine?: string;
    calorieTarget?: number;
    maxMissingIngredients?: number;
    recipeCount?: number;
    diets?: string[];
    conditions?: string[];
  }
) {
  const targetCaloriesPerMeal = Math.round((options.calorieTarget ?? 2000) / 3);
  const preferredCuisine = options.preferredCuisine && options.preferredCuisine !== "Any"
    ? options.preferredCuisine.toLowerCase()
    : "";
  const limit = clampRecipeCount(options.recipeCount);

  const ranked = recipes
    .map((recipe, index) => ({
      recipe,
      index,
      isPantryBalanced: isPantryBalancedRecipe(recipe),
      score: scoreStrictRecipe(recipe, {
        targetCaloriesPerMeal,
        preferredCuisine,
        maxMissingIngredients: options.maxMissingIngredients ?? 3,
        hasPreferences: Boolean(options.diets?.length || options.conditions?.length),
        availableIngredients: options.ingredients ?? []
      })
    }))
    .sort((left, right) => {
      if (left.isPantryBalanced !== right.isPantryBalanced) {
        return Number(right.isPantryBalanced) - Number(left.isPantryBalanced);
      }

      return right.score - left.score || left.index - right.index;
    });

  const selected = ranked.reduce(selectStructurallyVariedRankedRecipes(limit), [] as Array<{
      recipe: Recipe;
      index: number;
      isPantryBalanced: boolean;
      score: number;
    }>);

  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((item) => item.recipe.id ?? item.recipe.name.trim().toLowerCase()));
    for (const candidate of ranked) {
      const key = candidate.recipe.id ?? candidate.recipe.name.trim().toLowerCase();
      if (!key || selectedIds.has(key)) continue;
      selected.push(candidate);
      selectedIds.add(key);
      if (selected.length >= limit) break;
    }
  }

  return selected.map(({ recipe }) => recipe);
}

function clampRecipeCount(value?: number, maxRecipeCount = MAX_SHARED_POOL_RECIPE_RESULT_COUNT) {
  if (!Number.isFinite(value)) return DEFAULT_RECIPE_RESULT_COUNT;
  return Math.min(maxRecipeCount, Math.max(MIN_RECIPE_RESULT_COUNT, Number(value)));
}

function buildRecipeFallbackNotice(
  kind: "credits_used_shared_pool" | "ai_unavailable_shared_pool" | "ai_busy_shared_pool",
  recipeLanguage: string
) {
  const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
  if (wantsArabic && kind === "ai_busy_shared_pool") {
    return "خدمة توليد الوصفات مشغولة حالياً، لذا عرضنا أفضل الوصفات المطابقة المتاحة الآن.";
  }

  if (!wantsArabic) {
    if (kind === "credits_used_shared_pool") {
      return "Your 5 free AI credits are used. These recipes are from the shared recipe pool.";
    }

    if (kind === "ai_busy_shared_pool") {
      return "AI recipe generation is busy right now, so we showed the best matches from the shared recipe pool.";
    }

    return "AI recipe generation was unavailable, so we used matches from the shared recipe pool.";
  }

  if (kind === "credits_used_shared_pool") {
      return "تم استهلاك 5 أرصدة الذكاء الاصطناعي المجانية. هذه الوصفات من مجموعة الوصفات المشتركة.";
  }

  return "تعذر توليد الوصفات بالذكاء الاصطناعي، لذلك استخدمنا مطابقات من مجموعة الوصفات المشتركة.";
}

function isTransientAiOverload(error: unknown) {
  return isTransientModelError(error);
}

async function queueRecipeCachePersist(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  uid?: string | null;
}) {
  if (AWAIT_SHARED_POOL_CACHE_PERSISTENCE) {
    try {
      await persistGeneratedRecipeCache(input);
    } catch (error) {
      logger.warn("Recipe cache persistence failed", {
        uid: input.uid ?? null,
        recipeCount: input.recipes?.length ?? 0,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  void persistGeneratedRecipeCache(input).catch((error) => {
    logger.warn("Recipe cache persistence failed", {
      uid: input.uid ?? null,
      recipeCount: input.recipes?.length ?? 0,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  });
}

function stripPremiumDeliveredImages(recipes: Recipe[]) {
  return recipes.map((recipe) => ({
    ...recipe,
    image_attribution_name: undefined,
    image_attribution_url: undefined,
    image_source: undefined,
    image_url: undefined,
    localized: recipe.localized
      ? Object.fromEntries(
          Object.entries(recipe.localized).map(([languageKey, variant]) => [
            languageKey,
            variant
              ? {
                  ...variant,
                  image_attribution_name: undefined,
                  image_attribution_url: undefined,
                  image_source: undefined,
                  image_url: undefined
                }
              : variant
          ])
        )
      : recipe.localized
  }));
}

function buildScannerPantryBalanceRetryPrompt(basePrompt: string, recipeCount: number) {
  return [
    basePrompt,
    "",
    "Scanner repair pass: your previous answer did not produce enough strong pantry-first recipe options.",
    `Return up to ${recipeCount} recipes.`,
    "Recommend recipes where available ingredients clearly carry the dish after strict pantry ownership is applied.",
    "Start with the strongest pantry-friendly recipes first, centered on the scanned or typed ingredients.",
    "If there are not enough pantry-strong options, fill the remaining recipe slots with the best pantry-first recipes you can find.",
    "Keep missing_ingredients as low as possible and avoid weak pantry fits unless they are needed to fill later slots.",
    "If the pantry is sparse, choose simpler dish families, smaller plates, egg dishes, toast dishes, bowls, salads, soups, or direct ingredient-led meals that still respect cuisine and health constraints.",
    "Return only valid JSON and follow the same schema as before."
  ].join(" ");
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
  const hasCuisinePreference = Boolean(options.preferredCuisine && options.preferredCuisine !== "Any");
  const cuisineMatch = hasCuisinePreference && cuisineMatchesPreference(recipe.cuisine, options.preferredCuisine) ? 1 : 0;
  const cuisineMismatchPenalty = hasCuisinePreference && !cuisineMatch ? -120 : 0;
  const calorieDistance = Number.isFinite(recipe.calories)
    ? Math.abs(recipe.calories - options.targetCaloriesPerMeal)
    : options.targetCaloriesPerMeal;
  const calorieScore = Math.max(0, 8 - calorieDistance / 50);
  const maxMissingBonus = missingCount <= options.maxMissingIngredients ? 4 : -4;
  const ownershipBalanceScore =
    ownedCount >= missingCount
      ? 18 + Math.min(ownedCount - missingCount, 4) * 3
      : -(24 + Math.min(missingCount - ownedCount, 4) * 12);
  const matchQualityScore = getMatchQualityScore(recipe.match_quality);
  const dishIntentScore = Math.max(0, (recipe.dish_intent?.candidate_score ?? 0) / 8);
  const dishIntentHitScore = Math.min(recipe.dish_intent?.candidate_hits?.length ?? 0, 4) * 2;
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
    cuisineMatch * 18 +
    cuisineMismatchPenalty +
    cuisineFit.score +
    dishIntentScore +
    dishIntentHitScore +
    calorieScore +
    ownershipBalanceScore +
    maxMissingBonus +
    matchQualityScore
  );
}

function enforcePreferredCuisineRecipes(
  recipes: Recipe[],
  preferredCuisine?: string,
  mode: "strict" | "preserve_exact_scan_match" = "strict",
  recipeCount = recipes.length
) {
  if (!preferredCuisine || preferredCuisine === "Any") {
    return recipes.slice(0, recipeCount);
  }

  const preservedExactMatches = mode === "preserve_exact_scan_match"
    ? recipes.filter((recipe) => recipe.recipe_origin === "exact_scan_match")
    : [];
  const cuisineMatchedRecipes = recipes.filter((recipe) => cuisineMatchesPreference(recipe.cuisine, preferredCuisine));

  if (!cuisineMatchedRecipes.length) {
    return recipes.slice(0, recipeCount);
  }

  const filtered = [...preservedExactMatches];
  const seen = new Set<string>();

  for (const recipe of filtered) {
    seen.add(recipe.id ?? recipe.name.trim().toLowerCase());
  }

  for (const recipe of cuisineMatchedRecipes) {
    const key = recipe.id ?? recipe.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    filtered.push(recipe);
    if (filtered.length >= recipeCount) {
      break;
    }
  }

  if (filtered.length < recipeCount) {
    for (const recipe of recipes) {
      const key = recipe.id ?? recipe.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      filtered.push(recipe);
      if (filtered.length >= recipeCount) {
        break;
      }
    }
  }

  return filtered.slice(0, recipeCount);
}

function buildHardRequestRestrictionContext(
  candidateDishes: Array<{
    dishName: string;
    cuisine: string;
    score: number;
    hits: string[];
    anchorMatchCount: number;
    supportMatchCount: number;
  }>,
  preferredCuisine?: string
) {
  const hasSpecificCuisine = Boolean(preferredCuisine && preferredCuisine !== "Any");
  const trustedCandidates = candidateDishes
    .filter((candidate) => {
      if (
        hasSpecificCuisine &&
        preferredCuisine &&
        !cuisineMatchesPreference(candidate.cuisine, preferredCuisine)
      ) {
        return false;
      }

      return (
        candidate.score >= 95 ||
        candidate.anchorMatchCount >= 2 ||
        (candidate.anchorMatchCount >= 1 && candidate.supportMatchCount >= 1) ||
        candidate.hits.some((hit) => hit.startsWith("intent-") || hit.startsWith("sparse-"))
      );
    })
    .slice(0, 5);

  return {
    allowedFamilies: new Set(
      trustedCandidates
        .map((candidate) => normalizeDishRestrictionKey(candidate.dishName))
        .filter(Boolean)
    ),
    hasSpecificCuisine,
    preferredCuisine: preferredCuisine && preferredCuisine !== "Any" ? preferredCuisine : undefined,
    strict: trustedCandidates.length > 0
  };
}

function enforceHardRequestRecipes(
  recipes: Recipe[],
  restriction: {
    allowedFamilies: Set<string>;
    hasSpecificCuisine: boolean;
    preferredCuisine?: string;
    strict: boolean;
  },
  recipeCount: number
) {
  if (!restriction.strict) {
    return recipes.slice(0, recipeCount);
  }

  const preservedExactMatches = recipes.filter((recipe) => recipe.recipe_origin === "exact_scan_match");
  const compliantRecipes = recipes.filter((recipe) => isRecipeCompliantWithHardRestriction(recipe, restriction));

  if (!compliantRecipes.length) {
    return recipes.slice(0, recipeCount);
  }

  const merged: Recipe[] = [];
  const seen = new Set<string>();

  for (const recipe of [...preservedExactMatches, ...compliantRecipes]) {
    const key = recipe.id ?? recipe.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(recipe);
    if (merged.length >= recipeCount) {
      break;
    }
  }

  if (merged.length < recipeCount) {
    for (const recipe of recipes) {
      const key = recipe.id ?? recipe.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(recipe);
      if (merged.length >= recipeCount) {
        break;
      }
    }
  }

  return merged;
}

function enforceDistinctRecipeVariety(recipes: Recipe[], recipeCount: number) {
  const preservedExactMatches = recipes.filter((recipe) => recipe.recipe_origin === "exact_scan_match");
  const selected: Recipe[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const seenFamilies = new Set<string>();
  const seenStructures = new Set<string>();

  const addRecipe = (
    recipe: Recipe,
    options: {
      allowFamilyRepeat?: boolean;
      allowStructureRepeat?: boolean;
    } = {}
  ) => {
    if (selected.length >= recipeCount) return false;

    const idKey = recipe.id || "";
    const nameKey = normalizeDishRestrictionKey(recipe.name);
    const familyKey = getRecipeVarietyFamilyKey(recipe);
    const structureKey = buildRecipeStructureSignature(recipe);

    if (idKey && seenIds.has(idKey)) return false;
    if (nameKey && seenNames.has(nameKey)) return false;
    if (!options.allowFamilyRepeat && familyKey && seenFamilies.has(familyKey)) return false;
    if (!options.allowStructureRepeat && structureKey && seenStructures.has(structureKey)) return false;

    selected.push(recipe);
    if (idKey) seenIds.add(idKey);
    if (nameKey) seenNames.add(nameKey);
    if (familyKey) seenFamilies.add(familyKey);
    if (structureKey) seenStructures.add(structureKey);
    return true;
  };

  for (const recipe of preservedExactMatches) {
    addRecipe(recipe, { allowFamilyRepeat: true, allowStructureRepeat: true });
  }

  for (const recipe of recipes) {
    addRecipe(recipe);
  }

  for (const recipe of recipes) {
    addRecipe(recipe, { allowStructureRepeat: true });
  }

  for (const recipe of recipes) {
    addRecipe(recipe, { allowFamilyRepeat: true, allowStructureRepeat: true });
  }

  return selected.slice(0, recipeCount);
}

function getRecipeVarietyFamilyKey(recipe: Recipe) {
  const candidate = normalizeDishRestrictionKey(
    recipe.dish_intent?.dish_name || buildRecipeDishFamilyKey(recipe) || recipe.name
  );

  if (!candidate) return "";

  return candidate
    .replace(/\b(diabetes friendly|heart healthy|low sodium|high protein|low carb|gluten free|dairy free|vegan|vegetarian)\b/g, " ")
    .replace(/\b(grilled|baked|fried|roasted|pan seared|sauteed|simple|classic|spiced|lean|light)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecipeCompliantWithHardRestriction(
  recipe: Recipe,
  restriction: {
    allowedFamilies: Set<string>;
    hasSpecificCuisine: boolean;
    preferredCuisine?: string;
  }
) {
  if (
    restriction.hasSpecificCuisine &&
    restriction.preferredCuisine &&
    !cuisineMatchesPreference(recipe.cuisine, restriction.preferredCuisine)
  ) {
    return false;
  }

  if (!restriction.allowedFamilies.size) {
    return true;
  }

  const recipeFamily = normalizeDishRestrictionKey(
    recipe.dish_intent?.dish_name || buildRecipeDishFamilyKey(recipe) || recipe.name
  );
  if (!recipeFamily) {
    return false;
  }
  if (recipeFamily && restriction.allowedFamilies.has(recipeFamily)) {
    return true;
  }

  return Array.from(restriction.allowedFamilies).some((allowedFamily) =>
    recipeFamily.includes(allowedFamily) ||
    allowedFamily.includes(recipeFamily) ||
    sharesDishRestrictionTokens(recipeFamily, allowedFamily)
  );
}

function normalizeDishRestrictionKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(any|food|dish|meal|plate|bowl|dinner|lunch|breakfast|snack|style|inspired)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sharesDishRestrictionTokens(left: string, right: string) {
  if (!left || !right) return false;

  const leftTokens = new Set(left.split(" ").filter((token) => token.length >= 4));
  const rightTokens = right.split(" ").filter((token) => token.length >= 4);
  let matches = 0;

  for (const token of rightTokens) {
    if (leftTokens.has(token)) {
      matches += 1;
      if (matches >= 2) {
        return true;
      }
    }
  }

  return false;
}

function diversifyAnyCuisineRecipes(recipes: Recipe[], recipeCount: number, inputIngredients: string[]) {
  if (recipes.length <= 2) {
    return recipes.slice(0, recipeCount);
  }

  const grouped = new Map<string, Recipe[]>();
  const wantsPastaVariety = inputIngredients.some((ingredient) => isPastaLikeIngredient(ingredient));
  for (const recipe of recipes) {
    const key = wantsPastaVariety
      ? buildRecipeStructureSignature(recipe)
      : `${normalizeRecipeCuisineBucket(recipe.cuisine)}|${buildRecipeDishFamilyKey(recipe)}`;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(recipe);
    } else {
      grouped.set(key, [recipe]);
    }
  }

  if (grouped.size <= 1) {
    return recipes.slice(0, recipeCount);
  }

  const buckets = Array.from(grouped.values());
  const diversified: Recipe[] = [];
  const seenStructures = new Set<string>();

  while (diversified.length < recipeCount) {
    let progressed = false;

    for (const bucket of buckets) {
      const nextRecipe = bucket.shift();
      if (!nextRecipe) continue;
      const structureKey = buildRecipeStructureSignature(nextRecipe);
      if (seenStructures.has(structureKey)) {
        continue;
      }
      diversified.push(nextRecipe);
      seenStructures.add(structureKey);
      progressed = true;
      if (diversified.length >= recipeCount) {
        break;
      }
    }

    if (!progressed) {
      break;
    }
  }

  if (diversified.length < recipeCount) {
    const selectedKeys = new Set(diversified.map((recipe) => recipe.id ?? recipe.name.trim().toLowerCase()));
    for (const recipe of recipes) {
      const key = recipe.id ?? recipe.name.trim().toLowerCase();
      if (!key || selectedKeys.has(key)) continue;
      diversified.push(recipe);
      selectedKeys.add(key);
      if (diversified.length >= recipeCount) {
        break;
      }
    }
  }

  return diversified.slice(0, recipeCount);
}

function selectStructurallyVariedRankedRecipes(limit: number) {
  const selectedFamilies = new Map<string, number>();
  const selectedStructures = new Map<string, number>();

  return (
    selected: Array<{ recipe: Recipe; index: number; isPantryBalanced: boolean; score: number }>,
    candidate: { recipe: Recipe; index: number; isPantryBalanced: boolean; score: number }
  ) => {
    if (selected.length >= limit) return selected;

    const familyKey = buildRecipeDishFamilyKey(candidate.recipe) || candidate.recipe.name.trim().toLowerCase();
    const structureKey = buildRecipeStructureSignature(candidate.recipe);
    const familySeen = selectedFamilies.get(familyKey) ?? 0;
    const structureSeen = selectedStructures.get(structureKey) ?? 0;

    if (structureSeen >= 1) {
      return selected;
    }

    if (familySeen >= 2 && selected.length + 1 < limit) {
      return selected;
    }

    selected.push(candidate);
    selectedFamilies.set(familyKey, familySeen + 1);
    selectedStructures.set(structureKey, structureSeen + 1);
    return selected;
  };
}

function normalizeRecipeCuisineBucket(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return "unknown";
  if (normalized.includes("italian")) return "italian";
  if (normalized.includes("egyptian")) return "egyptian";
  if (normalized.includes("middleeastern") || normalized.includes("levant")) return "middleeastern";
  if (normalized.includes("mediterranean")) return "mediterranean";
  if (normalized.includes("indian")) return "indian";
  if (normalized.includes("mexican")) return "mexican";
  if (normalized.includes("american")) return "american";
  if (normalized.includes("thai")) return "thai";
  if (normalized.includes("turkish")) return "turkish";
  if (normalized.includes("asian")) return "asian";
  return normalized;
}

function prioritizePantryBalancedRecipes(recipes: Recipe[]) {
  const balancedExact: Recipe[] = [];
  const balancedSimilar: Recipe[] = [];
  const unbalancedExact: Recipe[] = [];
  const unbalancedSimilar: Recipe[] = [];

  for (const recipe of recipes) {
    const isBalanced = isPantryBalancedRecipe(recipe);
    const isExact = recipe.recipe_origin === "exact_scan_match";

    if (isBalanced && isExact) {
      balancedExact.push(recipe);
      continue;
    }

    if (isBalanced) {
      balancedSimilar.push(recipe);
      continue;
    }

    if (isExact) {
      unbalancedExact.push(recipe);
      continue;
    }

    unbalancedSimilar.push(recipe);
  }

  return [...balancedExact, ...balancedSimilar, ...unbalancedExact, ...unbalancedSimilar];
}

function isPantryBalancedRecipe(recipe: Recipe) {
  return recipe.ingredients.length >= recipe.missing_ingredients.length;
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
  if (expandIngredientFamilies([normalizedIngredient]).some((candidate) => availableIngredients.has(candidate))) {
    return true;
  }

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

async function applyImageFirstRecipeRanking(
  recipes: Recipe[],
  availableIngredientCount = 0,
  options?: {
    allowProviderLookup?: boolean;
  }
) {
  const sparsePantryBonus = availableIngredientCount > 0 && availableIngredientCount <= 2 ? 1.35 : 1;
  const allowProviderLookup = options?.allowProviderLookup !== false;
  const resolvedRecipes = await Promise.all(
    recipes.map(async (recipe, index) => {
      try {
        const resolvedPhoto = await resolveRecipePhotoCandidate(recipe, new Set(), { allowProviderLookup });
        return {
          index,
          photoFitScore: resolvedPhoto.photoFitScore * sparsePantryBonus,
          rawPhotoFitScore: resolvedPhoto.photoFitScore,
          recipe: {
            ...recipe,
            ...(resolvedPhoto.recipePatch ?? {})
          }
        };
      } catch (error) {
        logger.warn("Recipe photo ranking lookup failed", {
          recipeName: recipe.name,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        return {
          index,
          photoFitScore: 0,
          rawPhotoFitScore: 0,
          recipe
        };
      }
    })
  );

  const scoredRecipes = dedupeResolvedRecipeImages(resolvedRecipes);

  const sortedRecipes = scoredRecipes
    .sort((left, right) => right.photoFitScore - left.photoFitScore || left.index - right.index)
    .map(({ rawPhotoFitScore, recipe }, index, all) => ({
      recipe: {
        ...recipe,
        visual_match_label: getVisualMatchLabel(rawPhotoFitScore, index, all[0]?.rawPhotoFitScore ?? 0)
      },
      rawPhotoFitScore
    }));

  return ensureUniqueRecipePhotos(sortedRecipes.map(({ recipe }) => recipe));
}

async function ensureUniqueRecipePhotos(recipes: Recipe[]) {
  const usedImageUrls = new Set<string>();
  const uniqueRecipes: Recipe[] = [];

  for (const recipe of recipes) {
    const currentImageUrl = recipe.image_url;
    if (currentImageUrl && !usedImageUrls.has(currentImageUrl)) {
      usedImageUrls.add(currentImageUrl);
      uniqueRecipes.push(recipe);
      continue;
    }

    try {
      const resolvedPhoto = await resolveRecipePhotoCandidate(recipe, usedImageUrls, { allowProviderLookup: true });
      const candidateImageUrl = resolvedPhoto.recipePatch?.image_url;

      if (candidateImageUrl && !usedImageUrls.has(candidateImageUrl)) {
        usedImageUrls.add(candidateImageUrl);
        uniqueRecipes.push({
          ...recipe,
          ...(resolvedPhoto.recipePatch ?? {})
        });
        continue;
      }
    } catch (error) {
      logger.warn("Recipe unique photo replacement failed", {
        recipeName: recipe.name,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }

    uniqueRecipes.push({
      ...recipe,
      image_attribution_name: undefined,
      image_attribution_url: undefined,
      image_source: undefined,
      image_url: undefined
    });
  }

  return uniqueRecipes;
}

function dedupeResolvedRecipeImages(
  scoredRecipes: Array<{
    index: number;
    photoFitScore: number;
    rawPhotoFitScore: number;
    recipe: Recipe;
  }>
) {
  const usedImageUrls = new Set<string>();

  return scoredRecipes.map((entry) => {
    const imageUrl = entry.recipe.image_url;
    if (!imageUrl || !usedImageUrls.has(imageUrl)) {
      if (imageUrl) {
        usedImageUrls.add(imageUrl);
      }
      return entry;
    }

    return {
      ...entry,
      photoFitScore: Math.max(0, entry.photoFitScore - 6),
      rawPhotoFitScore: Math.max(0, entry.rawPhotoFitScore - 6),
      recipe: {
        ...entry.recipe,
        image_attribution_name: undefined,
        image_attribution_url: undefined,
        image_source: undefined,
        image_url: undefined
      }
    };
  });
}

async function resolveRecipePhotoCandidate(
  recipe: Recipe,
  excludedUrls: Set<string> = new Set(),
  options?: {
    allowProviderLookup?: boolean;
  }
) {
  if (recipe.image_url && !excludedUrls.has(recipe.image_url)) {
    return {
      photoFitScore: 100,
      recipePatch: null as Partial<Recipe> | null
    };
  }

  if (options?.allowProviderLookup === false) {
    return { photoFitScore: 0, recipePatch: null as Partial<Recipe> | null };
  }

  const queries = buildRecipePhotoQueriesForRanking(recipe);
  const baseIdentity = buildRecipePhotoIdentity(recipe.image_search_index ?? queries[0] ?? recipe.name);
  let bestScore = 0;
  let bestSource: keyof typeof MIN_ACCEPTED_PROVIDER_SCORE | null = null;
  let bestSourceScore = 0;
  let recipePatch: Partial<Recipe> | null = null;

  for (const [index, query] of queries.entries()) {
    const queryIdentity = buildRecipePhotoIdentity(query);
    const queryPriorityAdjustment = getPhotoQueryPriorityAdjustment(baseIdentity, queryIdentity, index);
    if (shouldTryWikimediaRecipePhoto(queryIdentity, index)) {
      const freePhoto = await findFreeRecipePhoto(query);
      const knownDishScore = 18 + queryPriorityAdjustment;
      if (freePhoto && !excludedUrls.has(freePhoto.imageUrl) && knownDishScore > bestScore) {
        bestScore = knownDishScore;
        bestSource = "wikimedia";
        bestSourceScore = 18;
        recipePatch = {
          image_source: "wikimedia",
          image_url: freePhoto.imageUrl
        };
      }
    }

    if (isUnsplashRecipePhotoSearchConfigured()) {
      const unsplash = await findUnsplashRecipePhoto(query, { excludeUrls: excludedUrls });
      if (unsplash) {
        const score = unsplash.score + 2 + queryPriorityAdjustment;
        if (score > bestScore) {
          bestScore = score;
          bestSource = "unsplash_search";
          bestSourceScore = unsplash.score;
          recipePatch = {
            image_attribution_name: unsplash.attributionName,
            image_attribution_url: unsplash.attributionUrl,
            image_source: "unsplash",
            image_url: unsplash.imageUrl
          };
        }
      }
    }

    if (isPexelsRecipePhotoSearchConfigured()) {
      const pexels = await findPexelsRecipePhoto(query, { excludeUrls: excludedUrls });
      if (pexels) {
        const score = pexels.score + queryPriorityAdjustment;
        if (score > bestScore) {
          bestScore = score;
          bestSource = "pexels_search";
          bestSourceScore = pexels.score;
          recipePatch = {
            image_source: "search",
            image_url: pexels.imageUrl
          };
        }
      }
    }
  }

  if (!recipePatch || !bestSource || bestSourceScore < MIN_ACCEPTED_PROVIDER_SCORE[bestSource]) {
    return { photoFitScore: 0, recipePatch: null as Partial<Recipe> | null };
  }

  return { photoFitScore: bestScore, recipePatch };
}

function buildRecipePhotoQueriesForRanking(recipe: Recipe) {
  return buildRecipePhotoQueryCandidates({
    cuisine: recipe.cuisine,
    dishIntent: recipe.dish_intent,
    imageSearchIndex: recipe.image_search_index,
    imageSearchIndices: recipe.image_search_indices,
    ingredients: recipe.ingredients,
    missingIngredients: recipe.missing_ingredients,
    name: recipe.name
  }).slice(0, 5);
}

function getPhotoQueryPriorityAdjustment(
  baseIdentity: ReturnType<typeof buildRecipePhotoIdentity>,
  queryIdentity: ReturnType<typeof buildRecipePhotoIdentity>,
  index: number
) {
  let adjustment = Math.max(0, 1.8 - index * 0.45);

  if (baseIdentity.mainIngredientKey && queryIdentity.mainIngredientKey) {
    adjustment += baseIdentity.mainIngredientKey === queryIdentity.mainIngredientKey ? 1.4 : -6;
  }

  if (baseIdentity.sauceKey && queryIdentity.sauceKey) {
    adjustment += baseIdentity.sauceKey === queryIdentity.sauceKey ? 1.1 : -5;
  }

  if (baseIdentity.starchKey && queryIdentity.starchKey) {
    adjustment += baseIdentity.starchKey === queryIdentity.starchKey ? 0.9 : -3.5;
  }

  if (/\bmussel|mussels\b/i.test(baseIdentity.cleanQuery) && /\bshrimp|prawn\b/i.test(queryIdentity.cleanQuery)) {
    adjustment -= 7;
  }

  if (/\btahini|sesame sauce\b/i.test(baseIdentity.cleanQuery) && /\b(pasta|spaghetti|linguine|marinara|pomodoro|red sauce)\b/i.test(queryIdentity.cleanQuery)) {
    adjustment -= 7;
  }

  return adjustment;
}

function getVisualMatchLabel(score: number, index: number, topScore: number) {
  if (score <= 0) return undefined;
  if (index === 0 && topScore >= 8) return "Best visual match";
  if (index === 0 && topScore >= 5) return "Top image match";
  if (index > 0 && score >= 8 && score >= topScore - 1) return "Strong visual match";
  return undefined;
}

function shouldTryWikimediaRecipePhoto(identity: ReturnType<typeof buildRecipePhotoIdentity>, index: number) {
  if (index > 1) return false;
  if (identity.canonicalDishKey) return true;
  return Boolean(identity.familyKey && WIKIMEDIA_FAMILY_ALLOWLIST.has(identity.familyKey));
}

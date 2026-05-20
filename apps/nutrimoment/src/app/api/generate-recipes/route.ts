import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
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
  consumeFreeAiCredit,
  hasGeneratedRecipeImageAccess
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { generateFallbackRecipes } from "@/services/fallbackAiService";
import { searchCatalogRecipes } from "@/services/recipeSearchService";
import { repairScanRecipesWithGuard } from "@/services/scanRecipeGuardService";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import {
  buildRecipeDishFamilyKey,
  buildRecipeStructureSignature,
  expandIngredientFamilies,
  isPastaLikeIngredient
} from "@/lib/ingredientFamilies";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { buildRecipePhotoIdentity, isStrictRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import { normalizePhotoIdentity, toIdentityKey } from "@/lib/photoIdentityBuilders";
import { getAllDishes } from "@/lib/cuisineCatalogs/completeCatalogs";
import { scoreCuisineFit } from "@/lib/cuisineScoring";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import {
  buildCanonicalDishPromptHint,
  enforceAuthenticCuisineRecipeSet,
  resolveAuthenticCuisineDishes
} from "@/lib/cuisineAuthenticityResolver";
import {
  buildCuisineAwareDishCandidates,
  buildDishCandidatePromptSummary,
  enrichRecipeWithDishIntent
} from "@/lib/recipeDishIntelligence";
import { findPexelsRecipePhoto, isPexelsRecipePhotoSearchConfigured } from "@/lib/pexelsRecipePhotoSearch";
import { findUnsplashRecipePhoto, isUnsplashRecipePhotoSearchConfigured } from "@/lib/unsplashRecipePhotoSearch";
import { findFreeRecipePhoto } from "@/lib/freeRecipePhotos";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ensureArabicRecipeLanguage, isArabicRecipeLanguage } from "@/lib/arabicRecipeLocalization";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { ensureDetailedRecipeSteps } from "@/lib/recipeStepDetails";
import type { Recipe } from "@/lib/types";
import { logger } from "@/lib/logger";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import {
  filterRecipesByDiet,
  type DietEnforcementContext
} from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";

const DEFAULT_RECIPE_RESULT_COUNT = 5;
const MIN_RECIPE_RESULT_COUNT = 1;
const MAX_SHARED_POOL_RECIPE_RESULT_COUNT = 10;
const AI_RECIPE_TRANSIENT_RETRY_ATTEMPTS = 3;
const AWAIT_SHARED_POOL_CACHE_PERSISTENCE =
  process.env.DISABLE_USER_RECIPE_CACHE === "true" &&
  process.env.DISABLE_SHARED_RECIPE_POOL !== "true";
const MIN_ACCEPTED_PROVIDER_SCORE = {
  wikimedia: 12,
  pexels_search: 11,
  unsplash_search: 11
} as const;
const WIKIMEDIA_FAMILY_ALLOWLIST = new Set([
  ...getAllDishes().map((dish) => dish.id),
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
  allergens: z.array(z.string()).optional(),
  historyEntryId: z.string().min(1).max(160).optional()
}).refine((value) => Boolean(value.ingredients?.length || value.prompt || value.referenceImage), {
  message: "Provide ingredients or a prompt."
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let accessCheck: Awaited<ReturnType<typeof canUseApiFeature>> | null = null;
  let historyEntryId: string | undefined;
  let historyUid: string | undefined;
  logger.info("Recipe generation HTTP request received", { requestId });
  try {
    accessCheck = await canUseApiFeature(request, "recipe_generation");
    const requestAccess = accessCheck.access;
    const hasGeneratedImageAccess = hasGeneratedRecipeImageAccess(requestAccess);
    // Free tier (no premium, no admin) is served entirely from the curated
    // catalog / shared recipe pool. Premium and admin users continue to use
    // Gemini as the primary recipe source.
    const isFreeTier = !requestAccess.isPremium && !requestAccess.isAdmin;
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
    historyEntryId = parsed.data.historyEntryId;
    historyUid = requestAccess.uid;

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
    // Server-side hard filter context for diet + allergens. Used to drop
    // anything Gemini returns that violates the user's rules, regardless of
    // how confidently the prompt asked Gemini to respect them.
    const dietContext: DietEnforcementContext = {
      diets: parsed.data.diets ?? [],
      allergens: parsed.data.allergens ?? []
    };
    const enforceDietOnRecipes = (recipes: Recipe[], stage: string): Recipe[] => {
      const result = filterRecipesByDiet(recipes, dietContext);
      const healthRejected: Array<{ recipe: Recipe; reason: ReturnType<typeof findRecipeHealthViolation> }> = [];
      const healthAllowed = result.allowed.filter((recipe) => {
        const reason = findRecipeHealthViolation(recipe, parsed.data.conditions ?? []);
        if (reason) healthRejected.push({ recipe, reason });
        return !reason;
      });
      if (result.rejected.length || healthRejected.length) {
        logger.warn("Diet/allergen filter dropped recipes", {
          requestId,
          stage,
          droppedCount: result.rejected.length + healthRejected.length,
          firstReason: result.rejected[0]?.reason ?? healthRejected[0]?.reason
        });
      }
      return healthAllowed;
    };
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
    const authenticDishCandidates = resolveAuthenticCuisineDishes({
      cuisine: parsed.data.preferredCuisine,
      ingredients: scoringIngredients
    });
    const candidateDishHints = buildDishCandidatePromptSummary(candidateDishes);
    const canonicalDishHint = buildCanonicalDishPromptHint(authenticDishCandidates);
    const requestRestriction = buildHardRequestRestrictionContext(candidateDishes, parsed.data.preferredCuisine, ingredients.length);
    const shouldLabelSimilarRecipes = Boolean(parsed.data.referenceImage);
    const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
    const prepareRecipes = (recipes: Recipe[]) =>
      (wantsArabic ? recipes.map(ensureArabicRecipeLanguage) : recipes)
        .map(ensureRecipePhotoIdentity)
        .map((recipe) =>
          ensureDetailedRecipeSteps(recipe, wantsArabic ? "Arabic" : "English")
        );
    const finalizeRecipes = (recipes: Recipe[]) => {
      const finalized = ensureRequestedRecipeCount(
        enforceDistinctRecipeVariety(
          prioritizePantryUsageRecipes(enforceAuthenticCuisineRecipeSet(enforceHardRequestRecipes(
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
            ), {
            availableIngredients: scoringIngredients,
            preferredCuisine: parsed.data.preferredCuisine,
            recipeLanguage,
            recipeCount
          }), scoringIngredients),
          recipeCount
          ),
          {
            availableIngredients,
            calorieTarget: parsed.data.calorieTarget ?? 2000,
            ingredients,
            allergens: parsed.data.allergens ?? [],
            preferredCuisine: parsed.data.preferredCuisine ?? "Any",
            recipeCount,
            scoringIngredients,
            diets: parsed.data.diets ?? [],
            conditions: parsed.data.conditions ?? []
          }
        );

      const guarded = repairScanRecipesWithGuard(finalized, {
        allergens: parsed.data.allergens ?? [],
        calorieTarget: parsed.data.calorieTarget ?? 2000,
        conditions: parsed.data.conditions ?? [],
        diets: parsed.data.diets ?? [],
        inputIngredients: ingredients,
        preferredCuisine: parsed.data.preferredCuisine ?? "Any",
        recipeCount,
        recipeLanguage,
        scoringIngredients
      });

      return prepareRecipes(guarded);
    };
    const deliverRecipes = (recipes: Recipe[]) =>
      hasGeneratedImageAccess ? stripPremiumDeliveredImages(recipes) : recipes;

    if (USE_MOCK && accessCheck.allowed) {
      const nextAccess = await consumeFreeAiCredit(requestAccess, "recipe_generation");
      const exactScanMatch = parsed.data.referenceImage
        ? buildMockExactScanRecipe(availableIngredients)
        : null;
      const strictRecipes = rankStrictRecipes(
        enforceDietOnRecipes(
          applyStrictIngredientOwnership(MOCK_RECIPES.recipes, availableIngredients, {
            preferredCuisine: parsed.data.preferredCuisine,
            diets: parsed.data.diets,
            conditions: parsed.data.conditions,
            allergens: parsed.data.allergens
          }),
          "mock"
        ),
        { ...parsed.data, ingredients: scoringIngredients, recipeCount }
      );
      const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
        allowProviderLookup: !hasGeneratedImageAccess
      });
      const finalRecipes = deliverRecipes(finalizeRecipes(
        mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
      ));
      await queueRecipeCachePersist({
        uid: requestAccess.uid,
        recipeLanguage,
        recipes: finalRecipes,
        dietContext
      });
      await persistRecipeGenerationHistoryEntry({
        historyEntryId,
        recipes: finalRecipes,
        status: "completed",
        uid: requestAccess.uid
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

    const catalogSearchLimit = Math.max(recipeCount, Math.min(MAX_SHARED_POOL_RECIPE_RESULT_COUNT * 3, recipeCount * 3));
    const searchResult = await searchCatalogRecipes({
      ingredients,
      preferredCuisine: parsed.data.preferredCuisine,
      calorieTarget: parsed.data.calorieTarget,
      diets: parsed.data.diets,
      conditions: parsed.data.conditions,
      allergens: parsed.data.allergens,
      maxResults: catalogSearchLimit,
      recipeLanguage,
      uid: requestAccess.uid
    });

    // Free-tier users are served from the curated catalog / shared recipe
    // pool exclusively. Gemini is only used for premium and admin callers.
    // Credit-exhausted users (any tier) also fall through here.
    if (!accessCheck.allowed || isFreeTier) {
      const reasonKind = !accessCheck.allowed ? "credits_used_shared_pool" : "free_plan_shared_pool";
      logger.info("Recipe generation served from shared recipe pool", {
        reason: reasonKind,
        accessReason: accessCheck.reason,
        recipeCount: searchResult.recipes.length,
        isFreeTier
      });
      const strictRecipes = rankStrictRecipes(
        enforceDietOnRecipes(
          applyStrictIngredientOwnership(searchResult.recipes, availableIngredients, {
            preferredCuisine: parsed.data.preferredCuisine,
            diets: parsed.data.diets,
            conditions: parsed.data.conditions,
            allergens: parsed.data.allergens
          }),
          "catalog_free_tier"
        ),
        { ...parsed.data, ingredients: scoringIngredients, recipeCount }
      );
      const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
        allowProviderLookup: !hasGeneratedImageAccess
      });
      const finalRecipes = deliverRecipes(finalizeRecipes(
        mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
      ));
      await queueRecipeCachePersist({
        uid: requestAccess.uid,
        recipeLanguage,
        recipes: finalRecipes,
        dietContext
      });
      await persistRecipeGenerationHistoryEntry({
        historyEntryId,
        recipes: finalRecipes,
        status: "completed",
        uid: requestAccess.uid
      });
      logger.info("Recipe generation request completed", {
        ...aiTraceSummary,
        servedFrom: searchResult.servedFrom,
        recipeCountReturned: finalRecipes.length,
        isFreeTier
      });
      return Response.json({
        result: JSON.stringify(finalRecipes),
        servedFrom: searchResult.servedFrom,
        canLoadMore: searchResult.canLoadMore,
        fallbackNotice: buildRecipeFallbackNotice(reasonKind, recipeLanguage),
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
              name: wantsArabic ? ingredient.raw : ingredient.normalized,
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
              candidateDishHints,
              canonicalDishHint
            }
          )
        : buildPromptOnlyRecipeGenerationPrompt(parsed.data.prompt ?? "", recipeLanguage, recipeCount);
      const text = await generateRecipesWithTransientRetry(prompt, (attempt) =>
        traceTextCall(attempt === 1 ? "primary_generation" : `primary_generation_retry_${attempt}`)
      );
      const recipes = parseAiJsonPayload(text, "recipe_generation");
      const normalizedRecipes = recipes.recipes ?? recipes;
      if (Array.isArray(normalizedRecipes) && normalizedRecipes.length) {
        const primaryOwnedRecipes = enforceAnyCuisineDiversity(
          rejectNearDuplicateAiRecipes(
            enforceDietOnRecipes(
              applyStrictIngredientOwnership(normalizedRecipes, availableIngredients, {
                preferredCuisine: parsed.data.preferredCuisine,
                diets: parsed.data.diets,
                conditions: parsed.data.conditions,
                allergens: parsed.data.allergens
              }),
              "ai_primary"
            ),
            requestId,
            "ai_primary"
          ),
          parsed.data.preferredCuisine,
          recipeCount,
          requestId
        );
        let strictRecipes = rankStrictRecipes(primaryOwnedRecipes, { ...parsed.data, ingredients: scoringIngredients, recipeCount })
          .slice(0, recipeCount);
        logRecipeRankingSnapshot("gemini_primary_after_strict_ranking", primaryOwnedRecipes, strictRecipes, {
          requestId,
          recipeCount,
          rankingOptions: { ...parsed.data, ingredients: scoringIngredients, recipeCount },
          sourceCount: normalizedRecipes.length
        });

        const hasPantryBalancedRecipe = strictRecipes.some((recipe) => isPantryBalancedRecipe(recipe));
        const uniqueRecipeCount = new Set(strictRecipes.map(getRecipeDuplicateCardKey).filter(Boolean)).size;
        const minimumUniqueRecipes = Math.min(recipeCount, recipeCount >= 8 ? 7 : recipeCount);
        const missingRecipeCount = Math.max(
          0,
          recipeCount - strictRecipes.length,
          minimumUniqueRecipes - uniqueRecipeCount,
          ingredients.length > 0 && !hasPantryBalancedRecipe ? 1 : 0
        );
        const shouldRunRepairPass =
          missingRecipeCount > 0 &&
          (strictRecipes.length < recipeCount || uniqueRecipeCount < minimumUniqueRecipes || !hasPantryBalancedRecipe);

        if (shouldRunRepairPass) {
          aiTraceSummary.repairPassTriggered = true;
          const repairRecipeCount = Math.min(recipeCount, Math.max(1, missingRecipeCount));
          logger.info("Retrying scanner recipe generation with strict pantry-balance repair prompt", {
            ingredientCount: ingredients.length,
            recipeCount,
            repairRecipeCount,
            selectedCount: strictRecipes.length,
            uniqueRecipeCount
          });

          const retryText = await generateRecipesWithTransientRetry(
            buildScannerPantryBalanceRetryPrompt(prompt, repairRecipeCount),
            (attempt) => traceTextCall(attempt === 1 ? "repair_generation" : `repair_generation_retry_${attempt}`)
          );
          const retryRecipes = parseAiJsonPayload(retryText, "recipe_generation");
          const retryNormalizedRecipes = retryRecipes.recipes ?? retryRecipes;

          if (Array.isArray(retryNormalizedRecipes) && retryNormalizedRecipes.length) {
            const repairOwnedRecipes = enforceAnyCuisineDiversity(
              rejectNearDuplicateAiRecipes(
                enforceDietOnRecipes(
                  applyStrictIngredientOwnership(retryNormalizedRecipes, availableIngredients, {
                    preferredCuisine: parsed.data.preferredCuisine,
                    diets: parsed.data.diets,
                    conditions: parsed.data.conditions,
                    allergens: parsed.data.allergens
                  }),
                  "ai_repair"
                ),
                requestId,
                "ai_repair"
              ),
              parsed.data.preferredCuisine,
              recipeCount,
              requestId
            );
            const repairRecipes = rankStrictRecipes(repairOwnedRecipes, { ...parsed.data, ingredients: scoringIngredients, recipeCount })
              .slice(0, recipeCount);
            logRecipeRankingSnapshot("gemini_repair_after_strict_ranking", repairOwnedRecipes, repairRecipes, {
              requestId,
              recipeCount,
              rankingOptions: { ...parsed.data, ingredients: scoringIngredients, recipeCount },
              sourceCount: retryNormalizedRecipes.length
            });
            strictRecipes = mergeRecipeResults(null, [...repairRecipes, ...strictRecipes], false, recipeCount);
          }
        }
        const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
          allowProviderLookup: !hasGeneratedImageAccess
        });
        const finalRecipes = deliverRecipes(finalizeRecipes(
          mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
        ));
        await queueRecipeCachePersist({
          uid: requestAccess.uid,
          recipeLanguage,
          recipes: finalRecipes,
          dietContext
        });
        await persistRecipeGenerationHistoryEntry({
          historyEntryId,
          recipes: finalRecipes,
          status: "completed",
          uid: requestAccess.uid
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
      enforceDietOnRecipes(
        applyStrictIngredientOwnership(searchResult.recipes, availableIngredients, {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens
        }),
        "ai_failed_fallback"
      ),
      { ...parsed.data, ingredients: scoringIngredients, recipeCount }
    );
    const photoFirstRecipes = await applyImageFirstRecipeRanking(strictRecipes, ingredients.length, {
      allowProviderLookup: !hasGeneratedImageAccess
    });
    const finalRecipes = deliverRecipes(finalizeRecipes(
      mergeRecipeResults(exactScanMatch, photoFirstRecipes, shouldLabelSimilarRecipes, recipeCount)
    ));
    await queueRecipeCachePersist({
      uid: requestAccess.uid,
      recipeLanguage,
      recipes: finalRecipes,
      dietContext
    });
    await persistRecipeGenerationHistoryEntry({
      historyEntryId,
      recipes: finalRecipes,
      status: "completed",
      uid: requestAccess.uid
    });
    logger.info("Recipe generation request completed", {
      ...aiTraceSummary,
      servedFrom: "shared_pool",
      recipeCountReturned: finalRecipes.length
    });
    const fallbackNotice =
      offlineFallbackKind === "ai_busy_shared_pool" && finalRecipes.length
        ? undefined
        : buildRecipeFallbackNotice(offlineFallbackKind, recipeLanguage);
    return Response.json({
      result: JSON.stringify(finalRecipes),
      servedFrom: "shared_pool",
      canLoadMore: searchResult.canLoadMore,
      fallbackNotice,
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
    await persistRecipeGenerationHistoryEntry({
      errorMessage: safeMessage,
      historyEntryId,
      recipes: [],
      status: "failed",
      uid: historyUid
    });
    return Response.json(
      { error: safeMessage },
      { status }
    );
  }
}

async function persistRecipeGenerationHistoryEntry(input: {
  errorMessage?: string;
  historyEntryId?: string;
  recipes: Recipe[];
  status: "completed" | "failed";
  uid?: string;
}) {
  if (!input.uid || !input.historyEntryId) return;

  try {
    const now = new Date().toISOString();
    await getAdminDb()
      .doc(`users/${input.uid}/history/${input.historyEntryId}`)
      .set(
        stripUndefinedDeep({
          completedAt: input.status === "completed" ? now : undefined,
          generationMessage: input.errorMessage,
          generationStatus: input.status,
          recipes: input.status === "completed" ? input.recipes : undefined,
          updatedAt: FieldValue.serverTimestamp()
        }),
        { merge: true }
      );
  } catch (error) {
    logger.warn("Recipe generation history persistence failed", {
      historyEntryId: input.historyEntryId,
      status: input.status,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }

  return value;
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

function ensureRecipePhotoIdentity(recipe: Recipe): Recipe {
  const existing = normalizePhotoIdentity(recipe.photo_identity);
  if (existing) return { ...recipe, photo_identity: existing };

  const source =
    recipe.image_search_index?.trim() ||
    recipe.image_search_indices?.[0]?.trim() ||
    recipe.dish_intent?.dish_name?.trim() ||
    recipe.localized?.English?.name?.trim() ||
    recipe.name?.trim();
  if (!source) return recipe;

  const identity = buildRecipePhotoIdentity(source);
  const synthesized = normalizePhotoIdentity({
    dish_slug: identity.canonicalDishKey ?? identity.familyKey ?? toIdentityKey(source) ?? "recipe-photo",
    english_name: identity.cleanQuery || source,
    cuisine_key: identity.cuisineKey ?? toIdentityKey(recipe.cuisine),
    protein: identity.mainIngredientKey,
    starch: identity.starchKey,
    sauce: identity.sauceKey,
    method: identity.cookingMethodKey
  });

  return synthesized ? { ...recipe, photo_identity: synthesized } : recipe;
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
    const key = getRecipeDuplicateCardKey(recipe);
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

function ensureRequestedRecipeCount(
  recipes: Recipe[],
  context: {
    availableIngredients: Set<string>;
    allergens: string[];
    calorieTarget: number;
    conditions: string[];
    diets: string[];
    ingredients: string[];
    preferredCuisine: string;
    recipeCount: number;
    scoringIngredients: string[];
  }
) {
  const fillers = buildSparseIngredientRecipeFillers(context);
  if (recipes.length >= context.recipeCount) {
    return shouldBlendSparseFillerVariety(recipes, context)
      ? blendSparseFillerVariety(recipes, fillers, context.recipeCount)
      : recipes.slice(0, context.recipeCount);
  }

  const merged = [...recipes];
  const seen = new Set(merged.map(getRecipeSelectionKey));
  for (const filler of fillers) {
    if (merged.length >= context.recipeCount) break;
    const key = getRecipeSelectionKey(filler);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(filler);
  }

  logger.info("Recipe generation sparse-input fill applied", {
    addedCount: Math.max(0, merged.length - recipes.length),
    inputCount: context.ingredients.length,
    requestedCount: context.recipeCount,
    returnedCount: merged.length
  });

  return merged.slice(0, context.recipeCount);
}

function shouldBlendSparseFillerVariety(
  recipes: Recipe[],
  context: {
    conditions: string[];
    diets: string[];
    ingredients: string[];
    preferredCuisine: string;
    scoringIngredients: string[];
  }
) {
  if (context.ingredients.length > 2) return false;

  const source = `${context.ingredients.join(" ")} ${context.scoringIngredients.join(" ")}`.toLowerCase();
  if (!isSparseGroundMeatSource(source) && !/\b(liver|kebda|kibda|ciger|cigeri)\b|كبدة|كبده/iu.test(source)) {
    return false;
  }

  const cuisineCount = new Set(recipes.map((recipe) => normalizeCuisinePreference(recipe.cuisine))).size;
  const familyCount = new Set(recipes.map(getRecipeVarietyFamilyKey).filter(Boolean)).size;
  const imageIdentityCount = new Set(recipes.map(getRecipeImageIdentityKey).filter(Boolean)).size;
  const dietMode = Boolean(context.diets.length || context.conditions.length);
  const anyCuisine = normalizeCuisinePreference(context.preferredCuisine) === "any";

  return (
    dietMode ||
    imageIdentityCount < Math.min(6, recipes.length) ||
    (anyCuisine && (cuisineCount < 3 || familyCount < Math.min(6, recipes.length)))
  );
}

function blendSparseFillerVariety(recipes: Recipe[], fillers: Recipe[], recipeCount: number) {
  const blended: Recipe[] = [];
  const seen = new Set<string>();
  const seenFamilies = new Set<string>();
  const seenCuisines = new Set<string>();
  const seenImageIdentities = new Set<string>();

  const add = (recipe: Recipe, force = false) => {
    if (blended.length >= recipeCount) return false;
    const key = getRecipeSelectionKey(recipe);
    if (!key || seen.has(key)) return false;
    const familyKey = getRecipeVarietyFamilyKey(recipe);
    const cuisineKey = normalizeCuisinePreference(recipe.cuisine);
    const imageIdentityKey = getRecipeImageIdentityKey(recipe);

    if (!force && familyKey && seenFamilies.has(familyKey) && blended.length + 1 < recipeCount) return false;
    if (!force && imageIdentityKey && seenImageIdentities.has(imageIdentityKey) && blended.length + 1 < recipeCount) return false;
    seen.add(key);
    if (familyKey) seenFamilies.add(familyKey);
    if (cuisineKey) seenCuisines.add(cuisineKey);
    if (imageIdentityKey) seenImageIdentities.add(imageIdentityKey);
    blended.push(recipe);
    return true;
  };

  for (const recipe of recipes.slice(0, 4)) {
    add(recipe);
  }

  if (blended.length < Math.min(2, recipeCount)) {
    for (const recipe of recipes.slice(0, 2)) {
      add(recipe, true);
    }
  }

  for (const filler of fillers) {
    const cuisineKey = normalizeCuisinePreference(filler.cuisine);
    if (seenCuisines.has(cuisineKey) && blended.length + 3 < recipeCount) continue;
    add(filler);
  }

  for (const filler of fillers) {
    add(filler);
  }

  for (const recipe of recipes) {
    add(recipe, true);
  }

  return blended.slice(0, recipeCount);
}

function buildSparseIngredientRecipeFillers(context: {
  availableIngredients: Set<string>;
  allergens: string[];
  calorieTarget: number;
  conditions: string[];
  diets: string[];
  ingredients: string[];
  preferredCuisine: string;
  recipeCount: number;
  scoringIngredients: string[];
}) {
  const source = `${context.ingredients.join(" ")} ${context.scoringIngredients.join(" ")}`.toLowerCase();
  const primaryIngredient = choosePrimarySparseIngredient(context.ingredients, context.scoringIngredients);
  const targetCalories = Math.max(320, Math.round(context.calorieTarget / 3));

  if (isSparseGroundMeatSource(source)) {
    return buildGroundMeatSparseFillers(primaryIngredient, context, targetCalories);
  }

  if (/\b(liver|kebda|kibda|ciger|cigeri)\b|كبدة|كبده/iu.test(source)) {
    return buildLiverSparseFillers(primaryIngredient, context, targetCalories);
  }

  return buildGenericSparseFillers(primaryIngredient, context, targetCalories);
}

function choosePrimarySparseIngredient(rawIngredients: string[], scoringIngredients: string[]) {
  return rawIngredients.find(Boolean) ?? scoringIngredients.find(Boolean) ?? "main ingredient";
}

function buildGroundMeatSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[]; preferredCuisine: string },
  targetCalories: number
) {
  const preferred = normalizeCuisinePreference(context.preferredCuisine);
  const source = `${primaryIngredient} ${context.preferredCuisine}`.toLowerCase();
  const prefersEgyptianFirst = preferred === "egyptian" || isArabicGroundMeatSource(source);
  const all = [
    makeSparseFillerRecipe({
      calories: targetCalories + 30,
      carbs: "18g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "kofta mashwia",
      excludeKeywords: ["burger", "steak", "beef cubes", "meatballs in sauce", "pasta"],
      fat: "22g",
      fiber: "3g",
      imageSearchIndices: ["egyptian kofta mashwia", "kofta kebab egyptian", "grilled kofta platter"],
      ingredients: [primaryIngredient],
      missingIngredients: ["onion", "parsley", "garlic", "cumin", "flatbread"],
      name: "Egyptian Kofta Mashwia",
      protein: "34g",
      sodium: "640mg",
      sugar: "4g",
      visualKeywords: ["charred minced meat skewers", "kofta logs", "grill marks"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 20,
      carbs: "24g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "dawood basha",
      excludeKeywords: ["grilled kofta", "kebab skewers", "burger", "steak", "pasta"],
      fat: "20g",
      fiber: "4g",
      imageSearchIndices: ["dawood basha", "egyptian meatballs tomato sauce", "kofta dawood basha"],
      ingredients: [primaryIngredient],
      missingIngredients: ["onion", "tomato sauce", "garlic", "cumin", "rice"],
      name: "Dawood Basha Meatballs",
      protein: "32g",
      sodium: "690mg",
      sugar: "7g",
      visualKeywords: ["small meatballs", "red tomato sauce", "egyptian dawood basha"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 85,
      carbs: "50g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "macarona bechamel",
      excludeKeywords: ["red sauce pasta", "spaghetti bowl", "lasagna sheets", "grilled kofta", "rice"],
      fat: "23g",
      fiber: "4g",
      imageSearchIndices: ["macarona bechamel egyptian", "egyptian bechamel pasta", "baked macarona bechamel"],
      ingredients: [primaryIngredient],
      missingIngredients: ["penne pasta", "milk", "flour", "butter", "onion"],
      name: "Egyptian Macarona Bechamel",
      protein: "31g",
      sodium: "720mg",
      sugar: "8g",
      visualKeywords: ["baked pasta square", "white bechamel top", "minced meat layer"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 45,
      carbs: "32g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "taagen kofta",
      excludeKeywords: ["burger", "steak", "pasta", "loose mince", "plain grilled skewers"],
      fat: "21g",
      fiber: "5g",
      imageSearchIndices: ["egyptian kofta tagine", "taagen kofta potatoes", "kofta potato tray"],
      ingredients: [primaryIngredient],
      missingIngredients: ["potatoes", "tomato sauce", "onion", "garlic", "green pepper"],
      name: "Egyptian Taagen Kofta With Potatoes",
      protein: "33g",
      sodium: "710mg",
      sugar: "7g",
      visualKeywords: ["baked kofta tray", "potato slices", "red tomato sauce"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 60,
      carbs: "44g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "egyptian rice kofta",
      excludeKeywords: ["grilled skewers", "burger", "steak", "plain rice", "pasta"],
      fat: "18g",
      fiber: "4g",
      imageSearchIndices: ["egyptian rice kofta", "koftet roz", "rice kofta tomato sauce"],
      ingredients: [primaryIngredient],
      missingIngredients: ["rice", "parsley", "dill", "cilantro", "tomato sauce"],
      name: "Egyptian Rice Kofta",
      protein: "30g",
      sodium: "720mg",
      sugar: "7g",
      visualKeywords: ["fried kofta fingers", "red tomato sauce", "egyptian koftet roz"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 80,
      carbs: "46g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "hawawshi",
      excludeKeywords: ["burger bun", "open sandwich", "pizza", "loose meat", "pasta"],
      fat: "20g",
      fiber: "4g",
      imageSearchIndices: ["hawawshi egyptian", "egyptian meat stuffed bread", "hawawshi pita"],
      ingredients: [primaryIngredient],
      missingIngredients: ["baladi bread", "onion", "green pepper", "parsley", "cumin"],
      name: "Egyptian Hawawshi",
      protein: "32g",
      sodium: "670mg",
      sugar: "5g",
      visualKeywords: ["crispy stuffed bread", "meat visible at cut edge", "flat pita wedges"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 40,
      carbs: "42g",
      cuisine: "American",
      difficulty: "Easy",
      dishName: "one-pan ground beef penne",
      excludeKeywords: ["steak", "beef cubes", "meatballs", "burger", "plain pasta"],
      fat: "18g",
      fiber: "5g",
      imageSearchIndices: ["ground beef penne", "beef tomato penne", "one pan beef penne"],
      ingredients: [primaryIngredient],
      missingIngredients: ["penne pasta", "tomato sauce", "onion", "garlic", "olive oil"],
      name: "One-Pan Ground Beef Penne",
      protein: "31g",
      sodium: "720mg",
      sugar: "8g",
      visualKeywords: ["penne tubes", "red tomato meat sauce", "crumbled ground beef"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 20,
      carbs: "38g",
      cuisine: "American",
      difficulty: "Easy",
      dishName: "ground beef pasta skillet",
      excludeKeywords: ["steak", "beef strips", "meatballs", "white sauce", "rice"],
      fat: "17g",
      fiber: "4g",
      imageSearchIndices: ["ground beef pasta", "beef macaroni skillet", "hamburger pasta"],
      ingredients: [primaryIngredient],
      missingIngredients: ["elbow macaroni", "tomato sauce", "zucchini", "bell pepper", "mozzarella"],
      name: "Ground Beef Pasta Skillet",
      protein: "30g",
      sodium: "690mg",
      sugar: "7g",
      visualKeywords: ["short pasta", "red sauce", "crumbled ground beef"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories,
      carbs: "34g",
      cuisine: "American",
      difficulty: "Easy",
      dishName: "hamburger stew",
      excludeKeywords: ["beef cubes", "steak", "meatballs", "pasta", "chili"],
      fat: "16g",
      fiber: "6g",
      imageSearchIndices: ["hamburger stew", "ground beef vegetable stew", "hamburger soup potatoes carrots"],
      ingredients: [primaryIngredient],
      missingIngredients: ["potatoes", "carrots", "celery", "onion", "diced tomatoes"],
      name: "Hamburger Stew",
      protein: "29g",
      sodium: "760mg",
      sugar: "9g",
      visualKeywords: ["chunky tomato broth", "crumbled ground beef", "potatoes and carrots"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 70,
      carbs: "48g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "kiymali pide",
      excludeKeywords: ["round lahmacun", "pizza", "burger", "pasta", "rice"],
      fat: "19g",
      fiber: "4g",
      imageSearchIndices: ["kiymali pide", "turkish beef pide", "turkish minced meat pide"],
      ingredients: [primaryIngredient],
      missingIngredients: ["pide dough", "onion", "tomato", "green pepper", "parsley"],
      name: "Turkish Kiymali Pide",
      protein: "33g",
      sodium: "710mg",
      sugar: "6g",
      visualKeywords: ["boat-shaped flatbread", "folded raised edges", "minced meat topping"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 45,
      carbs: "42g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "lahmacun",
      excludeKeywords: ["pizza cheese", "boat-shaped pide", "burger", "pasta", "rice"],
      fat: "17g",
      fiber: "4g",
      imageSearchIndices: ["lahmacun", "turkish lahmacun", "thin meat flatbread"],
      ingredients: [primaryIngredient],
      missingIngredients: ["flatbread dough", "tomato", "green pepper", "onion", "parsley"],
      name: "Turkish Lahmacun",
      protein: "29g",
      sodium: "680mg",
      sugar: "6g",
      visualKeywords: ["thin round flatbread", "finely minced meat", "edge-to-edge topping"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 20,
      carbs: "24g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "karniyarik",
      excludeKeywords: ["eggplant dip", "layered casserole", "pasta", "burger", "rice bowl"],
      fat: "21g",
      fiber: "7g",
      imageSearchIndices: ["karniyarik", "turkish stuffed eggplant", "eggplant ground beef"],
      ingredients: [primaryIngredient],
      missingIngredients: ["eggplant", "tomato", "green pepper", "onion", "parsley"],
      name: "Turkish Karniyarik",
      protein: "30g",
      sodium: "650mg",
      sugar: "9g",
      visualKeywords: ["split stuffed eggplant", "minced meat filling", "tomato pepper topping"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 95,
      carbs: "50g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "turkish spiral borek",
      excludeKeywords: ["flatbread", "pide", "lahmacun", "burger", "pasta"],
      fat: "24g",
      fiber: "3g",
      imageSearchIndices: ["turkish spiral borek", "ground beef borek", "kol boregi"],
      ingredients: [primaryIngredient],
      missingIngredients: ["phyllo pastry", "onion", "parsley", "paprika", "yogurt"],
      name: "Turkish Spiral Borek",
      protein: "28g",
      sodium: "740mg",
      sugar: "4g",
      visualKeywords: ["golden coiled pastry", "spiral borek", "spiced ground beef filling"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 50,
      carbs: "28g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "turkish musakka",
      excludeKeywords: ["stuffed whole eggplant", "eggplant dip", "pasta", "rice", "burger"],
      fat: "22g",
      fiber: "7g",
      imageSearchIndices: ["turkish musakka", "turkish eggplant beef casserole", "eggplant beef moussaka"],
      ingredients: [primaryIngredient],
      missingIngredients: ["eggplant", "tomato sauce", "green pepper", "onion", "mozzarella"],
      name: "Turkish Musakka",
      protein: "31g",
      sodium: "700mg",
      sugar: "8g",
      visualKeywords: ["layered eggplant casserole", "crumbled beef", "tomato sauce"]
    }, context)
  ];

  return prefersEgyptianFirst ? orderSparseFillersByCuisine(all, "egyptian") : orderSparseFillersByCuisine(all, preferred);
}

function buildLiverSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[]; preferredCuisine: string },
  targetCalories: number
) {
  const preferred = normalizeCuisinePreference(context.preferredCuisine);
  const all = [
    makeSparseFillerRecipe({
      calories: targetCalories,
      carbs: "16g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "alexandrian liver",
      excludeKeywords: ["beef steak", "beef cubes", "kofta", "meatballs", "pasta"],
      fat: "18g",
      fiber: "3g",
      imageSearchIndices: ["kebda eskandarani", "alexandrian liver", "egyptian liver sandwich filling"],
      ingredients: [primaryIngredient],
      missingIngredients: ["onion", "garlic", "green pepper", "lemon", "cumin"],
      name: "Alexandrian Kebda",
      protein: "34g",
      sodium: "620mg",
      sugar: "4g",
      visualKeywords: ["sliced liver", "green pepper", "dark glossy kebda"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 30,
      carbs: "34g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "egyptian liver sandwiches",
      excludeKeywords: ["burger", "steak sandwich", "kofta", "pasta", "rice bowl"],
      fat: "17g",
      fiber: "4g",
      imageSearchIndices: ["egyptian liver sandwiches", "kebda sandwich", "chopped liver sandwich"],
      ingredients: [primaryIngredient],
      missingIngredients: ["bread", "onion", "pepper", "garlic", "tahini"],
      name: "Egyptian Kebda Sandwiches",
      protein: "32g",
      sodium: "690mg",
      sugar: "5g",
      visualKeywords: ["chopped liver filling", "bread", "peppers and onion"]
    }, context)
  ];

  return orderSparseFillersByCuisine(all, preferred);
}

function buildGenericSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[]; preferredCuisine: string },
  targetCalories: number
) {
  return [
    makeSparseFillerRecipe({
      calories: targetCalories,
      carbs: "30g",
      cuisine: context.preferredCuisine === "Any" ? "American" : context.preferredCuisine,
      difficulty: "Easy",
      dishName: `${primaryIngredient} skillet`,
      excludeKeywords: ["wrong protein", "dessert", "unrelated side dish"],
      fat: "16g",
      fiber: "4g",
      imageSearchIndices: [`${primaryIngredient} skillet`, `${primaryIngredient} recipe`, `${primaryIngredient} dinner`],
      ingredients: [primaryIngredient],
      missingIngredients: ["onion", "garlic", "tomato", "olive oil"],
      name: `${toTitleCase(primaryIngredient)} Skillet`,
      protein: "24g",
      sodium: "600mg",
      sugar: "5g",
      visualKeywords: [primaryIngredient, "skillet meal", "simple plated dish"]
    }, context)
  ];
}

interface SparseFillerRecipeInput {
  calories: number;
  carbs: string;
  cuisine: string;
  difficulty: string;
  dishName: string;
  excludeKeywords: string[];
  fat: string;
  fiber: string;
  imageSearchIndices: string[];
  ingredients: string[];
  missingIngredients: string[];
  name: string;
  protein: string;
  sodium: string;
  sugar: string;
  visualKeywords: string[];
}

function makeSparseFillerRecipe(input: SparseFillerRecipeInput, context: { allergens?: string[]; availableIngredients: Set<string>; conditions?: string[]; diets?: string[] }): Recipe {
  const adapted = adaptSparseFillerForDiet(input, context);
  const owned = dedupeIngredients(input.ingredients).map(getRecipeIngredientLabel);
  const missing = dedupeIngredients(adapted.missingIngredients)
    .map(getRecipeIngredientLabel)
    .filter((ingredient) => !isIngredientAvailable(ingredient, context.availableIngredients));

  return enrichRecipeWithDishIntent({
    name: adapted.name,
    cuisine: input.cuisine,
    dish_intent: {
      dish_name: input.dishName,
      cuisine: input.cuisine,
      meal_type: "dinner",
      diet_type: adapted.dietType,
      cooking_method: "home cooking",
      visual_keywords: adapted.visualKeywords,
      exclude_keywords: adapted.excludeKeywords
    },
    image_search_index: input.imageSearchIndices[0],
    image_search_indices: input.imageSearchIndices,
    ingredients: owned,
    missing_ingredients: missing,
    steps: [],
    calories: adapted.calories,
    protein: input.protein,
    carbs: adapted.carbs,
    fat: input.fat,
    fiber: input.fiber,
    sugar: input.sugar,
    sodium: input.sodium,
    cook_time: input.difficulty === "Easy" ? "30 mins" : "45 mins",
    difficulty: input.difficulty,
    preference_hits: adapted.preferenceHits
  }, {
    availableIngredients: [...owned, ...missing],
    preferredCuisine: input.cuisine
  });
}

function adaptSparseFillerForDiet(
  input: SparseFillerRecipeInput,
  context: { allergens?: string[]; conditions?: string[]; diets?: string[] }
) {
  const dietText = [...(context.diets ?? []), ...(context.conditions ?? []), ...(context.allergens ?? [])]
    .join(" ")
    .toLowerCase();
  const wantsLowCarb = /\b(keto|low carb|diabetes|diabetic|blood sugar)\b/.test(dietText);
  const wantsGlutenFree = /\b(gluten|celiac|coeliac)\b/.test(dietText);
  const wantsDairyFree = /\b(dairy|lactose)\b/.test(dietText);
  const wantsLowSodium = /\b(low sodium|hypertension|blood pressure|heart)\b/.test(dietText);
  const wantsHighProtein = /\b(high protein|muscle|protein)\b/.test(dietText);
  const activeLabels = [
    wantsLowCarb ? "low carb" : "",
    wantsGlutenFree ? "gluten free" : "",
    wantsDairyFree ? "dairy free" : "",
    wantsLowSodium ? "low sodium" : "",
    wantsHighProtein ? "high protein" : ""
  ].filter(Boolean);

  let missingIngredients = [...input.missingIngredients];
  let carbs = input.carbs;
  let calories = input.calories;
  const visualKeywords = [...input.visualKeywords];
  const excludeKeywords = [...input.excludeKeywords];
  const preferenceHits = ["Sparse pantry fill: centers the entered ingredient and lists authentic support items as missing."];

  if (wantsLowCarb) {
    missingIngredients = missingIngredients.map((ingredient) =>
      /\b(penne|pasta|macaroni|spaghetti|rice|bread|pita|flatbread|dough|phyllo|filo|yufka|potato|potatoes)\b/i.test(ingredient)
        ? "zucchini, eggplant, or cauliflower"
        : ingredient
    );
    carbs = "14g";
    calories = Math.max(300, calories - 70);
    visualKeywords.push("low-carb vegetable base");
    excludeKeywords.push("large bread portion", "large pasta portion", "rice bed");
    preferenceHits.push("Adjusted for low-carb or blood-sugar-friendly needs.");
  }

  if (wantsGlutenFree) {
    missingIngredients = missingIngredients.map((ingredient) =>
      /\b(penne|pasta|macaroni|spaghetti|bread|pita|flatbread|dough|phyllo|filo|yufka)\b/i.test(ingredient)
        ? `gluten-free ${ingredient}`
        : ingredient
    );
    excludeKeywords.push("wheat bread", "regular pasta");
    preferenceHits.push("Uses gluten-free starch or pastry substitutions where needed.");
  }

  if (wantsDairyFree) {
    missingIngredients = missingIngredients.filter((ingredient) => !/\b(mozzarella|cheese|yogurt|butter|milk|cream)\b/i.test(ingredient));
    missingIngredients.push("olive oil");
    excludeKeywords.push("cheese", "cream sauce", "yogurt topping");
    preferenceHits.push("Removes dairy-based support ingredients.");
  }

  if (wantsLowSodium) {
    missingIngredients = missingIngredients.filter((ingredient) => !/\bsalt\b/i.test(ingredient));
    missingIngredients.push("lemon", "fresh herbs");
    preferenceHits.push("Uses herbs and citrus for a lower-sodium seasoning profile.");
  }

  if (wantsHighProtein) {
    preferenceHits.push("Keeps the entered protein as the center of the plate.");
  }

  return {
    ...input,
    calories,
    carbs,
    dietType: activeLabels.join(", ") || "standard",
    excludeKeywords: Array.from(new Set(excludeKeywords)),
    missingIngredients: Array.from(new Set(missingIngredients)),
    name: activeLabels.length ? `${input.name} (${toTitleCase(activeLabels.join(" "))})` : input.name,
    preferenceHits,
    visualKeywords: Array.from(new Set(visualKeywords))
  };
}

function orderSparseFillersByCuisine(recipes: Recipe[], preferredCuisine: string) {
  if (preferredCuisine === "any") return recipes;
  return [...recipes].sort((left, right) => {
    const leftMatches = normalizeCuisinePreference(left.cuisine) === preferredCuisine ? 1 : 0;
    const rightMatches = normalizeCuisinePreference(right.cuisine) === preferredCuisine ? 1 : 0;
    return rightMatches - leftMatches;
  });
}

function normalizeCuisinePreference(value?: string) {
  return (value || "Any").toLowerCase().replace(/[^a-z]/g, "") || "any";
}

function isSparseGroundMeatSource(source: string) {
  return /\b(ground|minced|mince)\s+(beef|meat|lamb|veal|protein)\b|\b(beef|meat|lamb|veal)\s+(ground|minced|mince)\b|\bground\s+meat\b|\bminced\s+meat\b|(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?|\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?/iu.test(source);
}

function isArabicGroundMeatSource(source: string) {
  return /(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?|\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?/iu.test(source);
}

function toTitleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
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
  const english = normalizeLocalizedRecipeVariant(localized.English ?? localized.english);
  const arabic = normalizeLocalizedRecipeVariant(localized.Arabic ?? localized.arabic);

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

interface RecipeRankingOptions {
  ingredients?: string[];
  preferredCuisine?: string;
  calorieTarget?: number;
  maxMissingIngredients?: number;
  recipeCount?: number;
  diets?: string[];
  conditions?: string[];
}

interface RankedRecipeCandidate {
  familyKey: string;
  index: number;
  isMainlyPantry: boolean;
  isPantryBalanced: boolean;
  missingCount: number;
  ownedCount: number;
  recipe: Recipe;
  score: number;
  structureKey: string;
}

function rankStrictRecipes(recipes: Recipe[], options: RecipeRankingOptions) {
  const limit = clampRecipeCount(options.recipeCount);
  const ranked = buildRankedRecipeCandidates(recipes, options);

  const selected = ranked.reduce(selectStructurallyVariedRankedRecipes(limit), [] as Array<RankedRecipeCandidate>);

  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((item) => getRecipeSelectionKey(item.recipe)));
    for (const candidate of ranked) {
      const key = getRecipeSelectionKey(candidate.recipe);
      if (!key || selectedIds.has(key)) continue;
      selected.push(candidate);
      selectedIds.add(key);
      if (selected.length >= limit) break;
    }
  }

  return selected.map(({ recipe }) => recipe);
}

function buildRankedRecipeCandidates(recipes: Recipe[], options: RecipeRankingOptions): RankedRecipeCandidate[] {
  const targetCaloriesPerMeal = Math.round((options.calorieTarget ?? 2000) / 3);
  const preferredCuisine = options.preferredCuisine && options.preferredCuisine !== "Any"
    ? options.preferredCuisine.toLowerCase()
    : "";

  return recipes
    .map((recipe, index) => {
      const pantryUsage = getRecipePantryUsageStats(recipe, options.ingredients ?? []);
      const familyKey = buildRecipeDishFamilyKey(recipe) || recipe.name.trim().toLowerCase();
      const structureKey = buildRecipeStructureSignature(recipe);
      return {
        familyKey,
        recipe,
        index,
        isMainlyPantry: pantryUsage.isMainlyPantry,
        isPantryBalanced: isPantryBalancedRecipe(recipe, options.ingredients ?? []),
        missingCount: pantryUsage.missingCount,
        ownedCount: pantryUsage.ownedCount,
        structureKey,
        score: scoreStrictRecipe(recipe, {
          targetCaloriesPerMeal,
          preferredCuisine,
          maxMissingIngredients: options.maxMissingIngredients ?? 3,
          hasPreferences: Boolean(options.diets?.length || options.conditions?.length),
          availableIngredients: options.ingredients ?? []
        })
      };
    })
    .sort((left, right) => {
      if (left.isMainlyPantry !== right.isMainlyPantry) {
        return Number(right.isMainlyPantry) - Number(left.isMainlyPantry);
      }
      if (left.ownedCount !== right.ownedCount) {
        return right.ownedCount - left.ownedCount;
      }
      if (Math.abs(left.score - right.score) >= 8) {
        return right.score - left.score;
      }
      if (left.missingCount !== right.missingCount) {
        return left.missingCount - right.missingCount;
      }
      if (left.isPantryBalanced !== right.isPantryBalanced) {
        return Number(right.isPantryBalanced) - Number(left.isPantryBalanced);
      }

      return right.score - left.score || left.index - right.index;
    });
}

function logRecipeRankingSnapshot(
  stage: string,
  candidates: Recipe[],
  selectedRecipes: Recipe[],
  context: {
    rankingOptions: RecipeRankingOptions;
    recipeCount: number;
    requestId: string;
    sourceCount: number;
  }
) {
  const selectedKeys = new Set(selectedRecipes.map(getRecipeSelectionKey));
  const ranked = buildRankedRecipeCandidates(candidates, context.rankingOptions);

  logger.info("Recipe ranking snapshot", {
    requestId: context.requestId,
    stage,
    requestedCount: context.recipeCount,
    sourceCount: context.sourceCount,
    candidateCount: candidates.length,
    selectedCount: selectedRecipes.length,
    ranking: ranked.slice(0, 20).map((entry, index) => ({
      rank: index + 1,
      selected: selectedKeys.has(getRecipeSelectionKey(entry.recipe)),
      score: Math.round(entry.score * 10) / 10,
      ownedCount: entry.ownedCount,
      missingCount: entry.missingCount,
      isMainlyPantry: entry.isMainlyPantry,
      isPantryBalanced: entry.isPantryBalanced,
      name: entry.recipe.name,
      cuisine: entry.recipe.cuisine,
      dishName: entry.recipe.dish_intent?.dish_name,
      imageSearchIndex: entry.recipe.image_search_index,
      familyKey: entry.familyKey,
      structureKey: entry.structureKey
    }))
  });
}

function getRecipeSelectionKey(recipe: Recipe) {
  return getRecipeDuplicateCardKey(recipe);
}

function getRecipeDuplicateCardKey(recipe: Recipe) {
  const familyKey = getRecipeVarietyFamilyKey(recipe);
  const nameKey = normalizeDishRestrictionKey(recipe.name);
  const imageIdentityKey = getRecipeImageIdentityKey(recipe);
  const ingredientKey = getRecipeVarietyIngredientKey(recipe);
  const identityKey = familyKey || imageIdentityKey || nameKey || recipe.id || "";

  return [identityKey, ingredientKey || imageIdentityKey].filter(Boolean).join("::");
}

function clampRecipeCount(value?: number, maxRecipeCount = MAX_SHARED_POOL_RECIPE_RESULT_COUNT) {
  if (!Number.isFinite(value)) return DEFAULT_RECIPE_RESULT_COUNT;
  return Math.min(maxRecipeCount, Math.max(MIN_RECIPE_RESULT_COUNT, Number(value)));
}

function buildRecipeFallbackNotice(
  kind:
    | "credits_used_shared_pool"
    | "ai_unavailable_shared_pool"
    | "ai_busy_shared_pool"
    | "free_plan_shared_pool",
  recipeLanguage: string
) {
  const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
  if (wantsArabic && kind === "ai_busy_shared_pool") {
    return "خدمة توليد الوصفات مشغولة حالياً، لذا عرضنا أفضل الوصفات المطابقة المتاحة الآن.";
  }

  if (!wantsArabic) {
    if (kind === "credits_used_shared_pool") {
      return "Your 10 free recipe generations are used. These recipes are from the shared recipe pool.";
    }

    if (kind === "free_plan_shared_pool") {
      return "Free plan: these recipes come from our curated kitchen library. Upgrade to premium for fresh AI-generated cards.";
    }

    if (kind === "ai_busy_shared_pool") {
      return "AI recipe generation is busy right now, so we showed the best matches from the shared recipe pool.";
    }

    return "AI recipe generation was unavailable, so we used matches from the shared recipe pool.";
  }

  if (kind === "credits_used_shared_pool") {
    return "تم استهلاك 10 طلبات توليد وصفات مجانية. هذه الوصفات من مجموعة الوصفات المشتركة.";
  }

  if (kind === "free_plan_shared_pool") {
    return "الخطة المجانية: هذه الوصفات من مكتبتنا المختارة. ترقّى للبريميوم للحصول على وصفات جديدة توليدية.";
  }

  return "تعذر توليد الوصفات بالذكاء الاصطناعي، لذلك استخدمنا مطابقات من مجموعة الوصفات المشتركة.";
}

async function generateRecipesWithTransientRetry(
  prompt: string,
  traceForAttempt: (attempt: number) => import("@/lib/openai").AiCallTraceOptions
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AI_RECIPE_TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await generateFallbackRecipes(prompt, traceForAttempt(attempt));
    } catch (error) {
      lastError = error;
      if (!isTransientAiOverload(error) || attempt === AI_RECIPE_TRANSIENT_RETRY_ATTEMPTS) {
        break;
      }

      logger.warn("Retrying transient AI recipe generation failure", {
        attempt,
        nextAttempt: attempt + 1,
        retryAttempts: AI_RECIPE_TRANSIENT_RETRY_ATTEMPTS,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI recipe generation failed");
}

function isTransientAiOverload(error: unknown) {
  return isTransientModelError(error);
}

async function queueRecipeCachePersist(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  uid?: string | null;
  dietContext?: DietEnforcementContext;
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
    "If the pantry is sparse, choose recognizable named dish families and list authentic support items as missing_ingredients. Do not collapse the retry into plain grilled, garlic-lemon, or generic pasta plates.",
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
  const pantryUsage = getRecipePantryUsageStats(recipe, options.availableIngredients);
  const ownedCount = pantryUsage.ownedCount;
  const missingCount = pantryUsage.missingCount;
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
  const namedDishScore = getNamedDishSpecificityScore(recipe);
  const ingredientIntegrationScore = getIngredientIntegrationScore(recipe, options.availableIngredients);
  const basicFallbackPenalty = getBasicFallbackPenalty(recipe);
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
    (pantryUsage.isMainlyPantry ? 20 : -60) +
    preferenceHitCount * (options.hasPreferences ? 7 : 3) +
    cuisineMatch * 18 +
    cuisineMismatchPenalty +
    cuisineFit.score +
    dishIntentScore +
    dishIntentHitScore +
    namedDishScore +
    ingredientIntegrationScore -
    basicFallbackPenalty +
    calorieScore +
    ownershipBalanceScore +
    maxMissingBonus +
    matchQualityScore
  );
}

function getNamedDishSpecificityScore(recipe: Recipe) {
  const source = [
    recipe.name,
    recipe.dish_intent?.dish_name,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!source.trim()) return 0;

  const namedDishHits = [
    /\b(hawawshi|kofta|kofte|kafta|kefta|adana|lahmacun|pide|karniyarik|musakka|borek|dawood|daoud|bechamel|koftet\s+roz)\b/,
    /\b(koshary|ful|taameya|shakshuka|eggah|molokhia|fattah|sayadeya|singari|tagine|alexandrian)\b/,
    /\b(mujadara|shawarma|fasolia|hummus|fattoush|tabbouleh|kebab)\b/,
    /\b(chana\s+masala|dal|tadka|keema|biryani|pulao|rajma|curry)\b/,
    /\b(pad\s+krapow|tom\s+yum|larb|teriyaki|bibimbap|fried\s+rice|congee)\b/,
    /\b(arrabbiata|pomodoro|risotto|minestrone|piccata|parmesan|frittata)\b/,
    /\b(hamburger\s+stew|meatloaf|stuffed\s+pepper|taco|enchilada|chili)\b/
  ].filter((pattern) => pattern.test(source)).length;

  const genericOnly =
    /\b(grilled|baked|fried|sauteed|pan\s*seared|garlic|lemon|herb|pasta|rice|bowl|plate|skillet)\b/.test(source) &&
    namedDishHits === 0;

  return namedDishHits ? Math.min(28, namedDishHits * 12) : genericOnly ? -8 : 0;
}

function getIngredientIntegrationScore(recipe: Recipe, availableIngredients: string[]) {
  const meaningfulAvailable = availableIngredients
    .map(normalizeIngredientForStrictMatch)
    .filter((ingredient) => ingredient && !isCommonPantrySupportIngredient(ingredient));
  const uniqueAvailable = Array.from(new Set(meaningfulAvailable));
  if (uniqueAvailable.length <= 1) return 0;

  const ownedMeaningful = recipe.ingredients
    .map(normalizeIngredientForStrictMatch)
    .filter((ingredient) => ingredient && uniqueAvailable.includes(ingredient) && !isCommonPantrySupportIngredient(ingredient));
  const ownedMeaningfulCount = new Set(ownedMeaningful).size;

  if (ownedMeaningfulCount >= 3) return 18;
  if (ownedMeaningfulCount === 2) return 10;
  return -6;
}

function getBasicFallbackPenalty(recipe: Recipe) {
  const source = [
    recipe.name,
    recipe.dish_intent?.dish_name,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    ...(recipe.dish_intent?.visual_keywords ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const basicMethod = /\b(grilled|grill|pan\s*seared|sauteed|baked)\b/.test(source);
  const basicFlavor = /\b(garlic\s+lemon|lemon\s+garlic|garlic\s+butter|lemon\s+herb|herb\s+garlic)\b/.test(source);
  const genericName = /\b(protein|meat|beef|chicken|fish|shrimp|seafood)\s+(plate|bowl|skillet|pasta|rice)\b/.test(source);
  const namedDishScore = getNamedDishSpecificityScore(recipe);

  if (namedDishScore > 0) return 0;
  if (basicFlavor && (basicMethod || genericName)) return 28;
  if (genericName) return 18;
  if (basicMethod && /\b(lemon|garlic|herb|pasta)\b/.test(source)) return 12;
  return 0;
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
    seen.add(getRecipeSelectionKey(recipe));
  }

  for (const recipe of cuisineMatchedRecipes) {
    const key = getRecipeSelectionKey(recipe);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    filtered.push(recipe);
    if (filtered.length >= recipeCount) {
      break;
    }
  }

  if (filtered.length < recipeCount) {
    for (const recipe of recipes) {
      const key = getRecipeSelectionKey(recipe);
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
  preferredCuisine?: string,
  inputIngredientCount = 0
) {
  const hasSpecificCuisine = Boolean(preferredCuisine && preferredCuisine !== "Any");
  if (!hasSpecificCuisine && inputIngredientCount <= 2) {
    return {
      allowedFamilies: new Set<string>(),
      hasSpecificCuisine,
      preferredCuisine: undefined,
      strict: false
    };
  }

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
    .slice(0, inputIngredientCount <= 2 ? 12 : 5);

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
    const key = getRecipeSelectionKey(recipe);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(recipe);
    if (merged.length >= recipeCount) {
      break;
    }
  }

  if (merged.length < recipeCount) {
    for (const recipe of recipes) {
      const key = getRecipeSelectionKey(recipe);
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

/**
 * Strip stop words / prepositions, sort the remaining tokens, and use the
 * result as a duplicate fingerprint. Catches "X with Y" vs "Y with X" name
 * swaps and "chicken with onion" vs "chicken onion plate" duplicates that
 * the variety enforcer below considers structurally distinct because the
 * dish_intent metadata differs.
 */
function buildNormalizedRecipeNameSignature(name: string | undefined): string {
  if (!name) return "";
  const cleaned = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(
      /\b(with|and|in|over|on|by|the|a|an|of|to|for|من|مع|و|في|على|إلى|الى|الـ|بال|طبق|وصفة|recipe|plate|dish|food)\b/giu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (tokens.length < 2) return "";
  return Array.from(new Set(tokens)).sort().join("|");
}

function rejectNearDuplicateAiRecipes(recipes: Recipe[], requestId: string, stage: string): Recipe[] {
  if (recipes.length <= 1) return recipes;
  const seen = new Set<string>();
  const result: Recipe[] = [];
  let dropped = 0;
  for (const recipe of recipes) {
    const signature = buildNormalizedRecipeNameSignature(recipe.name);
    if (signature && seen.has(signature)) {
      dropped += 1;
      continue;
    }
    if (signature) seen.add(signature);
    result.push(recipe);
  }
  if (dropped > 0) {
    logger.warn("Near-duplicate AI recipes rejected by name-token signature", {
      requestId,
      stage,
      droppedCount: dropped
    });
  }
  return result;
}

/**
 * Enforce that no single cuisine occupies more than `cap` proportion of the
 * recipe list when the user did not pick a specific cuisine. Prevents the
 * "all 10 cards Turkish" drift observed when Gemini latches onto a single
 * regional family for an Any-cuisine request. When the limit is reached,
 * additional recipes from that cuisine are simply trimmed; the response may
 * end up shorter and the caller's count-padding logic decides what to do.
 */
function enforceAnyCuisineDiversity(
  recipes: Recipe[],
  preferredCuisine: string | undefined,
  recipeCount: number,
  requestId: string
): Recipe[] {
  if (preferredCuisine && preferredCuisine !== "Any") return recipes;
  if (recipes.length <= 1) return recipes;

  const cap = Math.max(1, Math.ceil(recipeCount * 0.6));
  const seenCounts = new Map<string, number>();
  const accepted: Recipe[] = [];
  let dropped = 0;
  for (const recipe of recipes) {
    const cuisineKey = (recipe.cuisine ?? "").trim().toLowerCase() || "unknown";
    const current = seenCounts.get(cuisineKey) ?? 0;
    if (current >= cap) {
      dropped += 1;
      continue;
    }
    seenCounts.set(cuisineKey, current + 1);
    accepted.push(recipe);
  }
  if (dropped > 0) {
    logger.warn("Any-cuisine diversity cap trimmed recipes", {
      requestId,
      droppedCount: dropped,
      cap,
      cuisineCounts: Object.fromEntries(seenCounts.entries())
    });
  }
  return accepted;
}

function enforceDistinctRecipeVariety(recipes: Recipe[], recipeCount: number) {
  const preservedExactMatches = recipes.filter((recipe) => recipe.recipe_origin === "exact_scan_match");
  const selected: Recipe[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Map<string, RecipeIngredientVariant[]>();
  const seenFamilies = new Map<string, RecipeIngredientVariant[]>();
  const seenStructures = new Map<string, RecipeIngredientVariant[]>();
  const seenImageIdentities = new Map<string, RecipeIngredientVariant[]>();

  const addRecipe = (
    recipe: Recipe,
    options: {
      allowFamilyRepeat?: boolean;
      allowStructureRepeat?: boolean;
      allowImageRepeat?: boolean;
    } = {}
  ) => {
    if (selected.length >= recipeCount) return false;

    const idKey = recipe.id || "";
    const nameKey = normalizeDishRestrictionKey(recipe.name);
    const familyKey = getRecipeVarietyFamilyKey(recipe);
    const structureKey = buildRecipeStructureSignature(recipe);
    const imageIdentityKey = getRecipeImageIdentityKey(recipe);
    const ingredientVariant = buildRecipeIngredientVariant(recipe);

    if (idKey && seenIds.has(idKey)) return false;
    if (nameKey && !canAcceptRecipeIngredientVariant(seenNames.get(nameKey), ingredientVariant)) return false;
    if (
      !options.allowFamilyRepeat &&
      familyKey &&
      !canAcceptRecipeIngredientVariant(seenFamilies.get(familyKey), ingredientVariant)
    ) {
      return false;
    }
    if (
      !options.allowStructureRepeat &&
      structureKey &&
      !canAcceptRecipeIngredientVariant(seenStructures.get(structureKey), ingredientVariant)
    ) {
      return false;
    }
    if (
      !options.allowImageRepeat &&
      imageIdentityKey &&
      !canAcceptRecipeIngredientVariant(seenImageIdentities.get(imageIdentityKey), ingredientVariant)
    ) {
      return false;
    }

    selected.push(recipe);
    if (idKey) seenIds.add(idKey);
    if (nameKey) recordRecipeIngredientVariant(seenNames, nameKey, ingredientVariant);
    if (familyKey) recordRecipeIngredientVariant(seenFamilies, familyKey, ingredientVariant);
    if (structureKey) recordRecipeIngredientVariant(seenStructures, structureKey, ingredientVariant);
    if (imageIdentityKey) recordRecipeIngredientVariant(seenImageIdentities, imageIdentityKey, ingredientVariant);
    return true;
  };

  for (const recipe of preservedExactMatches) {
    addRecipe(recipe, { allowFamilyRepeat: true, allowImageRepeat: true, allowStructureRepeat: true });
  }

  for (const recipe of recipes) {
    addRecipe(recipe);
  }

  for (const recipe of recipes) {
    addRecipe(recipe, { allowStructureRepeat: true });
  }

  if (selected.length < recipeCount && recipes.some(isLiverRecipeCandidate)) {
    for (const recipe of recipes) {
      addRecipe(recipe, { allowFamilyRepeat: true, allowImageRepeat: true, allowStructureRepeat: true });
    }
  }

  return selected.slice(0, recipeCount);
}

type RecipeIngredientVariant = {
  key: string;
  tokens: Set<string>;
};

function buildRecipeIngredientVariant(recipe: Recipe): RecipeIngredientVariant {
  const tokens = getRecipeVarietyIngredientTokens(recipe);
  return {
    key: Array.from(tokens).sort().join("|"),
    tokens
  };
}

function getRecipeVarietyIngredientKey(recipe: Recipe) {
  return buildRecipeIngredientVariant(recipe).key;
}

function getRecipeVarietyIngredientTokens(recipe: Recipe) {
  const tokens = new Set<string>();
  const ingredients = [...(recipe.ingredients ?? []), ...(recipe.missing_ingredients ?? [])];

  for (const ingredient of ingredients) {
    const normalized = normalizeIngredientForStrictMatch(getRecipeIngredientLabel(ingredient));
    if (!normalized || isIncidentalRecipeVarietyIngredient(normalized)) continue;
    tokens.add(normalized);
  }

  return tokens;
}

function isIncidentalRecipeVarietyIngredient(normalizedIngredient: string) {
  return /^(salt|pepper|black pepper|white pepper|water|oil|vegetable oil|olive oil|cooking oil|neutral oil|butter|ghee|زيت|زيت نباتي|زيت زيتون|ملح|فلفل|فلفل اسود|ماء|زبدة|سمنة)$/iu.test(
    normalizedIngredient
  );
}

function canAcceptRecipeIngredientVariant(existingVariants: RecipeIngredientVariant[] | undefined, next: RecipeIngredientVariant) {
  if (!existingVariants?.length) return true;
  if (!next.key) return false;
  if (existingVariants.some((variant) => variant.key === next.key)) return false;
  if (existingVariants.length >= 2) return false;

  return existingVariants.every((variant) => areMeaningfullyDifferentIngredientVariants(variant.tokens, next.tokens));
}

function areMeaningfullyDifferentIngredientVariants(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return false;

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }

  const leftOnly = left.size - shared;
  const rightOnly = right.size - shared;
  const union = left.size + right.size - shared;
  const overlapRatio = union > 0 ? shared / union : 1;

  return (leftOnly >= 1 && rightOnly >= 1) || leftOnly + rightOnly >= 3 || overlapRatio <= 0.72;
}

function recordRecipeIngredientVariant(
  variantsByKey: Map<string, RecipeIngredientVariant[]>,
  key: string,
  variant: RecipeIngredientVariant
) {
  const variants = variantsByKey.get(key);
  if (variants) {
    variants.push(variant);
  } else {
    variantsByKey.set(key, [variant]);
  }
}

function isLiverRecipeCandidate(recipe: Recipe) {
  const source = [
    recipe.name,
    recipe.cuisine,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(liver|kebda|kibda|ciger|cigeri)\b|كبدة|كبده/iu.test(source);
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

function getRecipeImageIdentityKey(recipe: Recipe) {
  const candidates = [
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.dish_intent?.dish_name,
    recipe.name
  ]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeDishRestrictionKey)
    .filter(Boolean);

  const exactCandidate = candidates.find((candidate) => !isGenericRecipeImageIdentity(candidate));
  if (exactCandidate) return exactCandidate;

  return normalizeDishRestrictionKey(buildRecipeStructureSignature(recipe));
}

function isGenericRecipeImageIdentity(value: string) {
  if (!value) return true;

  return /^(ground meat|ground beef|minced meat|beef|meat|liver|fish|seafood|shrimp|chicken|food|recipe|dish|meal|plate|bowl)$/i.test(
    value
  );
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
  const seenStructures = new Map<string, RecipeIngredientVariant[]>();

  while (diversified.length < recipeCount) {
    let progressed = false;

    for (const bucket of buckets) {
      const nextRecipe = bucket.shift();
      if (!nextRecipe) continue;
      const structureKey = buildRecipeStructureSignature(nextRecipe);
      const ingredientVariant = buildRecipeIngredientVariant(nextRecipe);
      if (structureKey && !canAcceptRecipeIngredientVariant(seenStructures.get(structureKey), ingredientVariant)) {
        continue;
      }
      diversified.push(nextRecipe);
      if (structureKey) recordRecipeIngredientVariant(seenStructures, structureKey, ingredientVariant);
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
    const selectedKeys = new Set(diversified.map(getRecipeSelectionKey));
    for (const recipe of recipes) {
      const key = getRecipeSelectionKey(recipe);
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
  const selectedFamilies = new Map<string, RecipeIngredientVariant[]>();
  const selectedStructures = new Map<string, RecipeIngredientVariant[]>();

  return (
    selected: Array<{ recipe: Recipe; index: number; isPantryBalanced: boolean; score: number }>,
    candidate: { recipe: Recipe; index: number; isPantryBalanced: boolean; score: number }
  ) => {
    if (selected.length >= limit) return selected;

    const familyKey = buildRecipeDishFamilyKey(candidate.recipe) || candidate.recipe.name.trim().toLowerCase();
    const structureKey = buildRecipeStructureSignature(candidate.recipe);
    const ingredientVariant = buildRecipeIngredientVariant(candidate.recipe);
    const familyVariants = selectedFamilies.get(familyKey);
    const structureVariants = selectedStructures.get(structureKey);

    if (structureKey && !canAcceptRecipeIngredientVariant(structureVariants, ingredientVariant)) {
      return selected;
    }

    if (familyKey && !canAcceptRecipeIngredientVariant(familyVariants, ingredientVariant) && selected.length + 1 < limit) {
      return selected;
    }

    selected.push(candidate);
    if (familyKey) recordRecipeIngredientVariant(selectedFamilies, familyKey, ingredientVariant);
    if (structureKey) recordRecipeIngredientVariant(selectedStructures, structureKey, ingredientVariant);
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

function prioritizePantryUsageRecipes(recipes: Recipe[], availableIngredients: string[]) {
  const scored = recipes.map((recipe, index) => {
    const pantryUsage = getRecipePantryUsageStats(recipe, availableIngredients);
    return {
      index,
      pantryUsage,
      recipe
    };
  });
  const mainlyPantryRecipes = scored.filter((entry) => entry.pantryUsage.isMainlyPantry);
  const pool = mainlyPantryRecipes.length ? mainlyPantryRecipes : scored;

  return pool
    .sort((left, right) => {
      if (left.pantryUsage.ownedCount !== right.pantryUsage.ownedCount) {
        return right.pantryUsage.ownedCount - left.pantryUsage.ownedCount;
      }
      if (left.pantryUsage.missingCount !== right.pantryUsage.missingCount) {
        return left.pantryUsage.missingCount - right.pantryUsage.missingCount;
      }
      if (left.pantryUsage.ownedRatio !== right.pantryUsage.ownedRatio) {
        return right.pantryUsage.ownedRatio - left.pantryUsage.ownedRatio;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.recipe);
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

function isPantryBalancedRecipe(recipe: Recipe, availableIngredients: string[] = []) {
  if (availableIngredients.length) {
    const pantryUsage = getRecipePantryUsageStats(recipe, availableIngredients);
    return pantryUsage.ownedCount >= pantryUsage.missingCount;
  }

  return recipe.ingredients.length >= recipe.missing_ingredients.length;
}

function getRecipePantryUsageStats(recipe: Recipe, availableIngredients: string[]) {
  const availableSet = buildAvailableIngredientSet(availableIngredients, expandIngredientFamilies(availableIngredients));
  const ownedCount = recipe.ingredients.filter((ingredient) => isIngredientAvailable(ingredient, availableSet)).length;
  const availableCount = availableIngredients.filter((ingredient) => ingredient.trim().length > 0).length;
  const missingCount = recipe.missing_ingredients
    .filter((ingredient) => !isIngredientAvailable(ingredient, availableSet))
    .reduce((total, ingredient) => total + getMissingIngredientRankingWeight(ingredient, availableCount), 0);
  const totalRelevant = ownedCount + missingCount;
  const ownedRatio = totalRelevant > 0 ? ownedCount / totalRelevant : 0;

  return {
    isMainlyPantry: ownedCount > 0 && (ownedCount >= missingCount || ownedRatio >= (availableCount <= 2 ? 0.35 : 0.5)),
    missingCount,
    ownedCount,
    ownedRatio
  };
}

function getMissingIngredientRankingWeight(ingredient: string, availableIngredientCount: number) {
  const normalized = normalizeIngredientForStrictMatch(ingredient);
  if (!normalized) return 0;

  if (isCommonPantrySupportIngredient(normalized)) {
    return availableIngredientCount <= 2 ? 0.15 : 0.35;
  }

  if (isRecipeStructureSupportIngredient(normalized)) {
    return availableIngredientCount <= 2 ? 0.45 : 0.75;
  }

  return 1;
}

function isCommonPantrySupportIngredient(normalizedIngredient: string) {
  return /\b(salt|pepper|black pepper|cumin|coriander|paprika|turmeric|chili|chilli|cayenne|sumac|oregano|mint|parsley|cilantro|dill|basil|garlic|onion|oil|olive oil|butter|vinegar|lemon|lime|tomato paste|pepper paste|tahini|yogurt|water|stock|broth)\b/.test(
    normalizedIngredient
  );
}

function isRecipeStructureSupportIngredient(normalizedIngredient: string) {
  return /\b(rice|bread|pita|flatbread|baladi bread|pasta|penne|macaroni|spaghetti|flour|dough|pide dough|phyllo|filo|yufka|potato|carrot|celery|tomato|tomato sauce|green pepper|bell pepper|eggplant|aubergine|cheese|mozzarella)\b/.test(
    normalizedIngredient
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
  const normalized = value
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

  return isSparseGroundMeatSource(normalized) ? "ground meat" : normalized;
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
    if (isDurableRecipeImageUrl(currentImageUrl) && !usedImageUrls.has(currentImageUrl)) {
      usedImageUrls.add(currentImageUrl);
      uniqueRecipes.push(recipe);
      continue;
    }

    try {
      const resolvedPhoto = await resolveRecipePhotoCandidate(recipe, usedImageUrls, { allowProviderLookup: true });
      const candidateImageUrl = resolvedPhoto.recipePatch?.image_url;

      if (isDurableRecipeImageUrl(candidateImageUrl) && !usedImageUrls.has(candidateImageUrl)) {
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
    if (!imageUrl) return entry;

    if (isDurableRecipeImageUrl(imageUrl) && !usedImageUrls.has(imageUrl)) {
      usedImageUrls.add(imageUrl);
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
  if (isDurableRecipeImageUrl(recipe.image_url) && !excludedUrls.has(recipe.image_url)) {
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
  if (isStrictVisualRecipePhotoRequest(recipe, [baseIdentity, ...queries.map((query) => buildRecipePhotoIdentity(query))])) {
    return { photoFitScore: 0, recipePatch: null as Partial<Recipe> | null };
  }
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

function isStrictVisualRecipePhotoRequest(
  recipe: Recipe,
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>
) {
  if (identities.some(isStrictRecipePhotoIdentity)) return true;

  const source = [
    recipe.name,
    recipe.cuisine,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    ...identities.map((identity) => [
      identity.cleanQuery,
      identity.canonicalDishKey,
      identity.familyKey,
      identity.mainIngredientKey,
      identity.mealTypeKey,
      identity.starchKey
    ].filter(Boolean).join(" "))
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\b(liver|kebda|kibda|ciger|cigeri|fish|seafood|shrimp|prawn|mussel|mussels|clam|clams|calamari|squid|tuna|salmon|sayadeya|sayadieh|sayadiah|samak|singari|sengari|bori|bouri)\b/.test(source) ||
    /\b(ground|minced|mince)\s+(beef|meat|lamb|veal|protein)\b|\b(beef|meat|lamb|veal)\s+(ground|minced|mince)\b|\bground\s+meat\b|\bminced\s+meat\b|\u0644\u062d\u0645(?:\u0629|\u0647)?\s+\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?|\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?/iu.test(source)
  );
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

import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { after } from "next/server";
import { PromptBuilder } from "@/ai/PromptBuilder";
import {
  isTransientModelError,
  USE_MOCK,
  callOpenAIVision,
  ensureAiAvailable,
  extractJson
} from "@/lib/openai";
import {
  isFirebaseTransientError,
  accessPayload,
  buildFreeAiCreditsExhaustedNotice,
  canUseApiFeature,
  completeFreeAiAction,
  releaseFreeAiAction,
  reserveFreeAiAction,
} from "@/services/authService";
import { applyRateLimit, rateLimitHeaders } from "@/services/rateLimitService";
import { generateFallbackRecipes } from "@/services/fallbackAiService";
import { searchCatalogRecipes } from "@/services/recipeSearchService";
import {
  filterPreviouslyShownRecipes,
  normalizeRecipeIngredientContextKey,
  selectRecipeFreshnessBackfill
} from "@/services/recipeSearchFreshnessService";
import {
  getWarmSharedRecipeCacheSnapshot,
  persistGeneratedRecipeCache,
  persistPremiumValidatedRecipeCache
} from "@/services/userRecipeCacheService";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import {
  getMissingIngredientPurchaseWeight,
  isCommonPantrySupportIngredient
} from "@/services/recipeMissingIngredientPolicyService";
import { getIngredientProfileForTerm, normalizeIngredientText } from "@/food/IngredientNormalizer";
import {
  findRecipeReferencesForGeneration,
  mapRecipeReferencesToRecipes,
  shouldLoadRecipeReferencesForGeneration
} from "@/services/recipeReferenceService";
import {
  buildRecipeDishFamilyKey,
  buildRecipeStructureSignature,
  expandIngredientFamilies
} from "@/lib/ingredientFamilies";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { buildRecipePhotoIdentity, isStrictRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import { normalizePhotoIdentity, toIdentityKey } from "@/lib/photoIdentityBuilders";
import {
  normalizeRecipeThroughLocalizationService,
  validateArabicRecipeLocalization
} from "@/lib/localization/LocalizationService";
import { getCompleteCuisineCatalog } from "@/lib/cuisineCatalogs/completeCatalogs";
import { scoreCuisineFit } from "@/lib/cuisineScoring";
import {
  buildCuisineUnderfillMessage,
  cuisineMatchesPreference,
  normalizeCuisineLabel,
  selectRecipesWithCuisineFallback
} from "@/lib/cuisines";
import {
  enforceAuthenticCuisineRecipeSet,
  resolveAuthenticCuisineDishes
} from "@/lib/cuisineAuthenticityResolver";
import {
  buildCuisineAwareDishCandidates,
  enrichRecipeWithDishIntent
} from "@/lib/recipeDishIntelligence";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ensureArabicRecipeLanguage, isArabicRecipeLanguage } from "@/lib/arabicRecipeLocalization";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import type { RecipeCatalogDoc } from "@/lib/domain";
import type { Recipe } from "@/lib/types";
import { normalizeRecipeTitleEncoding } from "@/lib/recipeDisplayNames";
import { logger } from "@/lib/logger";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import {
  getSharedGeneratedRecipePhotoByCategory,
  getSharedRecipePhotoByApproximateCategory,
  getSharedRecipePhotoByQueryOrSignature,
  type SharedRecipePhotoEntry
} from "@/lib/sharedRecipePhotoCache";
import { isKnownWeakRecipeProviderImageUrl } from "@/lib/recipeImageQuality";
import {
  attachValidatedRecipePhotoAsset,
  canReuseRecipePhotoForDiet
} from "@/services/recipePhotoReusePolicy";
import { buildSharedRecipePhotoLinkSearchTokens } from "@/services/sharedRecipePhotoLinkService";
import { SHARED_RECIPE_V2_COLLECTION } from "@/services/sharedRecipeV2PolicyService";
import {
  adaptRecipeForDietRestrictions,
  findRecipeDietViolation,
  filterRecipesByDiet,
  type DietEnforcementContext
} from "@/lib/dietEnforcement";
import { adaptRecipeForHealthConditions, findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { RecipeReferencePromptRecipe } from "@/lib/recipeReferenceTypes";
import {
  getRecipeEditorCache,
  setRecipeEditorCache,
  type RecipeEditorCacheInput
} from "@/services/recipeEditorSemanticCache";
import { indexRecipeEditorBatchCandidates } from "@/services/recipeEditorBatchService";
import {
  buildPantryOwnershipSet,
  classifyRecipeIngredientOwnership,
  isPantryIngredientOwned,
  normalizeCompleteRecipeIngredientLines,
  requiresSeparatePantryPurchase
} from "@/services/recipeIngredientOwnershipService";
import {
  buildValidatedSourceFallback,
  getBlockingEditedRecipeQualityReasons
} from "@/services/recipeEditorFallbackService";
import { RecipeAcceptanceEngine } from "@/services/recipeAcceptanceEngine";
import {
  getRecipeIngredientValidationIdentity,
  isMalformedRecipeTitle,
  RecipeQualityGate
} from "@/services/recipeQualityGate";
import { enforceRecipeDiversity } from "@/services/recipeDiversityValidator";
import {
  createRecipeValidationReport,
  increaseRecipeValidationDatabaseFound,
  persistRecipePipelineReport,
  persistRecipeValidationReport,
  recordRecipeGenerationTrace,
  recordRecipeLifecycle,
  recordRecipePipelineStage,
  recordRecipeValidationTrace,
  updateRecipeValidationFunnel
} from "@/services/recipeValidationRepairService";
import { RecipeGenerationStatus } from "@/lib/RecipeGenerationStatus";
import {
  createRecipeIngredientCompatibilityEvaluator,
  hasExclusiveRequestedProteinForm,
  hasRequestedProteinForm
} from "@/services/recipePrimaryIngredientCompatibility";
import {
  analyzeRecipeInputCoverage,
  createRecipeInputCoveragePlan,
  doesRecipeSetMeetInputCoverage,
  getRecipeInputAnchorIds,
  selectRecipesForInputCoverage,
  toRecipeInputCoveragePrompt
} from "@/services/recipeInputCoverageService";
import {
  getPremiumRecipeEditorCandidateCount,
  prioritizeCuratedRecipeSources,
  shouldExpandRecipeSourceSearch,
  shouldFinalizeSourceCandidatesBeforeEditor,
  shouldRunPremiumRecipeEditor,
  shouldServeDatasetBeforeRecipeEditor
} from "@/services/premiumRecipeEditorPolicy";
import {
  preserveSourceDishIdentityName as preserveEditorSourceDishIdentityName,
  recipeTitlePreservesSourceDishIdentity
} from "@/services/recipeDishIdentityService";
import {
  filterCandidatesByIdentityContract,
  lockRecipeCandidateIdentities,
  normalizeRecipeLosslessly
} from "@/services/recipeIdentityContractService";
import { RecipeGeminiCallBudget } from "@/services/recipeGeminiCallBudget";
import {
  compileRecipeRequestPolicy,
  selectRecipesByRequestPolicy,
  type CompiledRecipeRequestPolicy
} from "@/services/recipeRequestPolicyService";
import { dedupeExactRecipeCandidates } from "@/services/recipeCandidateMergeService";
import {
  isSharedRecipeV2Searchable,
  mergeSharedRecipeV2Results,
  planSharedRecipeV2CuisineFulfillment
} from "@/services/sharedRecipeV2PolicyService";
import { DEFAULT_USER_SETTINGS } from "@/lib/userDefaults";

const DEFAULT_RECIPE_RESULT_COUNT = DEFAULT_USER_SETTINGS.recipeCount;
const MIN_RECIPE_RESULT_COUNT = 1;
const MAX_SHARED_POOL_RECIPE_RESULT_COUNT = 10;
const MAX_RECIPE_EDITOR_BATCH_SIZE = 12;
const MAX_RECIPE_GENERATION_CANDIDATES = 16;
const AI_RECIPE_TRANSIENT_RETRY_ATTEMPTS = 3;
const RECIPE_TEXT_GENERATION_OPTIONS = {
  temperature: 0.92,
  topP: 0.95
} as const;
const PREMIUM_RECIPE_EDITOR_TIMEOUT_MS = 45_000;
const RECIPE_BATCH_GENERATION_MAX_OUTPUT_TOKENS = 24_576;
const recipeQualityGate = new RecipeQualityGate();
const recipeAcceptanceEngine = new RecipeAcceptanceEngine();
const RECIPE_SIMILARITY_REJECTION_THRESHOLD = 0.75;
type RecentRecipeMemory = {
  familyKeys: Set<string>;
  imageIdentityKeys: Set<string>;
  names: Set<string>;
  recipes: Recipe[];
  selectionKeys: Set<string>;
  structureKeys: Set<string>;
};

const EMPTY_RECENT_RECIPE_MEMORY: RecentRecipeMemory = {
  familyKeys: new Set(),
  imageIdentityKeys: new Set(),
  names: new Set(),
  recipes: [],
  selectionKeys: new Set(),
  structureKeys: new Set()
};
const IN_PROCESS_RECENT_RECIPE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IN_PROCESS_RECENT_RECIPE_USERS = 500;
const MAX_IN_PROCESS_RECIPES_PER_USER = 100;
const inProcessRecentRecipes = new Map<string, { expiresAt: number; recipes: Recipe[] }>();

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
  actionId: z.string().min(1).max(128).optional(),
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
  excludedIngredients: z.array(z.string()).optional(),
  debug: z.boolean().optional(),
  historyEntryId: z.string().min(1).max(160).optional()
}).refine((value) => Boolean(value.ingredients?.length || value.prompt || value.referenceImage), {
  message: "Provide ingredients or a prompt."
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const requestStartedAt = Date.now();
  let variationSeed = buildRecipeVariationSeed(requestId);
  let accessCheck: Awaited<ReturnType<typeof canUseApiFeature>> | null = null;
  let responseAiActionReservationId: string | undefined;
  let responseAiActionGrantId: string | undefined;
  let lastValidSearchRecipes: Recipe[] = [];
  let pipelineDebug = process.env.PIPELINE_DEBUG === "true";
  let historyEntryId: string | undefined;
  let historyIngredientContextKey = "";
  let historyUid: string | undefined;
  let responsePreferredCuisine = "Any";
  let responseRequiresDailyFreshness = false;
  let responseRecentRecipeMemory = EMPTY_RECENT_RECIPE_MEMORY;
  let responseEligibleCuisineFallbackRecipes: Recipe[] = [];
  let responseEligibleBackfillRecipes: Recipe[] = [];
  let responseRequestedRecipeCount = 0;
  const validationReport = createRecipeValidationReport({
    inputIngredients: [],
    requestedCount: 0,
    requestId
  });
  const respondWithValidationReport = async (payload: Record<string, unknown>, init?: ResponseInit) => {
    let validationReportPath: string | undefined;
    let pipelineReport: unknown;
    let pipelineReportPath: string | undefined;
    const hasSearchCandidates = validationReport.generationTrace.search.candidatesFound > 0;
    const shouldFailOpen =
      (!Array.isArray(payload.recipes) || payload.recipes.length === 0) &&
      lastValidSearchRecipes.length > 0;
    const failOpenPayload = shouldFailOpen
      ? {
          ...payload,
          recipes: lastValidSearchRecipes,
          result: JSON.stringify(lastValidSearchRecipes),
          generationStatus: RecipeGenerationStatus.PARTIAL_RESULTS,
          message: "Returning validated search recipes after an optional enhancement failed."
        }
      : payload;
    const preserveSearchTruth =
      failOpenPayload.generationStatus === RecipeGenerationStatus.NO_RESULTS &&
      hasSearchCandidates &&
      (!Array.isArray(failOpenPayload.recipes) || failOpenPayload.recipes.length === 0);
    const truthPreservedPayload = preserveSearchTruth
      ? {
          ...failOpenPayload,
          generationStatus: RecipeGenerationStatus.PARTIAL_RESULTS,
          message: "Compatible recipes were found, but none completed final validation. See the pipeline report for rejected candidates."
        }
      : failOpenPayload;
    const cuisineEligiblePayload = enforceExplicitCuisineResponsePolicy(truthPreservedPayload, {
      preferredCuisine: responsePreferredCuisine,
      requestedCount: responseRequestedRecipeCount
    });
    const payloadRecipes = Array.isArray(cuisineEligiblePayload.recipes)
      ? cuisineEligiblePayload.recipes as Recipe[]
      : [];
    const freshPayloadRecipes = responseRequiresDailyFreshness
      ? filterPreviouslyShownRecipes(payloadRecipes, responseRecentRecipeMemory.recipes)
      : payloadRecipes;
    const cuisineFallbackSelection = responseRequiresDailyFreshness
      ? selectRecipeFreshnessBackfill(
          freshPayloadRecipes,
          responseEligibleCuisineFallbackRecipes,
          responseRequestedRecipeCount
        )
      : { backfilled: [] as Recipe[], recipes: freshPayloadRecipes };
    const newCuisineFallbackCount = cuisineFallbackSelection.backfilled.length;
    const freshnessSelection = responseRequiresDailyFreshness
      ? selectRecipeFreshnessBackfill(
          cuisineFallbackSelection.recipes,
          responseEligibleBackfillRecipes,
          responseRequestedRecipeCount
        )
      : { backfilled: [] as Recipe[], recipes: cuisineFallbackSelection.recipes };
    const backfilledCount = freshnessSelection.backfilled.length;
    const freshnessRecipes = freshnessSelection.recipes.map((recipe) => ({
      ...recipe,
      cuisine_match_origin:
        responsePreferredCuisine !== "Any" &&
        !cuisineMatchesPreference(recipe.cuisine, responsePreferredCuisine)
          ? "ingredient_fallback" as const
          : "preferred" as const,
      freshness_origin: freshnessSelection.backfilled.includes(recipe)
        ? "backfilled_recent" as const
        : "fresh" as const
    }));
    const otherCuisineCount = freshnessRecipes.filter(
      (recipe) => recipe.cuisine_match_origin === "ingredient_fallback"
    ).length;
    const cuisineFallbackNotice = otherCuisineCount
      ? ` ${otherCuisineCount} recipe${otherCuisineCount === 1 ? " is" : "s are"} from other cuisines because there were not enough validated ${responsePreferredCuisine} matches; they still match your ingredients and restrictions.`
      : "";
    const recentExcludedCount = Math.max(0, payloadRecipes.length - freshPayloadRecipes.length);
    const freshnessChanged =
      freshnessRecipes.length !== payloadRecipes.length ||
      newCuisineFallbackCount > 0 ||
      backfilledCount > 0;
    const freshnessPayload = !freshnessChanged
      ? cuisineEligiblePayload
      : {
          ...cuisineEligiblePayload,
          recipes: freshnessRecipes,
          result: JSON.stringify(freshnessRecipes),
          returnedCount: freshnessRecipes.length,
          freshCount: freshnessRecipes.length - backfilledCount,
          backfilledCount,
          generationStatus: freshnessRecipes.length >= responseRequestedRecipeCount
            ? RecipeGenerationStatus.PARTIAL_RESULTS
            : freshnessRecipes.length
              ? RecipeGenerationStatus.PARTIAL_RESULTS
              : RecipeGenerationStatus.NO_RESULTS,
          message: backfilledCount
            ? `Showing ${freshnessRecipes.length - backfilledCount} new recipes and ${backfilledCount} backfilled recipe${backfilledCount === 1 ? "" : "s"} from the last 24 hours ${freshnessRecipes.length >= responseRequestedRecipeCount ? "to reach" : "toward"} your requested ${responseRequestedRecipeCount}. Backfilled recipes still match your current ingredients and restrictions.${cuisineFallbackNotice}`
            : newCuisineFallbackCount > 0
              ? `Gemini and the preferred ${responsePreferredCuisine} pool did not fill all ${responseRequestedRecipeCount} spots, so ${newCuisineFallbackCount} new ingredient-matched recipe${newCuisineFallbackCount === 1 ? " was" : "s were"} added from other cuisines.${cuisineFallbackNotice}`
            : freshnessRecipes.length && recentExcludedCount > 0
              ? `Showing ${freshnessRecipes.length} of ${responseRequestedRecipeCount} new recipes; recipes shown for these ingredients in the last 24 hours were excluded.${cuisineFallbackNotice}`
              : freshnessRecipes.length
                ? cuisineEligiblePayload.message
                : "No new validated recipes are available for these ingredients yet. Recipes shown in the last 24 hours were excluded."
        };
    const responsePayload = freshnessPayload;
    const recipes = responsePayload.recipes;
    const returned = Array.isArray(recipes) ? recipes.length : 0;
    const responseStatus = init?.status ?? 200;
    const actionSucceeded = responseStatus >= 200 && responseStatus < 300 && returned > 0;
    let finalizedAccess = accessCheck?.access;
    let completedActionGrantId: string | undefined;
    if (responseAiActionReservationId && accessCheck) {
      const reservationId = responseAiActionReservationId;
      responseAiActionReservationId = undefined;
      if (actionSucceeded) {
        try {
          finalizedAccess = await completeFreeAiAction(accessCheck.access, reservationId);
          completedActionGrantId = responseAiActionGrantId;
        } catch (error) {
          await releaseFreeAiAction(accessCheck.access, reservationId);
          throw error;
        }
      } else {
        await releaseFreeAiAction(accessCheck.access, reservationId);
      }
      responseAiActionGrantId = undefined;
    }
    if (historyUid && historyIngredientContextKey && Array.isArray(recipes) && recipes.length) {
      rememberInProcessRecentRecipes(historyUid, historyIngredientContextKey, recipes as Recipe[]);
    }
    recordRecipeGenerationTrace(validationReport, {
      type: "response",
      recipes: Array.isArray(recipes) ? recipes as Recipe[] : []
    });
    const failureReason = typeof responsePayload.message === "string"
      ? responsePayload.message
      : typeof responsePayload.error === "string"
        ? responsePayload.error
        : returned === 0
          ? inferValidationFailureReason(validationReport)
          : null;
    updateRecipeValidationFunnel(validationReport, {
      failure_reason: failureReason,
      returned
    });
    try {
      validationReportPath = await persistRecipeValidationReport(validationReport);
    } catch (reportError) {
      logger.warn("Recipe validation report persistence failed", {
        requestId,
        errorMessage: reportError instanceof Error ? reportError.message : String(reportError)
      });
    }
    try {
      const persisted = await persistRecipePipelineReport(validationReport, requestStartedAt);
      if (pipelineDebug) {
        pipelineReport = persisted.pipelineReport;
        pipelineReportPath = persisted.reportPath;
      }
    } catch (reportError) {
      logger.warn("Recipe pipeline report persistence failed", {
        requestId,
        errorMessage: reportError instanceof Error ? reportError.message : String(reportError)
      });
    }
    return Response.json(
      {
        ...responsePayload,
        ...(completedActionGrantId ? { aiActionGrantId: completedActionGrantId } : {}),
        ...(finalizedAccess ? { access: accessPayload(finalizedAccess) } : {}),
        requestId,
        search_candidates_found: validationReport.generationTrace.search.candidatesFound,
        request_trace: pipelineDebug ? validationReport.generationTrace : undefined,
        validation_report: validationReport,
        validationReportPath,
        ...(pipelineReport ? { pipeline_report: pipelineReport, pipelineReportPath } : {})
      },
      init
    );
  };
  logger.info("Recipe generation HTTP request received", { requestId });
  try {
    accessCheck = await canUseApiFeature(request, "recipe_generation");
    const requestAccess = accessCheck.access;
    const hasAiGenerationAccess = accessCheck.allowed;
    // Free users with remaining trial credits can receive freshly generated
    // recipes. Curated matches are the first successful path, not an error.
    const isFreeTier = !requestAccess.isPremium && !requestAccess.isAdmin;
    const rl = applyRateLimit({
      uid: requestAccess.uid,
      feature: "recipe_generation",
      isPremium: accessCheck.allowed,
      bypass: requestAccess.isAdmin
    });
    if (!rl.decision.allowed) {
      return await respondWithValidationReport(
        {
          error: "Recipe generation is busy right now. Please try again shortly.",
          generationStatus: RecipeGenerationStatus.NO_RESULTS,
          retryAfterSeconds: rl.decision.retryAfterSeconds
        },
        {
          status: 429,
          headers: rateLimitHeaders(rl.decision, rl.config)
        }
      );
    }
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return await respondWithValidationReport(
        { error: "Add at least one ingredient to generate recipes.", generationStatus: RecipeGenerationStatus.NO_RESULTS },
        { status: 400 }
      );
    }
    historyEntryId = parsed.data.historyEntryId;
    historyUid = requestAccess.uid;
    pipelineDebug ||= parsed.data.debug === true;
    variationSeed = buildRecipeVariationSeed(parsed.data.actionId ?? requestId);

    if (parsed.data.referenceImage && !accessCheck.allowed) {
      return await respondWithValidationReport(
        {
          error: "Scan fridge recipe generation is a premium feature. Add ingredients manually to generate free recipe cards.",
          generationStatus: RecipeGenerationStatus.NO_RESULTS,
          access: accessPayload(requestAccess)
        },
        { status: 403 }
      );
    }

    const ingredients = (parsed.data.ingredients ?? extractIngredientsFromPrompt(parsed.data.prompt ?? ""))
      .map((ingredient) => ingredient.trim())
      .filter(Boolean);
    historyIngredientContextKey = normalizeRecipeIngredientContextKey(ingredients);
    const recipeLanguage = recipeLanguageFromUiLanguage(normalizePilotLanguage(parsed.data.uiLanguage, "en"));
    const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
    const requestedRecipeCount = clampRecipeCount(parsed.data.recipeCount, MAX_SHARED_POOL_RECIPE_RESULT_COUNT);
    responsePreferredCuisine = parsed.data.preferredCuisine ?? "Any";
    responseRequestedRecipeCount = requestedRecipeCount;
    let recipeCount = requestedRecipeCount;
    let v2PrefillRecipes: Recipe[] = [];
    updateRecipeValidationFunnel(validationReport, {
      requested: requestedRecipeCount,
      requestedCount: requestedRecipeCount
    });
    validationReport.inputIngredients = ingredients;
    if (!ingredients.length && !parsed.data.referenceImage) {
      return await respondWithValidationReport(
        { error: "Add at least one ingredient to generate recipes.", generationStatus: RecipeGenerationStatus.NO_RESULTS },
        { status: 400 }
      );
    }
    const aiAction = accessCheck.allowed
      ? await reserveFreeAiAction(requestAccess, "recipe_generation", parsed.data.actionId ?? requestId)
      : { access: requestAccess };
    const nextAccess = aiAction.access;
    responseAiActionReservationId = aiAction.actionId;
    responseAiActionGrantId = aiAction.actionGrantId;
    const hasPremiumWorkflowAccess = requestAccess.isPremium || requestAccess.isAdmin || accessCheck.allowed;
    responseRequiresDailyFreshness = hasPremiumWorkflowAccess;
    const workflowAccess = hasPremiumWorkflowAccess
      ? { ...requestAccess, isPremium: true }
      : requestAccess;
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
    const expandedNormalizedIngredientNames = Array.from(new Set([
      ...ingredientNormalization.searchTerms,
      ...expandIngredientFamilies(normalizedIngredientNames)
    ]));
    const scoringIngredients = expandedNormalizedIngredientNames;
    // A retry of the same click keeps the same seed, while a new actionId
    // rotates equivalent validated matches and avoids recently shown dishes.
    const availableIngredients = buildPantryOwnershipSet(
      { inputIngredients: ingredients, normalizedIngredients: normalizedIngredientNames },
      normalizeIngredientForStrictMatch
    );
    const recentRecipeMemory = await loadRecentRecipeMemory({
      inputIngredients: ingredients,
      requestId,
      uid: requestAccess.uid
    });
    responseRecentRecipeMemory = recentRecipeMemory;
    const recentRecipeIds = recentRecipeMemory.recipes.flatMap((recipe) =>
      [recipe.id, recipe.source_recipe_id].filter((value): value is string => Boolean(value?.trim()))
    );
    const v2SearchResult = ingredients.length
      ? await searchCatalogRecipes({
          ingredients,
          preferredCuisine: parsed.data.preferredCuisine,
          calorieTarget: parsed.data.calorieTarget,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens,
          maxResults: Math.max(requestedRecipeCount, Math.min(60, requestedRecipeCount * 6)),
          recipeLanguage,
          includeFirestoreReferences: false,
          allowRemoteCaches: true,
          forceSharedCacheRead: true,
          skipStaticSources: true,
          maxMissingIngredients: parsed.data.maxMissingIngredients,
          freshnessSeed: variationSeed,
          recentRecipeIds
        })
      : null;
    const v2ExcludedIngredientFilter = filterRecipesByExcludedIngredients(
      v2SearchResult?.recipes ?? [],
      parsed.data.excludedIngredients ?? []
    );
    const v2RestrictionSafe = v2ExcludedIngredientFilter.allowed
      .filter((recipe) => !findRecipeHealthViolation(recipe, parsed.data.conditions ?? []));
    const v2FreshRecipes = hasPremiumWorkflowAccess
      ? filterPreviouslyShownRecipes(v2RestrictionSafe, recentRecipeMemory.recipes)
      : v2RestrictionSafe;
    // An account with AI access first gives Gemini the complete preferred-
    // cuisine deficit. Other cuisines are held for the response-boundary
    // fallback. Accounts without AI access can still use those V2 matches.
    const v2Plan = planSharedRecipeV2CuisineFulfillment({
      canGenerateDeficit: hasPremiumWorkflowAccess,
      matches: v2FreshRecipes,
      preferredCuisine: parsed.data.preferredCuisine,
      requestedCount: requestedRecipeCount
    });
    responseEligibleCuisineFallbackRecipes = v2Plan.alternativeCuisineMatches;
    v2PrefillRecipes = v2Plan.existing;
    logger.info("Shared V2 freshness fulfillment planned", {
      requestId,
      freshMatchCount: v2FreshRecipes.length,
      preferredFreshMatchCount: v2Plan.preferredCuisineMatches.length,
      alternativeFreshMatchCount: v2Plan.alternativeCuisineMatches.length,
      recentExcludedCount: Math.max(0, v2RestrictionSafe.length - v2FreshRecipes.length),
      generationDeficit: v2Plan.generationDeficit,
      requestedCount: requestedRecipeCount
    });

    if (v2Plan.generationDeficit === 0) {
      const generationStatus = v2Plan.unfilledCount
        ? RecipeGenerationStatus.PARTIAL_RESULTS
        : RecipeGenerationStatus.SUCCESS_DATASET;
      const message = v2Plan.unfilledCount
        ? `Showing ${v2Plan.existing.length} of ${requestedRecipeCount} validated shared recipes.`
        : undefined;
      await persistRecipeGenerationHistoryEntry({
        historyEntryId,
        recipes: v2Plan.existing,
        status: v2Plan.existing.length ? "completed" : "failed",
        errorMessage: v2Plan.existing.length ? undefined : buildRecipeUnavailableMessage(recipeLanguage),
        uid: requestAccess.uid
      });
      return await respondWithValidationReport({
        recipes: v2Plan.existing,
        result: JSON.stringify(v2Plan.existing),
        servedFrom: "shared_pool_v2",
        generationStatus: v2Plan.existing.length ? generationStatus : RecipeGenerationStatus.NO_RESULTS,
        message: message ?? (v2Plan.existing.length ? undefined : buildRecipeUnavailableMessage(recipeLanguage)),
        requestedCount: requestedRecipeCount,
        returnedCount: v2Plan.existing.length,
        aiFillAttempted: false,
        canLoadMore: Boolean(v2SearchResult?.canLoadMore),
        access: accessPayload(nextAccess)
      });
    }

    recipeCount = v2Plan.generationDeficit;
    const recipeGenerationCandidateCount = Math.min(
      MAX_RECIPE_GENERATION_CANDIDATES,
      recipeCount + Math.max(2, Math.ceil(recipeCount * 0.6))
    );
    // V2 recipes are immutable inputs and never enter this editor. Only the
    // premium deficit is sourced from references and sent to Gemini.
    const sourceRecipeEditorEnabled =
      shouldRunPremiumRecipeEditor(workflowAccess, recipeCount) || (wantsArabic && accessCheck.allowed);
    const requestPolicy = compileRecipeRequestPolicy({
      allergens: parsed.data.allergens,
      conditions: parsed.data.conditions,
      diets: parsed.data.diets,
      excludedIngredients: parsed.data.excludedIngredients,
      ingredients: normalizedIngredientNames,
      preferredCuisine: parsed.data.preferredCuisine,
      requestedCount: recipeCount
    });
    const inputCoveragePlan = requestPolicy.coveragePlan;
    const inputCoveragePrompt = toRecipeInputCoveragePrompt(inputCoveragePlan);
    // Server-side hard filter context for diet + allergens. Used to drop
    // anything generated that violates the user's rules, regardless of
    // how confidently the prompt asked the model to respect them.
    const dietContext: DietEnforcementContext = {
      diets: parsed.data.diets ?? [],
      allergens: parsed.data.allergens ?? [],
      preferredProteinIngredients: ingredients
    };
    const enforceDietOnRecipes = (recipes: Recipe[], stage: string): Recipe[] => {
      // Diet restrictions and allergens are authoritative response rules.
      // Health conditions remain adaptations so familiar dishes are retained
      // with controlled fat, sodium, portions, and carbohydrate guidance.
      const dietAdaptedRecipes = recipes.map((recipe) => adaptRecipeForDietRestrictions(recipe, dietContext));
      const restrictionSafe = filterRecipesByDiet(dietAdaptedRecipes, dietContext);
      const healthAdapted = restrictionSafe.allowed.map((recipe) =>
        adaptRecipeForHealthConditions(recipe, parsed.data.conditions ?? [])
      );
      const ordered = healthAdapted;

      recordRecipePipelineStage(validationReport, {
        entered: recipes,
        exited: ordered,
        reason: (recipe) => {
          const violation = findRecipeDietViolation(recipe, dietContext);
          return violation ? `restriction_${violation.kind}:${violation.match}` : "restriction_not_selected";
        },
        stage: `safety:${stage}`
      });
      recordRecipeGenerationTrace(validationReport, {
        type: "search",
        candidatesFound: recipes.length,
        compatibleCandidatesFound: ordered.length,
        selectedIds: ordered.map((recipe) => recipe.id ?? recipe.name)
      });

      if (restrictionSafe.rejected.length) {
        logger.warn("Recipe restriction gate removed incompatible recipes", {
          requestId,
          stage,
          removedCount: restrictionSafe.rejected.length,
          firstReason: restrictionSafe.rejected[0]?.reason
        });
      }
      return ordered;
    };
    const rememberValidSearchRecipes = (recipes: Recipe[], stage: string) => {
      if (!recipes.length) return;
      const responseSizedRecipes = recipes
        .filter((recipe) =>
          isTrustedSourcedRecipe(recipe) ||
          (Number.isFinite(recipe.acceptance_score) && Number(recipe.acceptance_score) >= 70)
        )
        .filter((recipe) => recipeCompatibilityEvaluator.evaluatePrimary(recipe).compatible)
        .filter((recipe) => isCustomerFacingRecipeContractAcceptable(recipe, recipeLanguage))
        .slice(0, recipeCount);
      if (!responseSizedRecipes.length) return;
      if (responseSizedRecipes.length >= lastValidSearchRecipes.length) {
        lastValidSearchRecipes = responseSizedRecipes;
      }
      responseSizedRecipes.forEach((recipe, index) => {
        recordRecipeLifecycle(validationReport, {
          recipeId: recipe.id ?? recipe.name,
          title: recipe.name,
          searchScore: Math.max(0, recipes.length - index),
          selected: true
        });
      });
      logger.info("Recipe search baseline preserved for fail-open response", {
        requestId,
        stage,
        recipeCount: responseSizedRecipes.length,
        recipeIds: responseSizedRecipes.map((recipe) => recipe.id ?? recipe.name)
      });
    };
    // Search expansion may include related products such as chicken stock.
    // Ownership must reflect only what the user actually entered and its
    // canonical normalization.
    const recipeCompatibilityEvaluator = createRecipeIngredientCompatibilityEvaluator(ingredients);
    const dietSafeRecentRecipes = enforceDietOnRecipes(
      responseRecentRecipeMemory.recipes,
      "daily_freshness_backfill"
    );
    const exclusionSafeRecentRecipes = filterRecipesByExcludedIngredients(
      dietSafeRecentRecipes,
      parsed.data.excludedIngredients ?? []
    ).allowed;
    responseEligibleBackfillRecipes = selectRecipesByRequestPolicy(
      exclusionSafeRecentRecipes
        .filter((recipe) => recipeCompatibilityEvaluator.evaluatePrimary(recipe).compatible)
        .filter((recipe) =>
          (recipe.missing_ingredients?.length ?? 0) <=
          (parsed.data.maxMissingIngredients ?? DEFAULT_USER_SETTINGS.maxMissingIngredients)
        )
        .filter((recipe) => isCustomerFacingRecipeContractAcceptable(recipe, recipeLanguage)),
      requestPolicy,
      requestedRecipeCount
    );
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
    const recipeGeminiCallBudget = new RecipeGeminiCallBudget();
    const recordGeminiAttempt = (event: {
      attempt: number;
      phase: string;
      reason?: string;
      status: "failed" | "started" | "succeeded";
    }) => {
      recordRecipeGenerationTrace(validationReport, {
        type: `gemini_${event.status}`,
        attempt: event.attempt,
        phase: event.phase,
        ...(event.status === "failed" ? { reason: event.reason ?? "unknown_error" } : {})
      } as Parameters<typeof recordRecipeGenerationTrace>[1]);
    };
    logger.info("Recipe generation request started", {
      requestId,
      ingredientCount: ingredients.length,
      normalizedIngredientIds: ingredientNormalization.ingredientIds,
      expandedAliases: ingredientNormalization.expandedAliases.slice(0, 20).map((alias) => ({
        term: alias.term,
        weight: alias.weight
      })),
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
    const recipeNamesToAvoid = Array.from(new Set([
      ...recentRecipeMemory.recipes.flatMap((recipe) => [recipe.dish_identity, recipe.dish_intent?.dish_name, recipe.name]),
      ...v2PrefillRecipes
        .flatMap((recipe) => [recipe.dish_identity, recipe.dish_intent?.dish_name, recipe.name])
    ].map((name) => name?.trim()).filter((name): name is string => Boolean(name))));
    const recipeReferencesPromise = shouldLoadRecipeReferencesForGeneration({
      hasAiGenerationAccess,
      ingredientCount: ingredients.length
    })
      ? findRecipeReferencesForGeneration({
          avoidRecipeNames: recipeNamesToAvoid,
          allergens: parsed.data.allergens,
          diets: parsed.data.diets,
          ingredients: scoringIngredients,
          preferredCuisine: parsed.data.preferredCuisine ?? "Any",
          maxReferences: Math.min(60, Math.max(20, recipeCount * 6)),
          variationSeed
        }).then((references) => references.filter((reference) => {
          const mappedReference = mapRecipeReferencesToRecipes([reference], {
            calorieTarget: parsed.data.calorieTarget ?? DEFAULT_USER_SETTINGS.calorieTarget,
            recipeLanguage
          })[0];
          return Boolean(mappedReference) &&
            recipeCompatibilityEvaluator.evaluatePrimary(mappedReference).compatible;
        }))
      : Promise.resolve([]);
    const requestRestriction = buildHardRequestRestrictionContext(candidateDishes, parsed.data.preferredCuisine, ingredients.length);
    let referenceLibraryNeedsGroundedSearch = ingredients.length > 0;
    const shouldLabelSimilarRecipes = Boolean(parsed.data.referenceImage);
    const recipeEditorCandidateCount = sourceRecipeEditorEnabled
      ? getPremiumRecipeEditorCandidateCount({
          hasAdaptationConstraints: hasRecipeReferenceAdaptationConstraints({
            allergens: parsed.data.allergens,
            diets: parsed.data.diets,
            excludedIngredients: parsed.data.excludedIngredients
          }),
          requestedRecipeCount: recipeCount
        })
      : recipeCount;
    const prepareRecipes = (recipes: Recipe[]) => recipes.map(normalizeRecipeLosslessly);
    const finalizeRecipes = async (recipes: Recipe[]) => {
      const finalizationStartedAt = Date.now();
      let previousFinalizationStageAt = finalizationStartedAt;
      const logFinalizationStage = (stage: string, recipeTotal: number) => {
        if (!pipelineDebug) return;
        const now = Date.now();
        logger.info("Recipe finalization stage completed", {
          requestId,
          stage,
          recipeCount: recipeTotal,
          stageDurationMs: now - previousFinalizationStageAt,
          totalDurationMs: now - finalizationStartedAt
        });
        previousFinalizationStageAt = now;
      };
      const candidateRecipeCount = sourceRecipeEditorEnabled
        ? recipeEditorCandidateCount
        : Math.min(60, Math.max(recipeCount * 3, 30));
      // Candidate identity is locked before ranking. Every later stage may
      // select or reject a recipe, but it cannot reinterpret the dish.
      const localizedCandidates = wantsArabic
        ? recipes.map(ensureArabicRecipeLanguage).map((recipe) => normalizeRecipeThroughLocalizationService(recipe, "ar"))
        : recipes;
      const identityLock = lockRecipeCandidateIdentities(
        localizedCandidates
          .map((recipe) => ({ ...recipe, name: normalizeRecipeTitleEncoding(recipe.name) }))
          .map(ensureRecipePhotoIdentity)
      );
      identityLock.rejected.forEach(({ recipe, reasons }) => {
        const reason = reasons.join(",");
        recordRecipeValidationTrace(validationReport, {
          finalDecision: "rejected",
          reason,
          recipe,
          repairActions: [],
          repairAttempted: false,
          validator: "RecipeIdentityConsistency"
        });
        recordRecipeGenerationTrace(validationReport, {
          type: "post_rejected",
          id: recipe.id ?? recipe.name,
          name: recipe.name,
          reason
        });
      });
      const sourceBackedRecipes = identityLock.recipes;
      // Keep the complete eligible pool until validation. Otherwise malformed
      // high-overlap model output can displace valid source fallbacks early.
      const preValidationCandidateCount = Math.max(candidateRecipeCount, sourceBackedRecipes.length);
      recordRecipePipelineStage(validationReport, {
        entered: [],
        exited: sourceBackedRecipes,
        reason: "candidate_loaded",
        stage: "recipe_candidates_loaded"
      });
      // Imported recipes already have a real dish identity and an ordered method.
      // The candidate-family and authenticity rewriters below were designed to
      // rescue AI-created recipes; applying them to sources can replace or
      // discard legitimate recipes before the user ever sees them.
      const preserveTrustedSources = sourceBackedRecipes.length > 0;
      const cuisinePreferred =
        parsed.data.preferredCuisine === "Any"
          ? selectRecipesByRequestPolicy(sourceBackedRecipes, requestPolicy, preValidationCandidateCount)
          : preserveTrustedSources
            ? selectTrustedSourceCuisineRecipes(
                sourceBackedRecipes,
                parsed.data.preferredCuisine,
                scoringIngredients,
                candidateRecipeCount
              )
            : enforcePreferredCuisineRecipes(
                sourceBackedRecipes,
                parsed.data.preferredCuisine,
                parsed.data.referenceImage ? "preserve_exact_scan_match" : "strict",
                preValidationCandidateCount
              );
      const cuisineCoverageCandidates =
        !parsed.data.preferredCuisine || parsed.data.preferredCuisine === "Any"
          ? sourceBackedRecipes
          : preserveTrustedSources
            ? selectTrustedSourceCuisineRecipes(
                sourceBackedRecipes,
                parsed.data.preferredCuisine,
                scoringIngredients,
                sourceBackedRecipes.length
              )
            : enforcePreferredCuisineRecipes(
                sourceBackedRecipes,
                parsed.data.preferredCuisine,
                parsed.data.referenceImage ? "preserve_exact_scan_match" : "strict",
                sourceBackedRecipes.length
              );
      const cuisineSelected = doesRecipeSetMeetInputCoverage(cuisinePreferred, inputCoveragePlan)
        ? cuisinePreferred
        : selectRecipesForInputCoverage(
            Array.from(new Map(
              [...cuisinePreferred, ...cuisineCoverageCandidates].map((recipe) => [
                recipe.id ?? `${recipe.name}|${recipe.cuisine}`,
                recipe
              ])
            ).values()),
            inputCoveragePlan,
                preValidationCandidateCount
          );
      recordRecipePipelineStage(validationReport, {
        entered: sourceBackedRecipes,
        exited: cuisineSelected,
        reason: "cuisine_priority_limit",
        stage: "cuisine_priority"
      });
      const hardRequestSelected = preserveTrustedSources
        ? cuisineSelected
        : enforceHardRequestRecipes(cuisineSelected, requestRestriction, preValidationCandidateCount);
      recordRecipePipelineStage(validationReport, {
        entered: cuisineSelected,
        exited: hardRequestSelected,
        reason: "dish_intent_priority_limit",
        stage: "dish_intent_priority"
      });
      const authenticSelected = preserveTrustedSources
        ? hardRequestSelected
        : enforceAuthenticCuisineRecipeSet(hardRequestSelected, {
            availableIngredients: scoringIngredients,
            preferredCuisine: parsed.data.preferredCuisine,
            recipeLanguage,
            recipeCount: preValidationCandidateCount
          });
      recordRecipePipelineStage(validationReport, {
        entered: hardRequestSelected,
        exited: authenticSelected,
        reason: "authenticity_priority_limit",
        stage: "authenticity_priority"
      });
      const cuisineQualitySelected = preserveTrustedSources
        ? authenticSelected
        : filterWeakSpecificCuisineRecipes(authenticSelected, {
            availableIngredients: scoringIngredients,
            preferredCuisine: parsed.data.preferredCuisine,
            recipeCount: preValidationCandidateCount,
            requestId
          });
      recordRecipePipelineStage(validationReport, {
        entered: authenticSelected,
        exited: cuisineQualitySelected,
        reason: "cuisine_quality_priority_limit",
        stage: "cuisine_quality_priority"
      });
      const proteinAlignedSelected = filterRecipesByInputMainProtein(cuisineQualitySelected, {
        availableIngredients,
        ingredients,
        scoringIngredients
      });
      recordRecipePipelineStage(validationReport, {
        entered: cuisineQualitySelected,
        exited: proteinAlignedSelected,
        reason: "protein_priority_limit",
        stage: "protein_priority"
      });
      const sparseIngredientAlignedSelected = filterRecipesByRequestedSparseIngredient(proteinAlignedSelected, {
        ingredients,
        scoringIngredients
      });
      recordRecipePipelineStage(validationReport, {
        entered: proteinAlignedSelected,
        exited: sparseIngredientAlignedSelected,
        reason: "ingredient_priority_limit",
        stage: "ingredient_priority"
      });
      const pantryPrioritized = prioritizePantryUsageRecipes(
        sparseIngredientAlignedSelected,
        scoringIngredients,
        recentRecipeMemory,
        inputCoveragePlan
      );
      const cuisineBalancedPantry = parsed.data.preferredCuisine === "Any"
        ? selectRecipesByRequestPolicy(pantryPrioritized, requestPolicy, preValidationCandidateCount)
        : pantryPrioritized.slice(0, preValidationCandidateCount);
      // Do not let candidates with a conflicting hidden protein occupy the
      // bounded diversity slots and get rejected only after valid alternatives
      // have already been displaced.
      const primaryCompatibleCuisineCandidates = cuisineBalancedPantry.filter((recipe) =>
        recipeCompatibilityEvaluator.evaluatePrimary(recipe).compatible
      );
      // Quality acceptance is authoritative. Keep every compatible candidate
      // until that gate runs so early variety scoring cannot create underfill.
      const varied = primaryCompatibleCuisineCandidates.slice(0, preValidationCandidateCount);
      logFinalizationStage("source_selection_and_initial_ranking", varied.length);
      recordRecipePipelineStage(validationReport, {
        entered: pantryPrioritized,
        exited: varied,
        reason: "diversity_priority_limit",
        stage: "preparation_diversity_priority"
      });
      const finalized = varied;

      const guarded = finalized;
      logFinalizationStage("non_mutating_recipe_guard", guarded.length);
      recordRecipePipelineStage(validationReport, {
        entered: finalized,
        exited: guarded,
        reason: "non_mutating_guard",
        stage: "recipe_guard"
      });
      const finalQualitySelected = preserveTrustedSources
        ? guarded
        : parsed.data.preferredCuisine === "Any"
          ? filterGenericAnyCuisineRecipes(guarded, { recipeCount: preValidationCandidateCount, requestId })
          : filterWeakSpecificCuisineRecipes(guarded, {
              availableIngredients: scoringIngredients,
              preferredCuisine: parsed.data.preferredCuisine,
              recipeCount: preValidationCandidateCount,
              requestId
            });
      const finalProteinAlignedSelected = filterRecipesByInputMainProtein(finalQualitySelected, {
        availableIngredients,
        ingredients,
        scoringIngredients
      });
      const finalSparseIngredientAlignedSelected = filterRecipesByRequestedSparseIngredient(finalProteinAlignedSelected, {
        ingredients,
        scoringIngredients
      });
      const finalPantryPrioritized = prioritizePantryUsageRecipes(
        finalSparseIngredientAlignedSelected,
        scoringIngredients,
        recentRecipeMemory,
        inputCoveragePlan
      );
      const finalCuisineBalanced = parsed.data.preferredCuisine === "Any"
        ? selectRecipesByRequestPolicy(finalPantryPrioritized, requestPolicy, preValidationCandidateCount)
        : finalPantryPrioritized.slice(0, preValidationCandidateCount);
      const finalPrimaryCompatibleCandidates = finalCuisineBalanced.filter((recipe) =>
        recipeCompatibilityEvaluator.evaluatePrimary(recipe).compatible
      );
      const finalCountRepaired = finalPrimaryCompatibleCandidates.slice(0, preValidationCandidateCount);
      recordRecipePipelineStage(validationReport, {
        entered: finalSparseIngredientAlignedSelected,
        exited: finalCountRepaired,
        reason: "final_ranking_limit",
        stage: "final_ranking"
      });
      const responseCandidates = finalCountRepaired.length
        ? finalCountRepaired
        : parsed.data.preferredCuisine && parsed.data.preferredCuisine !== "Any"
          ? cuisineSelected
          : sourceBackedRecipes;

      const displayCandidates = enforceDistinctPreparedRecipeDisplay(filterRecipesByInputMainProtein(
          prepareRecipes(responseCandidates),
          {
            availableIngredients,
            ingredients,
            scoringIngredients
          }
        ), preValidationCandidateCount);
      const policyOrderedDisplayCandidates = parsed.data.preferredCuisine === "Any"
        ? selectRecipesByRequestPolicy(displayCandidates, requestPolicy, preValidationCandidateCount)
        : displayCandidates;
      const formattedRecipes = prioritizeNamedCuisineRecipes(
        policyOrderedDisplayCandidates,
        parsed.data.preferredCuisine,
        preValidationCandidateCount
      );
      // Diet adaptation is allowed to change ingredient content, but the
      // immutable identity contract rejects dish or photo reinterpretation.
      const dietPrepared = enforceDietOnRecipes(formattedRecipes, "prepared_response");
      const identityValidated = filterCandidatesByIdentityContract(dietPrepared, identityLock.contracts);
      identityValidated.rejected.forEach(({ recipe, reasons }) => {
        const reason = reasons.join(",");
        recordRecipeValidationTrace(validationReport, {
          finalDecision: "rejected",
          reason,
          recipe,
          repairActions: [],
          repairAttempted: false,
          validator: "RecipeIdentityContract"
        });
        recordRecipeGenerationTrace(validationReport, {
          type: "post_rejected",
          id: recipe.id ?? recipe.name,
          name: recipe.name,
          reason
        });
      });
      const prepared = identityValidated.recipes;
      logFinalizationStage("formatting_localization_and_diet_enforcement", prepared.length);
      recordRecipePipelineStage(validationReport, {
        entered: responseCandidates,
        exited: prepared,
        reason: "formatting_or_display_diversity",
        stage: "recipe_formatting"
      });
      // Preserve structurally usable searched sources before optional
      // editorial scoring. Later enhancements may report defects, but they
      // cannot erase every authentic candidate from the response.
      rememberValidSearchRecipes(
        markProgressiveRecipeImages(
          prepared.filter((recipe) =>
            !isFundamentallyUnusableRecipe(recipe) &&
            isCustomerFacingRecipeContractAcceptable(recipe, recipeLanguage)
          )
        ),
        "pre_quality_fail_open_baseline"
      );
      const acceptedRecipes: Recipe[] = [];
      let afterTitleValidation = 0;
      let afterQuantityValidation = 0;
      for (const recipe of prepared) {
        const ingredientEvidence = recipeCompatibilityEvaluator.evaluateEvidence(recipe);
        if (!ingredientEvidence.compatible) {
          recordRecipeValidationTrace(validationReport, {
            finalDecision: "soft_selected",
            reason: ingredientEvidence.reason,
            recipe,
            repairActions: [],
            repairAttempted: false,
            validator: "RecipeIngredientEvidence"
          });
          recordRecipeLifecycle(validationReport, {
            recipeId: recipe.id ?? recipe.name,
            title: recipe.name,
            validationStatus: "accepted"
          });
        }
        const primaryCompatibility = recipeCompatibilityEvaluator.evaluatePrimary(recipe);
        if (!primaryCompatibility.compatible) {
          const primaryRejectionReason = primaryCompatibility.incompatibleProteinFamilies.length
            ? [
                `${primaryCompatibility.reason}:${primaryCompatibility.incompatibleProteinFamilies.join("+")}`,
                ...(pipelineDebug && primaryCompatibility.incompatibleProteinEvidence.length
                  ? [`evidence=${primaryCompatibility.incompatibleProteinEvidence.join("|")}`]
                  : [])
              ].join(":")
            : primaryCompatibility.reason;
          recordRecipeValidationTrace(validationReport, {
            finalDecision: "rejected",
            reason: primaryRejectionReason,
            recipe,
            repairActions: [],
            repairAttempted: false,
            validator: "RecipePrimaryIngredientCompatibility"
          });
          recordRecipeGenerationTrace(validationReport, {
            type: "post_rejected",
            id: recipe.id ?? recipe.name,
            name: recipe.name,
            reason: primaryRejectionReason
          });
          recordRecipeLifecycle(validationReport, {
            recipeId: recipe.id ?? recipe.name,
            title: recipe.name,
            rejectionReason: primaryRejectionReason,
            validationStatus: "failed"
          });
          continue;
        }
        const validatedRecipe = recipe;
        const quality = recipeQualityGate.validate(validatedRecipe, recipeLanguage);
        if (!quality.reasons.some(isTitleValidationReason)) afterTitleValidation += 1;
        if (!quality.reasons.some(isQuantityValidationReason)) afterQuantityValidation += 1;
        if (isFundamentallyUnusableRecipe(validatedRecipe)) {
          logger.warn("Recipe quality gate rejected an unusable recipe", {
            requestId,
            recipeName: validatedRecipe.name,
            reasons: quality.reasons,
            repairActions: []
          });
          recordRecipeValidationTrace(validationReport, {
            finalDecision: "rejected",
            reason: "fundamentally_unusable_recipe",
            recipe: validatedRecipe,
            repairActions: [],
            repairAttempted: false,
            validator: "RecipeQualityGate"
          });
          recordRecipeGenerationTrace(validationReport, {
            type: "post_rejected",
            id: validatedRecipe.id ?? validatedRecipe.name,
            name: validatedRecipe.name,
            reason: "fundamentally_unusable_recipe"
          });
          recordRecipeLifecycle(validationReport, {
            recipeId: validatedRecipe.id ?? validatedRecipe.name,
            title: validatedRecipe.name,
            rejectionReason: "fundamentally_unusable_recipe",
            validationStatus: "failed"
          });
          continue;
        }
        if (!quality.valid) {
          recordRecipeValidationTrace(validationReport, {
            finalDecision: "soft_selected",
            reason: quality.reasons.join(",") || "repaired_quality_warning",
            recipe: validatedRecipe,
            repairActions: [],
            repairAttempted: false,
            validator: "RecipeQualityGate"
          });
        }
        const acceptance = recipeAcceptanceEngine.evaluate(validatedRecipe, {
          allowRepairableQualityIssues: true,
                  blockingQualityReasons: getBlockingEditedRecipeQualityReasons(quality.reasons),
          failOpen: isTrustedSourcedRecipe(validatedRecipe),
          imageReady: isDurableRecipeImageUrl(validatedRecipe.image_url),
          minimumScore: 70,
          qualityGate: quality,
          recipeLanguage,
          selectedRecipes: acceptedRecipes
        });
        if (!acceptance.accepted) {
          logger.info("Recipe acceptance engine rejected a recipe below the minimum score", {
            requestId,
            recipeName: validatedRecipe.name,
            score: acceptance.score,
            reasons: acceptance.reasons,
            repairActions: []
          });
          recordRecipeValidationTrace(validationReport, {
            finalDecision: "rejected",
            reason: acceptance.reasons.join(",") || "acceptance_score_below_minimum",
            recipe: validatedRecipe,
            repairActions: [],
            repairAttempted: false,
            validator: "RecipeAcceptanceEngine"
          });
          recordRecipeGenerationTrace(validationReport, {
            type: "post_rejected",
            id: validatedRecipe.id ?? validatedRecipe.name,
            name: validatedRecipe.name,
            reason: acceptance.reasons.join(",") || "acceptance_score_below_minimum"
          });
          recordRecipeLifecycle(validationReport, {
            recipeId: validatedRecipe.id ?? validatedRecipe.name,
            title: validatedRecipe.name,
            rejectionReason: acceptance.reasons.join(",") || "acceptance_score_below_minimum",
            validationStatus: "failed"
          });
          continue;
        }
        acceptedRecipes.push({
          ...validatedRecipe,
          acceptance_reasons: acceptance.reasons,
          acceptance_score: acceptance.score
        });
        recordRecipeLifecycle(validationReport, {
          recipeId: validatedRecipe.id ?? validatedRecipe.name,
          title: validatedRecipe.name,
          validationStatus: "accepted"
        });
        recordRecipeValidationTrace(validationReport, {
          finalDecision: "accepted",
          reason: acceptance.reasons.join(",") || "accepted",
          recipe: validatedRecipe,
          repairActions: [],
          repairAttempted: false,
          validator: "RecipeAcceptanceEngine"
        });
      }
      const qualityGated = acceptedRecipes;
      logFinalizationStage("validation_and_quality_acceptance", qualityGated.length);
      recordRecipePipelineStage(validationReport, {
        entered: prepared,
        exited: qualityGated,
        reason: "fundamentally_unusable_recipe",
        stage: "quality_gate"
      });
      updateRecipeValidationFunnel(validationReport, {
        after_quality_gate: qualityGated.length,
        after_quantity_validation: afterQuantityValidation,
        after_title_validation: afterTitleValidation
      });
      const diversityPreferred = enforceRecipeDiversity(qualityGated, {
        limit: candidateRecipeCount,
        maxPerFamilyDuringSoftFill: 2,
        rotateCuisines: !parsed.data.preferredCuisine || parsed.data.preferredCuisine === "Any",
        softFill: true,
        similarityThreshold: RECIPE_SIMILARITY_REJECTION_THRESHOLD
      });
      const diversitySelected = doesRecipeSetMeetInputCoverage(diversityPreferred, inputCoveragePlan)
        ? diversityPreferred
        : selectRecipesForInputCoverage(
            Array.from(new Map(
              [...diversityPreferred, ...qualityGated].map((recipe) => [
                recipe.id ?? `${recipe.name}|${recipe.cuisine}`,
                recipe
              ])
            ).values()),
            inputCoveragePlan,
            preValidationCandidateCount
          );
      recordRecipePipelineStage(validationReport, {
        entered: qualityGated,
        exited: diversitySelected,
        reason: "duplicate_or_diversity_score",
        stage: "diversity_ranking"
      });
      updateRecipeValidationFunnel(validationReport, {
        after_diversity: diversitySelected.length
      });
      if (diversitySelected.length < qualityGated.length) {
        logger.info("Recipe diversity validator removed near-duplicate recipes", {
          requestId,
          beforeCount: qualityGated.length,
          afterCount: diversitySelected.length,
          similarityThreshold: RECIPE_SIMILARITY_REJECTION_THRESHOLD
        });
        const selectedDiversityKeys = new Set(diversitySelected.map(getRecipeDuplicateCardKey));
        qualityGated
          .filter((recipe) => !selectedDiversityKeys.has(getRecipeDuplicateCardKey(recipe)))
          .forEach((recipe) => {
            recordRecipeValidationTrace(validationReport, {
              finalDecision: "soft_dropped",
              reason: "diversity_limit_or_similarity",
              recipe,
              repairActions: [],
              repairAttempted: false,
              validator: "RecipeDiversityValidator"
            });
          });
      } else if (diversitySelected.length) {
        diversitySelected.forEach((recipe) => {
          recordRecipeValidationTrace(validationReport, {
            finalDecision: "soft_selected",
            reason: "diversity_soft_fill",
            recipe,
            repairActions: [],
            repairAttempted: false,
            validator: "RecipeDiversityValidator"
          });
        });
      }
      const localizedSelected = diversitySelected.flatMap((recipe) => {
        const localizedRecipe = recipe;
        const rawContractViolations = getCustomerFacingRecipeContractViolations(localizedRecipe, recipeLanguage);
        const contractViolations = isTrustedSourcedRecipe(localizedRecipe)
          ? rawContractViolations.filter((reason) => reason !== "title_does_not_describe_recipe")
          : rawContractViolations;
        if (contractViolations.length) {
          logger.warn("Recipe rejected by the customer-facing response contract", {
            requestId,
            recipeName: localizedRecipe.name,
            recipeLanguage,
            reasons: contractViolations,
            ...(pipelineDebug && wantsArabic
              ? { englishLeakageFields: getArabicRecipeEnglishLeakageFields(localizedRecipe) }
              : {})
          });
          recordRecipeValidationTrace(validationReport, {
            finalDecision: "rejected",
            reason: contractViolations.join(","),
            recipe: localizedRecipe,
            repairActions: ["normalized_with_localization_service"],
            repairAttempted: true,
            validator: "RecipeLocalizationValidator"
          });
          recordRecipeGenerationTrace(validationReport, {
            type: "post_rejected",
            id: localizedRecipe.id ?? localizedRecipe.name,
            name: localizedRecipe.name,
            reason: contractViolations.join(",")
          });
          recordRecipeLifecycle(validationReport, {
            recipeId: localizedRecipe.id ?? localizedRecipe.name,
            title: localizedRecipe.name,
            rejectionReason: contractViolations.join(","),
            validationStatus: "failed"
          });
          return [];
        }
        return [localizedRecipe];
      });
      logFinalizationStage("diversity_and_final_localization", localizedSelected.length);
      recordRecipePipelineStage(validationReport, {
        entered: diversitySelected,
        exited: localizedSelected,
        reason: "localization_validation",
        stage: "localization"
      });

      // Fresh recipes remain first. Eligible recent recipes are reintroduced
      // only at the response boundary when the fresh set cannot fill the request.
      const activeDiets = parsed.data.diets ?? [];
      const policySelected = selectRecipesByRequestPolicy(localizedSelected, requestPolicy, recipeCount);
      const photoReadySelected = isFreeTier
        ? selectRecipesByRequestPolicy(localizedSelected, requestPolicy, recipeCount, {
            isEligible: (recipe) => canReuseRecipePhotoForDiet(recipe, activeDiets, true)
          })
        : [];
      const coverageSelected = photoReadySelected.length >= recipeCount
        ? photoReadySelected
        : policySelected;
      const responseRecipes = markProgressiveRecipeImages(
        await attachPhotosFromPublishedRecipeBundles(coverageSelected, activeDiets)
      );
      const coverageAnalysis = analyzeRecipeInputCoverage(responseRecipes, inputCoveragePlan);
      logger.info("Recipe input coverage selection completed", {
        requestId,
        requestedCount: recipeCount,
        returnedCount: responseRecipes.length,
        targets: Object.fromEntries(inputCoveragePlan.anchors.map((anchor) => [anchor.id, anchor.targetCards])),
        coverage: coverageAnalysis.coverage,
        missingAnchors: coverageAnalysis.missingAnchors,
        cardsUsingNoAnchor: coverageAnalysis.cardsUsingNoAnchor,
        cardsUsingMultipleAnchors: coverageAnalysis.cardsUsingMultipleAnchors
      });
      logFinalizationStage("response_mapping", responseRecipes.length);
      recordRecipePipelineStage(validationReport, {
        entered: localizedSelected,
        exited: responseRecipes,
        reason: "response_limit",
        stage: "image_matching_and_response"
      });
      return responseRecipes;
    };
    const finalizeRecipeResponse = async (recipes: Recipe[]) => {
      const finalizedGenerated = await finalizeRecipes(recipes);
      const freshGenerated = hasPremiumWorkflowAccess
        ? filterPreviouslyShownRecipes(finalizedGenerated, recentRecipeMemory.recipes)
        : finalizedGenerated;
      return mergeSharedRecipeV2Results(
        v2PrefillRecipes,
        freshGenerated,
        requestedRecipeCount
      );
    };
    const strictRankingOptions = {
      ...parsed.data,
      ingredients: scoringIngredients,
      recipeCount,
      recentRecipeMemory,
      requestPolicy,
      variationSeed
    };
    const sourceRankingOptions = {
      ...strictRankingOptions,
      candidateLimit: Math.max(recipeCount * 6, 60)
    };
    let responseReadySourceRecipes: Recipe[] = [];
    let recipeEditorSourceRecipes: Recipe[] = [];
    const finalizeSourceCandidatesBeforeEditor =
      !sourceRecipeEditorEnabled && shouldFinalizeSourceCandidatesBeforeEditor(workflowAccess);
    const rememberRecipeEditorSources = (recipes: Recipe[]) => {
      const authenticSources = recipes.filter((recipe) =>
        recipe.recipe_source_type !== "local_database" &&
        isTrustedSourcedRecipe(recipe) &&
        !isMalformedRecipeTitle(recipe.name) &&
        (
            !parsed.data.preferredCuisine ||
            parsed.data.preferredCuisine === "Any" ||
            (
              cuisineMatchesPreference(recipe.cuisine, parsed.data.preferredCuisine) &&
              !hasRecipeConflictingCuisineIdentity(recipe, parsed.data.preferredCuisine)
            ) ||
            hasStrongSpecificCuisineIdentity(recipe, parsed.data.preferredCuisine, scoringIngredients)
        )
      );
      if (!authenticSources.length) return;
      const rankedEditorSources = rankStrictRecipes(
        mergeRecipeResults(
          null,
          [...recipeEditorSourceRecipes, ...authenticSources],
          false,
          sourceRankingOptions.candidateLimit
        ),
        sourceRankingOptions
      );
      recipeEditorSourceRecipes = prioritizeCuratedRecipeSources(
        rankedEditorSources,
        recipeEditorCandidateCount
      );
    };

    if (USE_MOCK && accessCheck.allowed) {
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
        strictRankingOptions
      );
      const finalRecipes = await finalizeRecipeResponse(
        mergeRecipeResults(exactScanMatch, strictRecipes, shouldLabelSimilarRecipes, recipeCount)
      );
      await queueRecipeCachePersist({
        uid: requestAccess.uid,
        recipeLanguage,
        recipes: finalRecipes,
        dietContext,
        promoteToSharedPool: hasPremiumWorkflowAccess
      });
      await persistRecipeGenerationHistoryEntry({
        historyEntryId,
        recipes: finalRecipes,
        status: "completed",
        uid: requestAccess.uid
      });
      return await respondWithValidationReport({
        recipes: finalRecipes,
        result: JSON.stringify(finalRecipes),
        servedFrom: "mock",
        generationStatus: RecipeGenerationStatus.SUCCESS_AI,
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

    const catalogSearchLimit = parsed.data.preferredCuisine && parsed.data.preferredCuisine !== "Any"
      ? Math.max(recipeCount, Math.min(60, recipeCount * 6))
      : Math.max(recipeCount, Math.min(MAX_SHARED_POOL_RECIPE_RESULT_COUNT * 3, recipeCount * 3));
    let sharedRecipeSearchPromise: ReturnType<typeof searchCatalogRecipes> | null = null;
    const loadSharedRecipeSearchResult = () => {
      if (!sharedRecipeSearchPromise) {
        sharedRecipeSearchPromise = searchCatalogRecipes({
          ingredients,
          preferredCuisine: parsed.data.preferredCuisine,
          calorieTarget: parsed.data.calorieTarget,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens,
          maxResults: catalogSearchLimit,
          // Premium Arabic cards are localized once by the per-source editor.
          // Mapping every discovery candidate to Arabic first duplicates work
          // and can turn long imported source prose into a request bottleneck.
          recipeLanguage: sourceRecipeEditorEnabled && wantsArabic ? "English" : recipeLanguage,
          uid: requestAccess.uid,
          // This route already searches recipeReferenceRecipes through
          // findRecipeReferencesForGeneration. Avoid transferring the same
          // source documents again during catalog fallback.
          includeFirestoreReferences: false,
          allowRemoteCaches: !hasAiGenerationAccess,
          forceSharedCacheRead: !hasAiGenerationAccess,
          // The trusted bundled catalog is a validated, zero-AI-cost baseline
          // for every account. Free users still read the shared pool, but a
          // noisy or incomplete remote index must not hide canonical dishes.
          skipStaticSources: false,
          maxMissingIngredients: parsed.data.maxMissingIngredients,
          freshnessSeed: variationSeed,
          recentRecipeIds
        });
      }
      return sharedRecipeSearchPromise;
    };

    if (ingredients.length) {
      const recipeReferences = await recipeReferencesPromise;
      increaseRecipeValidationDatabaseFound(validationReport, recipeReferences.length);
      const referenceRecipes = mapRecipeReferencesToRecipes(recipeReferences, {
        calorieTarget: parsed.data.calorieTarget,
        // Premium editing must receive the untouched source language. Early
        // deterministic word substitution corrupts titles and full sentences
        // before the one-recipe Gemini editor has a chance to localize them.
        recipeLanguage: sourceRecipeEditorEnabled && wantsArabic ? "English" : recipeLanguage
      });
      recordRecipeGenerationTrace(validationReport, {
        type: "search",
        candidatesFound: referenceRecipes.length,
        selectedIds: referenceRecipes.map((recipe) => recipe.id ?? recipe.name)
      });
      recordRecipePipelineStage(validationReport, {
        entered: [],
        exited: referenceRecipes,
        reason: "no_exact_ingredient_match",
        stage: "recipe_search:exact_ingredient"
      });
      if (referenceRecipes.length) {
        const ownedReferenceRecipes = applyStrictIngredientOwnership(referenceRecipes, availableIngredients, {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens
        });
        if (sourceRecipeEditorEnabled) {
          rememberRecipeEditorSources(rankStrictRecipes(ownedReferenceRecipes, sourceRankingOptions));
        }
        const strictReferenceRecipes = rankStrictRecipes(
          enforceDietOnRecipes(
            ownedReferenceRecipes,
            "recipe_reference_primary"
          ),
          sourceRankingOptions
        );
        rememberRecipeEditorSources(strictReferenceRecipes);
        recordRecipeGenerationTrace(validationReport, {
          type: "search",
          candidatesFound: referenceRecipes.length,
          selectedIds: strictReferenceRecipes.map((recipe) => recipe.id ?? recipe.name)
        });
        const shouldUseReferenceDirectly =
          !hasRecipeReferenceAdaptationConstraints({
            allergens: parsed.data.allergens,
            diets: parsed.data.diets,
            excludedIngredients: parsed.data.excludedIngredients
          }) &&
          strictReferenceRecipes.length > 0 &&
          !hasUnresolvedSensitiveRecipeAdaptationRequest({
            allergens: parsed.data.allergens,
            conditions: parsed.data.conditions,
            diets: parsed.data.diets,
            excludedIngredients: parsed.data.excludedIngredients,
            requestedCount: recipeCount,
            safeReferenceCount: strictReferenceRecipes.length
          });

        const validatedReferenceRecipes = finalizeSourceCandidatesBeforeEditor
          ? await finalizeRecipeResponse(
              mergeRecipeResults(exactScanMatch, strictReferenceRecipes, shouldLabelSimilarRecipes, sourceRankingOptions.candidateLimit)
            )
          : [];
        if (shouldReplaceResponseSourceSet(
          responseReadySourceRecipes,
          validatedReferenceRecipes,
          scoringIngredients,
          ingredients.length
        )) {
          responseReadySourceRecipes = validatedReferenceRecipes;
        }
        rememberValidSearchRecipes(validatedReferenceRecipes, "recipe_reference_validated");
        const referenceSourceCandidates = sourceRecipeEditorEnabled
          ? recipeEditorSourceRecipes
          : validatedReferenceRecipes;
        referenceLibraryNeedsGroundedSearch = countRecipesWithUsefulPantryCoverage(
          referenceSourceCandidates,
          scoringIngredients,
          ingredients.length
        ) < recipeCount;

        const referenceHasRequestedCuisineDiversity =
          normalizeCuisinePreference(parsed.data.preferredCuisine ?? "Any") !== "any" ||
          hasMinimumAnyCuisineDiversity(validatedReferenceRecipes, recipeCount);
        const referenceHasRequestedCuisineDepth =
          normalizeCuisinePreference(parsed.data.preferredCuisine ?? "Any") === "any" ||
          validatedReferenceRecipes.filter((recipe) =>
            hasStrongSpecificCuisineIdentity(
              recipe,
              parsed.data.preferredCuisine ?? "Any",
              scoringIngredients
            )
          ).length >= Math.min(5, recipeCount);
        if (
          finalizeSourceCandidatesBeforeEditor &&
          shouldUseReferenceDirectly &&
          strictReferenceRecipes.length &&
          referenceHasRequestedCuisineDiversity &&
          referenceHasRequestedCuisineDepth
        ) {
          const finalRecipes = validatedReferenceRecipes;
          if (finalRecipes.length < recipeCount) {
            logger.warn("Reference library did not retain enough source-backed recipes after validation", {
              requestId,
              requestedCount: recipeCount,
              returnedCount: finalRecipes.length
            });
          } else if (shouldServeDatasetBeforeRecipeEditor({
            access: workflowAccess,
            availableRecipeCount: finalRecipes.length,
            requestedRecipeCount: recipeCount
          })) {
            await queueRecipeCachePersist({
              uid: requestAccess.uid,
              recipeLanguage,
              recipes: finalRecipes,
              dietContext,
              promoteToSharedPool: hasPremiumWorkflowAccess
            });
            await persistRecipeGenerationHistoryEntry({
              historyEntryId,
              recipes: finalRecipes,
              status: "completed",
              uid: requestAccess.uid
            });
            logger.info("Recipe generation served from real recipe reference library", {
              ...aiTraceSummary,
              servedFrom: "recipe_reference",
              referenceCount: recipeReferences.length,
              safeReferenceCount: strictReferenceRecipes.length,
              recipeCountReturned: finalRecipes.length
            });
            return await respondWithValidationReport({
              recipes: finalRecipes,
              result: JSON.stringify(finalRecipes),
              servedFrom: "recipe_reference",
              generationStatus: RecipeGenerationStatus.SUCCESS_DATASET,
              canLoadMore: recipeReferences.length > recipeCount,
              access: accessPayload(nextAccess)
            });
          }
        }

        // RecipeNLG is a broad reference corpus and may not contain enough
        // correctly classified dishes for a chosen cuisine. Before falling
        // back to Google grounding, combine it with the app's verified local
        // recipe catalog. Both paths preserve authored source instructions.
        const needsTrustedCuisineCatalog = sourceRecipeEditorEnabled &&
          Boolean(parsed.data.preferredCuisine && parsed.data.preferredCuisine !== "Any") &&
          !referenceSourceCandidates.some((recipe) => recipe.id?.startsWith("trusted-source-"));
        const needsAnyCuisineDiversityCatalog =
          normalizeCuisinePreference(parsed.data.preferredCuisine ?? "Any") === "any" &&
          !hasMinimumAnyCuisineDiversity(referenceSourceCandidates, recipeCount);
        const needsSpecificCuisineDepthCatalog =
          normalizeCuisinePreference(parsed.data.preferredCuisine ?? "Any") !== "any" &&
          (
            !sourceRecipeEditorEnabled ||
            referenceSourceCandidates.filter((recipe) =>
              hasStrongSpecificCuisineIdentity(
                recipe,
                parsed.data.preferredCuisine ?? "Any",
                scoringIngredients
              )
            ).length < Math.min(5, recipeCount)
          );
        const localCatalogResult = (
          needsTrustedCuisineCatalog ||
          needsAnyCuisineDiversityCatalog ||
          needsSpecificCuisineDepthCatalog ||
          shouldExpandRecipeSourceSearch({
          availableRecipeCount: referenceSourceCandidates.length,
          qualityRecipeCount: countRecipesWithUsefulPantryCoverage(
            referenceSourceCandidates,
            scoringIngredients,
            ingredients.length
          ),
          requestedRecipeCount: recipeCount
        }))
          ? await loadSharedRecipeSearchResult()
          : null;
        if (localCatalogResult) {
        recordRecipeGenerationTrace(validationReport, {
          type: "search",
          candidatesFound: localCatalogResult.candidateRecipes.length,
          compatibleCandidatesFound: localCatalogResult.matchingRecipeCount,
          selectedIds: localCatalogResult.rankedRecipeIds
        });
        recordRecipePipelineStage(validationReport, {
          entered: [],
          exited: localCatalogResult.recipes,
          reason: "fallback_to_catalog",
          stage: "recipe_search:synonyms_protein_dish_cuisine"
        });
        increaseRecipeValidationDatabaseFound(validationReport, recipeReferences.length + localCatalogResult.recipes.length);
        const ownedCatalogRecipes = applyStrictIngredientOwnership(localCatalogResult.recipes, availableIngredients, {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens
        });
        if (sourceRecipeEditorEnabled) {
          rememberRecipeEditorSources(rankStrictRecipes(ownedCatalogRecipes, sourceRankingOptions));
        }
        const strictCatalogRecipes = rankStrictRecipes(
          enforceDietOnRecipes(
            ownedCatalogRecipes,
            "catalog_local_source"
          ),
          sourceRankingOptions
        );
        rememberRecipeEditorSources(strictCatalogRecipes);
        const validatedLocalSourceRecipes = finalizeSourceCandidatesBeforeEditor
          ? await finalizeRecipeResponse(
              mergeRecipeResults(
                exactScanMatch,
                [...strictReferenceRecipes, ...strictCatalogRecipes],
                shouldLabelSimilarRecipes,
                sourceRankingOptions.candidateLimit
              )
            )
          : [];
        if (shouldReplaceResponseSourceSet(
          responseReadySourceRecipes,
          validatedLocalSourceRecipes,
          scoringIngredients,
          ingredients.length
        )) {
          responseReadySourceRecipes = validatedLocalSourceRecipes;
        }
        rememberValidSearchRecipes(validatedLocalSourceRecipes, "catalog_local_source_validated");
        const localSourceCandidates = sourceRecipeEditorEnabled
          ? recipeEditorSourceRecipes
          : validatedLocalSourceRecipes;
        referenceLibraryNeedsGroundedSearch = countRecipesWithUsefulPantryCoverage(
          localSourceCandidates,
          scoringIngredients,
          ingredients.length
        ) < recipeCount;

        if (
          shouldServeDatasetBeforeRecipeEditor({
            access: workflowAccess,
            availableRecipeCount: validatedLocalSourceRecipes.length,
            requestedRecipeCount: recipeCount
          }) &&
          !hasRecipeReferenceAdaptationConstraints({
            allergens: parsed.data.allergens,
            diets: parsed.data.diets,
            excludedIngredients: parsed.data.excludedIngredients
          }) &&
          validatedLocalSourceRecipes.length >= recipeCount
        ) {
          await queueRecipeCachePersist({
            uid: requestAccess.uid,
            recipeLanguage,
            recipes: validatedLocalSourceRecipes,
            dietContext,
            promoteToSharedPool: hasPremiumWorkflowAccess
          });
          await persistRecipeGenerationHistoryEntry({
            historyEntryId,
            recipes: validatedLocalSourceRecipes,
            status: "completed",
            uid: requestAccess.uid
          });
          logger.info("Recipe generation served from validated local recipe sources", {
            ...aiTraceSummary,
            servedFrom: "local_recipe_sources",
            referenceCount: recipeReferences.length,
            catalogCount: strictCatalogRecipes.length,
            recipeCountReturned: validatedLocalSourceRecipes.length
          });
          return await respondWithValidationReport({
            recipes: validatedLocalSourceRecipes,
            result: JSON.stringify(validatedLocalSourceRecipes),
            servedFrom: "local_recipe_sources",
            generationStatus: RecipeGenerationStatus.SUCCESS_DATASET,
            canLoadMore: recipeReferences.length + strictCatalogRecipes.length > recipeCount,
            access: accessPayload(nextAccess)
          });
        }

        logger.info("Recipe reference library needs AI adaptation for sensitive constraints", {
          requestId,
          referenceCount: recipeReferences.length,
          safeReferenceCount: strictReferenceRecipes.length,
          requestedCount: recipeCount,
          allergenCount: parsed.data.allergens?.length ?? 0,
          conditionCount: parsed.data.conditions?.length ?? 0,
          dietCount: parsed.data.diets?.length ?? 0,
          excludedIngredientCount: parsed.data.excludedIngredients?.length ?? 0
        });
        } else {
          logger.info("Recipe reference library satisfied source count; skipping catalog expansion", {
            requestId,
            requestedCount: recipeCount,
            sourceRecipeCount: referenceSourceCandidates.length,
            trustedCuratedSourceCount: referenceSourceCandidates.filter((recipe) =>
              recipe.id?.startsWith("trusted-source-")
            ).length
          });
        }
      }
    }

    const datasetSearchResult =
      ingredients.length &&
      shouldExpandRecipeSourceSearch({
        availableRecipeCount: sourceRecipeEditorEnabled
          ? recipeEditorSourceRecipes.length
          : responseReadySourceRecipes.length,
        requestedRecipeCount: recipeCount
      })
        ? await loadSharedRecipeSearchResult()
        : null;
    if (datasetSearchResult) {
      recordRecipeGenerationTrace(validationReport, {
        type: "search",
        candidatesFound: datasetSearchResult.candidateRecipes.length,
        compatibleCandidatesFound: datasetSearchResult.matchingRecipeCount,
        selectedIds: datasetSearchResult.rankedRecipeIds
      });
      recordRecipePipelineStage(validationReport, {
        entered: [],
        exited: datasetSearchResult.recipes,
        reason: "fallback_to_catalog",
        stage: "recipe_search:catalog_fallback"
      });
      increaseRecipeValidationDatabaseFound(validationReport, datasetSearchResult.recipes.length);
      const ownedDatasetRecipes = applyStrictIngredientOwnership(
        datasetSearchResult.recipes,
        availableIngredients,
        {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens
        }
      );
      if (sourceRecipeEditorEnabled) {
        rememberRecipeEditorSources(rankStrictRecipes(ownedDatasetRecipes, sourceRankingOptions));
      }
      const strictDatasetRecipes = rankStrictRecipes(
        enforceDietOnRecipes(
          ownedDatasetRecipes,
          "recipe_dataset_primary"
        ),
        sourceRankingOptions
      );
      rememberRecipeEditorSources(strictDatasetRecipes);
      const finalDatasetRecipes = finalizeSourceCandidatesBeforeEditor
        ? await finalizeRecipeResponse(
            mergeRecipeResults(exactScanMatch, strictDatasetRecipes, shouldLabelSimilarRecipes, sourceRankingOptions.candidateLimit)
          )
        : [];
      if (shouldReplaceResponseSourceSet(
        responseReadySourceRecipes,
        finalDatasetRecipes,
        scoringIngredients,
        ingredients.length
      )) {
        responseReadySourceRecipes = finalDatasetRecipes;
      }
      rememberValidSearchRecipes(finalDatasetRecipes, "recipe_dataset_validated");

      if (shouldServeDatasetBeforeRecipeEditor({
        access: workflowAccess,
        availableRecipeCount: finalDatasetRecipes.length,
        requestedRecipeCount: recipeCount
      })) {
        await queueRecipeCachePersist({
          uid: requestAccess.uid,
          recipeLanguage,
          recipes: finalDatasetRecipes,
          dietContext,
          promoteToSharedPool: hasPremiumWorkflowAccess
        });
        await persistRecipeGenerationHistoryEntry({
          historyEntryId,
          recipes: finalDatasetRecipes,
          status: "completed",
          uid: requestAccess.uid
        });
        logger.info("Recipe generation served from recipe dataset before AI", {
          ...aiTraceSummary,
          servedFrom: datasetSearchResult.servedFrom,
          recipeCountReturned: finalDatasetRecipes.length
        });
        return await respondWithValidationReport({
          recipes: finalDatasetRecipes,
          result: JSON.stringify(finalDatasetRecipes),
          servedFrom: datasetSearchResult.servedFrom,
          generationStatus: RecipeGenerationStatus.SUCCESS_DATASET,
          canLoadMore: datasetSearchResult.canLoadMore,
          access: accessPayload(nextAccess)
        });
      }

      logger.info("Recipe dataset search did not produce enough response-ready recipes; trying custom generation", {
        ...aiTraceSummary,
        candidateCount: datasetSearchResult.recipes.length,
        requestedCount: recipeCount,
        responseReadyCount: finalDatasetRecipes.length
      });
    }

    // If the dataset could not produce usable cards, only users with available
    // generation access continue into custom generation. Otherwise the client gets a friendly
    // empty-state message instead of a shared-pool warning.
    if (!accessCheck.allowed) {
      if (responseReadySourceRecipes.length) {
        await queueRecipeCachePersist({
          uid: requestAccess.uid,
          recipeLanguage,
          recipes: responseReadySourceRecipes,
          dietContext,
          promoteToSharedPool: hasPremiumWorkflowAccess
        });
        await persistRecipeGenerationHistoryEntry({
          historyEntryId,
          recipes: responseReadySourceRecipes,
          status: "completed",
          uid: requestAccess.uid
        });
        return await respondWithValidationReport({
          recipes: responseReadySourceRecipes,
          result: JSON.stringify(responseReadySourceRecipes),
          servedFrom: "shared_pool",
          generationStatus: RecipeGenerationStatus.PARTIAL_RESULTS,
          message: `Showing ${responseReadySourceRecipes.length} of ${recipeCount} shared-pool recipes. ${buildFreeAiCreditsExhaustedNotice("Shared recipes remain available.")}`,
          requestedCount: recipeCount,
          returnedCount: responseReadySourceRecipes.length,
          aiFillAttempted: false,
          aiFillUnavailableReason: accessCheck.reason,
          canLoadMore: false,
          access: accessPayload(nextAccess)
        });
      }
      const message = buildRecipeUnavailableMessage(recipeLanguage);
      logger.info("Recipe generation stopped after empty dataset search and unavailable AI access", {
        accessReason: accessCheck.reason,
        isFreeTier
      });
      await persistRecipeGenerationHistoryEntry({
        errorMessage: message,
        historyEntryId,
        recipes: [],
        status: "failed",
        uid: requestAccess.uid
      });
      return await respondWithValidationReport({
        message,
        recipes: [],
        result: "[]",
        servedFrom: "shared_pool",
        generationStatus: RecipeGenerationStatus.NO_RESULTS,
        requestedCount: recipeCount,
        returnedCount: 0,
        aiFillAttempted: false,
        aiFillUnavailableReason: accessCheck.reason,
        canLoadMore: false,
        access: accessPayload(nextAccess)
      });
    }

    try {
      ensureAiAvailable();
      const recipeReferences = await recipeReferencesPromise;
      // A partial or wrong-cuisine local hit must not suppress web grounding.
      // Search grounding is the source-of-truth fallback, never generic text.
      const shouldUseGroundedRecipeSearch = referenceLibraryNeedsGroundedSearch || recipeReferences.length === 0;
      const promptIngredients = normalizedPromptIngredients.map((ingredient, index) => ({
        name: wantsArabic ? ingredient.raw : preserveRequestedIngredientForm(ingredient.raw, ingredient.normalized),
        quantity: readIngredientQuantity(parsed.data.ingredientQuantities?.[index])
      }));
      const batchEditorSystemInstruction = PromptBuilder.recipeEditorBatchSystemPrompt(recipeLanguage);
      const discoverySystemInstruction = PromptBuilder.recipeDiscoverySystemPrompt(recipeLanguage);
      const batchGenerationSystemInstruction = PromptBuilder.recipeBatchGenerationSystemPrompt(recipeLanguage);
      const explicitSteakRequest = ingredients.some(isExplicitSteakIngredient);
      const steakFocusedDiscovery = explicitSteakRequest &&
        hasExclusiveRequestedProteinForm(ingredients, "beef");
      const groundedPrimaryIngredient = steakFocusedDiscovery
        ? ingredients.find(isExplicitSteakIngredient) ?? "steak"
        : choosePrimarySparseIngredient(ingredients, scoringIngredients);
      const groundedPrimaryProfile = getIngredientProfileForTerm(groundedPrimaryIngredient);
      const groundedPrimaryAliases = (inputCoveragePlan.anchors.length > 1
        ? inputCoveragePlan.anchors.flatMap((anchor) => anchor.aliases)
        : [
            groundedPrimaryIngredient,
            groundedPrimaryProfile?.canonicalEnglishName,
            ...(groundedPrimaryProfile?.aliases ?? [])
          ])
        .filter((value): value is string => Boolean(value))
        .map(normalizeIngredientText);
      const catalogCanonicalDishNames = resolveAuthenticCuisineDishes({
        cuisine: parsed.data.preferredCuisine ?? "Any",
        ingredients: scoringIngredients
      }, 18)
        .filter((candidate) =>
          [...candidate.dish.primaryIngredients, ...candidate.dish.optionalIngredients]
            .map(normalizeIngredientText)
            .some((ingredient) => groundedPrimaryAliases.some((alias) =>
              ingredient === alias || ingredient.includes(alias) || alias.includes(ingredient)
            ))
        )
        .filter((candidate) => {
          if (!steakFocusedDiscovery) return true;
          const identity = normalizeIngredientText([
            candidate.dishName,
            ...candidate.dish.primaryIngredients
          ].join(" "));
          return /\b(?:steak|sirloin|ribeye|rib eye|strip steak|tenderloin|filet mignon|flank steak|skirt steak|carne asada|churrasco|bistecca)\b/.test(identity) &&
            !/\b(?:ground|minced|mince|hamburger|meatball|kofta|kofte|burger|meatloaf)\b/.test(identity);
        })
        .map((candidate) => candidate.dishName);
      const groundedCanonicalDishNames = steakFocusedDiscovery
        ? Array.from(new Set([
            "Steak au Poivre",
            "Steak Diane",
            "Bistecca alla Fiorentina",
            "Carne Asada",
            "Churrasco",
            "Steak Fajitas",
            "Pepper Steak",
            "Beef Bulgogi with Sliced Sirloin",
            "London Broil",
            "Swiss Steak",
            "Tagliata di Manzo",
            "Sirloin Steak with Chimichurri",
            ...catalogCanonicalDishNames
          ]))
        : catalogCanonicalDishNames;
      const generateRecipeBatch = async (input: {
        avoidRecipeNames?: string[];
        phase: string;
        requestedCount: number;
      }) => {
        const batchSize = Math.max(1, input.requestedCount);
        const discoveryFocuses = [
          "braised or stewed canonical dish",
          "baked or roasted canonical dish",
          "pasta or noodle canonical dish",
          "grilled or pan-seared canonical dish",
          "soup, rice, or grain canonical dish",
          "stuffed, breaded, or composed canonical dish"
        ];
        const runBatch = async (batchCount: number, index: number, avoidRecipeNames: string[]) => {
          const batchCoveragePrompt = toRecipeInputCoveragePrompt(
            createRecipeInputCoveragePlan(ingredients, batchCount)
          );
          const canonicalDishWindow = Array.from(
            { length: Math.min(12, groundedCanonicalDishNames.length) },
            (_, offset) => groundedCanonicalDishNames[(index * 3 + offset) % groundedCanonicalDishNames.length]
          ).filter(Boolean);
          const discoveryPrompt = PromptBuilder.recipeGeneration(promptIngredients, {
            recipeLanguage,
            preferredCuisine: parsed.data.preferredCuisine ?? "Any",
            calorieTarget: parsed.data.calorieTarget ?? 2000,
            maxMissingIngredients: parsed.data.maxMissingIngredients ?? 3,
            ingredientCoverage: batchCoveragePrompt,
            primaryIngredient: inputCoveragePlan.anchors.length === 1 ? groundedPrimaryIngredient : undefined,
            recipeCount: batchCount,
            diets: parsed.data.diets ?? [],
            // Discovery retrieves the authentic source recipe. Medical
            // adaptation is deterministic after search and must not distort
            // the source title, method, or search result.
            conditions: [],
            allergens: parsed.data.allergens ?? [],
            excludedIngredients: parsed.data.excludedIngredients ?? [],
            discoveryFocus: [
              steakFocusedDiscovery
                ? "return distinct established steak-cut dishes spanning grilled, pan-seared, sliced, sauced, and international preparations; every recipe must explicitly use steak, sirloin, ribeye, tenderloin, flank steak, skirt steak, or another intact steak cut"
                : discoveryFocuses.join("; rotate the batch across these forms: "),
              "search for an established named dish whose source title explicitly identifies the dish",
              canonicalDishWindow.length
                ? `prioritize an authentic source for one of these pantry-compatible identities: ${canonicalDishWindow.join(", ")}`
                : "use a recognized canonical dish identity from the selected cuisine",
              steakFocusedDiscovery
                ? "the available protein is an intact steak cut; do not substitute ground beef, minced beef, hamburger, meatballs, kofta, burgers, or meatloaf"
                : "preserve the physical form of the user's named protein"
            ].join("; "),
            recentRecipeAvoidance: avoidRecipeNames.join(" | "),
            variationSeed: `${variationSeed}:${input.phase}:${index + 1}`
          });
          recipeGeminiCallBudget.claim(input.phase);
          const groundedText = await generateRecipesWithTransientRetry(
            discoveryPrompt,
            (attempt) => traceTextCall(`${input.phase}_${index + 1}_attempt_${attempt}`),
            {
              maxOutputTokens: RECIPE_BATCH_GENERATION_MAX_OUTPUT_TOKENS,
              responseJsonSchema: PromptBuilder.recipeGenerationResponseSchema(batchCount, batchCoveragePrompt),
              responseMimeType: "application/json",
              requestTimeoutMs: PREMIUM_RECIPE_EDITOR_TIMEOUT_MS,
              systemInstruction: batchGenerationSystemInstruction,
              temperature: 0.35,
              thinkingBudget: 0,
              topP: 0.8
            },
            recordGeminiAttempt,
            1
          );
          const groundedPayload = parseAiJsonPayload(groundedText, "recipe_generation");
          const candidates = Array.isArray(groundedPayload)
            ? groundedPayload
            : Array.isArray(groundedPayload.recipes)
              ? groundedPayload.recipes
              : groundedPayload.recipeGroups && typeof groundedPayload.recipeGroups === "object"
                ? Object.values(groundedPayload.recipeGroups).flatMap((group) => Array.isArray(group) ? group : [])
                : [];
          logger.info("Grounded recipe discovery batch parsed", {
            requestId,
            phase: input.phase,
            batch: index + 1,
            requestedCount: batchCount,
            candidates: (candidates as unknown[]).map((candidate) => {
              const recipe = candidate as Partial<Recipe>;
              return {
                name: recipe.name,
                ingredientCount: recipe.ingredients?.length ?? 0,
                missingIngredientCount: recipe.missing_ingredients?.length ?? 0,
                stepCount: recipe.steps?.length ?? 0,
                hasSourceUrl: /^https?:\/\//i.test(recipe.source_url?.trim() ?? "")
              };
            })
          });
          const normalizedCandidates = (candidates as unknown[])
            .filter((candidate): candidate is Recipe => Boolean(candidate && typeof candidate === "object"))
            .map((candidate) => ({
              ...candidate,
              ingredients: Array.isArray(candidate.ingredients) ? candidate.ingredients : [],
              missing_ingredients: Array.isArray(candidate.missing_ingredients) ? candidate.missing_ingredients : [],
              name: candidate.dish_identity?.trim() || candidate.name,
              recipe_source_type: /^https?:\/\//i.test(candidate.source_url?.trim() ?? "")
                ? "external_source" as const
                : candidate.recipe_source_type,
              steps: Array.isArray(candidate.steps) ? candidate.steps : []
            }));
          return normalizedCandidates.filter((candidate) => {
            const contractViolations = getCustomerFacingRecipeContractViolations(candidate, recipeLanguage);
            if (!contractViolations.length) return true;
            logger.warn("Grounded discovery candidate rejected before merge", {
              requestId,
              phase: input.phase,
              recipeName: candidate.name,
              reasons: contractViolations
            });
            recordRecipeGenerationTrace(validationReport, {
              type: "post_rejected",
              id: candidate.id ?? candidate.name,
              name: candidate.name,
              reason: contractViolations.join(",")
            });
            return false;
          });
        };
        const batches = Array.from(
          { length: Math.ceil(input.requestedCount / batchSize) },
          (_, index) => Math.min(batchSize, input.requestedCount - index * batchSize)
        );
        const initialAvoidNames = input.avoidRecipeNames ?? [];
        const batchResults = await mapSettledWithConcurrency(
          batches,
          input.phase === "grounded_underfill_discovery" ? 2 : 1,
          (batchCount, index) => runBatch(batchCount, index, initialAvoidNames)
        );
        const discovered = batchResults.flatMap((result, index) => {
          if (result.status === "fulfilled") return result.value;
          logger.warn("Grounded recipe discovery batch failed", {
            requestId,
            phase: input.phase,
            batch: index + 1,
            errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
          return [];
        });
        const unique = new Map<string, Recipe>();
        const avoidedNames = new Set(initialAvoidNames.map(normalizeCuisineIdentityText).filter(Boolean));
        discovered.forEach((recipe) => {
          const key = normalizeCuisineIdentityText(recipe.name ?? "");
          if (key && !avoidedNames.has(key) && !unique.has(key)) unique.set(key, recipe);
        });
        return [...unique.values()].slice(0, input.requestedCount);
      };
      let prompt = "";
      let recipes: unknown;
      let normalizedRecipes: unknown;
      const cuisineEligibleEditorSources =
        sourceRecipeEditorEnabled && parsed.data.preferredCuisine && parsed.data.preferredCuisine !== "Any"
          ? selectTrustedSourceCuisineRecipes(
              recipeEditorSourceRecipes,
              parsed.data.preferredCuisine,
              scoringIngredients,
              recipeEditorCandidateCount
            )
          : recipeEditorSourceRecipes;
      const sourceRecipesForEditor = sourceRecipeEditorEnabled
        ? dedupeRecipeEditorDishIdentities(
            enforceDistinctRecipeVariety(cuisineEligibleEditorSources, recipeEditorCandidateCount)
          )
        : responseReadySourceRecipes.length
          ? responseReadySourceRecipes.slice(0, recipeCount)
        : mapRecipeReferencesToRecipes(recipeReferences.slice(0, recipeCount), {
            calorieTarget: parsed.data.calorieTarget,
            recipeLanguage
          });
      const referenceById = new Map(recipeReferences.map((reference) => [reference.id, reference]));
      const editorTargets = sourceRecipesForEditor
        .slice(0, Math.min(recipeCount, MAX_RECIPE_EDITOR_BATCH_SIZE))
        .map((sourceRecipe, index) => ({
        sourceRecipe,
        reference:
          referenceById.get(sourceRecipe.source_recipe_id ?? sourceRecipe.id ?? "") ??
          buildRecipeEditorReference(sourceRecipe, index)
        }));
      if (editorTargets.length) {
        logger.info("Source recipe editor stage scheduled", {
          requestId,
          editorTargetCount: editorTargets.length,
          modelCallLimit: 1
        });
      }

      const editorSourcesMeetInputCoverage = doesRecipeSetMeetInputCoverage(
        editorTargets.map((target) => target.sourceRecipe),
        inputCoveragePlan
      );
      if (sourceRecipeEditorEnabled && editorTargets.length >= recipeCount && editorSourcesMeetInputCoverage) {
        const repairedEditorTargets = editorTargets.map((target) => {
          const repairedSource = prepareRecipeSourceForEditor(target.sourceRecipe, target.reference);
          const cacheInput: RecipeEditorCacheInput = {
            sourceRecipe: repairedSource.reference,
            recipeLanguage,
            preferredCuisine: parsed.data.preferredCuisine ?? "Any",
            availableIngredients: promptIngredients,
            diets: parsed.data.diets ?? [],
            conditions: parsed.data.conditions ?? [],
            allergens: parsed.data.allergens ?? [],
            excludedIngredients: parsed.data.excludedIngredients ?? []
          };
          return { ...target, cacheInput, repairedSource };
        });
        const isUsableEditorRecipe = (
          recipe: Recipe,
          target: (typeof repairedEditorTargets)[number]
        ) => {
          const adapted = adaptRecipeForHealthConditions(
            adaptRecipeForDietRestrictions(recipe, dietContext),
            parsed.data.conditions ?? []
          );
          const quality = recipeQualityGate.validate(adapted, recipeLanguage);
          return (
            isRecipeLocalizationAcceptable(adapted, recipeLanguage) &&
            !findRecipeDietViolation(adapted, dietContext) &&
            !findRecipeHealthViolation(adapted, parsed.data.conditions ?? []) &&
            recipeTitlePreservesSourceDishIdentity(
              target.repairedSource.sourceRecipe,
              adapted.name,
              recipeLanguage
            ) &&
            getBlockingEditedRecipeQualityReasons(quality.reasons).length === 0
          );
        };
        const cachedEditorResults = await Promise.all(
          repairedEditorTargets.map((target) =>
            getRecipeEditorCache(target.cacheInput, (recipe) => isUsableEditorRecipe(recipe, target))
          )
        );
        const cacheMisses = repairedEditorTargets
          .map((target, index) => ({ index, target }))
          .filter(({ index }) => !cachedEditorResults[index]);
        let batchCandidates = new Map<string, Record<string, unknown>>();
        let batchErrors = new Map<string, string>();
        let batchCallError: unknown;

        if (cacheMisses.length) {
          try {
            const batchPrompt = PromptBuilder.recipeEditorBatchPrompt({
              recipeLanguage,
              preferredCuisine: parsed.data.preferredCuisine ?? "Any",
              calorieTarget: parsed.data.calorieTarget ?? 2000,
              maxMissingIngredients: parsed.data.maxMissingIngredients ?? 3,
              recipeCount: cacheMisses.length,
              diets: parsed.data.diets ?? [],
              conditions: parsed.data.conditions ?? [],
              allergens: parsed.data.allergens ?? [],
              excludedIngredients: parsed.data.excludedIngredients ?? [],
              recipeReferences: cacheMisses.map(({ target }) => target.repairedSource.reference)
            });
            recipeGeminiCallBudget.claim("source_editor_batch");
            const text = await generateRecipesWithTransientRetry(
              batchPrompt,
              (attempt) => traceTextCall(`source_editor_batch_attempt_${attempt}`),
              {
                systemInstruction: batchEditorSystemInstruction,
                responseMimeType: "application/json",
                responseJsonSchema: PromptBuilder.recipeEditorBatchResponseSchema(cacheMisses.length),
                requestTimeoutMs: PREMIUM_RECIPE_EDITOR_TIMEOUT_MS
              },
              recordGeminiAttempt,
              1
            );
            const payload = parseAiJsonPayload(text, "recipe_generation");
            const normalizedPayload = Array.isArray(payload) ? payload : payload.recipes;
            const indexed = indexRecipeEditorBatchCandidates(
              normalizedPayload,
              cacheMisses.map(({ target }) => target.repairedSource.reference.id)
            );
            batchCandidates = indexed.candidates;
            batchErrors = indexed.errors;
            logger.info("Recipe editor batch payload parsed", {
              requestId,
              requestedCount: cacheMisses.length,
              candidateCount: batchCandidates.size,
              invalidCount: batchErrors.size,
              unexpectedIds: indexed.unexpectedIds
            });
          } catch (error) {
            batchCallError = error;
            logger.warn("Recipe editor batch call failed; using per-source fallback without a model retry", {
              requestId,
              errorMessage: error instanceof Error ? error.message : String(error)
            });
          }
        }

        const prepareBatchCandidate = (
          candidate: unknown,
          target: (typeof repairedEditorTargets)[number]
        ) => {
          const adapted = adaptRecipeForHealthConditions(
            adaptRecipeForDietRestrictions(
              mergeRecipeEditorOutput(candidate, {
                recipeLanguage,
                sourceRecipe: target.repairedSource.sourceRecipe
              }),
              dietContext
            ),
            parsed.data.conditions ?? []
          );
          const prepared = normalizeCompleteRecipeIngredientLines(
            adapted,
            getRecipeIngredientValidationIdentity
          );
          const quality = recipeQualityGate.validate(prepared, recipeLanguage);
          const blockingReasons = getBlockingEditedRecipeQualityReasons(quality.reasons);
          const localizationAcceptable = isRecipeLocalizationAcceptable(prepared, recipeLanguage);
          const dietViolation = findRecipeDietViolation(prepared, dietContext);
          const healthViolation = findRecipeHealthViolation(prepared, parsed.data.conditions ?? []);
          const identityPreserved = recipeTitlePreservesSourceDishIdentity(
            target.repairedSource.sourceRecipe,
            prepared.name,
            recipeLanguage
          );
          const editorRejectionReasons = [
            ...blockingReasons,
            ...(dietViolation ? [`restriction_${dietViolation.kind}:${dietViolation.match}`] : []),
            ...(healthViolation ? [`health_${healthViolation.condition}:${healthViolation.match}`] : []),
            ...(!localizationAcceptable ? ["localization_not_acceptable"] : []),
            ...(!identityPreserved ? ["source_dish_identity_not_preserved"] : [])
          ];
          if (editorRejectionReasons.length) {
            throw new Error(
              `Recipe editor quality gate rejected ${target.reference.id} (${prepared.name}): ${editorRejectionReasons.join(", ")}`
            );
          }
          return prepared;
        };

        const editorResults = await Promise.all(
          repairedEditorTargets.map(async (target, index): Promise<PromiseSettledResult<Recipe>> => {
            try {
              const cached = cachedEditorResults[index];
              let recipe: Recipe;
              let geminiStatus: "cached" | "succeeded";
              if (cached) {
                recipe = cached.recipe;
                geminiStatus = "cached";
              } else {
                if (batchCallError) throw batchCallError;
                const sourceId = target.repairedSource.reference.id;
                const batchError = batchErrors.get(sourceId);
                if (batchError) throw new Error(`Recipe editor batch rejected ${sourceId}: ${batchError}`);
                const candidate = batchCandidates.get(sourceId);
                if (!candidate) throw new Error(`Recipe editor batch omitted ${sourceId}`);
                recipe = prepareBatchCandidate(candidate, target);
                await setRecipeEditorCache(target.cacheInput, recipe);
                geminiStatus = "succeeded";
              }
              const resolvedRecipe = attachRecipeEditorSourceProvenance(
                adaptRecipeForHealthConditions(
                  adaptRecipeForDietRestrictions(recipe, dietContext),
                  parsed.data.conditions ?? []
                ),
                target.repairedSource.sourceRecipe
              );
              recordRecipeLifecycle(validationReport, {
                recipeId: target.sourceRecipe.id ?? target.reference.id,
                title: resolvedRecipe.name,
                geminiStatus,
                validationStatus: "accepted"
              });
              return { status: "fulfilled", value: resolvedRecipe };
            } catch (reason) {
              return { status: "rejected", reason };
            }
          })
        );
        const editedRecipes = editorResults.flatMap((result, index) => {
          if (result.status === "fulfilled") return [result.value];
          const failedSource = editorTargets[index]?.sourceRecipe;
          const sourceFallback = failedSource
            ? buildValidatedSourceFallback(failedSource, recipeLanguage)
            : null;
          const usableFallback = sourceFallback &&
            !isFundamentallyUnusableRecipe(sourceFallback) &&
            !findRecipeDietViolation(sourceFallback, dietContext) &&
            !findRecipeHealthViolation(sourceFallback, parsed.data.conditions ?? [])
              ? attachRecipeEditorSourceProvenance(sourceFallback, failedSource!)
              : null;
          logger.warn("Source recipe editor request failed", {
            requestId,
            referenceId: editorTargets[index]?.reference.id,
            errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason),
            returnedSourceFallback: Boolean(usableFallback)
          });
          recordRecipeGenerationTrace(validationReport, {
            type: "post_rejected",
            id: editorTargets[index]?.sourceRecipe.id ?? editorTargets[index]?.reference.id ?? `source_editor_${index + 1}`,
            name: editorTargets[index]?.reference.title ?? "Source recipe editor candidate",
            reason: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
          recordRecipeLifecycle(validationReport, {
            recipeId: editorTargets[index]?.sourceRecipe.id ?? editorTargets[index]?.reference.id ?? `source_editor_${index + 1}`,
            title: editorTargets[index]?.reference.title ?? "Source recipe editor candidate",
            geminiStatus: "failed",
            rejectionReason: result.reason instanceof Error ? result.reason.message : String(result.reason),
            validationStatus: usableFallback ? "accepted" : "failed"
          });
          return usableFallback ? [usableFallback] : [];
        });
        const distinctEditedRecipes = enforceDistinctRecipeVariety(
          editedRecipes,
          sourceRecipeEditorEnabled ? recipeEditorCandidateCount : recipeCount
        );
        editedRecipes.splice(0, editedRecipes.length, ...distinctEditedRecipes);
        logger.info("Source recipe editor stage completed", {
          requestId,
          requestedCount: editorTargets.length,
          cacheHitCount: cachedEditorResults.filter(Boolean).length,
          geminiBatchCallCount: cacheMisses.length ? 1 : 0,
          fulfilledCount: editorResults.filter((result) => result.status === "fulfilled").length,
          failedCount: editorResults.filter((result) => result.status === "rejected").length,
          returnedCount: editedRecipes.length,
          failures: editorResults.flatMap((result, index) =>
            result.status === "rejected"
              ? [{
                  referenceId: editorTargets[index]?.reference.id,
                  reason: result.reason instanceof Error ? result.reason.message : String(result.reason)
                }]
              : []
          )
        });
        prompt = "single batch editor prompt";
        recipes = editedRecipes;
        normalizedRecipes = editedRecipes;
      } else {
        if (ingredients.length && shouldUseGroundedRecipeSearch) {
          const groundedRecipes = await generateRecipeBatch({
            avoidRecipeNames: recipeNamesToAvoid,
            phase: "primary_grounded_discovery",
            requestedCount: recipeGenerationCandidateCount
          });
          prompt = "single structured generation batch prompt";
          recipes = groundedRecipes;
          normalizedRecipes = groundedRecipes;
        } else {
          prompt = ingredients.length
            ? PromptBuilder.recipeGeneration(promptIngredients, {
                recipeLanguage,
                preferredCuisine: parsed.data.preferredCuisine ?? "Any",
                calorieTarget: parsed.data.calorieTarget ?? 2000,
                maxMissingIngredients: parsed.data.maxMissingIngredients ?? 3,
                ingredientCoverage: inputCoveragePrompt,
                recipeCount,
                diets: parsed.data.diets ?? [],
                conditions: parsed.data.conditions ?? [],
                allergens: parsed.data.allergens ?? [],
                excludedIngredients: parsed.data.excludedIngredients ?? [],
                recentRecipeAvoidance: recipeNamesToAvoid.join(" | "),
                variationSeed
              })
            : PromptBuilder.promptOnlyRecipeGeneration(parsed.data.prompt ?? "", recipeLanguage, recipeCount);
          recipeGeminiCallBudget.claim("primary_generation");
          const text = await generateRecipesWithTransientRetry(
            prompt,
            (attempt) => traceTextCall(attempt === 1 ? "primary_generation" : `primary_generation_retry_${attempt}`),
            {
              responseJsonSchema: PromptBuilder.recipeDiscoveryResponseSchema(recipeCount),
              responseMimeType: "application/json",
              systemInstruction: discoverySystemInstruction
            },
            recordGeminiAttempt,
            1
          );
          recipes = parseAiJsonPayload(text, "recipe_generation");
          normalizedRecipes = (recipes as { recipes?: unknown }).recipes ?? recipes;
        }
      }
      if (Array.isArray(normalizedRecipes) && normalizedRecipes.length) {
        const sourcedRecipes = enforceSourcedRecipeContract(normalizedRecipes, {
          allowLocalDatabase:
            recipeReferences.length > 0 ||
            responseReadySourceRecipes.length > 0 ||
            recipeEditorSourceRecipes.length > 0,
          phase: "ai_primary",
          requestId,
          requireSourcedRecipes: ingredients.length > 0 && prompt !== "single structured generation batch prompt"
        });
        const primarySelectionLimit = prompt === "single structured generation batch prompt"
          ? recipeGenerationCandidateCount
          : sourceRecipeEditorEnabled
            ? recipeEditorCandidateCount
            : recipeCount;
        const primaryOwnedRecipes = enforceAnyCuisineDiversity(
          rejectNearDuplicateAiRecipes(
            enforceDietOnRecipes(
              applyStrictIngredientOwnership(sourcedRecipes, availableIngredients, {
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
          primarySelectionLimit,
          requestId
        );
        const rankedPrimaryRecipes = rankStrictRecipes(primaryOwnedRecipes, sourceRankingOptions);
        const strictRecipes = sourceRecipeEditorEnabled
          ? prioritizeCuratedRecipeSources(rankedPrimaryRecipes, primarySelectionLimit)
          : rankedPrimaryRecipes;
        logRecipeRankingSnapshot("gemini_primary_after_strict_ranking", primaryOwnedRecipes, strictRecipes, {
          requestId,
          recipeCount,
          rankingOptions: strictRankingOptions,
          sourceCount: normalizedRecipes.length
        });

        const requiredSourcedRecipeCount = Math.max(0, recipeCount - (exactScanMatch ? 1 : 0));
        if (ingredients.length > 0 && strictRecipes.length < requiredSourcedRecipeCount) {
          logger.warn("AI response underfilled sourced recipe target; keeping repaired source recipes and best generated candidates", {
            requestId,
            generatedCount: strictRecipes.length,
            repairedSourceCount: responseReadySourceRecipes.length,
            requiredSourcedRecipeCount
          });
        }
        // Keep validated source recipes behind the premium edited/grounded
        // candidates as a reserve pool. Final validation can still reject an
        // apparently complete AI batch for missing facts; omitting this pool
        // converted those per-card failures into fewer cards for the user.
        const reserveSourcePool = sourceRecipeEditorEnabled
          ? enforceDietOnRecipes(
              recipeEditorSourceRecipes.map((recipe) =>
                normalizeRecipeThroughLocalizationService(
                  wantsArabic ? ensureArabicRecipeLanguage(recipe) : recipe,
                  wantsArabic ? "ar" : "en"
                )
              ),
              "premium_editor_source_reserve"
            )
          : responseReadySourceRecipes;
        const localizedReserveRecipes = reserveSourcePool.filter((recipe) =>
          isRecipeLocalizationAcceptable(recipe, recipeLanguage) &&
          !findRecipeHealthViolation(recipe, parsed.data.conditions ?? [])
        );
        const rawResponseCandidates = sourceRecipeEditorEnabled
          ? [...strictRecipes, ...localizedReserveRecipes]
          : [...responseReadySourceRecipes, ...strictRecipes];
        // Finalization applies the authoritative diversity policy after quality
        // acceptance. Truncating by dish family here can discard valid reserve
        // candidates before malformed cards are rejected and cause underfill.
        const responseCandidates = rawResponseCandidates.slice(0, sourceRankingOptions.candidateLimit);
        let finalRecipes: Recipe[] = await finalizeRecipeResponse(
          mergeRecipeResults(
            exactScanMatch,
            responseCandidates,
            shouldLabelSimilarRecipes,
            sourceRankingOptions.candidateLimit
          )
        );
        if (ingredients.length && finalRecipes.length < recipeCount) {
          if (!finalRecipes.length) {
            throw new Error("No response-ready recipes survived repair-first validation.");
          }
          logger.warn("Recipe generation returning partial results after repair-first validation", {
            requestId,
            returnedCount: finalRecipes.length,
            requestedCount: recipeCount
          });
        }
        // Gemini editing, localization, and instruction repair operate on the
        // complete ingredient list. Reapply pantry ownership at the response
        // boundary so none of those stages can leak needed items into "have".
        finalRecipes = applyStrictIngredientOwnership(finalRecipes, availableIngredients, {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens,
          preserveIdentity: true
        });
        await queueRecipeCachePersist({
          uid: requestAccess.uid,
          recipeLanguage,
          recipes: finalRecipes,
          dietContext,
          promoteToSharedPool: hasPremiumWorkflowAccess
        });
        await persistRecipeGenerationHistoryEntry({
          historyEntryId,
          recipes: finalRecipes,
          status: "completed",
          uid: requestAccess.uid
        });
        logger.info("Recipe generation served from custom generation", {
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
        return await respondWithValidationReport({
          ...responsePayload,
          recipes: finalRecipes,
          servedFrom: "fallback_ai",
          generationStatus: finalRecipes.length >= recipeCount ? RecipeGenerationStatus.SUCCESS_AI : RecipeGenerationStatus.PARTIAL_RESULTS,
          result: JSON.stringify(finalRecipes),
          access: accessPayload(nextAccess)
        });
      }
    } catch (aiError) {
      logger.error("AI recipe generation failed after empty dataset search", aiError, {
        transientOverload: isTransientAiOverload(aiError)
      });
    }

    const recipeReferences = await recipeReferencesPromise;
    increaseRecipeValidationDatabaseFound(validationReport, recipeReferences.length);
    const referenceFallbackRecipes = mapRecipeReferencesToRecipes(recipeReferences, {
      calorieTarget: parsed.data.calorieTarget,
      recipeLanguage
    });
    const searchResult = referenceFallbackRecipes.length >= recipeCount ? null : await loadSharedRecipeSearchResult();
    if (searchResult) {
      increaseRecipeValidationDatabaseFound(validationReport, recipeReferences.length + searchResult.recipes.length);
    }
    logger.info("Recipe generation served from shared recipe pool after AI failure", {
      recipeCount: searchResult?.recipes.length ?? referenceFallbackRecipes.length,
      canLoadMore: Boolean(searchResult?.canLoadMore),
      referenceFallbackCount: referenceFallbackRecipes.length
    });
    const strictRecipes = rankStrictRecipes(
      enforceDietOnRecipes(
        applyStrictIngredientOwnership([...referenceFallbackRecipes, ...(searchResult?.recipes ?? [])], availableIngredients, {
          preferredCuisine: parsed.data.preferredCuisine,
          diets: parsed.data.diets,
          conditions: parsed.data.conditions,
          allergens: parsed.data.allergens
        }),
        "ai_failed_fallback"
      ),
      sourceRankingOptions
    );
    const finalRecipes = await finalizeRecipeResponse(
      mergeRecipeResults(exactScanMatch, strictRecipes, shouldLabelSimilarRecipes, sourceRankingOptions.candidateLimit)
    );
    rememberValidSearchRecipes(finalRecipes, "ai_failed_fallback_validated");
    if (finalRecipes.length < recipeCount) {
      if (finalRecipes.length) {
        await queueRecipeCachePersist({
          uid: requestAccess.uid,
          recipeLanguage,
          recipes: finalRecipes,
          dietContext,
          promoteToSharedPool: hasPremiumWorkflowAccess
        });
        await persistRecipeGenerationHistoryEntry({
          historyEntryId,
          recipes: finalRecipes,
          status: "completed",
          uid: requestAccess.uid
        });
        return await respondWithValidationReport({
          recipes: finalRecipes,
          result: JSON.stringify(finalRecipes),
          servedFrom: referenceFallbackRecipes.length ? "recipe_reference" : "shared_pool",
          generationStatus: RecipeGenerationStatus.PARTIAL_RESULTS,
          canLoadMore: searchResult?.canLoadMore ?? recipeReferences.length > recipeCount,
          access: accessPayload(nextAccess)
        });
      }
      const message = buildRecipeUnavailableMessage(recipeLanguage);
      await persistRecipeGenerationHistoryEntry({
        errorMessage: message,
        historyEntryId,
        recipes: [],
        status: "failed",
        uid: requestAccess.uid
      });
      return await respondWithValidationReport({
        message,
        recipes: [],
        result: "[]",
        servedFrom: "shared_pool",
        generationStatus: RecipeGenerationStatus.NO_RESULTS,
        canLoadMore: false,
        access: accessPayload(nextAccess)
      });
    }

    await queueRecipeCachePersist({
      uid: requestAccess.uid,
      recipeLanguage,
      recipes: finalRecipes,
      dietContext,
      promoteToSharedPool: hasPremiumWorkflowAccess
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

    return await respondWithValidationReport({
      recipes: finalRecipes,
      result: JSON.stringify(finalRecipes),
      servedFrom: referenceFallbackRecipes.length ? "recipe_reference" : "shared_pool",
      generationStatus: RecipeGenerationStatus.SUCCESS_DATASET,
      canLoadMore: searchResult?.canLoadMore ?? recipeReferences.length > recipeCount,
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
      const message =
        error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Premium"))
          ? error.message
          : "Recipe generation is temporarily unavailable. Please try again shortly.";
      const status = isFirebaseTransientError(error) || message.includes("temporarily unavailable") ? 503 : 401;
      return await respondWithValidationReport(
        { error: message, generationStatus: RecipeGenerationStatus.NO_RESULTS, recipes: [], result: "[]" },
        { status }
      );
    }
    logger.error("Error generating recipes", error, { requestId });
    const safeMessage = buildRecipeUnavailableMessage("English");
    const status = 200;
    await persistRecipeGenerationHistoryEntry({
      errorMessage: safeMessage,
      historyEntryId,
      recipes: [],
      status: "failed",
      uid: historyUid
    });
    return await respondWithValidationReport(
      { message: safeMessage, generationStatus: RecipeGenerationStatus.NO_RESULTS, recipes: [], result: "[]" },
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

  scheduleAfterResponse("recipe generation history persistence", async () => {
    const startedAt = Date.now();
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
      logger.info("Recipe generation history persisted after response", {
        durationMs: Date.now() - startedAt,
        historyEntryId: input.historyEntryId,
        status: input.status
      });
    } catch (error) {
      logger.warn("Recipe generation history persistence failed", {
        historyEntryId: input.historyEntryId,
        status: input.status,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

async function loadRecentRecipeMemory(input: {
  inputIngredients: string[];
  requestId: string;
  uid: string;
}): Promise<RecentRecipeMemory> {
  const ingredientContextKey = normalizeRecipeIngredientContextKey(input.inputIngredients);
  if (!ingredientContextKey) return EMPTY_RECENT_RECIPE_MEMORY;
  const inProcessRecipes = getInProcessRecentRecipes(input.uid, ingredientContextKey);
  try {
    const historyRef = getAdminDb()
      .collection("users")
      .doc(input.uid)
      .collection("history");
    let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
    try {
      snapshot = await historyRef.orderBy("createdAt", "desc").limit(100).get();
    } catch {
      snapshot = await historyRef.limit(100).get();
    }

    const freshnessCutoff = Date.now() - IN_PROCESS_RECENT_RECIPE_TTL_MS;
    const recentScanRecipes = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data() as {
          createdAt?: unknown;
          ingredients?: string[];
          recipes?: Recipe[];
          timestamp?: string;
        };
        const createdAt = getHistoryEntryCreatedAtMs(data.createdAt, data.timestamp);
        const sameIngredientContext = normalizeRecipeIngredientContextKey(data.ingredients ?? []) === ingredientContextKey;
        return sameIngredientContext && createdAt >= freshnessCutoff && Array.isArray(data.recipes)
          ? data.recipes
          : [];
      })
      .filter((recipes) => recipes.length > 0)
      .flat();
    const recipes = dedupeRecentRecipes([...inProcessRecipes, ...recentScanRecipes])
      .slice(0, MAX_IN_PROCESS_RECIPES_PER_USER);

    const memory = buildRecentRecipeMemory(recipes);
    if (memory.recipes.length) {
      logger.info("Loaded recent recipe memory for variation", {
        requestId: input.requestId,
        familyCount: memory.familyKeys.size,
        recipeCount: memory.recipes.length,
        structureCount: memory.structureKeys.size
      });
    }
    return memory;
  } catch (error) {
    logger.warn("Recent recipe memory load failed", {
      requestId: input.requestId,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    const recipes = inProcessRecipes
      .slice(0, MAX_IN_PROCESS_RECIPES_PER_USER);
    return recipes.length ? buildRecentRecipeMemory(recipes) : EMPTY_RECENT_RECIPE_MEMORY;
  }
}

function rememberInProcessRecentRecipes(uid: string, ingredientContextKey: string, recipes: Recipe[]) {
  const memoryKey = buildInProcessRecentRecipeKey(uid, ingredientContextKey);
  const existing = getInProcessRecentRecipes(uid, ingredientContextKey);
  inProcessRecentRecipes.set(memoryKey, {
    expiresAt: Date.now() + IN_PROCESS_RECENT_RECIPE_TTL_MS,
    recipes: dedupeRecentRecipes([...recipes, ...existing]).slice(0, MAX_IN_PROCESS_RECIPES_PER_USER)
  });
  while (inProcessRecentRecipes.size > MAX_IN_PROCESS_RECENT_RECIPE_USERS) {
    const oldestKey = inProcessRecentRecipes.keys().next().value;
    if (!oldestKey) break;
    inProcessRecentRecipes.delete(oldestKey);
  }
}

function getInProcessRecentRecipes(uid: string, ingredientContextKey: string) {
  const memoryKey = buildInProcessRecentRecipeKey(uid, ingredientContextKey);
  const entry = inProcessRecentRecipes.get(memoryKey);
  if (!entry) return [];
  if (entry.expiresAt <= Date.now()) {
    inProcessRecentRecipes.delete(memoryKey);
    return [];
  }
  return entry.recipes;
}

function buildInProcessRecentRecipeKey(uid: string, ingredientContextKey: string) {
  return `${uid}|${ingredientContextKey}`;
}

function getHistoryEntryCreatedAtMs(createdAt: unknown, timestamp?: string) {
  if (createdAt && typeof createdAt === "object") {
    const firestoreTimestamp = createdAt as { toDate?: () => Date; toMillis?: () => number };
    if (typeof firestoreTimestamp.toMillis === "function") return firestoreTimestamp.toMillis();
    if (typeof firestoreTimestamp.toDate === "function") return firestoreTimestamp.toDate().getTime();
  }
  const parsedTimestamp = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
}

function dedupeRecentRecipes(recipes: Recipe[]) {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const key = getRecipeSelectionKey(recipe) || recipe.id || normalizeDishRestrictionKey(recipe.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRecentRecipeMemory(recipes: Recipe[]): RecentRecipeMemory {
  const memory: RecentRecipeMemory = {
    familyKeys: new Set(),
    imageIdentityKeys: new Set(),
    names: new Set(),
    recipes,
    selectionKeys: new Set(),
    structureKeys: new Set()
  };

  for (const recipe of recipes) {
    const familyKey = getRecipeVarietyFamilyKey(recipe) || buildRecipeDishFamilyKey(recipe);
    const imageIdentityKey = getRecipeImageIdentityKey(recipe);
    const selectionKey = getRecipeSelectionKey(recipe);
    const structureKey = buildRecipeStructureSignature(recipe);
    const nameKey = normalizeDishRestrictionKey(recipe.dish_intent?.dish_name || recipe.name);
    if (familyKey) memory.familyKeys.add(familyKey);
    if (imageIdentityKey) memory.imageIdentityKeys.add(imageIdentityKey);
    if (selectionKey) memory.selectionKeys.add(selectionKey);
    if (structureKey) memory.structureKeys.add(structureKey);
    if (nameKey) memory.names.add(nameKey);
  }

  return memory;
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
      PromptBuilder.platedDishVision(input.language),
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

function isTrustedSourcedRecipe(recipe: Recipe) {
  const recipeId = String(recipe.id ?? "");
  const isLocalReference =
    recipe.recipe_source_type === "local_database" ||
    /^(?:recipe-reference-|trusted-source-|catalog-v2-)/i.test(recipeId);
  const isGroundedExternalRecipe =
    recipe.recipe_source_type === "external_source" &&
    typeof recipe.source_url === "string" &&
    /^https?:\/\//i.test(recipe.source_url.trim());

  if ((!isLocalReference && !isGroundedExternalRecipe) || !recipe.steps?.length) {
    return false;
  }

  return !hasSyntheticFallbackInstructions(recipe.steps);
}

function isFundamentallyUnusableRecipe(recipe: Recipe) {
  const hasIngredients = [
    ...(Array.isArray(recipe.ingredients) ? recipe.ingredients : []),
    ...(Array.isArray(recipe.missing_ingredients) ? recipe.missing_ingredients : [])
  ].some((ingredient) => ingredient.trim());
  const hasInstructions = Array.isArray(recipe.steps) && recipe.steps.some((step) => step.trim());
  const unsafeInstruction = recipe.steps.some((step) =>
    /\b(?:eat|serve)\s+(?:raw|undercooked)\s+(?:chicken|poultry|beef|meat|fish|egg)|\b(?:bleach|detergent|cleaning product)\b|(?:\u0643\u0644|\u0642\u062f\u0645)\s+(?:\u0627\u0644\u062f\u062c\u0627\u062c|\u0627\u0644\u0644\u062d\u0645)\s+\u0646\u064a\u0626/iu.test(step)
  );
  return !recipe.name?.trim() || !hasIngredients || !hasInstructions || unsafeInstruction;
}

function hasSyntheticFallbackInstructions(steps: string[]) {
  const source = steps.join(" ").replace(/\s+/g, " ").trim();
  const markers = [
    /سخّن المقلاة على نار متوسطة لمدة دقيقتين/u,
    /ملعقتين كبيرتين من الماء أو سائل الطبخ/u,
    /أضف .* أولا واطهه لمدة 4 إلى 6 دقائق/u,
    /ارفع الوجبة عن النار لمدة دقيقتين/u,
    /prep the scanned ingredients and slice any vegetables into even pieces/i,
    /cook the main ingredient with garlic, herbs, citrus/i,
    /add the vegetables or starch and simmer, roast, or toss/i,
    /taste with lemon, herbs, and pepper instead of relying on heavy salt/i,
    /serve warm with a fresh garnish/i
  ];

  return markers.filter((marker) => marker.test(source)).length >= 2;
}

function enforceSourcedRecipeContract(
  recipes: Recipe[],
  context: { allowLocalDatabase: boolean; phase: string; requestId: string; requireSourcedRecipes: boolean }
) {
  if (!context.requireSourcedRecipes) {
    return recipes;
  }

  const filtered = recipes.filter((recipe) => {
    if (!recipe.steps?.length) return false;
    if (recipe.recipe_source_type === "local_database") return context.allowLocalDatabase;
    if (recipe.recipe_source_type === "external_source") {
      return typeof recipe.source_url === "string" && /^https?:\/\//i.test(recipe.source_url.trim());
    }
    return false;
  });

  if (filtered.length !== recipes.length) {
    logger.warn("Rejected unsourced generated recipes from AI response", {
      requestId: context.requestId,
      phase: context.phase,
      rejectedCount: recipes.length - filtered.length,
      keptCount: filtered.length
    });
  }

  return filtered;
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
  const candidates: Recipe[] = [
    ...(exactRecipe
      ? [{ ...exactRecipe, recipe_origin: exactRecipe.recipe_origin ?? "exact_scan_match" as const }]
      : []),
    ...similarRecipes.map((recipe) => ({
      ...recipe,
      recipe_origin: recipe.recipe_origin ?? (markSimilarOrigins ? "similar_ingredients" as const : undefined)
    }))
  ];
  const merged = dedupeExactRecipeCandidates(candidates);
  return prioritizePantryBalancedRecipes(merged).slice(0, recipeCount);
}

function enforceDistinctPreparedRecipeDisplay(recipes: Recipe[], recipeCount: number) {
  const selected: Recipe[] = [];
  const seenDisplayNames = new Set<string>();
  const seenSourceIds = new Set<string>();

  for (const recipe of recipes) {
    if (selected.length >= recipeCount) break;
    const displayKey = buildNormalizedRecipeNameSignature(recipe.name) || normalizeDishRestrictionKey(recipe.name);
    const sourceId = recipe.source_recipe_id || recipe.id || "";
    if (displayKey && seenDisplayNames.has(displayKey)) continue;
    if (sourceId && seenSourceIds.has(sourceId)) continue;

    selected.push(recipe);
    if (displayKey) seenDisplayNames.add(displayKey);
    if (sourceId) seenSourceIds.add(sourceId);
  }

  return selected;
}

function getRecipePlateFormKey(recipe: Recipe) {
  const source = [
    recipe.name,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.dish_intent?.dish_name,
    recipe.dish_intent?.cooking_method,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    ...(recipe.steps ?? []),
    recipe.localized?.English?.name,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.localized?.English?.dish_intent?.cooking_method,
    ...(recipe.localized?.English?.dish_intent?.visual_keywords ?? []),
    recipe.localized?.Arabic?.name,
    recipe.localized?.Arabic?.image_search_index,
    ...(recipe.localized?.Arabic?.image_search_indices ?? []),
    recipe.localized?.Arabic?.dish_intent?.dish_name,
    recipe.localized?.Arabic?.dish_intent?.cooking_method,
    ...(recipe.localized?.Arabic?.dish_intent?.visual_keywords ?? [])
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\b(breaded|breadcrumb|breadcrumbs|panko|crusted|crumbed|cutlet|schnitzel|pane|pané)\b|بانيه|بقسماط/iu.test(source)) return "breaded";
  if (/\b(bbq|barbecue|barbeque|smoked|smoky|smoke)\b|باربكيو|مدخن/iu.test(source)) return "bbq-smoked";
  if (/\b(grilled|grill|charred|skewer|skewered|kebab|meshwi|mashwi)\b|مشوي|مشوية|سيخ|أسياخ/iu.test(source)) return "grilled";
  if (/\b(stew|stewed|tagine|tajine|curry|braise|braised|ragout|goulash)\b|طاجن|يخنة|كاري|مطبوخ/iu.test(source)) return "stew";
  if (/\b(soup|broth|chowder|bisque)\b|شوربة|حساء|مرق/iu.test(source)) return "soup";
  if (/\b(cheesy|cheese|mozzarella|parmesan|feta|cheddar|cream|creamy|alfredo|bechamel)\b|جبن|جبنة|كريمة|بشاميل/iu.test(source)) return "cheesy-creamy";
  if (/\b(fried|crispy|crisp|tempura|fritter|fritters|taameya|falafel)\b|مقلي|مقلية|مقرمش|طعمية|فلافل/iu.test(source)) return "fried-crispy";
  if (/\b(baked|roasted|roast|oven|tray|casserole|gratin)\b|مخبوز|فرن|صينية|طاجن/iu.test(source)) return "baked-roasted";
  if (/\b(sauce|saucy|glazed|glaze|gravy|tomato sauce|white sauce|tahini|salsa|molokhia)\b|صلصة|صوص|طحينة|ملوخية/iu.test(source)) return "saucy";
  if (/\b(sandwich|wrap|flatbread|pita|taco|burrito|shawarma|hawawshi)\b|ساندويتش|راب|عيش|خبز|شاورما|حواوشي/iu.test(source)) return "sandwich-wrap";
  if (/\b(pasta|spaghetti|penne|macaroni|noodle|noodles|rice|pilaf|biryani|kabsa|risotto)\b|مكرونة|باستا|أرز|رز|نودلز/iu.test(source)) return "starch-integrated";
  if (/\b(salad|slaw|bowl|cold plate)\b|سلطة/iu.test(source)) return "salad-bowl";
  if (/\b(stir[- ]?fry|saute|sauté|skillet|pan[- ]?fried|seared)\b|مقلاة|سوتيه/iu.test(source)) return "skillet";

  return "";
}

// Retained temporarily for catalog migration utilities; the live generation route
// deliberately does not call it because it manufactures unsourced filler cards.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const hasInputMainProtein = getEffectiveInputMainProteinCategories(context).size > 0;
  const proteinAlignedRecipes = filterRecipesByInputMainProtein(recipes, context);
  const fillers = filterRecipesByInputMainProtein(buildSparseIngredientRecipeFillers(context), context);
  const sourceRecipes = hasInputMainProtein ? proteinAlignedRecipes : recipes;
  if (sourceRecipes.length >= context.recipeCount) {
    const shouldBlendIngredientRelationships = shouldBlendIngredientRelationshipVariety(sourceRecipes, context);
    return shouldBlendSparseFillerVariety(sourceRecipes, context) ||
      shouldBlendAnyCuisineSparsePlateVariety(sourceRecipes, context) ||
      shouldBlendIngredientRelationships
      ? blendSparseFillerVariety(sourceRecipes, fillers, context.recipeCount, context.preferredCuisine, {
        sourceLeadCount: shouldBlendIngredientRelationships ? 1 : 4
      })
      : sourceRecipes.slice(0, context.recipeCount);
  }

  const merged = [...sourceRecipes];
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

function shouldBlendAnyCuisineSparsePlateVariety(
  recipes: Recipe[],
  context: {
    ingredients: string[];
    preferredCuisine: string;
  }
) {
  if (context.ingredients.length > 2) return false;
  if (normalizeCuisinePreference(context.preferredCuisine) !== "any") return false;

  const cuisineCount = new Set(recipes.map((recipe) => normalizeCuisinePreference(recipe.cuisine))).size;
  const familyCount = new Set(recipes.map(getRecipeVarietyFamilyKey).filter(Boolean)).size;
  const formCount = new Set(recipes.map(getRecipePlateFormKey).filter(Boolean)).size;

  return (
    cuisineCount < Math.min(3, recipes.length) ||
    familyCount < Math.min(6, recipes.length) ||
    formCount < Math.min(5, recipes.length)
  );
}

function shouldBlendIngredientRelationshipVariety(
  recipes: Recipe[],
  context: {
    availableIngredients: Set<string>;
    ingredients: string[];
    preferredCuisine: string;
    recipeCount: number;
    scoringIngredients: string[];
  }
) {
  const profiles = buildIngredientRelationshipProfiles(context);
  if (!profiles.length) return false;

  const coveredProfiles = profiles.filter((profile) =>
    recipes.some((recipe) => recipeMatchesIngredientRelationship(recipe, profile))
  ).length;
  const minimumProfileCoverage = Math.min(context.recipeCount, profiles.length, context.recipeCount >= 8 ? 5 : 3);
  if (coveredProfiles < minimumProfileCoverage) return true;

  const relationshipCoverage = recipes.filter((recipe) =>
    profiles.some((profile) => recipeMatchesIngredientRelationship(recipe, profile))
  ).length;
  const minimumRecipeCoverage = Math.min(context.recipeCount, context.recipeCount >= 8 ? 5 : 3);
  if (relationshipCoverage < minimumRecipeCoverage) return true;

  const familyCount = new Set(recipes.map(getRecipeVarietyFamilyKey).filter(Boolean)).size;
  return familyCount < Math.min(context.recipeCount, context.recipeCount >= 8 ? 6 : 4);
}

function blendSparseFillerVariety(
  recipes: Recipe[],
  fillers: Recipe[],
  recipeCount: number,
  preferredCuisine: string,
  options?: { sourceLeadCount?: number }
) {
  const anyCuisine = normalizeCuisinePreference(preferredCuisine) === "any";
  const sourceRecipes = anyCuisine ? diversifyAnyCuisineSparseFillers(recipes) : recipes;
  const sourceFillers = anyCuisine ? diversifyAnyCuisineSparseFillers(fillers) : fillers;
  const sourceLeadCount = Math.max(0, options?.sourceLeadCount ?? 4);
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

  for (const recipe of sourceRecipes.slice(0, sourceLeadCount)) {
    add(recipe);
  }

  if (blended.length < Math.min(2, recipeCount)) {
    for (const recipe of sourceRecipes.slice(0, 2)) {
      add(recipe, true);
    }
  }

  for (const filler of sourceFillers) {
    const cuisineKey = normalizeCuisinePreference(filler.cuisine);
    if (seenCuisines.has(cuisineKey) && blended.length + 3 < recipeCount) continue;
    add(filler);
  }

  for (const filler of sourceFillers) {
    add(filler);
  }

  for (const recipe of sourceRecipes) {
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
  const relationshipFillers = buildIngredientRelationshipSparseFillers(primaryIngredient, context, targetCalories);

  if (isSparseGroundMeatSource(source)) {
    return filterSparseFillersForPreferences(
      [...relationshipFillers, ...buildGroundMeatSparseFillers(primaryIngredient, context, targetCalories)],
      context
    );
  }

  if (/\b(liver|kebda|kibda|ciger|cigeri)\b|كبدة|كبده/iu.test(source)) {
    return filterSparseFillersForPreferences(
      [...relationshipFillers, ...buildLiverSparseFillers(primaryIngredient, context, targetCalories)],
      context
    );
  }

  return filterSparseFillersForPreferences(
    [...relationshipFillers, ...buildGenericSparseFillers(primaryIngredient, context, targetCalories)],
    context
  );
}

function filterSparseFillersForPreferences(
  recipes: Recipe[],
  context: { allergens: string[]; conditions: string[]; diets: string[] }
) {
  const dietContext = { diets: context.diets, allergens: context.allergens };
  const filtered = recipes
    .filter((recipe) => !findRecipeDietViolation(recipe, dietContext))
    .filter((recipe) => !findRecipeHealthViolation(recipe, context.conditions));

  return filtered.length ? filtered : recipes;
}

function choosePrimarySparseIngredient(rawIngredients: string[], scoringIngredients: string[]) {
  const candidates = [...rawIngredients, ...scoringIngredients].filter(Boolean);
  const proteinAnchor = candidates.find((ingredient) => getMainProteinCategoriesFromText(ingredient).size > 0);
  if (proteinAnchor) return proteinAnchor;

  return rawIngredients.find(Boolean) ?? scoringIngredients.find(Boolean) ?? "main ingredient";
}

function preserveRequestedIngredientForm(rawIngredient: string, normalizedIngredient: string) {
  return hasRequestedProteinForm(rawIngredient) ? rawIngredient.trim() : normalizedIngredient;
}

function isExplicitSteakIngredient(value: string) {
  return /\b(?:steak|sirloin|ribeye|rib eye|strip steak|tenderloin|filet mignon|flank steak|skirt steak)\b/i.test(value);
}

interface IngredientRelationshipProfile {
  bread?: string;
  dairy?: string;
  grain?: string;
  kind: "protein-vegetable-bread" | "protein-vegetable-grain" | "protein-vegetable";
  protein: string;
  proteinDisplay: string;
  vegetable: string;
}

function buildIngredientRelationshipSparseFillers(
  primaryIngredient: string,
  context: {
    allergens: string[];
    availableIngredients: Set<string>;
    conditions: string[];
    diets: string[];
    ingredients: string[];
    preferredCuisine: string;
    scoringIngredients: string[];
  },
  targetCalories: number
) {
  const profiles = buildIngredientRelationshipProfiles(context);
  if (!profiles.length) return [];

  const inputs = profiles.flatMap((profile) => buildIngredientRelationshipFillerInputs(profile, primaryIngredient, targetCalories));
  return dedupeSparseFillerRecipes(inputs.map((input) => makeSparseFillerRecipe(input, context)));
}

function buildIngredientRelationshipProfiles(context: {
  availableIngredients: Set<string>;
  ingredients: string[];
  scoringIngredients: string[];
}) {
  const candidates = Array.from(new Set([
    ...context.ingredients,
    ...context.scoringIngredients
  ])).filter(Boolean);
  const proteins = dedupeRelationshipCandidates(candidates.filter(isRelationshipProteinIngredient), getCanonicalRelationshipIngredient);
  const vegetables = dedupeRelationshipCandidates(candidates.filter(isRelationshipVegetableIngredient), getCanonicalRelationshipIngredient);
  if (!proteins.length || !vegetables.length) return [];

  const dairy = findIngredientCandidate(candidates, isRelationshipDairyIngredient);
  const bread = findIngredientCandidate(candidates, isRelationshipBreadIngredient);
  const grain = findIngredientCandidate(candidates, isRelationshipGrainIngredient);

  return proteins.slice(0, 8).map((protein) => {
    const canonicalProtein = getCanonicalRelationshipIngredient(protein);
    const vegetable = chooseBestRelationshipVegetable(canonicalProtein, vegetables);
    const baseProfile = {
      dairy: dairy ? getCanonicalRelationshipIngredient(dairy) : undefined,
      protein: canonicalProtein,
      proteinDisplay: getProteinDishDisplayLabel(protein),
      vegetable: getCanonicalRelationshipIngredient(vegetable)
    };

    if (bread) {
      return {
        ...baseProfile,
        bread: getCanonicalRelationshipIngredient(bread),
        kind: "protein-vegetable-bread" as const
      };
    }

    if (grain) {
      return {
        ...baseProfile,
        grain: getCanonicalRelationshipIngredient(grain),
        kind: "protein-vegetable-grain" as const
      };
    }

    return {
      ...baseProfile,
      kind: "protein-vegetable" as const
    };
  });
}

function buildIngredientRelationshipFillerInputs(
  profile: IngredientRelationshipProfile,
  primaryIngredient: string,
  targetCalories: number
): SparseFillerRecipeInput[] {
  const protein = profile.protein || primaryIngredient;
  const proteinDisplay = profile.proteinDisplay || toTitleCase(protein);
  const vegetable = profile.vegetable;
  const bread = profile.bread ?? "flatbread";
  const grain = profile.grain ?? "rice";
  const ownedBreadIngredients = profile.bread ? [bread] : [];
  const ownedGrainIngredients = profile.grain ? [grain] : [];
  const breadMissing = profile.bread ? [] : ["flatbread"];
  const grainMissing = profile.grain ? [] : ["rice"];
  const proteinSpecificInputs = buildProteinSpecificRelationshipFillerInputs(profile, targetCalories);

  if (profile.kind === "protein-vegetable-bread") {
    return [
      ...proteinSpecificInputs,
      {
        calories: targetCalories + 25,
        carbs: "34g",
        cuisine: "Middle Eastern",
        difficulty: "Medium",
        dishName: `${proteinDisplay.toLowerCase()} kebab wrap`,
        excludeKeywords: ["plain protein", "protein breast only", "unrelated meat", "rice only"],
        fat: "14g",
        fiber: "5g",
        imageSearchIndices: [
          `${proteinDisplay} kebab wrap ${vegetable}`,
          `${proteinDisplay} skewers with ${vegetable} flatbread`,
          `${proteinDisplay} shish kebab wrap`
        ],
        ingredients: [protein, vegetable, ...ownedBreadIngredients],
        missingIngredients: [...breadMissing, "lemon", "garlic", "yogurt", "paprika"],
        name: `${proteinDisplay} Kebab Wrap with ${toTitleCase(vegetable)}`,
        protein: "34g",
        sodium: "610mg",
        sugar: "5g",
        visualKeywords: [`${proteinDisplay} skewers`, vegetable, "flatbread wrap"]
      },
      {
        calories: targetCalories + 15,
        carbs: "32g",
        cuisine: "Mexican",
        difficulty: "Easy",
        dishName: `${proteinDisplay.toLowerCase()} fajitas`,
        excludeKeywords: ["plain protein", "protein breast only", "rice only", "unrelated seafood"],
        fat: "13g",
        fiber: "5g",
        imageSearchIndices: [
          `${proteinDisplay} fajitas ${vegetable}`,
          `${proteinDisplay} pepper fajitas`,
          `${proteinDisplay} fajita wrap`
        ],
        ingredients: [protein, vegetable, ...ownedBreadIngredients],
        missingIngredients: [...breadMissing, "onion", "lime", "cumin", "chili powder"],
        name: `${proteinDisplay} Fajitas with ${toTitleCase(vegetable)}`,
        protein: "33g",
        sodium: "600mg",
        sugar: "5g",
        visualKeywords: [`${proteinDisplay} fajitas`, vegetable, "tortilla wrap"]
      },
      {
        calories: targetCalories + 20,
        carbs: "33g",
        cuisine: "Middle Eastern",
        difficulty: "Easy",
        dishName: `${proteinDisplay.toLowerCase()} shawarma wrap`,
        excludeKeywords: ["plain protein", "protein breast only", "beef if not requested", "rice only"],
        fat: "14g",
        fiber: "4g",
        imageSearchIndices: [
          `${proteinDisplay} shawarma wrap ${vegetable}`,
          `${proteinDisplay} shawarma flatbread`,
          `${proteinDisplay} shawarma sandwich`
        ],
        ingredients: [protein, vegetable, ...ownedBreadIngredients],
        missingIngredients: [...breadMissing, "shawarma spices", "garlic sauce", "pickles", "lemon"],
        name: `${proteinDisplay} Shawarma Wrap`,
        protein: "34g",
        sodium: "620mg",
        sugar: "4g",
        visualKeywords: [`${proteinDisplay} shawarma`, vegetable, "wrapped flatbread"]
      },
      {
        calories: targetCalories + 10,
        carbs: "30g",
        cuisine: "Chinese",
        difficulty: "Easy",
        dishName: `sweet and sour ${proteinDisplay.toLowerCase()}`,
        excludeKeywords: ["plain protein", "protein breast only", "random sandwich", "unrelated curry"],
        fat: "12g",
        fiber: "4g",
        imageSearchIndices: [
          `sweet and sour ${proteinDisplay} ${vegetable}`,
          `${proteinDisplay} ${vegetable} stir fry`,
          `${proteinDisplay} pepper stir fry`
        ],
        ingredients: [protein, vegetable],
        missingIngredients: ["vinegar", "ginger", "soy sauce", "pineapple", "scallion"],
        name: `Sweet and Sour ${proteinDisplay} with ${toTitleCase(vegetable)}`,
        protein: "33g",
        sodium: "640mg",
        sugar: "8g",
        visualKeywords: [`sweet and sour ${proteinDisplay}`, vegetable, "glossy stir fry sauce"]
      },
      {
        calories: targetCalories + 20,
        carbs: "35g",
        cuisine: "Mediterranean",
        difficulty: "Medium",
        dishName: `stuffed flatbread with ${proteinDisplay.toLowerCase()}`,
        excludeKeywords: ["plain protein", "protein breast only", "rice only", "wrong protein"],
        fat: "14g",
        fiber: "5g",
        imageSearchIndices: [
          `${proteinDisplay} stuffed flatbread ${vegetable}`,
          `${proteinDisplay} pita sandwich ${vegetable}`,
          `${proteinDisplay} bread pocket ${vegetable}`
        ],
        ingredients: [protein, vegetable, ...ownedBreadIngredients],
        missingIngredients: [...breadMissing, "onion", "parsley", "sumac", "garlic"],
        name: `${proteinDisplay} Stuffed Flatbread with ${toTitleCase(vegetable)}`,
        protein: "33g",
        sodium: "610mg",
        sugar: "5g",
        visualKeywords: [`${proteinDisplay} filling`, vegetable, "stuffed bread"]
      }
    ];
  }

  if (profile.kind === "protein-vegetable-grain") {
    return [
      ...proteinSpecificInputs,
      {
        calories: targetCalories + 25,
        carbs: "38g",
        cuisine: "Asian",
        difficulty: "Easy",
        dishName: `${proteinDisplay.toLowerCase()} ${vegetable} stir-fry bowl`,
        excludeKeywords: ["plain protein", "protein breast only", "unrelated meat", "bread only"],
        fat: "12g",
        fiber: "5g",
        imageSearchIndices: [
          `${proteinDisplay} ${vegetable} stir fry ${grain}`,
          `${proteinDisplay} ${vegetable} rice bowl`,
          `${proteinDisplay} vegetable grain bowl`
        ],
        ingredients: [protein, vegetable, ...ownedGrainIngredients],
        missingIngredients: [...grainMissing, "ginger", "soy sauce", "scallion"],
        name: `${proteinDisplay} ${toTitleCase(vegetable)} Stir-Fry Bowl`,
        protein: "33g",
        sodium: "620mg",
        sugar: "5g",
        visualKeywords: [`${proteinDisplay} stir fry`, vegetable, grain]
      },
      {
        calories: targetCalories + 35,
        carbs: "42g",
        cuisine: "Middle Eastern",
        difficulty: "Medium",
        dishName: `${proteinDisplay.toLowerCase()} vegetable pilaf`,
        excludeKeywords: ["plain protein", "protein breast only", "generic rice"],
        fat: "13g",
        fiber: "5g",
        imageSearchIndices: [
          `${proteinDisplay} ${vegetable} pilaf`,
          `${proteinDisplay} rice with ${vegetable}`,
          `${proteinDisplay} vegetable rice plate`
        ],
        ingredients: [protein, vegetable, ...ownedGrainIngredients],
        missingIngredients: [...grainMissing, "onion", "cumin", "tomato", "parsley"],
        name: `${proteinDisplay} ${toTitleCase(vegetable)} Pilaf`,
        protein: "33g",
        sodium: "600mg",
        sugar: "5g",
        visualKeywords: [`${proteinDisplay} pieces`, vegetable, "seasoned grain"]
      }
    ];
  }

  return [
    ...proteinSpecificInputs,
    {
      calories: targetCalories + 10,
      carbs: "20g",
      cuisine: "Mediterranean",
      difficulty: "Easy",
      dishName: `${proteinDisplay.toLowerCase()} ${vegetable} skewers`,
      excludeKeywords: ["plain protein", "protein breast only", "unrelated protein"],
      fat: "13g",
      fiber: "4g",
      imageSearchIndices: [
        `${proteinDisplay} ${vegetable} skewers`,
        `${proteinDisplay} kebab with ${vegetable}`,
        `grilled ${proteinDisplay} ${vegetable}`
      ],
      ingredients: [protein, vegetable],
      missingIngredients: ["lemon", "garlic", "paprika", "parsley"],
      name: `${proteinDisplay} ${toTitleCase(vegetable)} Skewers`,
      protein: "34g",
      sodium: "590mg",
      sugar: "4g",
      visualKeywords: [`${proteinDisplay} skewers`, vegetable, "grilled"]
    },
    {
      calories: targetCalories + 15,
      carbs: "24g",
      cuisine: "Italian",
      difficulty: "Medium",
      dishName: `${proteinDisplay.toLowerCase()} cacciatore-style stew`,
      excludeKeywords: ["plain protein", "protein breast only", "unrelated protein"],
      fat: "13g",
      fiber: "5g",
      imageSearchIndices: [
        `${proteinDisplay} ${vegetable} tomato stew`,
        `${proteinDisplay} cacciatore ${vegetable}`,
        `${proteinDisplay} vegetable braise`
      ],
      ingredients: [protein, vegetable],
      missingIngredients: ["tomato", "onion", "garlic", "oregano"],
      name: `${proteinDisplay} ${toTitleCase(vegetable)} Stew`,
      protein: "33g",
      sodium: "600mg",
      sugar: "6g",
      visualKeywords: [`${proteinDisplay} pieces`, vegetable, "tomato sauce"]
    }
  ];
}

function buildProteinSpecificRelationshipFillerInputs(
  profile: IngredientRelationshipProfile,
  targetCalories: number
): SparseFillerRecipeInput[] {
  const protein = profile.protein;
  const proteinDisplay = profile.proteinDisplay;
  const vegetable = profile.vegetable;
  const hasTomato = isTomatoRelationshipIngredient(vegetable);
  const hasPepperOrOnion = isPepperOrOnionRelationshipIngredient(vegetable);
  const hasDairy = Boolean(profile.dairy);
  const dairyIngredient = profile.dairy ?? "mozzarella";

  if (isChickenRelationshipProfile(profile) && hasTomato && hasDairy) {
    return [
      {
        calories: targetCalories + 35,
        carbs: "28g",
        cuisine: "Italian",
        difficulty: "Medium",
        dishName: "chicken parmesan",
        excludeKeywords: ["plain chicken breast", "alfredo pasta", "ground meat", "fish"],
        fat: "16g",
        fiber: "4g",
        imageSearchIndices: ["chicken parmesan", "chicken parmigiana tomato sauce", "breaded chicken tomato cheese"],
        ingredients: [protein, vegetable, dairyIngredient],
        missingIngredients: ["breadcrumbs", "basil", "garlic", "parmesan"],
        name: "Chicken Parmesan with Tomato Sauce",
        protein: "38g",
        sodium: "640mg",
        sugar: "6g",
        visualKeywords: ["breaded chicken cutlet", "tomato sauce", "melted cheese"]
      }
    ];
  }

  if (isGroundMeatRelationshipProfile(profile) && hasTomato) {
    return [
      {
        calories: targetCalories + 25,
        carbs: "24g",
        cuisine: "Italian",
        difficulty: "Medium",
        dishName: "meatballs in tomato sauce",
        excludeKeywords: ["plain steak", "chicken", "fish", "burger patty"],
        fat: "17g",
        fiber: "4g",
        imageSearchIndices: ["meatballs tomato sauce", "Italian meatballs marinara", "ground meat meatballs tomato"],
        ingredients: [protein, vegetable],
        missingIngredients: ["egg", "breadcrumbs", "garlic", "basil"],
        name: "Meatballs in Tomato Sauce",
        protein: "32g",
        sodium: "630mg",
        sugar: "6g",
        visualKeywords: ["round meatballs", "red tomato sauce", "herbs"]
      },
      {
        calories: targetCalories + 15,
        carbs: "18g",
        cuisine: "Middle Eastern",
        difficulty: "Medium",
        dishName: "kofta tomato skillet",
        excludeKeywords: ["plain steak", "chicken", "fish", "burger"],
        fat: "16g",
        fiber: "4g",
        imageSearchIndices: ["kofta tomato sauce", "Middle Eastern kofta skillet", "kofta tomato pepper"],
        ingredients: [protein, vegetable],
        missingIngredients: ["onion", "parsley", "cumin", "coriander"],
        name: "Kofta in Tomato Sauce",
        protein: "32g",
        sodium: "610mg",
        sugar: "6g",
        visualKeywords: ["kofta pieces", "tomato sauce", "Middle Eastern spices"]
      }
    ];
  }

  if (isFishRelationshipProfile(profile)) {
    const fishName = proteinDisplay === "Fish" ? "Fish" : proteinDisplay;
    return [
      {
        calories: targetCalories + 10,
        carbs: "16g",
        cuisine: "Mediterranean",
        difficulty: "Easy",
        dishName: `${fishName.toLowerCase()} with grilled vegetables`,
        excludeKeywords: ["chicken", "ground meat", "steak", "shrimp"],
        fat: "13g",
        fiber: "5g",
        imageSearchIndices: [
          `${fishName} grilled vegetables`,
          `${fishName} with peppers onions`,
          `Mediterranean ${fishName} vegetables`
        ],
        ingredients: [protein, vegetable],
        missingIngredients: ["lemon", "olive oil", "parsley", "garlic"],
        name: `${fishName} with Grilled Vegetables`,
        protein: "34g",
        sodium: "560mg",
        sugar: "4g",
        visualKeywords: [fishName, "grilled vegetables", "lemon herb"]
      }
    ];
  }

  if (isShrimpRelationshipProfile(profile)) {
    return [
      {
        calories: targetCalories + 15,
        carbs: "24g",
        cuisine: "Mexican",
        difficulty: "Easy",
        dishName: "shrimp fajitas",
        excludeKeywords: ["chicken fajitas", "fish", "ground meat", "steak"],
        fat: "11g",
        fiber: "5g",
        imageSearchIndices: ["shrimp fajitas", "shrimp pepper fajitas", "shrimp fajita skillet"],
        ingredients: [protein, vegetable],
        missingIngredients: ["onion", "lime", "cumin", "tortillas"],
        name: "Shrimp Fajitas",
        protein: "31g",
        sodium: "610mg",
        sugar: "5g",
        visualKeywords: ["shrimp", "sliced peppers", "fajita skillet"]
      }
    ];
  }

  if (isSteakRelationshipProfile(profile)) {
    return [
      {
        calories: targetCalories + 25,
        carbs: "18g",
        cuisine: "American",
        difficulty: "Easy",
        dishName: hasPepperOrOnion ? "pepper steak" : "grilled steak with vegetables",
        excludeKeywords: ["ground meat", "chicken", "fish", "shrimp"],
        fat: "18g",
        fiber: "4g",
        imageSearchIndices: hasPepperOrOnion
          ? ["pepper steak", "steak peppers onions", "beef pepper steak"]
          : ["grilled steak vegetables", "steak with grilled vegetables", "steak dinner vegetables"],
        ingredients: [protein, vegetable],
        missingIngredients: ["garlic", "black pepper", "parsley", "lemon"],
        name: hasPepperOrOnion ? "Pepper Steak" : `Grilled ${proteinDisplay} with ${toTitleCase(vegetable)}`,
        protein: "38g",
        sodium: "590mg",
        sugar: "4g",
        visualKeywords: hasPepperOrOnion
          ? ["steak strips", "peppers and onions", "seared beef"]
          : ["grilled steak", vegetable, "simple plate"]
      }
    ];
  }

  return [];
}

function recipeMatchesIngredientRelationship(recipe: Recipe, profile: IngredientRelationshipProfile) {
  const text = getRecipeSparseIngredientIdentityText(recipe).toLowerCase();
  const hasProtein = text.includes(normalizeIngredientForStrictMatch(profile.protein)) ||
    text.includes(profile.proteinDisplay.toLowerCase());
  const hasVegetable = text.includes(normalizeIngredientForStrictMatch(profile.vegetable));
  const hasBread = !profile.bread || text.includes(normalizeIngredientForStrictMatch(profile.bread)) ||
    /\b(wrap|sandwich|flatbread|pita|tortilla|shawarma|fajita|taco|stuffed bread)\b/i.test(text);
  const hasGrain = !profile.grain || text.includes(normalizeIngredientForStrictMatch(profile.grain)) ||
    /\b(rice|pilaf|grain|bowl|biryani|kabsa|fried rice)\b/i.test(text);
  const hasRelationshipFamily = /\b(wrap|sandwich|flatbread|pita|tortilla|shawarma|fajita|taco|kebab|skewer|stir fry|stir-fry|sweet and sour|stuffed|pilaf|bowl|stew|tray|casserole)\b/i.test(text);

  if (profile.kind === "protein-vegetable-bread") return hasProtein && hasVegetable && hasBread && hasRelationshipFamily;
  if (profile.kind === "protein-vegetable-grain") return hasProtein && hasVegetable && hasGrain && hasRelationshipFamily;
  return hasProtein && hasVegetable && hasRelationshipFamily;
}

function findIngredientCandidate(candidates: string[], predicate: (value: string) => boolean) {
  return candidates.find((candidate) => predicate(candidate));
}

function dedupeRelationshipCandidates(candidates: string[], keyBuilder: (value: string) => string) {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const candidate of candidates) {
    const key = keyBuilder(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function chooseBestRelationshipVegetable(protein: string, vegetables: string[]) {
  const canonicalVegetables = vegetables.map(getCanonicalRelationshipIngredient);
  const byPreference = (patterns: RegExp[]) =>
    canonicalVegetables.find((vegetable) => patterns.some((pattern) => pattern.test(vegetable)));

  if (/\b(ground meat|beef mince|lamb mince)\b/i.test(protein)) {
    return byPreference([/\btomato\b/i, /\bonion\b/i, /\bbell pepper\b/i]) ?? vegetables[0];
  }
  if (/\b(chicken)\b/i.test(protein)) {
    return byPreference([/\btomato\b/i, /\bbell pepper\b/i, /\bonion\b/i]) ?? vegetables[0];
  }
  if (/\b(steak|beef|lamb)\b/i.test(protein)) {
    return byPreference([/\bbell pepper\b/i, /\bonion\b/i, /\btomato\b/i]) ?? vegetables[0];
  }
  if (/\b(salmon|fish|tilapia|tuna|cod|shrimp|prawn|seafood)\b/i.test(protein)) {
    return byPreference([/\bbell pepper\b/i, /\bonion\b/i, /\btomato\b/i]) ?? vegetables[0];
  }

  return vegetables[0];
}

function isRelationshipProteinIngredient(value: string) {
  return getMainProteinCategoriesFromText(value).size > 0 || /\b(tofu|tempeh|beans?|lentils?|chickpeas?)\b/i.test(value);
}

function isRelationshipVegetableIngredient(value: string) {
  const normalized = normalizeIngredientForStrictMatch(value);
  return /\b(bell pep+er|pep+er|capsicum|onion|tomato|potato|carrot|zucchini|eggplant|spinach|broccoli|cauliflower|cabbage|mushroom|corn|peas|okra|cucumber|lettuce|greens?)\b/i.test(normalized);
}

function isRelationshipBreadIngredient(value: string) {
  const normalized = normalizeIngredientForStrictMatch(value);
  return /\b(bread|flatbread|pita|tortilla|wrap|lavash|naan|bun|roll|toast|baladi)\b/i.test(normalized);
}

function isRelationshipGrainIngredient(value: string) {
  const normalized = normalizeIngredientForStrictMatch(value);
  return /\b(rice|grain|bulgur|quinoa|couscous|barley|oats|noodles?|pasta|spaghetti|penne|macaroni)\b/i.test(normalized);
}

function isRelationshipDairyIngredient(value: string) {
  const normalized = normalizeIngredientForStrictMatch(value);
  return /\b(cheese|milk|yogurt|cream|labneh|feta|mozzarella|cheddar|parmesan|ricotta|butter)\b/i.test(normalized);
}

function getCanonicalRelationshipIngredient(value: string) {
  const normalized = normalizeIngredientForStrictMatch(value);
  if (/\b(bell\s*pep+er|sweet\s+pep+er|capsicum|green\s+pep+er|red\s+pep+er|yellow\s+pep+er|pep+er)\b/i.test(normalized)) return "bell pepper";
  if (/\b(flatbread|pita|tortilla|lavash|naan|baladi\s+bread|wrap|bread)\b/i.test(normalized)) return "bread";
  if (/\b(chicken\s+breast|chicken\s+thigh|chicken\s+leg|chicken\s+tender|chicken)\b/i.test(normalized)) return "chicken";
  if (/\b(ground meat|ground beef|ground lamb|minced meat|minced beef|mince)\b/i.test(normalized)) return "ground meat";
  if (/\b(steak|beef steak)\b/i.test(normalized)) return "steak";
  if (/\b(salmon|tilapia|tuna|cod|shrimp|prawn|mozzarella|parmesan|cheese|yogurt|cream)\b/i.test(normalized)) return normalized;
  return normalized || value;
}

function getProteinDishDisplayLabel(value: string) {
  const normalized = normalizeIngredientForStrictMatch(value);
  if (/\bsalmon\b/i.test(normalized)) return "Salmon";
  if (/\btilapia\b/i.test(normalized)) return "Tilapia";
  if (/\btuna\b/i.test(normalized)) return "Tuna";
  if (/\bcod\b/i.test(normalized)) return "Cod";
  if (/\bsteak\b/i.test(normalized)) return "Steak";
  const categories = getMainProteinCategoriesFromText(value);
  if (categories.has("chicken")) return "Chicken";
  if (categories.has("shrimp")) return "Shrimp";
  if (categories.has("fish")) return "Fish";
  if (categories.has("seafood")) return "Seafood";
  if (categories.has("liver")) return "Liver";
  if (categories.has("beefOrLamb")) return /\blamb\b/i.test(value) ? "Lamb" : "Beef";
  if (categories.has("groundMeat")) return "Ground Meat";
  if (categories.has("egg")) return "Egg";
  return toTitleCase(getCanonicalRelationshipIngredient(value));
}

function isChickenRelationshipProfile(profile: IngredientRelationshipProfile) {
  return /\bchicken\b/i.test(profile.protein);
}

function isGroundMeatRelationshipProfile(profile: IngredientRelationshipProfile) {
  return /\bground meat\b/i.test(profile.protein);
}

function isFishRelationshipProfile(profile: IngredientRelationshipProfile) {
  return /\b(salmon|fish|tilapia|tuna|cod)\b/i.test(profile.protein);
}

function isShrimpRelationshipProfile(profile: IngredientRelationshipProfile) {
  return /\b(shrimp|prawn)\b/i.test(profile.protein);
}

function isSteakRelationshipProfile(profile: IngredientRelationshipProfile) {
  return /\b(steak|beef|lamb)\b/i.test(profile.protein) && !isGroundMeatRelationshipProfile(profile);
}

function isTomatoRelationshipIngredient(value: string) {
  return /\btomato\b/i.test(value);
}

function isPepperOrOnionRelationshipIngredient(value: string) {
  return /\b(bell pepper|pepper|onion)\b/i.test(value);
}

type MainProteinCategory = "chicken" | "groundMeat" | "beefOrLamb" | "liver" | "fish" | "shrimp" | "seafood" | "egg";

function filterRecipesByInputMainProtein(
  recipes: Recipe[],
  context: { availableIngredients: Set<string>; ingredients: string[]; scoringIngredients: string[] }
) {
  const inputProteins = getEffectiveInputMainProteinCategories(context);
  if (!inputProteins.size) return recipes;

  return [...recipes].sort((left, right) => {
    const score = (recipe: Recipe) => {
    const recipeProteins = getRecipeMainProteinCategories(recipe);
      if (!recipeProteins.size) return -36;
      if (isShrimpOnlyInputProteinSet(inputProteins) && recipeHasFishIdentityConflict(recipe)) return -80;
      if (isShrimpOnlyInputProteinSet(inputProteins) && !recipeHasShrimpIdentity(recipe)) return -60;
      return recipeProteinSetMatchesInput(recipeProteins, inputProteins) ? 40 : -48;
    };
    return score(right) - score(left);
  });
}

function hasMinimumAnyCuisineDiversity(recipes: Recipe[], recipeCount: number) {
  const requiredCuisineCount = Math.min(4, recipeCount);
  const cuisineKeys = new Set(
    recipes
      .map((recipe) => normalizeRecipeCuisineBucket(recipe.cuisine))
      .filter((cuisine) => cuisine && cuisine !== "unknown" && cuisine !== "global")
  );
  return cuisineKeys.size >= requiredCuisineCount;
}

function filterRecipesByRequestedSparseIngredient(
  recipes: Recipe[],
  context: { ingredients: string[]; scoringIngredients: string[] }
) {
  const requestedSource = [...context.ingredients, ...context.scoringIngredients].join(" ");
  if (isChickenSparseIngredientSource(requestedSource)) {
    return prioritizeRecipeMatches(recipes, recipeMatchesRequestedChickenSparseIngredient);
  }
  if (isEggSparseIngredientSource(requestedSource)) {
    return prioritizeRecipeMatches(recipes, recipeMatchesRequestedEggSparseIngredient);
  }
  if (!isLegumeSparseIngredientSource(requestedSource)) return recipes;

  return prioritizeRecipeMatches(recipes, (recipe) => recipeMatchesRequestedLegumeSparseIngredient(recipe, requestedSource));
}

function prioritizeRecipeMatches(recipes: Recipe[], matches: (recipe: Recipe) => boolean) {
  return [...recipes].sort((left, right) => Number(matches(right)) - Number(matches(left)));
}

function recipeMatchesRequestedChickenSparseIngredient(recipe: Recipe) {
  return isChickenSparseIngredientSource(getRecipeSparseDishIdentityText(recipe));
}

function recipeMatchesRequestedEggSparseIngredient(recipe: Recipe) {
  return isEggSparseIngredientSource(getRecipeSparseIngredientIdentityText(recipe));
}

function recipeMatchesRequestedLegumeSparseIngredient(recipe: Recipe, requestedSource: string) {
  const recipeText = getRecipeSparseIngredientIdentityText(recipe);

  if (isFavaSparseIngredientSource(requestedSource)) {
    return isFavaSparseIngredientSource(recipeText);
  }

  return isLegumeSparseIngredientSource(recipeText);
}

function getRecipeSparseIngredientIdentityText(recipe: Recipe) {
  return [
    recipe.name,
    recipe.cuisine,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    recipe.localized?.English?.name,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    recipe.localized?.English?.dish_intent?.dish_name,
    ...(recipe.localized?.English?.dish_intent?.visual_keywords ?? []),
    recipe.localized?.Arabic?.name,
    recipe.localized?.Arabic?.image_search_index,
    ...(recipe.localized?.Arabic?.image_search_indices ?? []),
    recipe.localized?.Arabic?.dish_intent?.dish_name,
    ...(recipe.localized?.Arabic?.dish_intent?.visual_keywords ?? [])
  ].filter(Boolean).join(" ");
}

function getRecipeSparseDishIdentityText(recipe: Recipe) {
  return [
    recipe.name,
    recipe.cuisine,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    recipe.localized?.English?.name,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    recipe.localized?.English?.dish_intent?.dish_name,
    ...(recipe.localized?.English?.dish_intent?.visual_keywords ?? []),
    recipe.localized?.Arabic?.name,
    recipe.localized?.Arabic?.image_search_index,
    ...(recipe.localized?.Arabic?.image_search_indices ?? []),
    recipe.localized?.Arabic?.dish_intent?.dish_name,
    ...(recipe.localized?.Arabic?.dish_intent?.visual_keywords ?? [])
  ].filter(Boolean).join(" ");
}

function getInputMainProteinCategories(context: { availableIngredients: Set<string>; ingredients: string[]; scoringIngredients: string[] }) {
  return getMainProteinCategoriesFromText([
    ...context.ingredients,
    ...context.scoringIngredients,
    ...Array.from(context.availableIngredients)
  ].join(" "));
}

function getRequestedMainProteinCategories(context: { ingredients: string[] }) {
  return getMainProteinCategoriesFromText(context.ingredients.join(" "));
}

function getEffectiveInputMainProteinCategories(context: { availableIngredients: Set<string>; ingredients: string[]; scoringIngredients: string[] }) {
  const requestedProteins = getRequestedMainProteinCategories(context);
  return requestedProteins.size ? requestedProteins : getInputMainProteinCategories(context);
}

function getRecipeMainProteinCategories(recipe: Recipe) {
  return getMainProteinCategoriesFromText([
    recipe.name,
    recipe.cuisine,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? [])
  ].filter(Boolean).join(" "));
}

function getRecipeNamedIdentityText(recipe: Recipe) {
  const localized = recipe.localized ?? {};
  return [
    recipe.name,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    localized.English?.name,
    localized.English?.image_search_index,
    ...(localized.English?.image_search_indices ?? []),
    localized.English?.dish_intent?.dish_name,
    ...(localized.English?.dish_intent?.visual_keywords ?? []),
    localized.Arabic?.name,
    localized.Arabic?.image_search_index,
    ...(localized.Arabic?.image_search_indices ?? []),
    localized.Arabic?.dish_intent?.dish_name,
    ...(localized.Arabic?.dish_intent?.visual_keywords ?? [])
  ].filter(Boolean).join(" ");
}

function recipeHasShrimpIdentity(recipe: Recipe) {
  return /(?:\bshrimp\b|\bprawn\b|\bgoong\b|\bgamberi\b|\bcamarones\b|\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646|\u0642\u0631\u064a\u062f\u0633)/iu.test(
    getRecipeNamedIdentityText(recipe)
  );
}

function recipeHasFishIdentityConflict(recipe: Recipe) {
  return /(?:\bfish\b|\bsalmon\b|\btilapia\b|\bcod\b|\bseabass\b|\btuna\b|\bseafood\b|\banchov(?:y|ies)\b|\bhamsi(?:li)?\b|\bpescado\b|\bsamke\b|\u0633\u0645\u0643|\u0633\u0645\u0643\u0629|\u0628\u0644\u0637\u064a|\u062f\u0646\u064a\u0633|\u0633\u0644\u0645\u0648\u0646|\u062a\u0648\u0646\u0629|\u0645\u0623\u0643\u0648\u0644\u0627\u062a|\u0628\u062d\u0631\u064a|\u0633\u064a\s*\u0641\u0648\u062f)/iu.test(
    getRecipeNamedIdentityText(recipe)
  );
}

function getMainProteinCategoriesFromText(value: string) {
  const normalized = value.toLowerCase();
  const categories = new Set<MainProteinCategory>();

  if (/(?:\bground\s+(?:beef|meat|lamb|turkey|chicken)\b|\bminced?\s+(?:beef|meat|lamb|turkey|chicken)\b|\b(?:beef|lamb)\s+mince\b|لحم\s*مفروم|لحمة\s*مفرومة|مفروم)/iu.test(normalized)) {
    categories.add("groundMeat");
  }
  if (/(?:\bliver\b|\bkebda\b|\bkibda\b|\bcigeri?\b|\u0643\u0628\u062f(?:\u0629|\u0647)?)/iu.test(normalized)) {
    categories.add("liver");
  }
  if (/(?:\bchicken\b|\bhen\b|\bpoultry\b|دجاج|فراخ|فراخة|فرخة|صدور\s*(?:دجاج|فراخ))/iu.test(normalized)) {
    categories.add("chicken");
  }
  if (/(?:\bbeef\b|\blamb\b|\bmutton\b|\bveal\b|\bmeat\b|\bsteak\b|لحم|لحمة|بقري|ضاني|غنم|عجل)/iu.test(normalized) && !categories.has("groundMeat") && !categories.has("liver")) {
    categories.add("beefOrLamb");
  }
  if (/(?:\bfish\b|\bsalmon\b|\btilapia\b|\bcod\b|\bseabass\b|\btuna\b|\bseafood\b|سمك|سمكة|بلطي|دنيس|سلمون|تونة|مأكولات|بحري|سي\s*فود)/iu.test(normalized)) {
    categories.add(normalized.includes("seafood") || /مأكولات|بحري|سي\s*فود/iu.test(normalized) ? "seafood" : "fish");
  }
  if (/(?:\bshrimp\b|\bprawn\b|\bgoong\b|جمبري|روبيان|قريدس)/iu.test(normalized)) {
    categories.add("shrimp");
  }
  if (isEggSparseIngredientSource(normalized)) {
    categories.add("egg");
  }

  return categories;
}

function isProteinCategoryAllowed(category: MainProteinCategory, allowed: Set<MainProteinCategory>) {
  if (allowed.has(category)) return true;
  if (category === "fish" && allowed.has("seafood")) return true;
  if (category === "shrimp" && allowed.has("seafood")) return true;
  if (category === "seafood" && (allowed.has("fish") || allowed.has("shrimp"))) return true;
  if (category === "beefOrLamb" && allowed.has("groundMeat")) return true;
  return false;
}

function recipeProteinSetMatchesInput(recipeProteins: Set<MainProteinCategory>, inputProteins: Set<MainProteinCategory>) {
  if (isShrimpOnlyInputProteinSet(inputProteins)) {
    return recipeProteins.has("shrimp") && Array.from(recipeProteins).every((category) => (
      category === "shrimp" || category === "seafood"
    ));
  }

  if (isFishOnlyInputProteinSet(inputProteins)) {
    return recipeProteins.has("fish") && Array.from(recipeProteins).every((category) => (
      category === "fish" || category === "seafood"
    ));
  }

  return Array.from(recipeProteins).every((category) => isProteinCategoryAllowed(category, inputProteins));
}

function isShrimpOnlyInputProteinSet(inputProteins: Set<MainProteinCategory>) {
  return inputProteins.has("shrimp") && !inputProteins.has("fish") && !inputProteins.has("seafood");
}

function isFishOnlyInputProteinSet(inputProteins: Set<MainProteinCategory>) {
  return inputProteins.has("fish") && !inputProteins.has("shrimp") && !inputProteins.has("seafood");
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

  const curated = buildCuratedCuisineSparseFillerInputs(context.preferredCuisine, primaryIngredient, targetCalories)
    .map((input) => makeSparseFillerRecipe(input, context));
  const candidates = [...all, ...curated];
  if (preferred === "any") {
    return diversifyAnyCuisineSparseFillers(candidates);
  }

  return prefersEgyptianFirst
    ? orderSparseFillersByCuisine(candidates, "egyptian")
    : orderSparseFillersByCuisine(candidates, preferred);
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
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 20,
      carbs: "42g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "liver and rice",
      excludeKeywords: ["beef steak", "kofta", "meatballs", "pasta", "random rice bowl"],
      fat: "16g",
      fiber: "4g",
      imageSearchIndices: ["egyptian liver and rice", "kebda rice egyptian", "liver rice plate"],
      ingredients: [primaryIngredient],
      missingIngredients: ["rice", "onion", "garlic", "tomato", "cumin"],
      name: "Egyptian Liver and Rice",
      protein: "33g",
      sodium: "640mg",
      sugar: "5g",
      visualKeywords: ["sliced liver", "rice", "egyptian spices"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories,
      carbs: "22g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "grilled kebda plate",
      excludeKeywords: ["ground meat", "meatballs", "burger", "steak", "pasta"],
      fat: "15g",
      fiber: "4g",
      imageSearchIndices: ["grilled kebda plate", "egyptian grilled liver", "kebda salad bread"],
      ingredients: [primaryIngredient],
      missingIngredients: ["lemon", "onion", "parsley", "baladi bread", "green pepper"],
      name: "Grilled Egyptian Kebda Plate",
      protein: "35g",
      sodium: "600mg",
      sugar: "4g",
      visualKeywords: ["grilled liver slices", "lemon", "baladi bread"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories - 10,
      carbs: "20g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "liver vegetable stew",
      excludeKeywords: ["beef cubes", "kofta", "meatballs", "pasta", "cream"],
      fat: "14g",
      fiber: "6g",
      imageSearchIndices: ["egyptian liver stew", "kebda tomato stew", "liver vegetables stew"],
      ingredients: [primaryIngredient],
      missingIngredients: ["tomato", "zucchini", "onion", "garlic", "coriander"],
      name: "Egyptian Liver Vegetable Stew",
      protein: "32g",
      sodium: "610mg",
      sugar: "7g",
      visualKeywords: ["liver pieces", "tomato stew", "vegetables"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 10,
      carbs: "18g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "smoked paprika kebda",
      excludeKeywords: ["smoked processed meat", "sausage", "kofta", "burger", "pasta"],
      fat: "16g",
      fiber: "4g",
      imageSearchIndices: ["smoked paprika kebda", "egyptian liver peppers", "spiced liver slices"],
      ingredients: [primaryIngredient],
      missingIngredients: ["smoked paprika", "green pepper", "onion", "garlic", "lemon"],
      name: "Smoked-Paprika Egyptian Kebda",
      protein: "34g",
      sodium: "620mg",
      sugar: "4g",
      visualKeywords: ["dark liver slices", "peppers", "smoked paprika"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 35,
      carbs: "36g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "liver shawarma",
      excludeKeywords: ["chicken shawarma", "beef shawarma", "kofta", "burger", "ground meat"],
      fat: "17g",
      fiber: "5g",
      imageSearchIndices: ["egyptian liver shawarma", "kebda shawarma plate", "liver shawarma wrap"],
      ingredients: [primaryIngredient],
      missingIngredients: ["flatbread", "tahini", "onion", "parsley", "sumac"],
      name: "Egyptian Liver Shawarma Plate",
      protein: "34g",
      sodium: "660mg",
      sugar: "5g",
      visualKeywords: ["thin liver strips", "flatbread", "tahini"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 15,
      carbs: "30g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "baked kebda tray",
      excludeKeywords: ["fried cutlet", "kofta tray", "meatballs", "pasta", "cream"],
      fat: "15g",
      fiber: "5g",
      imageSearchIndices: ["baked kebda tray", "egyptian liver tray", "liver peppers tray"],
      ingredients: [primaryIngredient],
      missingIngredients: ["potato", "green pepper", "tomato", "onion", "garlic"],
      name: "Baked Egyptian Kebda Tray",
      protein: "33g",
      sodium: "630mg",
      sugar: "5g",
      visualKeywords: ["baked liver slices", "pepper tray", "tomato"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories,
      carbs: "24g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "liver soup",
      excludeKeywords: ["cream soup", "meatball soup", "beef stew cubes", "pasta", "burger"],
      fat: "12g",
      fiber: "4g",
      imageSearchIndices: ["egyptian liver soup", "kebda broth", "liver vegetable soup"],
      ingredients: [primaryIngredient],
      missingIngredients: ["broth", "carrot", "celery", "onion", "parsley"],
      name: "Egyptian Liver Soup",
      protein: "31g",
      sodium: "580mg",
      sugar: "5g",
      visualKeywords: ["clear broth", "liver pieces", "vegetables"]
    }, context),
    makeSparseFillerRecipe({
      calories: targetCalories + 25,
      carbs: "28g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "sliced kebda with onions",
      excludeKeywords: ["ground meat", "kofta", "meatballs", "beef steak", "pasta"],
      fat: "16g",
      fiber: "5g",
      imageSearchIndices: ["sliced kebda onions", "egyptian liver onions", "liver peppers onions"],
      ingredients: [primaryIngredient],
      missingIngredients: ["onion", "green pepper", "lemon", "cumin", "whole wheat bread"],
      name: "Sliced Egyptian Kebda With Onions",
      protein: "34g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["sliced liver", "onions", "green peppers"]
    }, context)
  ];

  if (preferred === "any") {
    const anyCuisineFillers = buildAnyCuisineLiverSparseFillerInputs(primaryIngredient, targetCalories)
      .map((input) => makeSparseFillerRecipe(input, context));
    return diversifyAnyCuisineSparseFillers([...all, ...anyCuisineFillers]);
  }

  return orderSparseFillersByCuisine(all, preferred);
}

function buildAnyCuisineLiverSparseFillerInputs(
  liverIngredient: string,
  targetCalories: number
): SparseFillerRecipeInput[] {
  const primary = liverIngredient || "liver";
  return [
    {
      calories: targetCalories + 10,
      carbs: "20g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "arnavut cigeri",
      excludeKeywords: ["fried chicken", "chicken cutlet", "rice only", "steak", "kofta"],
      fat: "16g",
      fiber: "4g",
      imageSearchIndices: ["arnavut cigeri liver", "turkish liver arnavut cigeri", "cigeri liver cubes onions"],
      ingredients: [primary],
      missingIngredients: ["onion", "sumac", "parsley", "lemon", "paprika"],
      name: "Turkish Arnavut Cigeri",
      protein: "34g",
      sodium: "610mg",
      sugar: "4g",
      visualKeywords: ["liver cubes", "sumac onions", "turkish liver"]
    },
    {
      calories: targetCalories,
      carbs: "18g",
      cuisine: "Moroccan",
      difficulty: "Medium",
      dishName: "moroccan kebda chermoula",
      excludeKeywords: ["fried chicken", "rice only", "steak", "ground meat", "kofta"],
      fat: "15g",
      fiber: "5g",
      imageSearchIndices: ["moroccan kebda chermoula liver", "kebda mchermla liver", "moroccan liver chermoula"],
      ingredients: [primary],
      missingIngredients: ["cilantro", "parsley", "garlic", "lemon", "paprika"],
      name: "Moroccan Kebda Chermoula",
      protein: "33g",
      sodium: "600mg",
      sugar: "4g",
      visualKeywords: ["liver pieces", "chermoula sauce", "moroccan liver"]
    },
    {
      calories: targetCalories + 20,
      carbs: "28g",
      cuisine: "Indian",
      difficulty: "Medium",
      dishName: "kaleji masala",
      excludeKeywords: ["fried chicken", "butter chicken", "rice only", "kofta", "steak"],
      fat: "17g",
      fiber: "5g",
      imageSearchIndices: ["kaleji masala liver", "indian liver masala", "spiced liver kaleji"],
      ingredients: [primary],
      missingIngredients: ["tomato", "onion", "ginger", "garam masala", "cilantro"],
      name: "Kaleji Masala",
      protein: "34g",
      sodium: "630mg",
      sugar: "6g",
      visualKeywords: ["liver masala", "spiced tomato onion sauce", "kaleji"]
    },
    {
      calories: targetCalories,
      carbs: "22g",
      cuisine: "Italian",
      difficulty: "Medium",
      dishName: "fegato alla veneziana",
      excludeKeywords: ["fried chicken", "rice only", "pasta", "steak", "meatballs"],
      fat: "16g",
      fiber: "4g",
      imageSearchIndices: ["fegato alla veneziana liver onions", "venetian liver onions", "italian liver onions"],
      ingredients: [primary],
      missingIngredients: ["onion", "parsley", "lemon", "olive oil", "polenta"],
      name: "Fegato Alla Veneziana",
      protein: "33g",
      sodium: "590mg",
      sugar: "5g",
      visualKeywords: ["thin liver slices", "soft onions", "venetian liver"]
    },
    {
      calories: targetCalories + 10,
      carbs: "24g",
      cuisine: "Mexican",
      difficulty: "Easy",
      dishName: "higado encebollado",
      excludeKeywords: ["fried chicken", "rice only", "taco filling only", "steak", "ground meat"],
      fat: "15g",
      fiber: "5g",
      imageSearchIndices: ["higado encebollado liver onions", "mexican liver onions", "liver with onions mexican"],
      ingredients: [primary],
      missingIngredients: ["onion", "tomato", "jalapeno", "lime", "cilantro"],
      name: "Higado Encebollado",
      protein: "34g",
      sodium: "600mg",
      sugar: "5g",
      visualKeywords: ["liver strips", "onions", "mexican higado"]
    },
    {
      calories: targetCalories + 25,
      carbs: "34g",
      cuisine: "Middle Eastern",
      difficulty: "Easy",
      dishName: "liver shawarma plate",
      excludeKeywords: ["chicken shawarma", "beef shawarma", "fried chicken", "kofta", "rice only"],
      fat: "16g",
      fiber: "5g",
      imageSearchIndices: ["liver shawarma plate", "kebda shawarma liver", "middle eastern liver shawarma"],
      ingredients: [primary],
      missingIngredients: ["flatbread", "tahini", "sumac", "onion", "parsley"],
      name: "Liver Shawarma Plate",
      protein: "34g",
      sodium: "640mg",
      sugar: "5g",
      visualKeywords: ["liver strips", "flatbread", "shawarma spices"]
    },
    {
      calories: targetCalories,
      carbs: "18g",
      cuisine: "American",
      difficulty: "Easy",
      dishName: "grilled liver and onions",
      excludeKeywords: ["fried chicken", "rice only", "steak", "burger", "meatloaf"],
      fat: "14g",
      fiber: "4g",
      imageSearchIndices: ["grilled liver and onions", "healthy liver onions", "pan seared liver onions"],
      ingredients: [primary],
      missingIngredients: ["onion", "garlic", "parsley", "lemon", "green beans"],
      name: "Grilled Liver and Onions",
      protein: "35g",
      sodium: "560mg",
      sugar: "4g",
      visualKeywords: ["liver slices", "onions", "pan seared liver"]
    },
    {
      calories: targetCalories + 10,
      carbs: "20g",
      cuisine: "Mediterranean",
      difficulty: "Medium",
      dishName: "lemon oregano liver skewers",
      excludeKeywords: ["fried chicken", "rice only", "kofta", "steak cubes", "kebab without liver"],
      fat: "15g",
      fiber: "4g",
      imageSearchIndices: ["liver skewers lemon oregano", "mediterranean grilled liver skewers", "grilled liver kebab"],
      ingredients: [primary],
      missingIngredients: ["lemon", "oregano", "onion", "pepper", "parsley"],
      name: "Lemon-Oregano Liver Skewers",
      protein: "35g",
      sodium: "590mg",
      sugar: "4g",
      visualKeywords: ["liver skewers", "lemon oregano", "grilled liver"]
    }
  ];
}

function buildGenericSparseFillers(
  primaryIngredient: string,
  context: {
    allergens: string[];
    availableIngredients: Set<string>;
    conditions: string[];
    diets: string[];
    ingredients: string[];
    preferredCuisine: string;
    scoringIngredients: string[];
  },
  targetCalories: number
) {
  const preferred = normalizeCuisinePreference(context.preferredCuisine);
  const authenticFillers = preferred === "any"
    ? buildAnyCuisineSparseFillers(primaryIngredient, context, targetCalories)
    : buildAuthenticCuisineSparseFillers(primaryIngredient, context, targetCalories);
  const cuisineProteinFillers = preferred === "any"
    ? []
    : buildPreferredCuisineProteinSparseFillers(primaryIngredient, context, targetCalories);
  const fallbackFillers = [
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

  const mergedFillers = preferred === "any"
    ? diversifyAnyCuisineSparseFillers([...authenticFillers, ...cuisineProteinFillers])
    : dedupeSparseFillerRecipes([...authenticFillers, ...cuisineProteinFillers]);
  return mergedFillers.length ? mergedFillers : fallbackFillers;
}

function buildPreferredCuisineProteinSparseFillers(
  primaryIngredient: string,
  context: {
    allergens: string[];
    availableIngredients: Set<string>;
    conditions: string[];
    diets: string[];
    ingredients: string[];
    preferredCuisine: string;
    scoringIngredients: string[];
  },
  targetCalories: number
) {
  const inputProteins = getEffectiveInputMainProteinCategories(context);
  if (inputProteins.has("chicken")) {
    return buildAnyCuisineChickenSparseFillers(primaryIngredient, context, targetCalories)
      .filter((recipe) => cuisineMatchesPreference(recipe.cuisine, context.preferredCuisine));
  }

  return [];
}

function dedupeSparseFillerRecipes(recipes: Recipe[]) {
  const seen = new Set<string>();
  const deduped: Recipe[] = [];
  for (const recipe of recipes) {
    const key = getRecipeSelectionKey(recipe);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(recipe);
  }
  return deduped;
}

function diversifyAnyCuisineSparseFillers(recipes: Recipe[]) {
  const deduped = dedupeSparseFillerRecipes(recipes);
  const grouped = new Map<string, Recipe[]>();
  for (const recipe of deduped) {
    const cuisine = normalizeCuisinePreference(recipe.cuisine);
    grouped.set(cuisine, [...(grouped.get(cuisine) ?? []), recipe]);
  }

  const cuisines = Array.from(grouped.keys());
  if (cuisines.length <= 1) return deduped;

  const cuisineOffset = Math.floor(Math.random() * cuisines.length);
  const orderedCuisines = rotateArray(cuisines, cuisineOffset);
  const rotatedGroups = new Map(
    orderedCuisines.map((cuisine, index) => {
      const group = grouped.get(cuisine) ?? [];
      return [cuisine, rotateArray(group, (cuisineOffset + index) % Math.max(1, group.length))] as const;
    })
  );
  const diversified: Recipe[] = [];
  const maxGroupLength = Math.max(...Array.from(rotatedGroups.values()).map((group) => group.length));

  for (let round = 0; round < maxGroupLength; round += 1) {
    for (const cuisine of orderedCuisines) {
      const recipe = rotatedGroups.get(cuisine)?.[round];
      if (recipe) diversified.push(recipe);
    }
  }

  return diversified;
}

function rotateArray<T>(items: T[], offset: number) {
  if (!items.length) return items;
  const normalizedOffset = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

function buildAnyCuisineSparseFillers(
  primaryIngredient: string,
  context: {
    allergens: string[];
    availableIngredients: Set<string>;
    conditions: string[];
    diets: string[];
    ingredients: string[];
    preferredCuisine: string;
    scoringIngredients: string[];
  },
  targetCalories: number
) {
  const source = `${context.ingredients.join(" ")} ${context.scoringIngredients.join(" ")}`.toLowerCase();
  const inputProteins = getEffectiveInputMainProteinCategories(context);
  const hasSeafood =
    inputProteins.has("fish") ||
    inputProteins.has("shrimp") ||
    inputProteins.has("seafood") ||
    /\b(shrimp|fish|seafood|salmon|tilapia|cod|prawn)\b/.test(source);
  const hasGrain = /\b(rice|quinoa|bulgur|farro|barley|freekeh)\b/.test(source);
  const hasLegume = isLegumeSparseIngredientSource(`${primaryIngredient} ${source}`);
  if (inputProteins.has("chicken")) {
    return buildAnyCuisineChickenSparseFillers(primaryIngredient, context, targetCalories);
  }
  if (isShrimpOnlyInputProteinSet(inputProteins)) {
    return buildAnyCuisineShrimpSparseFillers(primaryIngredient, context, targetCalories);
  }
  if (inputProteins.has("egg") || isEggSparseIngredientSource(`${primaryIngredient} ${source}`)) {
    return buildAnyCuisineEggSparseFillers(primaryIngredient, context, targetCalories);
  }
  if (hasLegume) {
    return buildAnyCuisineLegumeSparseFillers(primaryIngredient, context, targetCalories);
  }
  if (!hasSeafood) {
    return buildAnyCuisineVegetableSparseFillers(primaryIngredient, context, targetCalories, hasGrain);
  }
  const baseIngredient = primaryIngredient || (hasSeafood ? "seafood" : hasGrain ? "rice" : "vegetables");
  const templates: SparseFillerRecipeInput[] = [
    {
      calories: targetCalories + 20,
      carbs: hasGrain ? "42g" : "28g",
      cuisine: "Mexican",
      difficulty: "Medium",
      dishName: "pescado a la veracruzana",
      excludeKeywords: ["generic fish plate"],
      fat: "14g",
      fiber: "6g",
      imageSearchIndices: ["pescado a la veracruzana", "veracruz style fish"],
      ingredients: [baseIngredient],
      missingIngredients: ["tomato", "pepper", "olive", "capers"],
      name: "Pescado a la Veracruzana",
      protein: hasSeafood ? "34g" : "24g",
      sodium: "620mg",
      sugar: "6g",
      visualKeywords: ["veracruz fish", "tomato olive sauce"]
    },
    {
      calories: targetCalories,
      carbs: "34g",
      cuisine: "Thai",
      difficulty: "Medium",
      dishName: "tom yum goong",
      excludeKeywords: ["generic shrimp soup"],
      fat: "10g",
      fiber: "4g",
      imageSearchIndices: ["tom yum goong", "thai tom yum shrimp"],
      ingredients: [baseIngredient],
      missingIngredients: ["lemongrass", "lime", "chili", "mushrooms"],
      name: "Tom Yum Goong",
      protein: "32g",
      sodium: "600mg",
      sugar: "5g",
      visualKeywords: ["tom yum", "clear spicy shrimp soup"]
    },
    {
      calories: targetCalories + 30,
      carbs: "44g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "sayadeya",
      excludeKeywords: ["generic rice bowl"],
      fat: "13g",
      fiber: "5g",
      imageSearchIndices: ["egyptian fish sayadeya", "seafood sayadeya rice"],
      ingredients: [baseIngredient],
      missingIngredients: ["rice", "onion", "tomato", "cumin"],
      name: "Sayadeya",
      protein: "33g",
      sodium: "640mg",
      sugar: "5g",
      visualKeywords: ["egyptian seafood rice", "sayadeya"]
    },
    {
      calories: targetCalories + 10,
      carbs: "38g",
      cuisine: "Mediterranean",
      difficulty: "Easy",
      dishName: "salmon souvlaki",
      excludeKeywords: ["generic salmon plate"],
      fat: "16g",
      fiber: "5g",
      imageSearchIndices: ["salmon souvlaki", "mediterranean salmon souvlaki"],
      ingredients: [baseIngredient],
      missingIngredients: ["lemon", "oregano", "cucumber", "tomato"],
      name: "Salmon Souvlaki",
      protein: "34g",
      sodium: "590mg",
      sugar: "5g",
      visualKeywords: ["salmon skewers", "greek souvlaki"]
    },
    {
      calories: targetCalories + 30,
      carbs: "40g",
      cuisine: "Indian",
      difficulty: "Medium",
      dishName: "fish curry",
      excludeKeywords: ["generic curry bowl"],
      fat: "15g",
      fiber: "6g",
      imageSearchIndices: ["indian fish curry", "tomato fish curry"],
      ingredients: [baseIngredient],
      missingIngredients: ["tomato", "ginger", "turmeric", "cumin"],
      name: "Indian Fish Curry",
      protein: "33g",
      sodium: "620mg",
      sugar: "6g",
      visualKeywords: ["fish curry", "spiced tomato sauce"]
    },
    {
      calories: targetCalories + 20,
      carbs: "42g",
      cuisine: "Italian",
      difficulty: "Medium",
      dishName: "seafood risotto",
      excludeKeywords: ["generic rice"],
      fat: "12g",
      fiber: "4g",
      imageSearchIndices: ["seafood risotto", "italian seafood risotto"],
      ingredients: [baseIngredient],
      missingIngredients: ["arborio rice", "tomato", "parsley", "olive oil"],
      name: "Seafood Risotto",
      protein: "31g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["italian seafood risotto", "creamy rice"]
    },
    {
      calories: targetCalories + 10,
      carbs: "36g",
      cuisine: "Middle Eastern",
      difficulty: "Medium",
      dishName: "samke harra",
      excludeKeywords: ["generic fish"],
      fat: "14g",
      fiber: "5g",
      imageSearchIndices: ["samke harra", "lebanese spicy fish"],
      ingredients: [baseIngredient],
      missingIngredients: ["tahini", "chili", "lemon", "cilantro"],
      name: "Samke Harra",
      protein: "33g",
      sodium: "610mg",
      sugar: "5g",
      visualKeywords: ["lebanese spicy fish", "tahini chili sauce"]
    },
    {
      calories: targetCalories + 10,
      carbs: "40g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "hamsili pilav",
      excludeKeywords: ["generic rice"],
      fat: "13g",
      fiber: "5g",
      imageSearchIndices: ["hamsili pilav", "turkish anchovy rice"],
      ingredients: [baseIngredient],
      missingIngredients: ["rice", "parsley", "onion", "lemon"],
      name: "Hamsili Pilav",
      protein: "30g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["turkish fish rice", "hamsili pilav"]
    }
  ];

  return templates.map((input) => makeSparseFillerRecipe(input, context));
}

function buildAnyCuisineEggSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[] },
  targetCalories: number
) {
  const eggIngredient = isEggSparseIngredientSource(primaryIngredient) ? primaryIngredient : "eggs";
  const templates: SparseFillerRecipeInput[] = [
    {
      calories: targetCalories,
      carbs: "14g",
      cuisine: "Mexican",
      difficulty: "Easy",
      dishName: "huevos a la mexicana",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "meat-only", "eggplant"],
      fat: "17g",
      fiber: "4g",
      imageSearchIndices: ["huevos a la mexicana", "mexican style eggs", "eggs tomato chili onion"],
      ingredients: [eggIngredient],
      missingIngredients: ["tomato", "onion", "chili", "cilantro", "corn tortillas"],
      name: "Huevos A La Mexicana",
      protein: "18g",
      sodium: "560mg",
      sugar: "5g",
      visualKeywords: ["eggs", "tomato chili", "mexican breakfast"]
    },
    {
      calories: targetCalories + 10,
      carbs: "18g",
      cuisine: "Turkish",
      difficulty: "Easy",
      dishName: "cilbir",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "eggplant"],
      fat: "18g",
      fiber: "3g",
      imageSearchIndices: ["cilbir", "turkish poached eggs yogurt", "eggs with garlic yogurt"],
      ingredients: [eggIngredient],
      missingIngredients: ["yogurt", "garlic", "paprika butter", "dill", "lemon"],
      name: "Cilbir",
      protein: "19g",
      sodium: "590mg",
      sugar: "5g",
      visualKeywords: ["poached eggs", "garlic yogurt", "turkish eggs"]
    },
    {
      calories: targetCalories + 20,
      carbs: "20g",
      cuisine: "Middle Eastern",
      difficulty: "Easy",
      dishName: "shakshuka",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "eggplant"],
      fat: "16g",
      fiber: "5g",
      imageSearchIndices: ["shakshuka", "eggs in tomato pepper sauce", "middle eastern shakshuka eggs"],
      ingredients: [eggIngredient],
      missingIngredients: ["tomato", "pepper", "onion", "cumin", "parsley"],
      name: "Shakshuka",
      protein: "18g",
      sodium: "620mg",
      sugar: "7g",
      visualKeywords: ["eggs", "tomato pepper sauce", "skillet"]
    },
    {
      calories: targetCalories,
      carbs: "12g",
      cuisine: "Indian",
      difficulty: "Medium",
      dishName: "egg bhurji",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "eggplant curry"],
      fat: "17g",
      fiber: "4g",
      imageSearchIndices: ["egg bhurji", "indian scrambled eggs", "masala scrambled eggs"],
      ingredients: [eggIngredient],
      missingIngredients: ["onion", "tomato", "ginger", "turmeric", "cilantro"],
      name: "Egg Bhurji",
      protein: "19g",
      sodium: "570mg",
      sugar: "5g",
      visualKeywords: ["scrambled eggs", "masala", "tomato onion"]
    },
    {
      calories: targetCalories + 10,
      carbs: "16g",
      cuisine: "Italian",
      difficulty: "Easy",
      dishName: "frittata",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "eggplant pasta"],
      fat: "18g",
      fiber: "4g",
      imageSearchIndices: ["vegetable frittata", "italian frittata eggs", "frittata with vegetables"],
      ingredients: [eggIngredient],
      missingIngredients: ["spinach", "tomato", "onion", "basil", "parmesan"],
      name: "Vegetable Frittata",
      protein: "20g",
      sodium: "590mg",
      sugar: "5g",
      visualKeywords: ["eggs", "frittata", "vegetables"]
    },
    {
      calories: targetCalories,
      carbs: "14g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "eggah",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "eggplant"],
      fat: "16g",
      fiber: "4g",
      imageSearchIndices: ["eggah", "egyptian eggah", "egyptian egg omelet herbs"],
      ingredients: [eggIngredient],
      missingIngredients: ["parsley", "onion", "tomato", "cumin", "dill"],
      name: "Egyptian Eggah",
      protein: "18g",
      sodium: "570mg",
      sugar: "4g",
      visualKeywords: ["eggs", "herb omelet", "egyptian eggah"]
    },
    {
      calories: targetCalories + 15,
      carbs: "18g",
      cuisine: "Japanese",
      difficulty: "Medium",
      dishName: "tamagoyaki",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "eggplant"],
      fat: "15g",
      fiber: "3g",
      imageSearchIndices: ["tamagoyaki", "japanese rolled omelette", "rolled eggs"],
      ingredients: [eggIngredient],
      missingIngredients: ["soy sauce", "mirin", "scallion", "cucumber", "sesame"],
      name: "Tamagoyaki",
      protein: "18g",
      sodium: "600mg",
      sugar: "6g",
      visualKeywords: ["rolled omelette", "eggs", "japanese tamagoyaki"]
    },
    {
      calories: targetCalories + 10,
      carbs: "16g",
      cuisine: "Mediterranean",
      difficulty: "Easy",
      dishName: "eggs with spinach and feta",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "eggplant"],
      fat: "18g",
      fiber: "4g",
      imageSearchIndices: ["eggs spinach feta", "mediterranean baked eggs spinach", "spinach feta eggs"],
      ingredients: [eggIngredient],
      missingIngredients: ["spinach", "feta", "tomato", "olive oil", "oregano"],
      name: "Spinach Feta Eggs",
      protein: "20g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["eggs", "spinach feta", "mediterranean skillet"]
    }
  ];

  return templates.map((input) => makeSparseFillerRecipe(input, context));
}

function buildAnyCuisineLegumeSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[] },
  targetCalories: number
) {
  const legumeIngredient = isFavaSparseIngredientSource(primaryIngredient) ? "ful" : primaryIngredient || "beans";
  const templates: SparseFillerRecipeInput[] = [
    {
      calories: targetCalories,
      carbs: "36g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "ful medames",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "mushroom pasta", "generic stew"],
      fat: "12g",
      fiber: "10g",
      imageSearchIndices: ["ful medames", "egyptian ful", "fava beans olive oil cumin"],
      ingredients: [legumeIngredient],
      missingIngredients: ["lemon", "cumin", "olive oil", "tomato", "parsley"],
      name: "Ful Medames",
      protein: "18g",
      sodium: "580mg",
      sugar: "4g",
      visualKeywords: ["fava beans", "ful medames", "olive oil cumin"]
    },
    {
      calories: targetCalories + 20,
      carbs: "38g",
      cuisine: "Middle Eastern",
      difficulty: "Easy",
      dishName: "ful bil zeit",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "mushrooms"],
      fat: "14g",
      fiber: "10g",
      imageSearchIndices: ["ful bil zeit", "lebanese ful with olive oil", "fava beans lemon olive oil"],
      ingredients: [legumeIngredient],
      missingIngredients: ["olive oil", "lemon", "garlic", "parsley", "tomato"],
      name: "Ful Bil Zeit",
      protein: "17g",
      sodium: "560mg",
      sugar: "4g",
      visualKeywords: ["fava beans", "olive oil", "lemon parsley"]
    },
    {
      calories: targetCalories + 15,
      carbs: "34g",
      cuisine: "Indian",
      difficulty: "Medium",
      dishName: "rajma-style bean masala",
      excludeKeywords: ["fish curry", "seafood", "shrimp", "mushroom rice"],
      fat: "13g",
      fiber: "10g",
      imageSearchIndices: ["bean masala", "rajma masala", "indian bean curry"],
      ingredients: [legumeIngredient],
      missingIngredients: ["tomato", "ginger", "garam masala", "cumin", "cilantro"],
      name: "Bean Masala",
      protein: "19g",
      sodium: "620mg",
      sugar: "6g",
      visualKeywords: ["bean curry", "tomato masala", "indian beans"]
    },
    {
      calories: targetCalories + 10,
      carbs: "40g",
      cuisine: "Mexican",
      difficulty: "Easy",
      dishName: "black bean tacos",
      excludeKeywords: ["fish taco", "shrimp taco", "seafood"],
      fat: "13g",
      fiber: "11g",
      imageSearchIndices: ["black bean tacos", "mexican bean tacos", "bean tacos avocado"],
      ingredients: [legumeIngredient],
      missingIngredients: ["corn tortillas", "tomato", "avocado", "cilantro", "lime"],
      name: "Bean Tacos",
      protein: "18g",
      sodium: "590mg",
      sugar: "5g",
      visualKeywords: ["beans", "corn tortillas", "avocado tomato"]
    },
    {
      calories: targetCalories + 20,
      carbs: "42g",
      cuisine: "Italian",
      difficulty: "Medium",
      dishName: "pasta e fagioli",
      excludeKeywords: ["seafood pasta", "fish", "mushroom risotto"],
      fat: "12g",
      fiber: "10g",
      imageSearchIndices: ["pasta e fagioli", "italian bean soup", "bean pasta soup"],
      ingredients: [legumeIngredient],
      missingIngredients: ["gluten-free pasta", "tomato", "rosemary", "carrot", "olive oil"],
      name: "Pasta e Fagioli",
      protein: "18g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["bean pasta soup", "tomato broth", "italian beans"]
    },
    {
      calories: targetCalories + 10,
      carbs: "36g",
      cuisine: "Mediterranean",
      difficulty: "Easy",
      dishName: "warm fava bean salad",
      excludeKeywords: ["fish", "seafood", "mushrooms", "rice pilaf"],
      fat: "13g",
      fiber: "11g",
      imageSearchIndices: ["warm fava bean salad", "mediterranean fava beans", "fava beans tomato parsley"],
      ingredients: [legumeIngredient],
      missingIngredients: ["tomato", "parsley", "lemon", "olive oil", "cucumber"],
      name: "Warm Fava Bean Salad",
      protein: "17g",
      sodium: "560mg",
      sugar: "5g",
      visualKeywords: ["fava beans", "tomato parsley", "mediterranean bean salad"]
    },
    {
      calories: targetCalories + 15,
      carbs: "38g",
      cuisine: "Turkish",
      difficulty: "Medium",
      dishName: "zeytinyagli bakla",
      excludeKeywords: ["fish", "seafood", "rice pilaf", "mushrooms"],
      fat: "14g",
      fiber: "10g",
      imageSearchIndices: ["zeytinyagli bakla", "turkish fava beans olive oil", "bakla olive oil"],
      ingredients: [legumeIngredient],
      missingIngredients: ["dill", "olive oil", "lemon", "onion", "yogurt"],
      name: "Zeytinyagli Bakla",
      protein: "17g",
      sodium: "560mg",
      sugar: "5g",
      visualKeywords: ["turkish fava beans", "olive oil dill", "bakla"]
    },
    {
      calories: targetCalories,
      carbs: "34g",
      cuisine: "Moroccan",
      difficulty: "Medium",
      dishName: "bessara",
      excludeKeywords: ["fish", "seafood", "mushrooms", "rice bowl"],
      fat: "11g",
      fiber: "11g",
      imageSearchIndices: ["bessara", "moroccan fava bean soup", "split fava bean soup"],
      ingredients: [legumeIngredient],
      missingIngredients: ["garlic", "cumin", "olive oil", "paprika", "lemon"],
      name: "Bessara",
      protein: "18g",
      sodium: "590mg",
      sugar: "4g",
      visualKeywords: ["fava bean soup", "cumin olive oil", "moroccan bessara"]
    }
  ];

  return templates.map((input) => makeSparseFillerRecipe(input, context));
}

function buildAnyCuisineVegetableSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[] },
  targetCalories: number,
  hasGrain: boolean
) {
  const baseIngredient = primaryIngredient || (hasGrain ? "rice" : "vegetables");
  const templates: SparseFillerRecipeInput[] = [
    {
      calories: targetCalories + 10,
      carbs: hasGrain ? "44g" : "30g",
      cuisine: "Mexican",
      difficulty: "Easy",
      dishName: "calabacitas",
      excludeKeywords: ["fish", "shrimp", "seafood"],
      fat: "12g",
      fiber: "6g",
      imageSearchIndices: ["calabacitas", "mexican zucchini corn tomato", "mexican vegetable skillet"],
      ingredients: [baseIngredient],
      missingIngredients: ["zucchini", "corn", "tomato", "pepper", "cilantro"],
      name: "Calabacitas",
      protein: "14g",
      sodium: "560mg",
      sugar: "6g",
      visualKeywords: ["zucchini corn", "tomato pepper", "mexican vegetables"]
    },
    {
      calories: targetCalories,
      carbs: hasGrain ? "42g" : "28g",
      cuisine: "Thai",
      difficulty: "Easy",
      dishName: "pad pak ruam",
      excludeKeywords: ["fish", "shrimp", "seafood"],
      fat: "11g",
      fiber: "6g",
      imageSearchIndices: ["pad pak ruam", "thai mixed vegetable stir fry", "thai vegetables basil"],
      ingredients: [baseIngredient],
      missingIngredients: ["mixed vegetables", "garlic", "thai basil", "lime", "chili"],
      name: "Pad Pak Ruam",
      protein: "14g",
      sodium: "590mg",
      sugar: "6g",
      visualKeywords: ["thai vegetables", "stir fry", "basil garlic"]
    },
    {
      calories: targetCalories + 20,
      carbs: hasGrain ? "46g" : "32g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "vegetable tagine",
      excludeKeywords: ["fish", "shrimp", "seafood"],
      fat: "12g",
      fiber: "7g",
      imageSearchIndices: ["egyptian vegetable tagine", "middle eastern vegetable stew", "vegetable tomato tagine"],
      ingredients: [baseIngredient],
      missingIngredients: ["tomato", "zucchini", "potato", "onion", "cumin"],
      name: "Vegetable Tagine",
      protein: "14g",
      sodium: "610mg",
      sugar: "7g",
      visualKeywords: ["vegetable stew", "tomato cumin", "tagine"]
    },
    {
      calories: targetCalories + 15,
      carbs: hasGrain ? "44g" : "34g",
      cuisine: "Indian",
      difficulty: "Medium",
      dishName: "vegetable jalfrezi",
      excludeKeywords: ["fish", "shrimp", "seafood"],
      fat: "13g",
      fiber: "7g",
      imageSearchIndices: ["vegetable jalfrezi", "indian vegetable curry", "jalfrezi vegetables"],
      ingredients: [baseIngredient],
      missingIngredients: ["tomato", "pepper", "cauliflower", "ginger", "cumin"],
      name: "Vegetable Jalfrezi",
      protein: "15g",
      sodium: "620mg",
      sugar: "7g",
      visualKeywords: ["vegetable curry", "tomato pepper", "indian jalfrezi"]
    },
    {
      calories: targetCalories + 10,
      carbs: hasGrain ? "42g" : "30g",
      cuisine: "Italian",
      difficulty: "Easy",
      dishName: "ciambotta",
      excludeKeywords: ["fish", "shrimp", "seafood"],
      fat: "12g",
      fiber: "7g",
      imageSearchIndices: ["ciambotta", "italian vegetable stew", "southern italian vegetables"],
      ingredients: [baseIngredient],
      missingIngredients: ["eggplant", "zucchini", "tomato", "pepper", "olive oil"],
      name: "Ciambotta",
      protein: "14g",
      sodium: "580mg",
      sugar: "7g",
      visualKeywords: ["italian vegetable stew", "tomato eggplant", "ciambotta"]
    }
  ];

  return templates.map((input) => makeSparseFillerRecipe(input, context));
}

function isLegumeSparseIngredientSource(value: string) {
  return /(?:\b(?:ful|foul|fuul|fava|bean|beans|lentil|lentils|chickpea|chickpeas|tofu)\b|\u0641\u0648\u0644|\u0641\u0627\u0635\u0648\u0644\u064a\u0627|\u0644\u0648\u0628\u064a\u0627|\u062d\u0645\u0635|\u0639\u062f\u0633)/iu.test(value);
}

function isFavaSparseIngredientSource(value: string) {
  return /(?:\b(?:ful|foul|fuul|fava)\b|\u0641\u0648\u0644)/iu.test(value);
}

function isChickenSparseIngredientSource(value: string) {
  return /(?:\b(?:chicken|hen|poultry|farakh|farkh|pollo|tavuk|gai|murgh)\b|\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e|\u0641\u0631\u062e(?:\u0629)?)/iu.test(value);
}

function isEggSparseIngredientSource(value: string) {
  return /(?:\beggs?\b|\u0628\u064a\u0636)/iu.test(value);
}

function buildAnyCuisineShrimpSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[] },
  targetCalories: number
) {
  const shrimpIngredient = isShrimpIngredientText(primaryIngredient) ? primaryIngredient : "shrimp";
  const templates: SparseFillerRecipeInput[] = [
    {
      calories: targetCalories,
      carbs: "34g",
      cuisine: "Thai",
      difficulty: "Medium",
      dishName: "tom yum goong",
      excludeKeywords: ["fish", "salmon", "anchovy", "hamsi", "generic seafood soup"],
      fat: "10g",
      fiber: "4g",
      imageSearchIndices: ["tom yum goong", "thai tom yum shrimp soup", "spicy thai shrimp soup"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["lemongrass", "lime", "chili", "mushrooms"],
      name: "Tom Yum Goong",
      protein: "32g",
      sodium: "600mg",
      sugar: "5g",
      visualKeywords: ["shrimp", "tom yum", "clear spicy shrimp soup"]
    },
    {
      calories: targetCalories + 30,
      carbs: "52g",
      cuisine: "Thai",
      difficulty: "Medium",
      dishName: "pad thai goong",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic noodles"],
      fat: "15g",
      fiber: "5g",
      imageSearchIndices: ["pad thai goong", "shrimp pad thai", "thai shrimp noodles"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["rice noodles", "tamarind", "bean sprouts", "lime"],
      name: "Pad Thai Goong",
      protein: "33g",
      sodium: "620mg",
      sugar: "7g",
      visualKeywords: ["shrimp", "rice noodles", "pad thai"]
    },
    {
      calories: targetCalories + 10,
      carbs: "38g",
      cuisine: "Thai",
      difficulty: "Medium",
      dishName: "goong ob woon sen",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic rice bowl"],
      fat: "12g",
      fiber: "4g",
      imageSearchIndices: ["goong ob woon sen", "thai shrimp glass noodles", "shrimp glass noodle clay pot"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["glass noodles", "ginger", "celery", "garlic"],
      name: "Goong Ob Woon Sen",
      protein: "34g",
      sodium: "610mg",
      sugar: "5g",
      visualKeywords: ["shrimp", "glass noodles", "clay pot noodles"]
    },
    {
      calories: targetCalories + 20,
      carbs: "42g",
      cuisine: "Italian",
      difficulty: "Medium",
      dishName: "risotto ai gamberi",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic seafood risotto"],
      fat: "13g",
      fiber: "4g",
      imageSearchIndices: ["risotto ai gamberi", "italian shrimp risotto", "shrimp risotto"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["arborio rice", "tomato", "parsley", "olive oil"],
      name: "Risotto Ai Gamberi",
      protein: "31g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["shrimp", "italian shrimp risotto", "creamy rice"]
    },
    {
      calories: targetCalories + 15,
      carbs: "24g",
      cuisine: "Mexican",
      difficulty: "Medium",
      dishName: "camarones a la diabla",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic spicy plate"],
      fat: "14g",
      fiber: "5g",
      imageSearchIndices: ["camarones a la diabla", "mexican spicy shrimp", "shrimp diabla"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["tomato", "chili", "garlic", "lime"],
      name: "Camarones A La Diabla",
      protein: "35g",
      sodium: "620mg",
      sugar: "6g",
      visualKeywords: ["shrimp", "red chili sauce", "mexican shrimp"]
    },
    {
      calories: targetCalories + 10,
      carbs: "32g",
      cuisine: "Indian",
      difficulty: "Medium",
      dishName: "prawn masala",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic curry bowl"],
      fat: "15g",
      fiber: "6g",
      imageSearchIndices: ["prawn masala", "indian shrimp curry", "shrimp masala"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["tomato", "ginger", "turmeric", "cumin"],
      name: "Prawn Masala",
      protein: "33g",
      sodium: "620mg",
      sugar: "6g",
      visualKeywords: ["shrimp", "prawn masala", "spiced tomato sauce"]
    },
    {
      calories: targetCalories,
      carbs: "28g",
      cuisine: "Mediterranean",
      difficulty: "Easy",
      dishName: "shrimp souvlaki",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic skewer"],
      fat: "14g",
      fiber: "5g",
      imageSearchIndices: ["shrimp souvlaki", "mediterranean shrimp skewers", "greek shrimp souvlaki"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["lemon", "oregano", "cucumber", "tomato"],
      name: "Shrimp Souvlaki",
      protein: "34g",
      sodium: "590mg",
      sugar: "5g",
      visualKeywords: ["shrimp", "grilled shrimp skewers", "lemon oregano"]
    },
    {
      calories: targetCalories + 30,
      carbs: "44g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "egyptian shrimp rice",
      excludeKeywords: ["fish sayadeya", "whole fish", "salmon", "anchovy", "hamsi", "seafood rice"],
      fat: "13g",
      fiber: "5g",
      imageSearchIndices: ["egyptian shrimp rice", "gambari rice", "egyptian tomato shrimp rice"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["rice", "onion", "tomato", "cumin"],
      name: "Egyptian Shrimp Rice",
      protein: "33g",
      sodium: "640mg",
      sugar: "5g",
      visualKeywords: ["shrimp", "egyptian shrimp rice", "tomato onion rice"]
    },
    {
      calories: targetCalories + 20,
      carbs: "40g",
      cuisine: "Middle Eastern",
      difficulty: "Medium",
      dishName: "shrimp kabsa",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic rice"],
      fat: "14g",
      fiber: "5g",
      imageSearchIndices: ["shrimp kabsa", "middle eastern shrimp rice", "gulf shrimp kabsa"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["rice", "tomato", "cardamom", "cumin"],
      name: "Shrimp Kabsa",
      protein: "34g",
      sodium: "630mg",
      sugar: "5g",
      visualKeywords: ["shrimp", "spiced rice", "kabsa"]
    },
    {
      calories: targetCalories + 5,
      carbs: "20g",
      cuisine: "American",
      difficulty: "Easy",
      dishName: "garlic lemon shrimp skillet",
      excludeKeywords: ["fish", "salmon", "anchovy", "generic seafood skillet"],
      fat: "13g",
      fiber: "4g",
      imageSearchIndices: ["garlic lemon shrimp skillet", "healthy shrimp skillet", "shrimp with lemon garlic"],
      ingredients: [shrimpIngredient],
      missingIngredients: ["garlic", "lemon", "parsley", "olive oil"],
      name: "Garlic Lemon Shrimp Skillet",
      protein: "34g",
      sodium: "560mg",
      sugar: "4g",
      visualKeywords: ["shrimp", "lemon garlic", "skillet"]
    }
  ];

  return templates.map((input) => makeSparseFillerRecipe(input, context));
}

function isShrimpIngredientText(value: string) {
  return /(?:\bshrimp\b|\bprawn\b|\bgoong\b|\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646|\u0642\u0631\u064a\u062f\u0633)/iu.test(value);
}

function buildAnyCuisineChickenSparseFillers(
  primaryIngredient: string,
  context: { allergens: string[]; availableIngredients: Set<string>; conditions: string[]; diets: string[] },
  targetCalories: number
) {
  const chickenIngredient = primaryIngredient || "chicken";
  const templates: SparseFillerRecipeInput[] = [
    {
      calories: targetCalories + 20,
      carbs: "32g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "chicken fattah",
      excludeKeywords: ["beef fattah", "lamb fattah", "kofta", "ground meat"],
      fat: "15g",
      fiber: "4g",
      imageSearchIndices: ["egyptian chicken fattah", "chicken fattah rice bread", "fatta chicken egyptian"],
      ingredients: [chickenIngredient],
      missingIngredients: ["rice", "baladi bread", "garlic", "vinegar", "tomato sauce"],
      name: "Egyptian Chicken Fattah",
      protein: "34g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["chicken over rice", "toasted bread", "garlic tomato sauce"]
    },
    {
      calories: targetCalories,
      carbs: "26g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "farakh meshwi",
      excludeKeywords: ["kofta", "ground meat", "beef kebab"],
      fat: "14g",
      fiber: "4g",
      imageSearchIndices: ["farakh meshwi", "egyptian grilled chicken", "grilled chicken baladi bread"],
      ingredients: [chickenIngredient],
      missingIngredients: ["lemon", "cumin", "garlic", "baladi bread", "salad"],
      name: "Farakh Meshwi",
      protein: "36g",
      sodium: "580mg",
      sugar: "4g",
      visualKeywords: ["charred grilled chicken", "baladi bread", "lemon cumin"]
    },
    {
      calories: targetCalories + 10,
      carbs: "24g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "chicken molokhia",
      excludeKeywords: ["beef molokhia", "rabbit molokhia", "ground meat"],
      fat: "13g",
      fiber: "5g",
      imageSearchIndices: ["chicken molokhia egyptian", "molokhia with chicken", "egyptian molokhia chicken"],
      ingredients: [chickenIngredient],
      missingIngredients: ["molokhia", "garlic", "coriander", "rice"],
      name: "Chicken Molokhia",
      protein: "34g",
      sodium: "600mg",
      sugar: "4g",
      visualKeywords: ["green molokhia soup", "chicken pieces", "rice"]
    },
    {
      calories: targetCalories + 15,
      carbs: "34g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "chicken hawawshi",
      excludeKeywords: ["beef hawawshi", "ground meat hawawshi", "kofta", "liver"],
      fat: "15g",
      fiber: "5g",
      imageSearchIndices: ["egyptian chicken hawawshi", "chicken hawawshi baladi bread", "hawawshi chicken"],
      ingredients: [chickenIngredient, "bread", "onion", "tomato"],
      missingIngredients: ["green pepper", "parsley", "cumin"],
      name: "Egyptian Chicken Hawawshi",
      protein: "35g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["stuffed baladi bread", "chicken filling", "onion tomato"]
    },
    {
      calories: targetCalories + 20,
      carbs: "30g",
      cuisine: "Egyptian",
      difficulty: "Medium",
      dishName: "chicken tomato tray",
      excludeKeywords: ["beef tray", "kofta tray", "liver tray", "ground meat"],
      fat: "14g",
      fiber: "5g",
      imageSearchIndices: ["egyptian chicken tomato tray", "chicken tomato onion tray", "egyptian baked chicken tray"],
      ingredients: [chickenIngredient, "onion", "tomato"],
      missingIngredients: ["potato", "green pepper", "garlic", "cumin"],
      name: "Egyptian Chicken Tomato Tray",
      protein: "35g",
      sodium: "600mg",
      sugar: "6g",
      visualKeywords: ["baked chicken", "tomato onion sauce", "egyptian tray"]
    },
    {
      calories: targetCalories + 10,
      carbs: "32g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "baladi chicken shawarma",
      excludeKeywords: ["beef shawarma", "liver shawarma", "kofta", "ground meat"],
      fat: "14g",
      fiber: "4g",
      imageSearchIndices: ["egyptian chicken shawarma baladi bread", "baladi chicken shawarma", "chicken shawarma tomato onion"],
      ingredients: [chickenIngredient, "bread", "onion", "tomato"],
      missingIngredients: ["lemon", "tahini", "cumin"],
      name: "Baladi Chicken Shawarma",
      protein: "35g",
      sodium: "610mg",
      sugar: "5g",
      visualKeywords: ["sliced chicken", "baladi bread", "tomato onion"]
    },
    {
      calories: targetCalories,
      carbs: "28g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "chicken tomato stew",
      excludeKeywords: ["beef stew", "liver stew", "kofta", "ground meat"],
      fat: "12g",
      fiber: "5g",
      imageSearchIndices: ["egyptian chicken tomato stew", "chicken onion tomato stew", "egyptian chicken stew"],
      ingredients: [chickenIngredient, "onion", "tomato"],
      missingIngredients: ["garlic", "coriander", "carrot"],
      name: "Egyptian Chicken Tomato Stew",
      protein: "34g",
      sodium: "580mg",
      sugar: "6g",
      visualKeywords: ["chicken pieces", "tomato stew", "onion"]
    },
    {
      calories: targetCalories + 5,
      carbs: "30g",
      cuisine: "Egyptian",
      difficulty: "Easy",
      dishName: "grilled chicken baladi plate",
      excludeKeywords: ["beef kebab", "kofta", "liver", "ground meat"],
      fat: "13g",
      fiber: "4g",
      imageSearchIndices: ["grilled chicken baladi plate", "egyptian grilled chicken bread tomato", "farakh meshwi baladi plate"],
      ingredients: [chickenIngredient, "bread", "tomato", "onion"],
      missingIngredients: ["lemon", "cumin", "parsley"],
      name: "Grilled Chicken Baladi Plate",
      protein: "36g",
      sodium: "590mg",
      sugar: "4g",
      visualKeywords: ["grilled chicken", "baladi bread", "tomato onion salad"]
    },
    {
      calories: targetCalories,
      carbs: "28g",
      cuisine: "Middle Eastern",
      difficulty: "Easy",
      dishName: "chicken shawarma",
      excludeKeywords: ["beef shawarma", "kofta", "ground meat"],
      fat: "14g",
      fiber: "4g",
      imageSearchIndices: ["chicken shawarma plate", "middle eastern chicken shawarma", "chicken shawarma wrap"],
      ingredients: [chickenIngredient],
      missingIngredients: ["shawarma spices", "garlic sauce", "flatbread", "cucumber"],
      name: "Chicken Shawarma Plate",
      protein: "35g",
      sodium: "610mg",
      sugar: "4g",
      visualKeywords: ["sliced chicken shawarma", "flatbread", "garlic sauce"]
    },
    {
      calories: targetCalories + 20,
      carbs: "34g",
      cuisine: "Mexican",
      difficulty: "Medium",
      dishName: "tinga de pollo",
      excludeKeywords: ["beef tinga", "ground beef", "generic chicken bowl"],
      fat: "13g",
      fiber: "6g",
      imageSearchIndices: ["tinga de pollo", "mexican chicken tinga", "chipotle chicken tostadas"],
      ingredients: [chickenIngredient],
      missingIngredients: ["chipotle", "tomato", "corn tortilla", "avocado"],
      name: "Tinga de Pollo",
      protein: "34g",
      sodium: "620mg",
      sugar: "6g",
      visualKeywords: ["shredded chicken", "chipotle tomato sauce", "tostada"]
    },
    {
      calories: targetCalories + 25,
      carbs: "36g",
      cuisine: "Italian",
      difficulty: "Medium",
      dishName: "chicken cacciatore",
      excludeKeywords: ["beef stew", "ground meat", "meatballs"],
      fat: "14g",
      fiber: "5g",
      imageSearchIndices: ["chicken cacciatore", "pollo alla cacciatora", "italian tomato braised chicken"],
      ingredients: [chickenIngredient],
      missingIngredients: ["tomato", "pepper", "oregano", "olive oil"],
      name: "Chicken Cacciatore",
      protein: "35g",
      sodium: "610mg",
      sugar: "6g",
      visualKeywords: ["tomato braised chicken", "peppers", "italian herbs"]
    },
    {
      calories: targetCalories + 30,
      carbs: "36g",
      cuisine: "Indian",
      difficulty: "Medium",
      dishName: "tandoori chicken",
      excludeKeywords: ["beef curry", "lamb curry", "ground meat"],
      fat: "15g",
      fiber: "4g",
      imageSearchIndices: ["tandoori chicken", "indian grilled chicken", "tandoori chicken plate"],
      ingredients: [chickenIngredient],
      missingIngredients: ["yogurt", "turmeric", "garam masala", "lemon"],
      name: "Tandoori Chicken",
      protein: "36g",
      sodium: "620mg",
      sugar: "5g",
      visualKeywords: ["red grilled chicken", "tandoori spices", "lemon"]
    },
    {
      calories: targetCalories + 15,
      carbs: "32g",
      cuisine: "Thai",
      difficulty: "Medium",
      dishName: "gai pad krapow",
      excludeKeywords: ["pork basil", "beef basil", "ground meat"],
      fat: "13g",
      fiber: "4g",
      imageSearchIndices: ["gai pad krapow", "thai basil chicken", "pad kra pao chicken"],
      ingredients: [chickenIngredient],
      missingIngredients: ["thai basil", "chili", "garlic", "rice"],
      name: "Gai Pad Krapow",
      protein: "34g",
      sodium: "650mg",
      sugar: "5g",
      visualKeywords: ["thai basil chicken", "chili garlic", "rice"]
    }
  ];

  return templates.map((input) => makeSparseFillerRecipe(input, context));
}

function buildAuthenticCuisineSparseFillers(
  primaryIngredient: string,
  context: {
    allergens: string[];
    availableIngredients: Set<string>;
    conditions: string[];
    diets: string[];
    ingredients: string[];
    preferredCuisine: string;
    scoringIngredients: string[];
  },
  targetCalories: number
) {
  const candidateIngredients = Array.from(new Set([
    ...context.ingredients,
    ...context.scoringIngredients,
    ...Array.from(context.availableIngredients)
  ])).filter(Boolean);
  const candidates = resolveAuthenticCuisineDishes({
    cuisine: context.preferredCuisine,
    ingredients: candidateIngredients
  }, 16);

  const catalogFillers = candidates
    .filter((candidate) => candidate.matchedRequired.length || candidate.matchedOptional.length || candidate.strongRule)
    .filter((candidate) => isSpecificCuisineFillerName(candidate.dishName, context.preferredCuisine))
    .slice(0, 12)
    .map((candidate) => {
      const dishIngredients = [...candidate.dish.primaryIngredients, ...candidate.dish.optionalIngredients];
      const ownedIngredients = dishIngredients.filter((ingredient) => isIngredientAvailable(ingredient, context.availableIngredients));
      const missingIngredients = dishIngredients.filter((ingredient) => !isIngredientAvailable(ingredient, context.availableIngredients));
      const cuisine = getCuisineLabelFromCandidate(candidate.cuisine);
      const hasSeafood = dishIngredients.some((ingredient) => /\b(fish|shrimp|seafood|salmon|tilapia|prawn)\b/i.test(ingredient));
      const hasLegumes = dishIngredients.some((ingredient) => /\b(lentil|chickpea|bean|tofu)\b/i.test(ingredient));
      const hasMeat = dishIngredients.some((ingredient) => /\b(beef|meat|lamb|chicken|turkey)\b/i.test(ingredient));

      return makeSparseFillerRecipe({
        calories: targetCalories + (hasMeat ? 35 : hasSeafood ? 10 : 0),
        carbs: hasLegumes ? "34g" : "30g",
        cuisine,
        difficulty: candidate.dish.iconicScore >= 75 ? "Medium" : "Easy",
        dishName: candidate.dishName,
        excludeKeywords: ["generic bowl", "random cuisine", "fusion", "wrong dish"],
        fat: hasMeat ? "18g" : hasSeafood ? "12g" : "13g",
        fiber: hasLegumes ? "8g" : "5g",
        imageSearchIndices: Array.from(new Set([
          candidate.dishName,
          ...candidate.aliases,
          `${cuisine} ${candidate.dishName}`,
          `traditional ${candidate.dishName}`
        ])).slice(0, 5),
        ingredients: ownedIngredients.length ? ownedIngredients : [primaryIngredient],
        missingIngredients: missingIngredients.slice(0, 6),
        name: candidate.dishName,
        protein: hasMeat || hasSeafood ? "32g" : hasLegumes ? "18g" : "14g",
        sodium: "620mg",
        sugar: "5g",
        visualKeywords: [
          candidate.dishName,
          `${cuisine} ${candidate.dishName}`,
          ...candidate.dish.names.english
        ].slice(0, 6)
      }, context);
    });

  const seen = new Set(catalogFillers.map((recipe) => normalizeCuisineIdentityText(recipe.dish_intent?.dish_name ?? recipe.name)));
  const curatedFillers = buildCuratedCuisineSparseFillerInputs(context.preferredCuisine, primaryIngredient, targetCalories)
    .filter((input) => {
      const key = normalizeCuisineIdentityText(input.dishName);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((input) => makeSparseFillerRecipe(input, context));

  return [...catalogFillers, ...curatedFillers];
}

function isSpecificCuisineFillerName(dishName: string, preferredCuisine: string) {
  const normalized = normalizeCuisineIdentityText(dishName);
  return (
    Boolean(normalized) &&
    !hasConflictingCuisineDisplaySignal(normalized, preferredCuisine) &&
    hasCuisineSpecificIdentitySignal(normalized, preferredCuisine) &&
    !isGenericSpecificCuisineDisplayName(normalized)
  );
}

function buildCuratedCuisineSparseFillerInputs(
  preferredCuisine: string,
  primaryIngredient: string,
  targetCalories: number
): SparseFillerRecipeInput[] {
  const protein = /\b(shrimp|fish|seafood|salmon|tilapia|cod|prawn)\b/i.test(primaryIngredient)
    ? "32g"
    : /\b(lentil|chickpea|bean|tofu)\b/i.test(primaryIngredient)
      ? "18g"
      : "24g";
  const base = {
    calories: targetCalories,
    carbs: "30g",
    difficulty: "Medium",
    fat: "13g",
    fiber: "6g",
    protein,
    sodium: "620mg",
    sugar: "5g"
  };
  const cuisine = normalizeCuisinePreference(preferredCuisine);
  const make = (input: Omit<SparseFillerRecipeInput, keyof typeof base>) => ({ ...base, ...input });

  if (cuisine === "italian") {
    return [
      make({ cuisine: "Italian", dishName: "caponata", excludeKeywords: ["generic vegetable tray"], imageSearchIndices: ["sicilian caponata", "eggplant caponata", "caponata"], ingredients: [primaryIngredient], missingIngredients: ["eggplant", "tomato", "celery", "capers", "olive oil"], name: "Caponata", visualKeywords: ["eggplant caponata", "sicilian vegetable stew"] }),
      make({ cuisine: "Italian", dishName: "ribollita", excludeKeywords: ["generic soup"], imageSearchIndices: ["ribollita", "tuscan ribollita", "white bean ribollita"], ingredients: [primaryIngredient], missingIngredients: ["white beans", "tomato", "kale", "carrot", "olive oil"], name: "Ribollita", visualKeywords: ["tuscan bean soup", "ribollita"] }),
      make({ cuisine: "Italian", dishName: "pasta e fagioli", excludeKeywords: ["generic pasta"], imageSearchIndices: ["pasta e fagioli", "italian bean pasta soup"], ingredients: [primaryIngredient], missingIngredients: ["gluten-free pasta", "white beans", "tomato", "rosemary"], name: "Pasta e Fagioli", visualKeywords: ["bean pasta soup", "italian pasta e fagioli"] }),
      make({ cuisine: "Italian", dishName: "polenta e funghi", excludeKeywords: ["rice bowl"], imageSearchIndices: ["polenta e funghi", "italian polenta mushrooms"], ingredients: [primaryIngredient], missingIngredients: ["polenta", "mushrooms", "tomato", "olive oil"], name: "Polenta e Funghi", visualKeywords: ["soft polenta", "mushrooms"] }),
      make({ cuisine: "Italian", dishName: "pasta alla norma", excludeKeywords: ["generic pasta"], imageSearchIndices: ["pasta alla norma", "sicilian eggplant pasta"], ingredients: [primaryIngredient], missingIngredients: ["gluten-free pasta", "eggplant", "tomato", "basil"], name: "Pasta alla Norma", visualKeywords: ["eggplant tomato pasta", "sicilian pasta alla norma"] }),
      make({ cuisine: "Italian", dishName: "ciambotta", excludeKeywords: ["generic stew"], imageSearchIndices: ["ciambotta", "italian vegetable stew"], ingredients: [primaryIngredient], missingIngredients: ["zucchini", "eggplant", "tomato", "pepper"], name: "Ciambotta", visualKeywords: ["italian vegetable stew", "ciambotta"] }),
      make({ cuisine: "Italian", dishName: "pappa al pomodoro", excludeKeywords: ["generic tomato soup"], imageSearchIndices: ["pappa al pomodoro", "tuscan tomato bread soup"], ingredients: [primaryIngredient], missingIngredients: ["tomato", "gluten-free bread", "basil", "olive oil"], name: "Pappa al Pomodoro", visualKeywords: ["thick tomato soup", "tuscan pappa al pomodoro"] }),
      make({ cuisine: "Italian", dishName: "farinata", excludeKeywords: ["generic pancake"], imageSearchIndices: ["farinata", "ligurian chickpea farinata"], ingredients: [primaryIngredient], missingIngredients: ["chickpea flour", "rosemary", "olive oil"], name: "Farinata", visualKeywords: ["chickpea flatbread", "ligurian farinata"] }),
      make({ cuisine: "Italian", dishName: "parmigiana di melanzane", excludeKeywords: ["generic casserole"], imageSearchIndices: ["parmigiana di melanzane", "eggplant parmigiana"], ingredients: [primaryIngredient], missingIngredients: ["eggplant", "tomato sauce", "mozzarella", "basil"], name: "Parmigiana di Melanzane", visualKeywords: ["eggplant parmigiana", "tomato basil layers"] }),
      make({ cuisine: "Italian", dishName: "fagioli all'uccelletto", excludeKeywords: ["generic beans"], imageSearchIndices: ["fagioli all'uccelletto", "tuscan white beans tomato sage"], ingredients: [primaryIngredient], missingIngredients: ["white beans", "tomato", "sage", "olive oil"], name: "Fagioli all'Uccelletto", visualKeywords: ["tuscan white beans", "tomato sage sauce"] }),
      make({ cuisine: "Italian", dishName: "melanzane a funghetto", excludeKeywords: ["generic eggplant tray"], imageSearchIndices: ["melanzane a funghetto", "neapolitan eggplant tomato"], ingredients: [primaryIngredient], missingIngredients: ["eggplant", "tomato", "garlic", "basil"], name: "Melanzane a Funghetto", visualKeywords: ["neapolitan eggplant", "tomato basil"] }),
      make({ cuisine: "Italian", dishName: "risotto al pomodoro", excludeKeywords: ["generic rice bowl"], imageSearchIndices: ["risotto al pomodoro", "italian tomato risotto"], ingredients: [primaryIngredient], missingIngredients: ["arborio rice", "tomato", "basil", "olive oil"], name: "Risotto al Pomodoro", visualKeywords: ["tomato risotto", "italian risotto"] }),
      make({ cuisine: "Italian", dishName: "peperonata", excludeKeywords: ["generic pepper tray"], imageSearchIndices: ["peperonata", "italian peppers tomato stew"], ingredients: [primaryIngredient], missingIngredients: ["bell peppers", "tomato", "onion", "olive oil"], name: "Peperonata", visualKeywords: ["italian pepper stew", "tomato peppers"] })
    ];
  }

  if (cuisine === "thai") {
    return [
      make({ cuisine: "Thai", dishName: "tom yum goong", excludeKeywords: ["generic shrimp soup"], imageSearchIndices: ["tom yum goong", "thai tom yum shrimp soup"], ingredients: [primaryIngredient], missingIngredients: ["lemongrass", "lime", "chili", "mushrooms"], name: "Tom Yum Goong", visualKeywords: ["clear spicy shrimp soup", "tom yum"] }),
      make({ cuisine: "Thai", dishName: "pla neung manao", excludeKeywords: ["generic steamed fish"], imageSearchIndices: ["pla neung manao", "thai steamed fish lime garlic"], ingredients: [primaryIngredient], missingIngredients: ["lime", "garlic", "chili", "cilantro"], name: "Pla Neung Manao", visualKeywords: ["steamed fish", "lime garlic sauce"] }),
      make({ cuisine: "Thai", dishName: "gaeng som", excludeKeywords: ["generic curry"], imageSearchIndices: ["gaeng som", "thai sour fish curry"], ingredients: [primaryIngredient], missingIngredients: ["tamarind", "chili paste", "vegetables", "lime"], name: "Gaeng Som", visualKeywords: ["orange sour curry", "fish curry"] }),
      make({ cuisine: "Thai", dishName: "pad thai goong", excludeKeywords: ["generic noodles"], imageSearchIndices: ["pad thai goong", "shrimp pad thai"], ingredients: [primaryIngredient], missingIngredients: ["rice noodles", "tamarind", "bean sprouts", "lime"], name: "Pad Thai Goong", visualKeywords: ["rice noodles", "shrimp pad thai"] }),
      make({ cuisine: "Thai", dishName: "goong ob woon sen", excludeKeywords: ["generic rice bowl"], imageSearchIndices: ["goong ob woon sen", "thai shrimp glass noodles"], ingredients: [primaryIngredient], missingIngredients: ["glass noodles", "ginger", "celery", "garlic"], name: "Goong Ob Woon Sen", visualKeywords: ["shrimp glass noodles", "clay pot noodles"] }),
      make({ cuisine: "Thai", dishName: "pla rad prik", excludeKeywords: ["generic fried fish"], imageSearchIndices: ["pla rad prik", "thai fish chili sauce"], ingredients: [primaryIngredient], missingIngredients: ["chili", "lime", "garlic", "thai basil"], name: "Pla Rad Prik", visualKeywords: ["fish with chili sauce", "thai pla rad prik"] }),
      make({ cuisine: "Thai", dishName: "gaeng keow wan pla", excludeKeywords: ["generic curry"], imageSearchIndices: ["gaeng keow wan pla", "thai green curry fish"], ingredients: [primaryIngredient], missingIngredients: ["coconut milk", "green curry paste", "thai basil", "vegetables"], name: "Gaeng Keow Wan Pla", visualKeywords: ["green curry fish", "thai basil curry"] }),
      make({ cuisine: "Thai", dishName: "panang pla", excludeKeywords: ["generic curry"], imageSearchIndices: ["panang pla", "thai panang fish curry"], ingredients: [primaryIngredient], missingIngredients: ["coconut milk", "panang curry paste", "lime leaves", "thai basil"], name: "Panang Pla", visualKeywords: ["panang fish curry", "red coconut curry"] }),
      make({ cuisine: "Thai", dishName: "yum woon sen talay", excludeKeywords: ["generic seafood salad"], imageSearchIndices: ["yum woon sen talay", "thai glass noodle seafood salad"], ingredients: [primaryIngredient], missingIngredients: ["glass noodles", "lime", "chili", "cilantro"], name: "Yum Woon Sen Talay", visualKeywords: ["glass noodle seafood salad", "thai lime dressing"] }),
      make({ cuisine: "Thai", dishName: "pad krapow goong", excludeKeywords: ["generic stir fry"], imageSearchIndices: ["pad krapow goong", "thai basil shrimp stir fry"], ingredients: [primaryIngredient], missingIngredients: ["thai basil", "chili", "garlic", "rice"], name: "Pad Krapow Goong", visualKeywords: ["thai basil shrimp", "chili basil stir fry"] }),
      make({ cuisine: "Thai", dishName: "tom kha pla", excludeKeywords: ["generic soup"], imageSearchIndices: ["tom kha pla", "thai coconut fish soup"], ingredients: [primaryIngredient], missingIngredients: ["coconut milk", "galangal", "lime", "mushrooms"], name: "Tom Kha Pla", visualKeywords: ["coconut fish soup", "tom kha"] })
    ];
  }

  if (cuisine === "indian") {
    return [
      make({ cuisine: "Indian", dishName: "dal tadka", excludeKeywords: ["generic lentil stew"], imageSearchIndices: ["dal tadka", "indian dal tadka"], ingredients: [primaryIngredient], missingIngredients: ["lentils", "tomato", "cumin", "turmeric"], name: "Dal Tadka", visualKeywords: ["yellow lentil dal", "tempered spices"] }),
      make({ cuisine: "Indian", dishName: "chana masala", excludeKeywords: ["generic chickpea stew"], imageSearchIndices: ["chana masala", "indian chickpea curry"], ingredients: [primaryIngredient], missingIngredients: ["chickpeas", "tomato", "ginger", "garam masala"], name: "Chana Masala", visualKeywords: ["chickpea curry", "masala sauce"] }),
      make({ cuisine: "Indian", dishName: "palak dal", excludeKeywords: ["generic spinach soup"], imageSearchIndices: ["palak dal", "spinach dal"], ingredients: [primaryIngredient], missingIngredients: ["spinach", "lentils", "garlic", "cumin"], name: "Palak Dal", visualKeywords: ["spinach lentil dal", "green dal"] }),
      make({ cuisine: "Indian", dishName: "gobi masala", excludeKeywords: ["generic cauliflower tray"], imageSearchIndices: ["gobi masala", "indian cauliflower masala"], ingredients: [primaryIngredient], missingIngredients: ["cauliflower", "tomato", "ginger", "cumin"], name: "Gobi Masala", visualKeywords: ["cauliflower masala", "spiced tomato sauce"] }),
      make({ cuisine: "Indian", dishName: "sambar", excludeKeywords: ["generic vegetable soup"], imageSearchIndices: ["sambar", "south indian lentil sambar"], ingredients: [primaryIngredient], missingIngredients: ["lentils", "tamarind", "tomato", "vegetables"], name: "Sambar", visualKeywords: ["south indian sambar", "lentil vegetable stew"] }),
      make({ cuisine: "Indian", dishName: "baingan bharta", excludeKeywords: ["generic eggplant dip"], imageSearchIndices: ["baingan bharta", "indian roasted eggplant"], ingredients: [primaryIngredient], missingIngredients: ["eggplant", "tomato", "onion", "cumin"], name: "Baingan Bharta", visualKeywords: ["roasted eggplant mash", "indian baingan bharta"] }),
      make({ cuisine: "Indian", dishName: "saag chana", excludeKeywords: ["generic spinach bowl"], imageSearchIndices: ["saag chana", "indian spinach chickpeas"], ingredients: [primaryIngredient], missingIngredients: ["spinach", "chickpeas", "ginger", "cumin"], name: "Saag Chana", visualKeywords: ["spinach chickpea curry", "green saag"] }),
      make({ cuisine: "Indian", dishName: "rajma masala", excludeKeywords: ["generic bean stew"], imageSearchIndices: ["rajma masala", "indian kidney bean curry"], ingredients: [primaryIngredient], missingIngredients: ["kidney beans", "tomato", "ginger", "garam masala"], name: "Rajma Masala", visualKeywords: ["kidney bean curry", "rajma masala"] }),
      make({ cuisine: "Indian", dishName: "tofu tikka masala", excludeKeywords: ["paneer", "chicken tikka"], imageSearchIndices: ["tofu tikka masala", "vegan tikka masala"], ingredients: [primaryIngredient], missingIngredients: ["tofu", "tomato", "ginger", "garam masala"], name: "Tofu Tikka Masala", visualKeywords: ["vegan tikka masala", "tomato masala sauce"] }),
      make({ cuisine: "Indian", dishName: "vegetable jalfrezi", excludeKeywords: ["generic vegetable tray"], imageSearchIndices: ["vegetable jalfrezi", "indian jalfrezi vegetables"], ingredients: [primaryIngredient], missingIngredients: ["cauliflower", "pepper", "tomato", "cumin"], name: "Vegetable Jalfrezi", visualKeywords: ["spiced vegetable jalfrezi", "tomato pepper masala"] }),
      make({ cuisine: "Indian", dishName: "rasam", excludeKeywords: ["generic tomato soup"], imageSearchIndices: ["rasam", "south indian rasam"], ingredients: [primaryIngredient], missingIngredients: ["tomato", "tamarind", "black pepper", "cumin"], name: "Rasam", visualKeywords: ["south indian rasam", "spiced tomato broth"] })
    ];
  }

  if (cuisine === "turkish") {
    return [
      make({ cuisine: "Turkish", dishName: "izgara kofte", excludeKeywords: ["burger", "generic meatballs"], imageSearchIndices: ["izgara kofte", "turkish grilled kofte"], ingredients: [primaryIngredient], missingIngredients: ["parsley", "onion", "sumac", "tomato"], name: "Izgara Kofte", visualKeywords: ["grilled turkish kofte", "charred kofte patties"] }),
      make({ cuisine: "Turkish", dishName: "adana kebab", excludeKeywords: ["generic kebab"], imageSearchIndices: ["adana kebab", "turkish adana kebab"], ingredients: [primaryIngredient], missingIngredients: ["red pepper", "parsley", "onion", "sumac"], name: "Adana Kebab", visualKeywords: ["spicy minced kebab", "turkish adana"] }),
      make({ cuisine: "Turkish", dishName: "patlican kebabi", excludeKeywords: ["generic eggplant tray"], imageSearchIndices: ["patlican kebabi", "turkish eggplant kebab"], ingredients: [primaryIngredient], missingIngredients: ["eggplant", "tomato", "pepper", "onion"], name: "Patlican Kebabi", visualKeywords: ["eggplant kebab", "turkish patlican"] }),
      make({ cuisine: "Turkish", dishName: "karniyarik", excludeKeywords: ["generic stuffed eggplant"], imageSearchIndices: ["karniyarik", "turkish stuffed eggplant"], ingredients: [primaryIngredient], missingIngredients: ["eggplant", "tomato", "pepper", "parsley"], name: "Karniyarik", visualKeywords: ["split eggplant", "minced filling"] }),
      make({ cuisine: "Turkish", dishName: "turkish et sote", excludeKeywords: ["generic skillet"], imageSearchIndices: ["turkish et sote", "turkish beef saute"], ingredients: [primaryIngredient], missingIngredients: ["pepper", "tomato", "onion", "paprika"], name: "Turkish Et Sote", visualKeywords: ["turkish beef saute", "peppers tomato"] }),
      make({ cuisine: "Turkish", dishName: "kiymali kabak dolma", excludeKeywords: ["rice heavy dolma"], imageSearchIndices: ["kiymali kabak dolma", "turkish stuffed zucchini meat"], ingredients: [primaryIngredient], missingIngredients: ["zucchini", "tomato", "parsley", "pepper"], name: "Kiymali Kabak Dolma", visualKeywords: ["stuffed zucchini", "turkish kabak dolma"] }),
      make({ cuisine: "Turkish", dishName: "saksuka", excludeKeywords: ["generic vegetables"], imageSearchIndices: ["turkish saksuka", "saksuka eggplant tomato"], ingredients: [primaryIngredient], missingIngredients: ["eggplant", "zucchini", "tomato", "pepper"], name: "Saksuka", visualKeywords: ["turkish saksuka", "eggplant tomato"] }),
      make({ cuisine: "Turkish", dishName: "biber dolmasi", excludeKeywords: ["rice heavy dolma"], imageSearchIndices: ["biber dolmasi", "turkish stuffed peppers"], ingredients: [primaryIngredient], missingIngredients: ["bell pepper", "tomato", "parsley", "onion"], name: "Biber Dolmasi", visualKeywords: ["stuffed peppers", "turkish dolma"] })
    ];
  }

  if (cuisine === "mexican") {
    return [
      make({ cuisine: "Mexican", dishName: "tinga de pollo", excludeKeywords: ["generic chicken bowl"], imageSearchIndices: ["tinga de pollo", "mexican chicken tinga"], ingredients: [primaryIngredient], missingIngredients: ["tomato", "chipotle", "onion", "corn tortilla"], name: "Tinga de Pollo", visualKeywords: ["shredded chicken tinga", "chipotle tomato sauce"] }),
      make({ cuisine: "Mexican", dishName: "chicken tostadas", excludeKeywords: ["generic toast"], imageSearchIndices: ["chicken tostadas", "mexican chicken tostada"], ingredients: [primaryIngredient], missingIngredients: ["corn tostadas", "black beans", "tomato", "avocado"], name: "Chicken Tostadas", visualKeywords: ["crisp corn tostada", "chicken beans avocado"] }),
      make({ cuisine: "Mexican", dishName: "enchiladas verdes", excludeKeywords: ["flour tortilla"], imageSearchIndices: ["enchiladas verdes", "mexican green enchiladas"], ingredients: [primaryIngredient], missingIngredients: ["corn tortillas", "tomatillo salsa", "cilantro", "onion"], name: "Enchiladas Verdes", visualKeywords: ["green salsa enchiladas", "corn tortillas"] }),
      make({ cuisine: "Mexican", dishName: "caldo tlalpeno", excludeKeywords: ["generic chicken soup"], imageSearchIndices: ["caldo tlalpeno", "mexican chicken vegetable soup"], ingredients: [primaryIngredient], missingIngredients: ["chickpeas", "tomato", "chipotle", "zucchini"], name: "Caldo Tlalpeno", visualKeywords: ["mexican chicken soup", "chipotle broth"] }),
      make({ cuisine: "Mexican", dishName: "sopa de tortilla", excludeKeywords: ["flour tortilla"], imageSearchIndices: ["sopa de tortilla", "mexican tortilla soup"], ingredients: [primaryIngredient], missingIngredients: ["corn tortilla strips", "tomato", "chili", "avocado"], name: "Sopa de Tortilla", visualKeywords: ["tomato chili soup", "corn tortilla strips"] }),
      make({ cuisine: "Mexican", dishName: "pescado a la veracruzana", excludeKeywords: ["generic fish"], imageSearchIndices: ["pescado a la veracruzana", "veracruz style fish"], ingredients: [primaryIngredient], missingIngredients: ["tomato", "olive", "capers", "pepper"], name: "Pescado a la Veracruzana", visualKeywords: ["veracruz fish", "tomato olive sauce"] }),
      make({ cuisine: "Mexican", dishName: "chicken fajitas", excludeKeywords: ["generic grilled chicken"], imageSearchIndices: ["mexican chicken fajitas", "chicken fajitas peppers"], ingredients: [primaryIngredient], missingIngredients: ["pepper", "onion", "lime", "corn tortillas"], name: "Chicken Fajitas", visualKeywords: ["sliced chicken peppers", "fajita skillet"] }),
      make({ cuisine: "Mexican", dishName: "huevos a la mexicana", excludeKeywords: ["generic eggs"], imageSearchIndices: ["huevos a la mexicana", "mexican style eggs"], ingredients: [primaryIngredient], missingIngredients: ["egg", "tomato", "onion", "chili"], name: "Huevos a la Mexicana", visualKeywords: ["tomato chili eggs", "mexican breakfast"] }),
      make({ cuisine: "Mexican", dishName: "black bean tacos", excludeKeywords: ["flour tortilla"], imageSearchIndices: ["black bean tacos", "mexican black bean tacos"], ingredients: [primaryIngredient], missingIngredients: ["corn tortillas", "black beans", "tomato", "avocado"], name: "Black Bean Tacos", visualKeywords: ["corn tortilla tacos", "black beans avocado"] }),
      make({ cuisine: "Mexican", dishName: "chile relleno", excludeKeywords: ["breaded fried"], imageSearchIndices: ["chile relleno", "mexican stuffed poblano"], ingredients: [primaryIngredient], missingIngredients: ["poblano pepper", "tomato sauce", "beans", "cilantro"], name: "Chile Relleno", visualKeywords: ["stuffed poblano", "tomato sauce"] }),
      make({ cuisine: "Mexican", dishName: "pozole verde", excludeKeywords: ["generic soup"], imageSearchIndices: ["pozole verde", "mexican green pozole"], ingredients: [primaryIngredient], missingIngredients: ["hominy", "tomatillo", "cilantro", "radish"], name: "Pozole Verde", visualKeywords: ["green pozole", "hominy tomatillo broth"] })
    ];
  }

  if (cuisine === "middleeastern") {
    return [
      make({ cuisine: "Middle Eastern", dishName: "mansaf", excludeKeywords: ["generic lamb rice"], imageSearchIndices: ["mansaf", "jordanian mansaf"], ingredients: [primaryIngredient], missingIngredients: ["rice", "yogurt sauce", "almonds", "parsley"], name: "Mansaf", visualKeywords: ["jordanian mansaf", "rice yogurt sauce"] }),
      make({ cuisine: "Middle Eastern", dishName: "maqluba", excludeKeywords: ["generic rice"], imageSearchIndices: ["maqluba", "middle eastern upside down rice"], ingredients: [primaryIngredient], missingIngredients: ["rice", "eggplant", "cauliflower", "tomato"], name: "Maqluba", visualKeywords: ["upside down rice", "eggplant cauliflower"] }),
      make({ cuisine: "Middle Eastern", dishName: "fatteh", excludeKeywords: ["generic chickpea bowl"], imageSearchIndices: ["chickpea fatteh", "middle eastern fatteh"], ingredients: [primaryIngredient], missingIngredients: ["chickpeas", "toasted bread", "yogurt", "tahini"], name: "Fatteh", visualKeywords: ["chickpea fatteh", "tahini yogurt"] }),
      make({ cuisine: "Middle Eastern", dishName: "mujadara", excludeKeywords: ["generic lentils"], imageSearchIndices: ["mujadara", "lentils rice onions"], ingredients: [primaryIngredient], missingIngredients: ["lentils", "rice", "onion", "olive oil"], name: "Mujadara", visualKeywords: ["lentils rice onions", "middle eastern mujadara"] }),
      make({ cuisine: "Middle Eastern", dishName: "shawarma", excludeKeywords: ["generic wrap"], imageSearchIndices: ["middle eastern shawarma", "shawarma plate"], ingredients: [primaryIngredient], missingIngredients: ["shawarma spices", "tahini", "cucumber", "tomato"], name: "Shawarma Plate", visualKeywords: ["shawarma spices", "tahini salad"] }),
      make({ cuisine: "Middle Eastern", dishName: "kofta kebab", excludeKeywords: ["generic meatballs"], imageSearchIndices: ["middle eastern kofta kebab", "kofta kebab"], ingredients: [primaryIngredient], missingIngredients: ["parsley", "onion", "cumin", "tahini"], name: "Kofta Kebab", visualKeywords: ["kofta skewers", "middle eastern kebab"] }),
      make({ cuisine: "Middle Eastern", dishName: "hummus", excludeKeywords: ["generic dip"], imageSearchIndices: ["hummus", "middle eastern hummus"], ingredients: [primaryIngredient], missingIngredients: ["chickpeas", "tahini", "lemon", "olive oil"], name: "Hummus", visualKeywords: ["chickpea tahini dip", "hummus"] }),
      make({ cuisine: "Middle Eastern", dishName: "tabbouleh", excludeKeywords: ["generic salad"], imageSearchIndices: ["tabbouleh", "parsley bulgur salad"], ingredients: [primaryIngredient], missingIngredients: ["parsley", "bulgur", "tomato", "lemon"], name: "Tabbouleh", visualKeywords: ["parsley salad", "bulgur tomato"] }),
      make({ cuisine: "Middle Eastern", dishName: "kibbeh", excludeKeywords: ["generic croquette"], imageSearchIndices: ["kibbeh", "middle eastern kibbeh"], ingredients: [primaryIngredient], missingIngredients: ["bulgur", "onion", "mint", "cumin"], name: "Kibbeh", visualKeywords: ["bulgur meat shells", "middle eastern kibbeh"] }),
      make({ cuisine: "Middle Eastern", dishName: "musakhan", excludeKeywords: ["generic chicken bread"], imageSearchIndices: ["musakhan", "palestinian sumac chicken"], ingredients: [primaryIngredient], missingIngredients: ["sumac", "onion", "flatbread", "pine nuts"], name: "Musakhan", visualKeywords: ["sumac chicken", "flatbread onions"] })
    ];
  }

  return [];
}

function getCuisineLabelFromCandidate(cuisine: string) {
  const labels: Record<string, string> = {
    american: "American",
    asian: "Asian",
    egyptian: "Egyptian",
    indian: "Indian",
    italian: "Italian",
    mediterranean: "Mediterranean",
    mexican: "Mexican",
    middleEastern: "Middle Eastern",
    thai: "Thai",
    turkish: "Turkish"
  };
  return labels[cuisine] ?? cuisine;
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
  const requestedIngredients = dedupeIngredients(input.ingredients).map(getRecipeIngredientLabel);
  const owned = requestedIngredients.filter((ingredient) =>
    isIngredientAvailable(ingredient, context.availableIngredients)
  );
  const unavailableRequestedIngredients = requestedIngredients.filter((ingredient) =>
    !isIngredientAvailable(ingredient, context.availableIngredients)
  );
  const missing = dedupeIngredients([
    ...unavailableRequestedIngredients,
    ...adapted.missingIngredients
  ])
    .map(getRecipeIngredientLabel)
    .filter((ingredient) => !isIngredientAvailable(ingredient, context.availableIngredients));

  const enriched = enrichRecipeWithDishIntent({
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

  return {
    ...enriched,
    image_search_index: input.imageSearchIndices[0],
    image_search_indices: input.imageSearchIndices
  };
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
  const wantsLowSodium = /\b(low sodium|hypertension|blood pressure|highbloodpressure|high blood pressure|heart)\b/.test(dietText);
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

function hasUnresolvedSensitiveRecipeAdaptationRequest(input: {
  allergens?: string[];
  conditions?: string[];
  diets?: string[];
  excludedIngredients?: string[];
  requestedCount: number;
  safeReferenceCount: number;
}) {
  const hasSensitiveConstraints = Boolean(
    input.diets?.length ||
      input.conditions?.length ||
      hasRecipeReferenceAdaptationConstraints(input)
  );
  return hasSensitiveConstraints && input.safeReferenceCount < input.requestedCount;
}

function hasRecipeReferenceAdaptationConstraints(input: {
  allergens?: string[];
  diets?: string[];
  excludedIngredients?: string[];
}) {
  return Boolean(
    input.allergens?.length ||
      input.excludedIngredients?.length
  );
}

function filterRecipesByExcludedIngredients(recipes: Recipe[], excludedIngredients: string[]) {
  const excluded = excludedIngredients
    .map(normalizeIngredientForStrictMatch)
    .filter(Boolean);
  if (!excluded.length) {
    return { allowed: recipes, rejected: [] as Array<{ recipe: Recipe; reason: string }> };
  }

  const rejected: Array<{ recipe: Recipe; reason: string }> = [];
  const allowed = recipes.filter((recipe) => {
    const recipeText = [
      recipe.name,
      recipe.cuisine,
      ...(recipe.ingredients ?? []),
      ...(recipe.missing_ingredients ?? []),
      ...(recipe.steps ?? [])
    ]
      .map((value) => normalizeIngredientForStrictMatch(String(value ?? "")))
      .join(" ");
    const matched = excluded.find((ingredient) => ingredient.length >= 2 && recipeText.includes(ingredient));
    if (matched) {
      rejected.push({ recipe, reason: `excluded_ingredient:${matched}` });
      return false;
    }
    return true;
  });

  return { allowed, rejected };
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

function applyStrictIngredientOwnership(
  inputRecipes: unknown[],
  availableIngredients: Set<string>,
  context?: {
    allergens?: string[];
    conditions?: string[];
    diets?: string[];
    preserveIdentity?: boolean;
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
    const ownershipInput: Recipe = {
      ...baseRecipe,
      ingredients: (Array.isArray(baseRecipe.ingredients) ? baseRecipe.ingredients : []).map(getRecipeIngredientLabel),
      missing_ingredients: (Array.isArray(baseRecipe.missing_ingredients) ? baseRecipe.missing_ingredients : []).map(getRecipeIngredientLabel)
    };
    const ownership = classifyRecipeIngredientOwnership(ownershipInput, {
      canonicalize: normalizeIngredientForStrictMatch,
      isAvailable: (ingredient, canonicalName) => isPantryIngredientOwned({
        availableIngredients,
        canonicalName,
        displayText: ingredient,
        matchRelatedIngredient: (candidate) => isIngredientAvailable(candidate, availableIngredients)
      })
    });
    const owned = ownership.recipe.ingredients;
    const missing = ownership.recipe.missing_ingredients;

    if (context?.preserveIdentity) {
      return {
        ...ownership.recipe,
        ingredients: owned,
        missing_ingredients: missing
      };
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
      ...ownership.recipe,
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
    plated_visual_description:
      typeof variant.plated_visual_description === "string" && variant.plated_visual_description.trim()
        ? variant.plated_visual_description.trim()
        : undefined,
    recipe_origin:
      variant.recipe_origin === "exact_scan_match" || variant.recipe_origin === "similar_ingredients"
        ? variant.recipe_origin
        : undefined,
    recipe_source_type:
      variant.recipe_source_type === "local_database" ||
      variant.recipe_source_type === "external_source" ||
      variant.recipe_source_type === "generated"
        ? variant.recipe_source_type
        : undefined,
    scan_match_explanation:
      typeof variant.scan_match_explanation === "string" && variant.scan_match_explanation.trim()
        ? variant.scan_match_explanation.trim()
        : undefined,
    source_url:
      typeof variant.source_url === "string" && /^https?:\/\//i.test(variant.source_url.trim())
        ? variant.source_url.trim()
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
  candidateLimit?: number;
  ingredients?: string[];
  preferredCuisine?: string;
  calorieTarget?: number;
  maxMissingIngredients?: number;
  recipeCount?: number;
  diets?: string[];
  conditions?: string[];
  excludedIngredients?: string[];
  recentRecipeMemory?: RecentRecipeMemory;
  requestPolicy?: CompiledRecipeRequestPolicy;
  variationSeed?: string;
}

interface RankedRecipeCandidate {
  anchorMatchCount: number;
  familyKey: string;
  index: number;
  isMainlyPantry: boolean;
  isPantryBalanced: boolean;
  missingCount: number;
  ownedCount: number;
  recentPenalty: number;
  recipe: Recipe;
  score: number;
  structureKey: string;
}

function rankStrictRecipes(recipes: Recipe[], options: RecipeRankingOptions) {
  const limit = options.candidateLimit == null
    ? clampRecipeCount(options.recipeCount)
    : Math.min(100, Math.max(MIN_RECIPE_RESULT_COUNT, Math.floor(options.candidateLimit)));
  const ranked = applyRunVariationToRankedCandidates(
    buildRankedRecipeCandidates(recipes, options),
    options.variationSeed,
    limit
  );

  if (options.requestPolicy) {
    return selectRecipesByRequestPolicy(
      ranked.map((candidate) => candidate.recipe),
      options.requestPolicy,
      limit
    );
  }

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

function applyRunVariationToRankedCandidates(
  ranked: RankedRecipeCandidate[],
  variationSeed: string | undefined,
  limit: number
) {
  if (!variationSeed || ranked.length <= limit) return ranked;

  const topScore = ranked[0]?.score ?? 0;
  const windowSize = Math.min(ranked.length, Math.max(limit * 4, limit + 8));
  const explorationWindow = ranked.slice(0, windowSize);
  const remaining = ranked.slice(windowSize);
  const eligible = explorationWindow.filter((candidate) =>
    candidate.score >= topScore - 18 ||
    candidate.isMainlyPantry ||
    candidate.isPantryBalanced
  );
  const ineligible = explorationWindow.filter((candidate) => !eligible.includes(candidate));

  const varied = [...eligible].sort((left, right) => {
    if (left.anchorMatchCount !== right.anchorMatchCount) {
      return right.anchorMatchCount - left.anchorMatchCount;
    }
    if (left.isMainlyPantry !== right.isMainlyPantry) {
      return Number(right.isMainlyPantry) - Number(left.isMainlyPantry);
    }
    if (left.ownedCount !== right.ownedCount && Math.abs(left.ownedCount - right.ownedCount) > 1) {
      return right.ownedCount - left.ownedCount;
    }
    const leftScoreBand = Math.floor(left.score / 10);
    const rightScoreBand = Math.floor(right.score / 10);
    if (leftScoreBand !== rightScoreBand) return rightScoreBand - leftScoreBand;
    if (left.missingCount !== right.missingCount && Math.abs(left.missingCount - right.missingCount) > 1) {
      return left.missingCount - right.missingCount;
    }
    const leftVariation = getRecipeVariationSortValue(variationSeed, left);
    const rightVariation = getRecipeVariationSortValue(variationSeed, right);
    return leftVariation - rightVariation || left.index - right.index;
  });

  return [...varied, ...ineligible, ...remaining];
}

function getRecipeVariationSortValue(seed: string, candidate: RankedRecipeCandidate) {
  return stableVariationNumber([
    seed,
    candidate.familyKey,
    candidate.structureKey,
    candidate.recipe.name,
    candidate.recipe.cuisine,
    candidate.recipe.image_search_index
  ].filter(Boolean).join("|"));
}

function stableVariationNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function getRecentRecipeRepetitionPenalty(recipe: Recipe, memory?: RecentRecipeMemory) {
  if (!memory?.recipes.length) return 0;
  let penalty = 0;
  const selectionKey = getRecipeSelectionKey(recipe);
  const familyKey = getRecipeVarietyFamilyKey(recipe) || buildRecipeDishFamilyKey(recipe);
  const structureKey = buildRecipeStructureSignature(recipe);
  const imageIdentityKey = getRecipeImageIdentityKey(recipe);
  const nameKey = normalizeDishRestrictionKey(recipe.dish_intent?.dish_name || recipe.name);

  if (selectionKey && memory.selectionKeys.has(selectionKey)) penalty += 120;
  if (nameKey && memory.names.has(nameKey)) penalty += 95;
  if (familyKey && memory.familyKeys.has(familyKey)) penalty += 60;
  if (imageIdentityKey && memory.imageIdentityKeys.has(imageIdentityKey)) penalty += 45;
  if (structureKey && memory.structureKeys.has(structureKey)) penalty += 30;

  // Recent dishes should rotate lower, but must remain eligible when they are
  // still the strongest pantry/cuisine match for a repeated request.
  return Math.min(penalty, 30);
}

function buildRankedRecipeCandidates(recipes: Recipe[], options: RecipeRankingOptions): RankedRecipeCandidate[] {
  const targetCaloriesPerMeal = Math.round((options.calorieTarget ?? 2000) / 3);
  const preferredCuisine = options.preferredCuisine && options.preferredCuisine !== "Any"
    ? options.preferredCuisine.toLowerCase()
    : "";
  const missingIngredientLimit = Number.isFinite(options.maxMissingIngredients)
    ? Math.max(0, Number(options.maxMissingIngredients))
    : Number.POSITIVE_INFINITY;

  return recipes
    .map((recipe, index) => {
      const pantryUsage = getRecipePantryUsageStats(recipe, options.ingredients ?? []);
      const anchorMatchCount = options.requestPolicy
        ? getRecipeInputAnchorIds(recipe, options.requestPolicy.coveragePlan).length
        : 0;
      const familyKey = buildRecipeDishFamilyKey(recipe) || recipe.name.trim().toLowerCase();
      const structureKey = buildRecipeStructureSignature(recipe);
      const recentPenalty = getRecentRecipeRepetitionPenalty(recipe, options.recentRecipeMemory);
      const baseScore = scoreStrictRecipe(recipe, {
        targetCaloriesPerMeal,
        preferredCuisine,
        maxMissingIngredients: options.maxMissingIngredients ?? 3,
        hasPreferences: Boolean(options.diets?.length || options.conditions?.length),
        diets: options.diets ?? [],
        excludedIngredients: options.excludedIngredients ?? [],
        availableIngredients: options.ingredients ?? []
      });
      return {
        anchorMatchCount,
        familyKey,
        recipe,
        index,
        isMainlyPantry: pantryUsage.isMainlyPantry,
        isPantryBalanced: isPantryBalancedRecipe(recipe, options.ingredients ?? []),
        missingCount: pantryUsage.missingCount,
        ownedCount: pantryUsage.ownedCount,
        recentPenalty,
        structureKey,
        score: baseScore - recentPenalty
      };
    })
    .filter((candidate) => candidate.missingCount <= missingIngredientLimit)
    .sort((left, right) => {
      if (left.anchorMatchCount !== right.anchorMatchCount) {
        return right.anchorMatchCount - left.anchorMatchCount;
      }
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
      recentPenalty: Math.round(entry.recentPenalty * 10) / 10,
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

function dedupeRecipeEditorDishIdentities(recipes: Recipe[]) {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const identity = buildNormalizedRecipeNameSignature(
      recipe.dish_identity || recipe.dish_intent?.dish_name || recipe.name
    );
    const key = identity || normalizeDishRestrictionKey(recipe.name) || recipe.id || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRecipeDuplicateCardKey(recipe: Recipe) {
  const familyKey = getRecipeVarietyFamilyKey(recipe);
  const nameKey = normalizeDishRestrictionKey(recipe.name);
  const imageIdentityKey = getRecipeImageIdentityKey(recipe);
  const ingredientKey = getRecipeVarietyIngredientKey(recipe);
  const identityKey = familyKey || imageIdentityKey || nameKey || recipe.id || "";

  return [identityKey, ingredientKey || imageIdentityKey].filter(Boolean).join("::");
}

function buildRecipeVariationSeed(requestId: string) {
  return requestId.replace(/-/g, "").slice(0, 12);
}

function clampRecipeCount(value?: number, maxRecipeCount = MAX_SHARED_POOL_RECIPE_RESULT_COUNT) {
  if (!Number.isFinite(value)) return DEFAULT_RECIPE_RESULT_COUNT;
  return Math.min(maxRecipeCount, Math.max(MIN_RECIPE_RESULT_COUNT, Number(value)));
}

export function enforceExplicitCuisineResponsePolicy(
  payload: Record<string, unknown>,
  context: { preferredCuisine: string; requestedCount: number }
) {
  if (!Array.isArray(payload.recipes) || !context.preferredCuisine || context.preferredCuisine === "Any") {
    return payload;
  }

  const recipes = payload.recipes as Recipe[];
  const requestedCount = Math.max(
    1,
    Number(payload.requestedCount ?? context.requestedCount ?? recipes.length)
  );
  const selection = selectRecipesWithCuisineFallback(recipes, context.preferredCuisine, requestedCount);
  const selectedRecipes = selection.recipes.map((recipe) => ({
    ...recipe,
    cuisine_match_origin: cuisineMatchesPreference(recipe.cuisine, context.preferredCuisine)
      ? "preferred" as const
      : "ingredient_fallback" as const
  }));
  const isUnderfilled = selectedRecipes.length < requestedCount;
  if (selection.fallbackCount === 0 && !isUnderfilled && selectedRecipes.length === recipes.length) return payload;

  const message = selection.fallbackCount
    ? `Showing ${selection.preferredCount} validated ${context.preferredCuisine} recipe${selection.preferredCount === 1 ? "" : "s"} and ${selection.fallbackCount} ingredient-matched recipe${selection.fallbackCount === 1 ? "" : "s"} from other cuisines because the preferred cuisine did not fill all ${requestedCount} spots.`
    : buildCuisineUnderfillMessage({
        preferredCuisine: context.preferredCuisine,
        requestedCount,
        returnedCount: selectedRecipes.length
      });

  return {
    ...payload,
    recipes: selectedRecipes,
    result: JSON.stringify(selectedRecipes),
    preferredCuisineCount: selection.preferredCount,
    fallbackCuisineCount: selection.fallbackCount,
    requestedCount,
    returnedCount: selectedRecipes.length,
    generationStatus: selectedRecipes.length && !selection.fallbackCount && !isUnderfilled
      ? payload.generationStatus
      : selectedRecipes.length
      ? RecipeGenerationStatus.PARTIAL_RESULTS
      : RecipeGenerationStatus.NO_RESULTS,
    message
  };
}

function buildRecipeUnavailableMessage(recipeLanguage: string) {
  if (!isArabicRecipeLanguage(recipeLanguage)) {
    return "We could not find a good recipe match for those ingredients right now. Try adding one more ingredient or changing the cuisine.";
  }

  return "\u0644\u0645 \u0646\u062c\u062f \u0648\u0635\u0641\u0629 \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0643\u0648\u0646\u0627\u062a \u0627\u0644\u0622\u0646. \u062c\u0631\u0628 \u0625\u0636\u0627\u0641\u0629 \u0645\u0643\u0648\u0646 \u0622\u062e\u0631 \u0623\u0648 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0645\u0637\u0628\u062e.";
}

/**
 * Converts a validated source recipe back into the small editor contract. This
 * keeps deterministic repairs ahead of Gemini without exposing source metadata
 * or allowing the editor to replace the recipe's documented method.
 */
function buildRecipeEditorReference(recipe: Recipe, index: number): RecipeReferencePromptRecipe {
  return {
    id: recipe.source_recipe_id ?? recipe.id ?? `source-recipe-${index + 1}`,
    title: recipe.name,
    dishIdentity: recipe.dish_identity ?? recipe.name,
    cuisine: recipe.cuisine,
    imagePrompt: recipe.plated_visual_description,
    ingredients: [...recipe.ingredients, ...recipe.missing_ingredients],
    steps: recipe.steps,
    sourceUrl: recipe.source_url,
    matchedIngredients: []
  };
}

function prepareRecipeSourceForEditor(
  sourceRecipe: Recipe,
  reference: RecipeReferencePromptRecipe
) {
  const prepared = normalizeRecipeLosslessly(sourceRecipe);

  return {
    reference: {
      ...reference,
      title: prepared.name,
      dishIdentity: prepared.dish_identity || reference.dishIdentity,
      cuisine: prepared.cuisine,
      ingredients: [...prepared.ingredients, ...prepared.missing_ingredients],
      steps: prepared.steps,
      imagePrompt: prepared.plated_visual_description || reference.imagePrompt
    },
    sourceRecipe: prepared
  };
}

/**
 * Gemini edits only the user-facing cooking fields. Source-backed nutrition,
 * source identity, and image metadata stay deterministic on the backend.
 */
function mergeRecipeEditorOutput(
  candidate: unknown,
  options: { recipeLanguage: string; sourceRecipe: Recipe }
): Recipe {
  const sourceRecipe = options.sourceRecipe;
  const edited = candidate && typeof candidate === "object" ? (candidate as Partial<Recipe>) : {};
  const stringField = <K extends keyof Recipe>(field: K) => {
    const value = edited[field];
    return typeof value === "string" && value.trim() ? value.trim() : sourceRecipe[field];
  };
  const stringArrayField = <K extends keyof Recipe>(field: K) => {
    const value = edited[field];
    return Array.isArray(value) && value.every((item) => typeof item === "string") && value.length
      ? value.map((item) => item.trim()).filter(Boolean)
      : sourceRecipe[field];
  };

  return attachRecipeEditorSourceProvenance({
    ...sourceRecipe,
    name: preserveSourceDishIdentityName(sourceRecipe, stringField("name") as string, options.recipeLanguage),
    cuisine: sourceRecipe.cuisine,
    ingredients: stringArrayField("ingredients") as string[],
    missing_ingredients: stringArrayField("missing_ingredients") as string[],
    steps: stringArrayField("steps") as string[],
    cook_time: stringField("cook_time") as string,
    difficulty: stringField("difficulty") as string,
    preference_hits: stringArrayField("preference_hits") as string[]
  }, sourceRecipe);
}

function attachRecipeEditorSourceProvenance(recipe: Recipe, sourceRecipe: Recipe): Recipe {
  const sourceUrl = sourceRecipe.source_url?.trim();
  const sourceType = sourceRecipe.recipe_source_type === "external_source" && /^https?:\/\//i.test(sourceUrl ?? "")
    ? "external_source"
    : "local_database";

  return {
    ...recipe,
    id: sourceRecipe.id ?? recipe.id,
    source_recipe_id: sourceRecipe.source_recipe_id ?? sourceRecipe.id ?? recipe.source_recipe_id,
    recipe_source_type: sourceType,
    source_url: sourceType === "external_source" ? sourceUrl : sourceRecipe.source_url ?? recipe.source_url
  };
}

async function mapSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    })
  );

  return results;
}

function preserveSourceDishIdentityName(sourceRecipe: Recipe, editedName: string, recipeLanguage: string) {
  return preserveEditorSourceDishIdentityName(sourceRecipe, editedName, recipeLanguage);
}

async function generateRecipesWithTransientRetry(
  prompt: string,
  traceForAttempt: (attempt: number) => import("@/lib/openai").AiCallTraceOptions,
  options?: import("@/lib/openai").AiTextGenerationOptions,
  onAttempt?: (event: {
    attempt: number;
    phase: string;
    reason?: string;
    status: "failed" | "started" | "succeeded";
  }) => void,
  maxAttempts = AI_RECIPE_TRANSIENT_RETRY_ATTEMPTS
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const trace = traceForAttempt(attempt);
    const phase = trace.phase ?? "recipe_generation";
    onAttempt?.({ attempt, phase, status: "started" });
    try {
      const result = await generateFallbackRecipes(prompt, trace, {
        ...RECIPE_TEXT_GENERATION_OPTIONS,
        ...options
      });
      onAttempt?.({ attempt, phase, status: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
      onAttempt?.({
        attempt,
        phase,
        reason: error instanceof Error ? error.message : String(error),
        status: "failed"
      });
      if (isAiTimeoutError(error) || !isTransientAiOverload(error) || attempt === maxAttempts) {
        break;
      }

      logger.warn("Retrying transient AI recipe generation failure", {
        attempt,
        nextAttempt: attempt + 1,
        retryAttempts: maxAttempts,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI recipe generation failed");
}

function isTransientAiOverload(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return isTransientModelError(error) || /empty response from gemini model/i.test(message);
}

function isAiTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|abort/i.test(message);
}

async function queueRecipeCachePersist(input: {
  recipeLanguage: string;
  recipes?: Recipe[];
  uid?: string | null;
  dietContext?: DietEnforcementContext;
  promoteToSharedPool?: boolean;
}) {
  const persist = async () => {
    const startedAt = Date.now();
    try {
      await persistGeneratedRecipeCache(input);
      const promotion = input.promoteToSharedPool
        ? await persistPremiumValidatedRecipeCache({
            recipeLanguage: input.recipeLanguage,
            recipes: input.recipes
          })
        : null;
      attachSharedRecipeV2SourceIds(input.recipes ?? [], promotion?.documents ?? []);
      logger.info("Recipe cache persisted after response", {
        durationMs: Date.now() - startedAt,
        promotedRecipeCount: promotion?.available ?? promotion?.published ?? 0,
        publishedRecipeCount: promotion?.published ?? 0,
        reusedRecipeCount: promotion?.reused ?? 0,
        recipeCount: input.recipes?.length ?? 0,
        uid: input.uid ?? null
      });
    } catch (error) {
      logger.warn("Recipe cache persistence failed", {
        uid: input.uid ?? null,
        recipeCount: input.recipes?.length ?? 0,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Premium recipes must exist in the shared pool before their client-side
  // photo requests begin, otherwise the generated image has no document to
  // link to and free users receive a permanently pending photo bundle.
  if (input.promoteToSharedPool) {
    await persist();
    return;
  }

  scheduleAfterResponse("recipe cache persistence", persist);
}

function attachSharedRecipeV2SourceIds(recipes: Recipe[], documents: RecipeCatalogDoc[]) {
  const documentIdsByRecipe = new Map(
    documents.map((document) => [
      `${normalizeRecipeV2LookupText(document.title)}|${normalizeRecipeV2LookupText(document.cuisine)}`,
      document.id
    ])
  );

  recipes.forEach((recipe) => {
    const key = `${normalizeRecipeV2LookupText(recipe.name)}|${normalizeRecipeV2LookupText(recipe.cuisine)}`;
    const sourceRecipeId = documentIdsByRecipe.get(key);
    if (sourceRecipeId) recipe.source_recipe_id = sourceRecipeId;
  });
}

function normalizeRecipeV2LookupText(value?: string) {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function scheduleAfterResponse(label: string, task: () => Promise<void>) {
  try {
    after(task);
  } catch (error) {
    // Direct route invocation in a non-Next test context has no request lifecycle.
    // Keep the side effect fail-open there instead of making the response fail.
    logger.warn("Unable to register after-response task; running it in the background", {
      label,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    void task();
  }
}

function scoreStrictRecipe(
  recipe: Recipe,
  options: {
    targetCaloriesPerMeal: number;
    preferredCuisine: string;
    maxMissingIngredients: number;
    hasPreferences: boolean;
    diets: string[];
    excludedIngredients: string[];
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
  const namedDishPantryFitBonus = namedDishScore > 0 && ownedCount >= 2 && missingCount <= options.maxMissingIngredients
    ? 50
    : 0;
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
  const dietPenalty = findRecipeDietViolation(recipe, { diets: options.diets, allergens: [] }) ? 72 : 0;
  const excludedIngredientPenalty = filterRecipesByExcludedIngredients(
    [recipe],
    options.excludedIngredients
  ).rejected.length ? 72 : 0;

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
    namedDishPantryFitBonus +
    ingredientIntegrationScore -
    basicFallbackPenalty +
    calorieScore +
    ownershipBalanceScore +
    maxMissingBonus +
    matchQualityScore -
    dietPenalty -
    excludedIngredientPenalty
  );
}

function getNamedDishSpecificityScore(recipe: Recipe) {
  const source = [
    recipe.name,
    recipe.dish_identity,
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
    /\b(mansaf|maqluba|maklouba|makloubeh|kabsa|kibbeh|musakhan|mujadara|shawarma|fasolia|hummus|fattoush|tabbouleh|kebab)\b/,
    /\b(chana\s+masala|dal|tadka|keema|biryani|pulao|rajma|curry)\b/,
    /\b(pad\s+krapow|tom\s+yum|larb|teriyaki|bibimbap|fried\s+rice|congee)\b/,
    /\b(alfredo|arrabbiata|cacciatore|florentine|lasagna|neapolitan|parmigiana|parmesan|piccata|pizzaiola|pomodoro|primavera|risotto|minestrone|frittata|saltimbocca)\b/,
    /(?:ألفريدو|كاتشاتوري|كاستياتوري|بيكاتا|بارميزان|باريميجيانا|لازانيا|نابوليتان|بيتزايولا|بريمافيرا|توسكاني|ريزوتو|مينستروني|سالتيمبوكا)/u,
    /\b(hamburger\s+stew|meatloaf|stuffed\s+pepper|taco|enchilada|chili)\b/
  ].filter((pattern) => pattern.test(source)).length;

  const genericOnly =
    /\b(grilled|baked|fried|sauteed|pan\s*seared|garlic|lemon|herb|pasta|rice|bowl|plate|skillet)\b/.test(source) &&
    namedDishHits === 0;

  return namedDishHits ? Math.min(56, namedDishHits * 28) : genericOnly ? -16 : 0;
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
    return preservedExactMatches.slice(0, recipeCount);
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

  return filtered.slice(0, recipeCount);
}

/**
 * Local references are evidence, not suggestions. For a named cuisine we
 * never pad a source-backed result with another cuisine merely to reach the
 * requested card count. The caller then uses grounded external sources for
 * the remaining cards.
 */
function selectTrustedSourceCuisineRecipes(
  recipes: Recipe[],
  preferredCuisine: string | undefined,
  availableIngredients: string[],
  recipeCount: number
) {
  if (!preferredCuisine || preferredCuisine === "Any") {
    return recipes.slice(0, recipeCount);
  }

  const normalizedPreferredCuisine = normalizeCuisineLabel(preferredCuisine);
  const candidates = recipes.filter((recipe) => {
    const hasExactCuisineLabel = normalizeCuisineLabel(recipe.cuisine) === normalizedPreferredCuisine;
    const hasAuthenticNamedIdentity = hasStrongSpecificCuisineIdentity(
      recipe,
      preferredCuisine,
      availableIngredients
    );
    return (
      cuisineMatchesPreference(recipe.cuisine, preferredCuisine) &&
      (hasExactCuisineLabel || hasAuthenticNamedIdentity) &&
      !hasRecipeConflictingCuisineIdentity(recipe, preferredCuisine)
    );
  });
  // Older shared records can carry broad photo/search aliases from adjacent
  // cuisines. Those aliases should not hide a recipe whose displayed identity
  // and authoritative cuisine are still coherent. Keep them as soft-fill
  // candidates after the strongest metadata matches.
  const safeExactCuisineFallbacks = recipes.filter((recipe) =>
    normalizeCuisineLabel(recipe.cuisine) === normalizedPreferredCuisine &&
    !hasRecipeConflictingCuisineTitleIdentity(recipe, preferredCuisine)
  );
  const mergedCandidates = Array.from(new Map(
    [...candidates, ...safeExactCuisineFallbacks].map((recipe) => [
      recipe.id ?? `${recipe.name}|${recipe.cuisine}`,
      recipe
    ])
  ).values());

  return mergedCandidates
    .sort((left, right) => {
      const score = (recipe: Recipe) =>
        Number(cuisineMatchesPreference(recipe.cuisine, preferredCuisine)) * 80 +
        Number(recipe.id?.startsWith("trusted-source-")) * 100 +
        Number(recipe.recipe_source_type === "external_source" && /^https?:\/\//i.test(recipe.source_url ?? "")) * 20 +
        Number(hasStrongSpecificCuisineIdentity(recipe, preferredCuisine, availableIngredients)) * 60 -
        Number(hasRecipeConflictingCuisineIdentity(recipe, preferredCuisine)) * 200 -
        Number(isGenericSpecificCuisineDisplayName(normalizeCuisineIdentityText(recipe.name))) * 30;
      return score(right) - score(left);
    })
    .slice(0, recipeCount);
}

function filterWeakSpecificCuisineRecipes(
  recipes: Recipe[],
  input: {
    availableIngredients: string[];
    preferredCuisine?: string;
    recipeCount: number;
    requestId: string;
  }
) {
  if (!input.preferredCuisine || input.preferredCuisine === "Any") return recipes.slice(0, input.recipeCount);
  const preferredCuisine = input.preferredCuisine;

  return [...recipes]
    .sort((left, right) => {
      const score = (recipe: Recipe) =>
        Number(recipe.recipe_origin === "exact_scan_match") * 100 +
        Number(cuisineMatchesPreference(recipe.cuisine ?? "", preferredCuisine)) * 40 +
        Number(hasStrongSpecificCuisineIdentity(recipe, preferredCuisine, input.availableIngredients)) * 60 -
        Number(hasRecipeConflictingCuisineIdentity(recipe, preferredCuisine)) * 200;
      return score(right) - score(left);
    })
    .filter((recipe) => !hasRecipeConflictingCuisineIdentity(recipe, preferredCuisine))
    .slice(0, input.recipeCount);
}

function filterGenericAnyCuisineRecipes(
  recipes: Recipe[],
  input: {
    recipeCount: number;
    requestId: string;
  }
) {
  return [...recipes]
    .sort((left, right) => Number(isGenericAnyCuisineRecipe(left)) - Number(isGenericAnyCuisineRecipe(right)))
    .slice(0, input.recipeCount);
}

function isGenericAnyCuisineRecipe(recipe: Recipe) {
  const display = normalizeCuisineIdentityText([
    recipe.name,
    recipe.localized?.English?.name,
    recipe.image_search_index,
    recipe.dish_intent?.dish_name
  ].filter(Boolean).join(" "));

  if (!display) return true;
  return /\b(generic|skillet|plate|bowl|power|lemon herb|garlic chicken|grilled salmon|salmon rice|chickpea tomato stew|chicken rice|rice and bean pantry)\b/u.test(display);
}

function hasStrongSpecificCuisineIdentity(recipe: Recipe, preferredCuisine: string, availableIngredients: string[]) {
  const displayHaystack = normalizeCuisineIdentityText([
    recipe.name,
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name
  ].filter(Boolean).join(" "));
  if (hasConflictingCuisineDisplaySignal(displayHaystack, preferredCuisine)) return false;
  if (isGenericSpecificCuisineDisplayName(displayHaystack) && !hasCuisineSpecificIdentitySignal(displayHaystack, preferredCuisine)) {
    return false;
  }

  const haystack = normalizeCuisineIdentityText([
    recipe.name,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.photo_identity?.dish_slug,
    recipe.photo_identity?.english_name,
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    recipe.localized?.English?.name,
    recipe.localized?.English?.dish_intent?.dish_name
  ].filter(Boolean).join(" "));

  if (!haystack) return false;
  const hasNamedCuisineSignal = hasCuisineSpecificIdentitySignal(haystack, preferredCuisine);
  if (!hasNamedCuisineSignal) return false;

  if (getSpecificCuisineDishAliases(preferredCuisine).some((alias) => identityTextIncludesAlias(haystack, alias))) {
    return true;
  }

  return resolveAuthenticCuisineDishes({
    cuisine: preferredCuisine,
    ingredients: [
      ...availableIngredients,
      ...(recipe.ingredients ?? []),
      ...(recipe.missing_ingredients ?? [])
    ],
    mealType: recipe.dish_intent?.meal_type
  }, 12).some((candidate) =>
    candidate.aliases
      .map(normalizeCuisineIdentityText)
      .filter((alias) => alias.length >= 4)
      .some((alias) => identityTextIncludesAlias(haystack, alias))
  );
}

function prioritizeNamedCuisineRecipes(
  recipes: Recipe[],
  preferredCuisine: string | undefined,
  limit: number
) {
  if (!preferredCuisine || preferredCuisine === "Any") return recipes.slice(0, limit);

  return recipes
    .map((recipe, index) => ({
      index,
      namedDishScore: getNamedDishSpecificityScore(recipe),
      recipe
    }))
    .sort((left, right) =>
      right.namedDishScore - left.namedDishScore || left.index - right.index
    )
    .map((entry) => entry.recipe)
    .slice(0, limit);
}

function isGenericSpecificCuisineDisplayName(displayHaystack: string) {
  return /\b(bowl|plate|skillet|tray|grain bowl|vegetable soup|herb tray|rice bowl|pasta skillet|mixed grill)\b/u.test(displayHaystack);
}

function hasConflictingCuisineDisplaySignal(displayHaystack: string, preferredCuisine: string) {
  if (!displayHaystack) return false;
  const preferred = normalizeCuisinePreference(preferredCuisine);
  const conflictingSignals: Record<string, string[]> = {
    egyptian: ["alexandrian", "egyptian", "hawawshi", "koshary", "molokhia", "sayadeya"],
    indian: ["baingan", "biryani", "chana", "dal", "gobi", "masala", "palak", "sambar", "tikka"],
    italian: ["arrabbiata", "caponata", "ciambotta", "italian", "margherita", "minestrone", "polenta", "ribollita"],
    japanese: ["japanese", "miso", "sushi", "tempura", "teriyaki"],
    mexican: ["caldo", "chile", "enchilada", "fajita", "fajitas", "huevos", "mexican", "mole", "pescado", "pozole", "sopa", "taco", "tinga", "tostada", "tostadas", "veracruzana"],
    middleeastern: ["fatteh", "hummus", "kibbeh", "maqluba", "mansaf", "middle eastern", "mujadara", "shawarma"],
    vietnamese: ["banh xeo", "pho", "vietnamese"],
    thai: ["gaeng", "goong", "krapow", "massaman", "pad thai", "panang", "pla ", "thai", "tom kha", "tom yum"],
    turkish: ["adana", "biber", "borek", "dolma", "izgara", "karniyarik", "kebab", "kofte", "lahmacun", "menemen", "patlican", "pide", "saksuka", "turkish"]
  };

  return Object.entries(conflictingSignals).some(([cuisine, signals]) => {
    if (cuisine === preferred) return false;
    return signals.some((signal) => identityTextIncludesAlias(displayHaystack, signal.trim()));
  });
}

function hasCuisineSpecificIdentitySignal(haystack: string, preferredCuisine: string) {
  const signals: Record<string, string[]> = {
    egyptian: ["alexandrian", "baladi", "basha", "egyptian", "fattah", "hawawshi", "kebda", "kofta", "koshary", "liver", "molokhia", "sayadeya"],
    indian: ["baingan", "biryani", "chana", "curry", "dal", "gobi", "indian", "masala", "palak", "rajma", "rasam", "saag", "sambar", "tadka", "tikka"],
    italian: [
      "alfredo", "arrabbiata", "bolognese", "cacciatore", "caponata", "carbonara", "ciambotta",
      "fagioli", "florentine", "italian", "margherita", "marsala", "melanzane", "minestrone",
      "norma", "parmesan", "parmigiana", "pesto", "piccata", "polenta", "pomodoro", "primavera",
      "ribollita", "risotto", "tuscan", "ألفريدو", "إيطالي", "إيطالية", "بارميزان", "بيستو",
      "بيكاتا", "بريمافيرا", "توسكاني", "كاتشاتوري", "مارسالا"
    ],
    mediterranean: ["briam", "caponata", "dolma", "fasolada", "gemista", "greek", "mediterranean", "moussaka", "ratatouille", "saganaki", "souvlaki"],
    mexican: ["caldo", "chilaquiles", "chile", "enchilada", "fajita", "fajitas", "huevos", "mexican", "mole", "pescado", "pozole", "quesadilla", "sopa", "taco", "tinga", "tostada", "tostadas", "veracruzana"],
    middleeastern: ["fatteh", "hummus", "kibbeh", "maqluba", "mansaf", "middle eastern", "mujadara", "shawarma", "tabbouleh"],
    thai: ["gaeng", "goong", "khao", "krapow", "larb", "massaman", "pad", "panang", "pla", "prik", "sen", "sticky rice", "thai", "tom kha", "tom yum", "woon", "yum"],
    turkish: ["adana", "biber", "borek", "dolma", "izgara", "karniyarik", "kebab", "kofte", "lahmacun", "menemen", "patlican", "pide", "saksuka", "turkish"]
  };
  const key = normalizeCuisinePreference(preferredCuisine);
  return (signals[key] ?? [key]).some((signal) => identityTextIncludesAlias(haystack, signal));
}

function identityTextIncludesAlias(haystack: string, alias: string) {
  if (!haystack || !alias) return false;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "u").test(haystack);
}

function getSpecificCuisineDishAliases(preferredCuisine: string) {
  const oneWordSignals = new Set([
    "arrabbiata",
    "biryani",
    "caponata",
    "chana",
    "ciambotta",
    "dal",
    "dolma",
    "fagioli",
    "gobi",
    "hawawshi",
    "kebda",
    "kofta",
    "koshary",
    "kofte",
    "liver",
    "menemen",
    "minestrone",
    "palak",
    "polenta",
    "pozole",
    "ribollita",
    "risotto",
    "sambar",
    "shawarma"
  ]);

  return [
    ...getManualSpecificCuisineDishAliases(preferredCuisine),
    ...(getCompleteCuisineCatalog(preferredCuisine) ?? [])
      .flatMap((dish) => [
      dish.id.replace(/-/g, " "),
      ...dish.names.english,
      ...dish.names.native,
      ...(dish.names.other ?? [])
      ])
  ]
    .map(normalizeCuisineIdentityText)
    .filter((alias) => alias.length >= 4)
    .filter((alias) => alias.includes(" ") || oneWordSignals.has(alias));
}

function getManualSpecificCuisineDishAliases(preferredCuisine: string) {
  const key = normalizeCuisinePreference(preferredCuisine);
  if (key === "egyptian") {
    return [
      "alexandrian kebda",
      "alexandrian liver",
      "egyptian kebda",
      "egyptian liver",
      "kebda eskandarani",
      "kebda sandwiches",
      "liver and rice",
      "liver sandwiches"
    ];
  }
  return [];
}

function normalizeCuisineIdentityText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const cleaned = normalizeDishRestrictionSynonyms(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(
      /\b(with|and|in|over|on|by|the|a|an|of|to|for|من|مع|و|في|على|إلى|الى|الـ|بال|طبق|وصفة|recipe|plate|dish|food)\b/giu,
      " "
    )
    .replace(/\b(egyptian|arabic|middle|eastern|mediterranean|masri|baladi)\b/giu, " ")
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
    const nameKey = buildNormalizedRecipeNameSignature(recipe.name) || normalizeDishRestrictionKey(recipe.name);
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

  // Broad family and structure keys are ranking signals, not reasons to
  // underfill a response. Once the strongest variety has been selected, keep
  // adding distinct dish identities even when they share a technique family.
  // addRecipe still rejects duplicate IDs and names in this relaxed pass.
  if (selected.length < recipeCount) {
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
  const candidateSource =
    recipe.dish_intent?.dish_name || buildRecipeDishFamilyKey(recipe) || recipe.name
  const candidate = buildNormalizedRecipeNameSignature(candidateSource) || normalizeDishRestrictionKey(candidateSource);

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
  return normalizeDishRestrictionSynonyms(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(any|food|dish|meal|plate|bowl|dinner|lunch|breakfast|snack|style|inspired|egyptian|arabic|middle eastern|mediterranean|masri|baladi)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDishRestrictionSynonyms(value: string) {
  return value
    .replace(/\u0641\u062a\u0629/giu, " fattah ")
    .replace(/\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e|\u0641\u0631\u062e\u0629?/giu, " chicken ")
    .replace(/\u0643\u0628\u062f(?:\u0629|\u0647)?/giu, " liver ")
    .replace(/\u0634\u0627\u0648\u0631\u0645\u0627/giu, " shawarma ")
    .replace(/\u0645\u0644\u0648\u062e\u064a\u0629/giu, " molokhia ")
    .replace(/\u0645\u0634\u0648\u064a(?:\u0629)?/giu, " grilled ")
    .replace(/\u0635\u064a\u0646\u064a\u0629/giu, " tray ")
    .replace(/\u0634\u0648\u0631\u0628\u0629|\u0634\u0631\u0628\u0629/giu, " soup ")
    .replace(/\u0623\u0631\u0632|\u0627\u0631\u0632/giu, " rice ")
    .replace(/\u062e\u0628\u0632|\u0639\u064a\u0634/giu, " bread ")
    .replace(/\u0628\u0635\u0644/giu, " onion ")
    .replace(/\u0637\u0645\u0627\u0637\u0645|\u0628\u0646\u062f\u0648\u0631\u0629/giu, " tomato ")
    .replace(/\u0645\u0635\u0631\u064a(?:\u0629)?|\u0628\u0644\u062f\u064a(?:\u0629)?/giu, " egyptian ");
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

function prioritizePantryUsageRecipes(
  recipes: Recipe[],
  availableIngredients: string[],
  recentRecipeMemory?: RecentRecipeMemory,
  inputCoveragePlan?: ReturnType<typeof createRecipeInputCoveragePlan>
) {
  const scored = recipes.map((recipe, index) => {
    const pantryUsage = getRecipePantryUsageStats(recipe, availableIngredients);
    return {
      anchorMatchCount: inputCoveragePlan
        ? getRecipeInputAnchorIds(recipe, inputCoveragePlan).length
        : 0,
      index,
      pantryUsage,
      recentPenalty: getRecentRecipeRepetitionPenalty(recipe, recentRecipeMemory),
      recipe
    };
  });
  return scored
    .sort((left, right) => {
      if (left.anchorMatchCount !== right.anchorMatchCount) {
        return right.anchorMatchCount - left.anchorMatchCount;
      }
      if (left.pantryUsage.ownedCount !== right.pantryUsage.ownedCount) {
        return right.pantryUsage.ownedCount - left.pantryUsage.ownedCount;
      }
      if (left.recentPenalty !== right.recentPenalty) {
        return left.recentPenalty - right.recentPenalty;
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
  const availableSet = buildPantryOwnershipSet(
    { inputIngredients: availableIngredients, normalizedIngredients: [] },
    normalizeIngredientForStrictMatch
  );
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
  return getMissingIngredientPurchaseWeight(normalized, availableIngredientCount);
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
  if (requiresSeparatePantryPurchase(normalizedIngredient)) return false;
  const ingredientProfile = getIngredientProfileForTerm(normalizedIngredient);
  if (ingredientProfile) {
    if (
      availableIngredients.has(ingredientProfile.id) ||
      availableIngredients.has(ingredientProfile.id.replace(/_/g, " ")) ||
      availableIngredients.has(normalizeIngredientForStrictMatch(ingredientProfile.canonicalEnglishName))
    ) {
      return true;
    }

    if (
      [
        ...ingredientProfile.aliases,
        ...ingredientProfile.synonyms,
        ...ingredientProfile.pluralForms,
        ...ingredientProfile.ocrMistakes,
        ...ingredientProfile.spellingMistakes
      ].some((alias) => availableIngredients.has(normalizeIngredientForStrictMatch(alias)))
    ) {
      return true;
    }
  }

  if (expandIngredientFamilies([normalizedIngredient]).some((candidate) => availableIngredients.has(candidate))) {
    return true;
  }

  for (const available of availableIngredients) {
    if (isSafeIngredientSubsetMatch(normalizedIngredient, available)) return true;
  }

  return false;
}

function isSafeIngredientSubsetMatch(recipeIngredient: string, availableIngredient: string) {
  if (
    requiresSeparatePantryPurchase(recipeIngredient) ||
    requiresSeparatePantryPurchase(availableIngredient)
  ) {
    return false;
  }

  return (
    (recipeIngredient.length >= 4 && availableIngredient.includes(recipeIngredient)) ||
    (availableIngredient.length >= 4 && recipeIngredient.includes(availableIngredient))
  );
}

function normalizeIngredientForStrictMatch(value: string) {
  const normalized = normalizeIngredientText(value)
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

  if (/\b(bell\s*pep+er|sweet\s+pep+er|capsicum)\b/i.test(normalized)) return "bell pepper";
  if (/\b(flatbread|pita|tortilla|lavash|naan|baladi\s+bread|wrap)\b/i.test(normalized)) return "bread";
  if (/\b(chicken\s+breast|chicken\s+thigh|chicken\s+leg|chicken\s+tender)\b/i.test(normalized)) return "chicken";
  if (requiresSeparatePantryPurchase(normalized)) return normalized;

  const profile = getIngredientProfileForTerm(normalized);
  if (profile) return profile.canonicalEnglishName;

  return isSparseGroundMeatSource(normalized) ? "ground meat" : normalized;
}

function hasRecipeConflictingCuisineIdentity(recipe: Recipe, preferredCuisine: string) {
  return hasConflictingCuisineDisplaySignal(normalizeCuisineIdentityText([
    recipe.name,
    recipe.dish_identity,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.photo_identity?.english_name,
    recipe.dish_intent?.dish_name,
    recipe.localized?.English?.name
  ].filter(Boolean).join(" ")), preferredCuisine);
}

function hasRecipeConflictingCuisineTitleIdentity(recipe: Recipe, preferredCuisine: string) {
  return hasConflictingCuisineDisplaySignal(normalizeCuisineIdentityText([
    recipe.name,
    recipe.dish_identity,
    recipe.dish_intent?.dish_name,
    recipe.localized?.English?.name
  ].filter(Boolean).join(" ")), preferredCuisine);
}

function countRecipesWithUsefulPantryCoverage(
  recipes: Recipe[],
  availableIngredients: string[],
  inputIngredientCount: number
) {
  const minimumOwnedIngredients = inputIngredientCount >= 2 ? 2 : 1;
  return recipes.filter((recipe) => {
    const usage = getRecipePantryUsageStats(recipe, availableIngredients);
    return usage.ownedCount >= minimumOwnedIngredients && (usage.isMainlyPantry || usage.ownedRatio >= 0.35);
  }).length;
}

function shouldReplaceResponseSourceSet(
  current: Recipe[],
  candidate: Recipe[],
  availableIngredients: string[],
  inputIngredientCount: number
) {
  if (!candidate.length) return false;
  if (!current.length) return true;

  const currentInputCoverage = countCoveredRequestedIngredients(current, availableIngredients);
  const candidateInputCoverage = countCoveredRequestedIngredients(candidate, availableIngredients);
  if (candidateInputCoverage !== currentInputCoverage) {
    return candidateInputCoverage > currentInputCoverage;
  }

  const currentCoverage = countRecipesWithUsefulPantryCoverage(
    current,
    availableIngredients,
    inputIngredientCount
  );
  const candidateCoverage = countRecipesWithUsefulPantryCoverage(
    candidate,
    availableIngredients,
    inputIngredientCount
  );

  if (candidateCoverage !== currentCoverage) {
    return candidateCoverage > currentCoverage;
  }

  return candidate.length > current.length;
}

function countCoveredRequestedIngredients(recipes: Recipe[], availableIngredients: string[]) {
  return availableIngredients.filter((ingredient) => {
    const evaluator = createRecipeIngredientCompatibilityEvaluator([ingredient]);
    return recipes.some((recipe) => evaluator.evaluateEvidence(recipe).compatible);
  }).length;
}

// Photo resolution is intentionally client-side for scanner responses so recipe
// cards are not held behind cache/provider latency.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function applyImageFirstRecipeRanking(
  recipes: Recipe[],
  availableIngredientCount = 0
) {
  const sparsePantryBonus = availableIngredientCount > 0 && availableIngredientCount <= 2 ? 1.35 : 1;
  const resolvedRecipes = await Promise.all(
    recipes.map(async (recipe, index) => {
      try {
        const resolvedPhoto = await resolveRecipePhotoCandidate(recipe, new Set());
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function selectPhotoRankingCandidates(recipes: Recipe[], recipeCount: number) {
  // Keep source retrieval broad for quality and variety, but only score enough
  // leading candidates to fill the visible card set with image-ready recipes.
  return recipes.slice(0, Math.max(recipeCount * 3, 30));
}

async function ensureUniqueRecipePhotos(recipes: Recipe[]) {
  const usedImageUrls = new Set<string>();
  const uniqueRecipes: Recipe[] = [];

  for (const recipe of recipes) {
    const currentImageUrl = recipe.image_url;
    if (
      isDurableRecipeImageUrl(currentImageUrl) &&
      !usedImageUrls.has(currentImageUrl) &&
      canKeepExistingRecipeImageUrl(recipe)
    ) {
      usedImageUrls.add(currentImageUrl);
      uniqueRecipes.push(recipe);
      continue;
    }

    try {
      const resolvedPhoto = await resolveRecipePhotoCandidate(recipe, usedImageUrls);
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

function canKeepExistingRecipeImageUrl(recipe: Recipe) {
  if (!isStrictVisualRecipePhotoRequest(recipe, collectRecipePhotoIdentities(recipe))) return true;
  return getStrictRecipePhotoRequestMainIngredientKeys(recipe, buildRecipePhotoQueriesForRanking(recipe)).size === 0;
}

function markProgressiveRecipeImages(recipes: Recipe[]) {
  return recipes.map((recipe) => {
    const placeholder = buildRecipeImagePlaceholder(recipe);
    if (isDurableRecipeImageUrl(recipe.image_url)) {
      return {
        ...recipe,
        image_error: false,
        image_loading: false,
        image_placeholder: placeholder
      };
    }

    return {
      ...recipe,
      image_attribution_name: undefined,
      image_attribution_url: undefined,
      image_error: true,
      image_loading: false,
      image_placeholder: placeholder,
      image_source: undefined,
      image_url: undefined
    };
  });
}

async function attachPhotosFromPublishedRecipeBundles(recipes: Recipe[], diets: string[]) {
  const recipesMissingReusablePhotos = recipes
    .filter((recipe) => !canReuseRecipePhotoForDiet(recipe, diets, true));
  const sourceRecipeIds = Array.from(new Set(recipesMissingReusablePhotos
    .map((recipe) => recipe.source_recipe_id ?? recipe.id)
    .filter((id): id is string => Boolean(id?.startsWith("shared-")))
  ));
  const exactTitleTokens = buildSharedRecipePhotoLinkSearchTokens(recipesMissingReusablePhotos.flatMap((recipe) => [
    recipe.name,
    recipe.localized?.English?.name,
    recipe.dish_intent?.dish_name
  ].filter((value): value is string => Boolean(value?.trim()))));
  const db = getAdminDb();
  const sharedRecipeCollection = db.collection(SHARED_RECIPE_V2_COLLECTION);
  const [sourceDocuments, exactTitleSnapshot] = await Promise.all([
    sourceRecipeIds.length
      ? db.getAll(
        ...sourceRecipeIds.map((id) => db.collection(SHARED_RECIPE_V2_COLLECTION).doc(id))
      ).catch((error) => {
        logger.warn("Bundled recipe photo source lookup failed", {
          errorMessage: error instanceof Error ? error.message : String(error),
          sourceRecipeCount: sourceRecipeIds.length
        });
        return [];
      })
      : [],
    exactTitleTokens.length
      ? sharedRecipeCollection
        .where("searchTokens", "array-contains-any", exactTitleTokens)
        .get()
        .catch((error) => {
          logger.warn("Bundled recipe photo title lookup failed", {
            errorMessage: error instanceof Error ? error.message : String(error),
            titleTokenCount: exactTitleTokens.length
          });
          return null;
        })
      : null
  ]);
  const directBundlesById = new Map<string, RecipeCatalogDoc>();
  sourceDocuments.forEach((document) => {
    if (!document.exists) return;
    directBundlesById.set(document.id, { ...document.data(), id: document.id } as RecipeCatalogDoc);
  });
  const exactTitleBundles = exactTitleSnapshot?.docs.map((document) => ({
    ...document.data(),
    id: document.id
  } as RecipeCatalogDoc)) ?? [];
  const publishedBundles = Array.from(new Map([
    ...getWarmSharedRecipeCacheSnapshot({ allowStale: true }),
    ...exactTitleBundles,
    ...directBundlesById.values()
  ].map((recipe) => [recipe.id, recipe])).values())
    .filter(isSharedRecipeV2Searchable);
  if (!publishedBundles.length) return recipes;

  const bundlesByIdentity = new Map<string, typeof publishedBundles>();
  publishedBundles.forEach((bundle) => {
    buildPublishedRecipeBundleKeys({
      cuisine: bundle.cuisine,
      names: [bundle.title, bundle.localized?.English?.name, bundle.dishIntent?.dish_name]
    }).forEach((key) => {
      const current = bundlesByIdentity.get(key) ?? [];
      current.push(bundle);
      bundlesByIdentity.set(key, current);
    });
  });

  const usedImageUrls = new Set<string>();
  return recipes.map((recipe) => {
    if (canReuseRecipePhotoForDiet(recipe, diets, true) && !usedImageUrls.has(recipe.image_url ?? "")) {
      if (recipe.image_url) usedImageUrls.add(recipe.image_url);
      return attachValidatedRecipePhotoAsset({
        ...recipe,
        image_source: "cache",
        photo_asset: recipe.photo_asset
          ? { ...recipe.photo_asset, source: "cache" }
          : recipe.photo_asset
      }, diets);
    }

    const sourceRecipeId = recipe.source_recipe_id ?? recipe.id;
    const directBundle = sourceRecipeId ? directBundlesById.get(sourceRecipeId) : undefined;
    const candidates = [
      ...(directBundle ? [directBundle] : []),
      ...buildPublishedRecipeBundleKeys({
      cuisine: recipe.cuisine,
      names: [recipe.name, recipe.localized?.English?.name, recipe.dish_intent?.dish_name]
      }).flatMap((key) => bundlesByIdentity.get(key) ?? [])
    ];
    const bundle = candidates.find((candidate) => {
      const imageUrl = candidate.image.thumbPath || candidate.image.storagePath;
      return imageUrl && !usedImageUrls.has(imageUrl);
    });
    if (!bundle) return attachValidatedRecipePhotoAsset(recipe, diets);

    const imageUrl = bundle.image.thumbPath || bundle.image.storagePath;
    const targetDietTags = recipe.photo_asset?.dietTags ?? [];
    const bundleDietTags = bundle.image.dietTags?.length ? bundle.image.dietTags : bundle.dietTags;
    const linked = attachValidatedRecipePhotoAsset({
      ...recipe,
      image_attribution_name: bundle.image.attributionName,
      image_attribution_url: bundle.image.attributionUrl,
      image_source: "cache",
      image_url: imageUrl,
      photo_asset: {
        attributionName: bundle.image.attributionName,
        attributionUrl: bundle.image.attributionUrl,
        dietTags: Array.from(new Set([...targetDietTags, ...bundleDietTags])),
        source: "cache",
        status: "ready",
        url: imageUrl,
        validatedAt: bundle.image.validatedAt,
        validatorHash: bundle.image.validatorHash
      }
    }, diets);
    if (linked.image_url) usedImageUrls.add(linked.image_url);
    return linked;
  });
}

function buildPublishedRecipeBundleKeys(input: {
  cuisine: string;
  names: Array<string | null | undefined>;
}) {
  const cuisine = toIdentityKey(input.cuisine);
  return Array.from(new Set(input.names.flatMap((name) => {
    if (!name?.trim()) return [];
    const normalizedName = toIdentityKey(name);
    const canonicalDishKey = buildRecipePhotoIdentity(name).canonicalDishKey;
    return [
      normalizedName ? `${cuisine}:${normalizedName}` : "",
      canonicalDishKey ? `${cuisine}:canonical:${canonicalDishKey}` : ""
    ].filter(Boolean);
  })));
}

function isRecipeLocalizationAcceptable(recipe: Recipe, recipeLanguage: string) {
  if (recipeLanguage.toLowerCase() !== "arabic") return true;
  const validation = validateArabicRecipeLocalization(recipe);
  if (!validation.valid) return false;
  const userFacingText = [
    recipe.name,
    recipe.cuisine,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps,
    recipe.cook_time,
    recipe.difficulty,
    ...(recipe.preference_hits ?? [])
  ].join(" ");
  if (/[A-Za-z]/.test(userFacingText)) return false;
  const arabic = recipe.localized?.Arabic;
  if (arabic?.name?.trim() && arabic.steps?.length && arabic.ingredients?.length) return true;
  return /[\u0600-\u06ff]/u.test(recipe.name) && recipe.steps.some((step) => /[\u0600-\u06ff]/u.test(step));
}

function getArabicRecipeEnglishLeakageFields(recipe: Recipe) {
  const fields: Array<[string, string]> = [
    ["name", recipe.name],
    ["cuisine", recipe.cuisine],
    ...recipe.ingredients.map((value, index) => [`ingredients.${index}`, value] as [string, string]),
    ...recipe.missing_ingredients.map((value, index) => [`missing_ingredients.${index}`, value] as [string, string]),
    ...recipe.steps.map((value, index) => [`steps.${index}`, value] as [string, string]),
    ["cook_time", recipe.cook_time],
    ["difficulty", recipe.difficulty],
    ...(recipe.preference_hits ?? []).map((value, index) => [`preference_hits.${index}`, value] as [string, string])
  ];

  return fields
    .filter(([, value]) => /[A-Za-z]/.test(value))
    .map(([field, value]) => ({ field, value }));
}

const CUSTOMER_FACING_RECIPE_CONTRACT_REASONS = new Set([
  "english_leakage_in_arabic",
  "forbidden_arabic_transliteration",
  "ingredient_only_title",
  "invalid_recipe_instructions",
  "malformed_recipe_title",
  "missing_instructions",
  "missing_title_or_cuisine",
  "title_does_not_describe_recipe"
]);

function getCustomerFacingRecipeContractViolations(recipe: Recipe, recipeLanguage: string) {
  const violations = recipeQualityGate
    .validate(recipe, recipeLanguage)
    .reasons
    .filter((reason) => CUSTOMER_FACING_RECIPE_CONTRACT_REASONS.has(reason));
  if (!isRecipeLocalizationAcceptable(recipe, recipeLanguage)) {
    violations.push("localization_not_acceptable");
  }
  return Array.from(new Set(violations));
}

function isCustomerFacingRecipeContractAcceptable(recipe: Recipe, recipeLanguage: string) {
  return getCustomerFacingRecipeContractViolations(recipe, recipeLanguage).length === 0;
}

function isTitleValidationReason(reason: string) {
  return reason === "ingredient_only_title" || reason === "title_does_not_describe_recipe" || reason === "missing_title_or_cuisine";
}

function isQuantityValidationReason(reason: string) {
  return reason.startsWith("ingredient_missing_quantity_or_unit") || reason.startsWith("protein_missing_quantity");
}

function inferValidationFailureReason(report: { after_diversity: number; after_quality_gate: number; after_quantity_validation: number; after_title_validation: number; database_found: number }) {
  if (report.database_found === 0) return "No source recipes matched the request.";
  if (report.after_title_validation === 0) return "Title validation rejected remaining recipes.";
  if (report.after_quantity_validation === 0) return "Quantity validation rejected remaining recipes.";
  if (report.after_quality_gate === 0) return "Quality gate rejected remaining recipes.";
  if (report.after_diversity === 0) return "Diversity validator removed remaining recipes.";
  return "No recipes could be returned after final validation.";
}

function buildRecipeImagePlaceholder(recipe: Recipe) {
  const cuisine = recipe.photo_identity?.cuisine_key || recipe.dish_intent?.cuisine || recipe.cuisine || "global";
  const method = recipe.photo_identity?.method || recipe.dish_intent?.cooking_method || "plated";
  return {
    label: `${recipe.name} ${method} plate`.replace(/\s+/g, " ").trim(),
    tone: toIdentityKey(cuisine) || "global"
  };
}

function collectRecipePhotoIdentities(recipe: Recipe) {
  return collectRecipePhotoTextCandidates(recipe)
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => buildRecipePhotoIdentity(value));
}

async function resolveRecipePhotoCandidate(
  recipe: Recipe,
  excludedUrls: Set<string> = new Set()
) {
  if (
    isDurableRecipeImageUrl(recipe.image_url) &&
    !excludedUrls.has(recipe.image_url) &&
    canKeepExistingRecipeImageUrl(recipe)
  ) {
    return {
      photoFitScore: 100,
      recipePatch: null as Partial<Recipe> | null
    };
  }

  const queries = buildRecipePhotoQueriesForRanking(recipe);
  const generatedCachedPhoto = await resolveGeneratedRecipePhotoCacheCandidate(recipe, queries, excludedUrls);
  if (generatedCachedPhoto) {
    return generatedCachedPhoto;
  }
  return { photoFitScore: 0, recipePatch: null as Partial<Recipe> | null };
}

async function resolveGeneratedRecipePhotoCacheCandidate(
  recipe: Recipe,
  queries: string[],
  excludedUrls: Set<string>
) {
  const recipePhotoTexts = collectRecipePhotoTextCandidates(recipe);
  const identities = recipePhotoTexts
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => buildRecipePhotoIdentity(value));
  const signatureCandidates = Array.from(new Set([
    ...identities.map((identity) => identity.signature),
    ...identities.map((identity) => `generated:${identity.canonicalDishKey}`).filter((value) => value !== "generated:"),
    ...identities.map((identity) => `generated:${identity.familyKey}`).filter((value) => value !== "generated:")
  ]));
  const queryCandidates = Array.from(new Set([
    ...queries,
    ...recipePhotoTexts
  ].filter((value): value is string => Boolean(value?.trim()))));

  let cached = await getSharedRecipePhotoByQueryOrSignature({
    queries: queryCandidates,
    signatures: signatureCandidates
  });
  const isChickenCandidate = isChickenRecipePhotoCandidate(recipe, queries);
  const isLiverCandidate = isLiverRecipePhotoCandidate(recipe, queries);
  const isShrimpCandidate = isShrimpRecipePhotoCandidate(recipe, queries);
  const requestedMainIngredientKeys = getStrictRecipePhotoRequestMainIngredientKeys(recipe, queries);
  const ingredientTexts = collectRecipePhotoIngredientTextCandidates(recipe);
  if (!isUsableSharedRecipePhotoCacheEntryForRecipe(cached, excludedUrls, {
    isChickenCandidate,
    isLiverCandidate,
    isShrimpCandidate,
    requestIdentityTexts: queryCandidates,
    requestedMainIngredientKeys
  })) {
    const approximateMainIngredientKeys = buildApproximateRecipePhotoMainIngredientKeys(
      identities,
      ingredientTexts,
      isLiverCandidate
    );
    const hasApproximateCategoryLookup =
      approximateMainIngredientKeys.length > 0 ||
      identities.some(hasRecipePhotoCategoryLookupKey);
    cached = hasApproximateCategoryLookup
      ? await getSharedRecipePhotoByApproximateCategory({
          allowProviderPhotos: true,
          canonicalDishKeys: identities.map((identity) => identity.canonicalDishKey),
          cookingMethodKeys: identities.map((identity) => identity.cookingMethodKey),
          cuisineKeys: identities.map((identity) => identity.cuisineKey),
          excludeImageUrls: Array.from(excludedUrls),
          familyKeys: identities.map((identity) => identity.familyKey),
          ingredientTexts,
          mainIngredientKeys: approximateMainIngredientKeys,
          mealTypeKeys: identities.map((identity) => identity.mealTypeKey),
          requestTexts: queryCandidates,
          sauceKeys: identities.map((identity) => identity.sauceKey),
          starchKeys: identities.map((identity) => identity.starchKey)
        })
      : null;
  }
  if (!isUsableSharedRecipePhotoCacheEntryForRecipe(cached, excludedUrls, {
    isChickenCandidate,
    isLiverCandidate,
    isShrimpCandidate,
    requestIdentityTexts: queryCandidates,
    requestedMainIngredientKeys
  }) && isLiverCandidate) {
    cached = await getSharedGeneratedRecipePhotoByCategory({
      allowProviderPhotos: true,
      cuisineKeys: identities.map((identity) => identity.cuisineKey),
      excludeImageUrls: Array.from(excludedUrls),
      familyKeys: identities.map((identity) => identity.familyKey),
      ingredientTexts,
      mainIngredientKey: "liver",
      requestTexts: queryCandidates
    });
  }
  if (!isUsableSharedRecipePhotoCacheEntryForRecipe(cached, excludedUrls, {
    isChickenCandidate,
    isLiverCandidate,
    isShrimpCandidate,
    requestIdentityTexts: queryCandidates,
    requestedMainIngredientKeys
  })) return null;

  return {
    photoFitScore: 80,
    recipePatch: {
      image_attribution_name: undefined,
      image_attribution_url: undefined,
      image_source: "cache" as const,
      image_url: cached.imageUrl
    } satisfies Partial<Recipe>
  };
}

function collectRecipePhotoTextCandidates(recipe: Recipe) {
  const localizedVariants = Object.values(recipe.localized ?? {});
  return [
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? []),
    recipe.name,
    ...localizedVariants.flatMap((variant) => [
      variant?.image_search_index,
      ...(variant?.image_search_indices ?? []),
      variant?.dish_intent?.dish_name,
      ...(variant?.dish_intent?.visual_keywords ?? []),
      variant?.name
    ])
  ];
}

function collectRecipePhotoIngredientTextCandidates(recipe: Recipe) {
  const localizedVariants = Object.values(recipe.localized ?? {});
  return Array.from(
    new Set(
      [
        ...(recipe.ingredients ?? []),
        ...(recipe.missing_ingredients ?? []),
        ...localizedVariants.flatMap((variant) => [
          ...(variant?.ingredients ?? []),
          ...(variant?.missing_ingredients ?? [])
        ])
      ]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function buildApproximateRecipePhotoMainIngredientKeys(
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>,
  ingredientTexts: string[],
  isLiverCandidate: boolean
) {
  const ingredientIdentities = ingredientTexts.map((ingredient) => buildRecipePhotoIdentity(ingredient));
  return Array.from(
    new Set(
      [
        isLiverCandidate ? "liver" : null,
        ...identities.map((identity) => identity.mainIngredientKey),
        ...ingredientIdentities.map((identity) => identity.mainIngredientKey)
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value && value !== "general" && value !== "food" && value !== "meal")
    )
  ).slice(0, 6);
}

function hasRecipePhotoCategoryLookupKey(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  return Boolean(
    identity.canonicalDishKey ||
      identity.familyKey ||
      identity.mealTypeKey ||
      identity.starchKey ||
      identity.sauceKey ||
      identity.cookingMethodKey
  );
}

function isUsableSharedRecipePhotoCacheEntry(
  entry: SharedRecipePhotoEntry | null,
  excludedUrls: Set<string>
): entry is SharedRecipePhotoEntry {
  if (!entry || !isDurableRecipeImageUrl(entry.imageUrl) || excludedUrls.has(entry.imageUrl)) return false;
  if (isKnownWeakRecipeProviderImageUrl(entry.imageUrl)) return false;
  return true;
}

function isUsableSharedRecipePhotoCacheEntryForRecipe(
  entry: SharedRecipePhotoEntry | null,
  excludedUrls: Set<string>,
  context: {
    isChickenCandidate: boolean;
    isLiverCandidate: boolean;
    isShrimpCandidate: boolean;
    requestIdentityTexts: string[];
    requestedMainIngredientKeys: Set<string>;
  }
): entry is SharedRecipePhotoEntry {
  if (!isUsableSharedRecipePhotoCacheEntry(entry, excludedUrls)) return false;
  if (!isSharedRecipePhotoEntryCompatibleWithMainIngredients(entry, context.requestedMainIngredientKeys, context.requestIdentityTexts)) return false;
  if (context.isChickenCandidate && !isChickenRecipePhotoCacheEntry(entry)) return false;
  if (context.isLiverCandidate && !isLiverRecipePhotoCacheEntry(entry)) return false;
  if (context.isShrimpCandidate && !isShrimpRecipePhotoCacheEntry(entry)) return false;
  return true;
}

function getStrictRecipePhotoRequestMainIngredientKeys(recipe: Recipe, queries: string[]) {
  const keys = collectRecipePhotoMainIngredientKeys([
    ...collectRecipePhotoTextCandidates(recipe),
    ...queries
  ]);

  if (isChickenRecipePhotoCandidate(recipe, queries)) keys.add("chicken");
  if (isShrimpRecipePhotoCandidate(recipe, queries)) keys.add("shrimp");
  if (isLiverRecipePhotoCandidate(recipe, queries)) keys.add("liver");
  if (isEggSparseIngredientSource(getRecipeSparseIngredientIdentityText(recipe))) keys.add("egg");
  if (isFavaSparseIngredientSource(getRecipeSparseIngredientIdentityText(recipe))) keys.add("bean");

  return keys;
}

function isSharedRecipePhotoEntryCompatibleWithMainIngredients(
  entry: SharedRecipePhotoEntry,
  requestedMainIngredientKeys: Set<string>,
  requestIdentityTexts: string[]
) {
  if (!requestedMainIngredientKeys.size) return true;
  if (isSharedRecipePhotoEntryCompatibleByNamedPlate(entry, requestIdentityTexts)) return true;
  const cacheKeys = collectRecipePhotoMainIngredientKeys([entry.query, entry.signature]);
  if (!cacheKeys.size) return false;
  for (const requestedKey of requestedMainIngredientKeys) {
    if (cacheKeys.has(requestedKey)) return true;
    if (requestedKey === "seafood" && (cacheKeys.has("fish") || cacheKeys.has("shrimp"))) return true;
    if ((requestedKey === "fish" || requestedKey === "shrimp") && cacheKeys.has("seafood")) return true;
    if (requestedKey === "bean" && (cacheKeys.has("chickpea") || cacheKeys.has("lentil"))) return true;
  }
  return false;
}

function isSharedRecipePhotoEntryCompatibleByNamedPlate(entry: SharedRecipePhotoEntry, requestIdentityTexts: string[]) {
  const requestIdentities = requestIdentityTexts.map((value) => buildRecipePhotoIdentity(value));
  const cacheIdentities = [entry.query, entry.signature]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => buildRecipePhotoIdentity(value));

  return cacheIdentities.some((cacheIdentity) =>
    requestIdentities.some((requestIdentity) => {
      if (
        cacheIdentity.canonicalDishKey &&
        requestIdentity.canonicalDishKey &&
        cacheIdentity.canonicalDishKey === requestIdentity.canonicalDishKey
      ) {
        return true;
      }
      return Boolean(
        cacheIdentity.familyKey &&
          requestIdentity.familyKey &&
          cacheIdentity.familyKey === requestIdentity.familyKey &&
          (!cacheIdentity.mainIngredientKey ||
            !requestIdentity.mainIngredientKey ||
            cacheIdentity.mainIngredientKey === requestIdentity.mainIngredientKey)
      );
    })
  );
}

function collectRecipePhotoMainIngredientKeys(values: Array<string | null | undefined>) {
  const keys = new Set<string>();
  for (const value of values) {
    if (!value?.trim()) continue;
    const identity = buildRecipePhotoIdentity(value);
    if (identity.mainIngredientKey && !isGenericRecipePhotoMainIngredientKey(identity.mainIngredientKey)) {
      keys.add(identity.mainIngredientKey);
    }
  }
  return keys;
}

function isGenericRecipePhotoMainIngredientKey(value: string) {
  return value === "general" || value === "food" || value === "meal";
}

function isChickenRecipePhotoCandidate(recipe: Recipe, queries: string[]) {
  return [
    ...collectRecipePhotoTextCandidates(recipe),
    ...queries
  ].filter((value): value is string => typeof value === "string")
    .some(isChickenSparseIngredientSource);
}

function isChickenRecipePhotoCacheEntry(entry: SharedRecipePhotoEntry) {
  const text = normalizeRecipePhotoCacheLookupText([entry.query, entry.signature].filter(Boolean).join(" "));
  if (!isChickenSparseIngredientSource(text)) return false;
  return !/(?:\b(?:kofta|kafta|kofte|kefta|meatball|meatballs|beef|lamb|meat|kebab|shrimp|prawn|fish|salmon|tilapia|anchovy|hamsi|pescado|samke|black\s+bean|bean\s+taco|chile\s+relleno)\b|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0644\u062d\u0645|\u0633\u0645\u0643|\u062c\u0645\u0628\u0631\u064a)/iu.test(text);
}

function isShrimpRecipePhotoCandidate(recipe: Recipe, queries: string[]) {
  return [
    ...collectRecipePhotoTextCandidates(recipe),
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    ...queries
  ].filter((value): value is string => typeof value === "string")
    .some(isShrimpIngredientText);
}

function isShrimpRecipePhotoCacheEntry(entry: SharedRecipePhotoEntry) {
  const text = normalizeRecipePhotoCacheLookupText([entry.query, entry.signature].filter(Boolean).join(" "));
  if (!isShrimpIngredientText(text)) return false;
  return !/(?:\b(?:kofta|kafta|kofte|kefta|meatball|meatballs|beef|lamb|meat|kebab|fish|salmon|tilapia|anchovy|hamsi|pescado|samke)\b|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0644\u062d\u0645|\u0633\u0645\u0643)/iu.test(text);
}

function isLiverRecipePhotoCandidate(recipe: Recipe, queries: string[]) {
  return [
    ...collectRecipePhotoTextCandidates(recipe),
    ...(recipe.ingredients ?? []),
    ...(recipe.missing_ingredients ?? []),
    ...queries
  ].filter((value): value is string => typeof value === "string")
    .some((value) => /\b(liver|kebda|kibda|ciger|cigeri|kaleji|higado|fegato)\b|\u0643\u0628\u062f(?:\u0629|\u0647)?/iu.test(value));
}

function isLiverRecipePhotoCacheEntry(entry: SharedRecipePhotoEntry) {
  return /\b(liver|kebda|kibda|ciger|cigeri|kaleji|higado|fegato)\b|\u0643\u0628\u062f(?:\u0629|\u0647)?/iu.test(
    [entry.query, entry.signature].filter(Boolean).join(" ")
  );
}

function normalizeRecipePhotoCacheLookupText(value: string) {
  return value
    .toLowerCase()
    .replace(/\bfarakh\b/g, "chicken")
    .replace(/\bfarkh\b/g, "chicken")
    .replace(/\bpollo\b/g, "chicken")
    .replace(/\btavuk\b/g, "chicken")
    .replace(/\bgai\b/g, "chicken")
    .replace(/\bmurgh\b/g, "chicken")
    .replace(/\bfried?\s+shrimp\b/g, "shrimp")
    .replace(/\bshrimp\s+kabsa\b/g, "shrimp kabsa")
    .replace(/\bgambari\b/g, "shrimp")
    .replace(/\bgoong\b/g, "shrimp")
    .replace(/\bgamberi\b/g, "shrimp")
    .replace(/\bcamarones\b/g, "shrimp");
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

function getVisualMatchLabel(score: number, index: number, topScore: number) {
  if (score <= 0) return undefined;
  if (index === 0 && topScore >= 8) return "Best visual match";
  if (index === 0 && topScore >= 5) return "Top image match";
  if (index > 0 && score >= 8 && score >= topScore - 1) return "Strong visual match";
  return undefined;
}

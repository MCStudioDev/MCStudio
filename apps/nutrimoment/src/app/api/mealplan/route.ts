import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { PromptBuilder } from "@/ai/PromptBuilder";
import { USE_MOCK, callOpenAIText, ensureAiAvailable, extractJson, getClientFacingAiErrorMessage, isTransientModelError } from "@/lib/openai";
import { normalizeMealPlanData, sanitizeMealPlanForFirestore } from "@/lib/mealPlan";
import {
  accessErrorResponse,
  accessPayload,
  canUseApiFeature,
  consumeFreeAiCredit,
  isFirebaseTransientError
} from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { logger } from "@/lib/logger";
import { buildMealPlanData, reconcileShoppingListWithPantry } from "@/services/mealPlanService";
import { mapCatalogRecipeToMeal, searchCatalogRecipes } from "@/services/recipeSearchService";
import { repairMealPlanWithGuard, summarizeMealPlanIssues, validateMealPlan } from "@/services/mealPlanGuardService";
import { normalizeCuisineLabel } from "@/lib/cuisines";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import { isArabicRecipeLanguage, localizeMealPlanForArabic } from "@/lib/arabicRecipeLocalization";
import { normalizePhotoIdentity, toIdentityKey } from "@/lib/photoIdentityBuilders";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { buildMealPlanPreferenceSignature } from "@/lib/mealPlanPreferenceSignature";
import { ensureDetailedMealPlanSteps } from "@/lib/recipeStepDetails";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { RecipeCatalogDoc } from "@/lib/domain";
import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";
import {
  findIngredientDietViolation,
  findRecipeDietViolation,
  type DietEnforcementContext
} from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";

export const runtime = "nodejs";
export const maxDuration = 90;

const requestSchema = z.object({
  prompt: z.string().min(20).optional(),
  pantry: z.array(z.string()).optional(),
  pantryItems: z.array(z.object({ name: z.string(), quantity: z.string().optional() })).optional(),
  uiLanguage: z.string().optional(),
  preferredCuisine: z.string().optional(),
  calorieTarget: z.number().optional(),
  diets: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
  historyEntryId: z.string().optional(),
  historyIngredients: z.array(z.string()).optional(),
  historyTitle: z.string().optional(),
  persistResult: z.boolean().optional()
});

const MOCK_MEAL_PLAN = {
  plan: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => ({
    day,
    breakfast: {
      name: "Greek yogurt with berries and granola",
      calories: 380,
      protein: "20g",
      carbs: "45g",
      fat: "10g",
      ingredients: ["greek yogurt", "berries", "granola"],
      steps: ["Spoon yogurt into a bowl.", "Top with berries.", "Finish with granola and serve."]
    },
    lunch: {
      name: "Quinoa salad with grilled chicken",
      calories: 520,
      protein: "38g",
      carbs: "55g",
      fat: "16g",
      ingredients: ["quinoa", "grilled chicken", "greens", "olive oil"],
      steps: ["Cook the quinoa until fluffy.", "Season and grill the chicken.", "Slice the chicken and toss with quinoa and greens.", "Dress lightly and serve."]
    },
    dinner: {
      name: "Salmon with roasted vegetables",
      calories: 580,
      protein: "42g",
      carbs: "30g",
      fat: "26g",
      ingredients: ["salmon fillets", "asparagus", "sweet potato", "olive oil", "lemon"],
      steps: ["Heat the oven and prep the vegetables.", "Roast the vegetables until almost tender.", "Add the salmon and bake until it flakes easily.", "Finish with lemon before serving."]
    }
  })),
  shoppingList: [
    "Greek yogurt - 14 cup",
    "Mixed berries - 7 cup",
    "Granola - 3.5 cup",
    "Quinoa - 7 cup",
    "Chicken breast - 7 lb",
    "Salmon fillets - 7 fillet",
    "Asparagus - 7 bunch",
    "Sweet potato - 7 whole",
    "Lemon - 7 whole",
    "Olive oil - 14 tbsp"
  ]
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let failureHistoryEntryId: string | undefined;
  let failureUid: string | undefined;
  logger.info("Meal plan HTTP request received", { requestId });
  try {
    const accessCheck = await canUseApiFeature(request, "weekly_plan");
    const access = accessCheck.access;
    if (!access.isPremium && !access.isAdmin) {
      return Response.json(
        {
          error: "Weekly meal plans are a premium feature.",
          access: accessPayload(access)
        },
        { status: 403 }
      );
    }
    const rl = applyRateLimit({
      uid: access.uid,
      feature: "meal_plan",
      isPremium: access.isPremium,
      bypass: access.isAdmin
    });
    if (!rl.decision.allowed) {
      return rateLimitedResponse(rl.decision, rl.config);
    }
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    failureHistoryEntryId = parsed.data.historyEntryId;
    failureUid = access.uid;
    const recipeLanguage = recipeLanguageFromUiLanguage(normalizePilotLanguage(parsed.data.uiLanguage, "en"));

    if (!accessCheck.allowed) {
      return Response.json(
        {
          error: "Your 3 free weekly meal plans are used. Upgrade to premium for more weekly planning.",
          access: accessPayload(access)
        },
        { status: 402 }
      );
    }

    const nextAccess = await consumeFreeAiCredit(access, "weekly_plan");
    const pantryItems = parsed.data.pantryItems ?? [];
    const pantry = parsed.data.pantry ?? (pantryItems.length ? pantryItems.map((item) => item.name) : extractPantryFromPrompt(parsed.data.prompt ?? ""));
    // Server-side diet/allergen gate for meal-plan output. Any slot the AI
    // returns that violates the user's diet or allergen settings is repaired
    // into a real safe meal. Replacements may add missing ingredients to the
    // shopping list; pantry-only planning is less important than not showing
    // placeholders or unsafe meals.
    const dietContext: DietEnforcementContext = {
      diets: parsed.data.diets ?? [],
      allergens: parsed.data.allergens ?? []
    };
    const rawPantryStock = pantryItems.length ? pantryItems : pantry.map((name) => ({ name, quantity: "1" }));
    const pantryStock = rawPantryStock.filter((item) => !findIngredientDietViolation(item.name, dietContext));
    const ignoredPantryItems = rawPantryStock.filter((item) => findIngredientDietViolation(item.name, dietContext));
    const dietCompatiblePantry = pantryStock.map((item) => item.name);
    if (ignoredPantryItems.length) {
      logger.info("Meal plan ignored pantry items that conflict with selected diet/allergen rules", {
        requestId,
        ignoredPantryItems: ignoredPantryItems.map((item) => item.name),
        diets: dietContext.diets,
        allergens: dietContext.allergens
      });
    }
    const mealPlanGuardPreferences = {
      dietContext,
      conditions: parsed.data.conditions ?? [],
      preferredCuisine: parsed.data.preferredCuisine,
      maxMealRepeatCount: 2,
      minUniqueMeals: 15,
      minPescatarianSeafoodSlots: 6
    };
    const preferenceSignature = buildMealPlanPreferenceSignature({
      allergens: parsed.data.allergens ?? [],
      calorieTarget: parsed.data.calorieTarget,
      conditions: parsed.data.conditions ?? [],
      diets: parsed.data.diets ?? [],
      preferredCuisine: parsed.data.preferredCuisine,
      uiLanguage: parsed.data.uiLanguage
    });
    const repairMealPlanSlots = (plan: MealPlanData, stage: string, replacementRecipes: RecipeCatalogDoc[] = []): MealPlanData => {
      let repairCount = 0;
      let dietViolationCount = 0;
      let healthViolationCount = 0;
      let cuisineRepairCount = 0;
      let placeholderCount = 0;
      let catalogReplacementCount = 0;
      let defaultReplacementCount = 0;
      const usedReplacementNames = new Set<string>();
      const replacementMeals: MealPlanMeal[] = [];
      const cuisineAlignedReplacements = getCuisineAlignedRecipes(replacementRecipes, parsed.data.preferredCuisine);
      const cleaned = {
        ...plan,
        plan: plan.plan.map((day) => {
          const dayWithCleanedSlots = { ...day };
          for (const slot of ["breakfast", "lunch", "dinner"] as const) {
            const meal = day[slot];
            if (!meal) continue;
            const violation = findRecipeDietViolation(meal, dietContext);
            const healthViolation = findRecipeHealthViolation(meal, parsed.data.conditions ?? []);
            const placeholder = isPlaceholderMeal(meal);
            const cuisineMismatch = !mealMatchesPreferredCuisine(meal, parsed.data.preferredCuisine);
            if (violation || healthViolation || placeholder || cuisineMismatch) {
              repairCount += 1;
              if (violation) dietViolationCount += 1;
              if (healthViolation) healthViolationCount += 1;
              if (placeholder) placeholderCount += 1;
              if (cuisineMismatch) cuisineRepairCount += 1;
              const replacement = buildSafeMealReplacement({
                dietContext,
                recipeLanguage,
                preferredCuisine: parsed.data.preferredCuisine,
                conditions: parsed.data.conditions ?? [],
                replacementRecipes: cuisineAlignedReplacements.length ? cuisineAlignedReplacements : replacementRecipes,
                slot,
                usedReplacementNames
              });
              if (replacement.source === "catalog") catalogReplacementCount += 1;
              if (replacement.source === "default") defaultReplacementCount += 1;
              replacementMeals.push(replacement.meal);
              dayWithCleanedSlots[slot] = replacement.meal;
            }
          }
          return dayWithCleanedSlots;
        })
      };
      if (repairCount > 0) {
        const expandedShoppingList = addMealIngredientsToShoppingList(cleaned.shoppingList, replacementMeals);
        logger.warn("Meal plan slot guard repaired meal slots", {
          requestId,
          stage,
          repairCount,
          dietViolationCount,
          healthViolationCount,
          cuisineRepairCount,
          placeholderCount,
          catalogReplacementCount,
          defaultReplacementCount
        });
        return {
          ...cleaned,
          shoppingList: expandedShoppingList
        };
      }
      return cleaned;
    };
    const applyFinalMealPlanGuard = (plan: MealPlanData, stage: string): MealPlanData => {
      const result = repairMealPlanWithGuard(plan, mealPlanGuardPreferences);

      if (result.initialIssues.length || result.finalIssues.length) {
        logger.warn("Meal plan final guard evaluated generated plan", {
          requestId,
          stage,
          repairedSlots: result.repairedSlots,
          initialIssueSummary: summarizeMealPlanIssues(result.initialIssues),
          finalIssueSummary: summarizeMealPlanIssues(result.finalIssues)
        });
      }

      return result.mealPlan;
    };
    const repairMealPlanWithAiIfNeeded = async (plan: MealPlanData): Promise<MealPlanData> => {
      const issues = validateMealPlan(plan, mealPlanGuardPreferences);
      if (!issues.length) return plan;

      logger.info("Meal plan needs AI repair pass before fallback guard", {
        requestId,
        issueSummary: summarizeMealPlanIssues(issues)
      });

      try {
        const repairText = await callOpenAIText(
          PromptBuilder.mealPlanRepair({
            pantry: dietCompatiblePantry,
            pantryItems: pantryStock,
            diets: parsed.data.diets ?? [],
            conditions: parsed.data.conditions ?? [],
            recipeLanguage,
            preferredCuisine: parsed.data.preferredCuisine,
            calorieTarget: parsed.data.calorieTarget,
            allergens: parsed.data.allergens ?? [],
            mealPlan: plan,
            issues
          })
        );
        const repairJson = extractJson(repairText);
        const rawRepairPlan = JSON.parse(repairJson);
        const normalizedRepairPlan = normalizeMealPlanData(rawRepairPlan);
        if (!normalizedRepairPlan) {
          logger.warn("Meal plan AI repair response was not a usable plan", {
            requestId,
            preview: repairJson.slice(0, 600)
          });
          return plan;
        }

        const repairedWithShoppingList = {
          ...normalizedRepairPlan,
          shoppingList: reconcileShoppingListWithPantry(normalizedRepairPlan.shoppingList, pantryStock)
        };
        const repairedIssues = validateMealPlan(repairedWithShoppingList, mealPlanGuardPreferences);
        logger.info("Meal plan AI repair pass completed", {
          requestId,
          beforeIssueSummary: summarizeMealPlanIssues(issues),
          afterIssueSummary: summarizeMealPlanIssues(repairedIssues)
        });

        return repairedIssues.length <= issues.length ? repairedWithShoppingList : plan;
      } catch (repairError) {
        logger.warn("Meal plan AI repair pass failed; continuing to fallback guard", {
          requestId,
          errorMessage: repairError instanceof Error ? repairError.message : String(repairError),
          issueSummary: summarizeMealPlanIssues(issues)
        });
        return plan;
      }
    };

    if (USE_MOCK) {
      const mockPlan = repairMealPlanSlots(
        { ...MOCK_MEAL_PLAN, servedFrom: "mock" as const },
        "mock"
      );
      const guardedMockPlan = applyFinalMealPlanGuard(mockPlan, "mock_final");
      const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
      const outputMockPlan = ensureDetailedMealPlanSteps(
        wantsArabic ? localizeMealPlanForArabic(guardedMockPlan) : guardedMockPlan,
        wantsArabic ? "Arabic" : "English"
      );
      queueMealPlanCachePersist({
        uid: access.uid,
        recipeLanguage,
        meals: outputMockPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]),
        recipes: outputMockPlan.recommendedRecipes,
        dietContext
      });
      await persistMealPlanResultForUser({
        historyEntryId: parsed.data.historyEntryId,
        historyIngredients: parsed.data.historyIngredients ?? dietCompatiblePantry,
        historyTitle: parsed.data.historyTitle,
        mealPlan: outputMockPlan,
        preferenceSignature,
        persistResult: parsed.data.persistResult,
        uid: access.uid
      });
      return Response.json({ result: JSON.stringify({ ...outputMockPlan, preferenceSignature }), access: accessPayload(nextAccess) });
    }

    const searchResult = await searchCatalogRecipes({
      ingredients: dietCompatiblePantry,
      preferredCuisine: parsed.data.preferredCuisine,
      calorieTarget: parsed.data.calorieTarget,
      diets: parsed.data.diets,
      conditions: parsed.data.conditions,
      allergens: parsed.data.allergens,
      maxResults: 21,
      recipeLanguage,
      uid: access.uid
    });

    const rankedRecipeMap = new Map(searchResult.candidateRecipes.map((recipe) => [recipe.id, recipe]));
    const orderedRankedRecipes = searchResult.rankedRecipeIds
      .map((recipeId) => rankedRecipeMap.get(recipeId))
      .filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe));
    const rankedCatalogRecipes = orderedRankedRecipes.length
      ? orderedRankedRecipes
      : searchResult.candidateRecipes;
    const cuisineAlignedCatalogRecipes = getCuisineAlignedRecipes(rankedCatalogRecipes, parsed.data.preferredCuisine);
    const catalogRecipes = cuisineAlignedCatalogRecipes.length ? cuisineAlignedCatalogRecipes : rankedCatalogRecipes;

    try {
      ensureAiAvailable();
      const text = await callOpenAIText(
        PromptBuilder.mealPlan({
          pantry: dietCompatiblePantry,
          pantryItems: pantryStock,
          diets: parsed.data.diets ?? [],
          conditions: parsed.data.conditions ?? [],
          recipeLanguage,
          preferredCuisine: parsed.data.preferredCuisine,
          calorieTarget: parsed.data.calorieTarget,
          allergens: parsed.data.allergens ?? []
        })
      );
      const json = extractJson(text);
      const rawMealPlan = JSON.parse(json);
      const aiMealPlan = normalizeMealPlanData(rawMealPlan);

      if (aiMealPlan) {
        const reconciledShoppingList = reconcileShoppingListWithPantry(aiMealPlan.shoppingList, pantryStock);
        const aiRepairedMealPlan = await repairMealPlanWithAiIfNeeded({
          ...aiMealPlan,
          shoppingList: reconciledShoppingList
        });
        const reconciledMealPlan = repairMealPlanSlots(
          aiRepairedMealPlan,
          "ai_mealplan",
          catalogRecipes
        );
        const guardedMealPlan = applyFinalMealPlanGuard(reconciledMealPlan, "ai_mealplan_final");
        const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
        const outputMealPlan = ensureDetailedMealPlanSteps(
          wantsArabic ? localizeMealPlanForArabic(guardedMealPlan) : guardedMealPlan,
          wantsArabic ? "Arabic" : "English"
        );
        queueMealPlanCachePersist({
          uid: access.uid,
          recipeLanguage,
          meals: outputMealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]),
          recipes: outputMealPlan.recommendedRecipes,
          dietContext
        });
        await persistMealPlanResultForUser({
          historyEntryId: parsed.data.historyEntryId,
          historyIngredients: parsed.data.historyIngredients ?? dietCompatiblePantry,
          historyTitle: parsed.data.historyTitle,
          mealPlan: outputMealPlan,
          preferenceSignature,
          persistResult: parsed.data.persistResult,
          uid: access.uid
        });
        logger.info("Meal plan served from Gemini fallback AI", {
          days: outputMealPlan.plan.length,
          shoppingItems: outputMealPlan.shoppingList.length,
          shoppingItemsBeforeReconcile: aiMealPlan.shoppingList.length
        });
        return Response.json({
          result: JSON.stringify({ ...outputMealPlan, preferenceSignature, servedFrom: "fallback_ai" }),
          servedFrom: "fallback_ai",
          access: accessPayload(nextAccess)
        });
      }

      logger.warn("Premium meal plan AI response was not usable; using shared-pool fallback", {
        topLevelType: Array.isArray(rawMealPlan) ? "array" : typeof rawMealPlan,
        keys: rawMealPlan && typeof rawMealPlan === "object" && !Array.isArray(rawMealPlan) ? Object.keys(rawMealPlan).slice(0, 10) : [],
        preview: json.slice(0, 600)
      });
    } catch (aiError) {
      logger.error("Premium meal plan API failed; using shared-pool fallback", aiError);
    }

    if (!catalogRecipes.length) {
      return Response.json(
        {
          error: "The shared recipe pool is empty right now, so no fallback meal plan is available.",
          access: accessPayload(nextAccess)
        },
        { status: 503 }
      );
    }

    const emergencyMealPlan = repairMealPlanSlots(
      {
        ...buildMealPlanData(catalogRecipes, pantryStock),
        servedFrom: "shared_pool" as const
      },
      "catalog_emergency",
      catalogRecipes
    );
    const guardedEmergencyMealPlan = applyFinalMealPlanGuard(emergencyMealPlan, "catalog_emergency_final");
    const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
    const outputEmergencyMealPlan = ensureDetailedMealPlanSteps(
      wantsArabic ? localizeMealPlanForArabic(guardedEmergencyMealPlan) : guardedEmergencyMealPlan,
      wantsArabic ? "Arabic" : "English"
    );
    queueMealPlanCachePersist({
      uid: access.uid,
      recipeLanguage,
      meals: outputEmergencyMealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]),
      recipes: outputEmergencyMealPlan.recommendedRecipes,
      dietContext
    });
    await persistMealPlanResultForUser({
      historyEntryId: parsed.data.historyEntryId,
      historyIngredients: parsed.data.historyIngredients ?? dietCompatiblePantry,
      historyTitle: parsed.data.historyTitle,
      mealPlan: outputEmergencyMealPlan,
      preferenceSignature,
      persistResult: parsed.data.persistResult,
      uid: access.uid
    });
    logger.info("Meal plan served from shared recipe pool after AI failure", {
      days: outputEmergencyMealPlan.plan.length,
      shoppingItems: outputEmergencyMealPlan.shoppingList.length
    });
    return Response.json({
      result: JSON.stringify({ ...outputEmergencyMealPlan, preferenceSignature }),
      servedFrom: "shared_pool",
      fallbackNotice: "The premium AI meal plan service was unavailable, so we used recipes from the shared recipe pool.",
      access: accessPayload(nextAccess)
    });
  } catch (err) {
    if (
      isFirebaseTransientError(err) ||
      (err instanceof Error && (err.message.includes("Sign in") || err.message.includes("Firebase Admin credentials")))
    ) {
      logger.warn("Meal plan request failed during access checks", {
        requestId,
        errorMessage: err instanceof Error ? err.message : String(err)
      });
      return accessErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : "Meal plan generation failed";
    const status = message.includes("GEMINI_API_KEY") ? 503 : isTransientModelError(err) ? 503 : 500;
    const safeMessage = isTransientModelError(err)
      ? getClientFacingAiErrorMessage(err, "Meal plan generation is temporarily unavailable. Please try again in a few minutes.")
      : message;
    logger.error("Meal plan generation failed", err, { requestId });
    await persistMealPlanFailureForUser({
      errorMessage: safeMessage,
      historyEntryId: failureHistoryEntryId,
      uid: failureUid
    });
    return Response.json({ error: safeMessage }, { status });
  }
}

function extractPantryFromPrompt(prompt: string): string[] {
  const match = prompt.match(/pantry items:\s*(.+?)\./i);
  if (!match?.[1]) return [];
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

function getCuisineAlignedRecipes(recipes: RecipeCatalogDoc[], preferredCuisine?: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return recipes;
  return recipes.filter((recipe) => catalogRecipeMatchesPreferredCuisine(recipe, preferredCuisine));
}

function catalogRecipeMatchesPreferredCuisine(recipe: RecipeCatalogDoc, preferredCuisine: string) {
  const preferred = normalizeCuisineLabel(preferredCuisine);
  return (
    normalizeCuisineLabel(recipe.cuisine) === preferred ||
    (recipe.regionalCuisines ?? []).some((cuisine) => normalizeCuisineLabel(cuisine) === preferred) ||
    normalizeCuisineLabel(recipe.localized?.English?.cuisine ?? "") === preferred
  );
}

function mealMatchesPreferredCuisine(meal: MealPlanMeal, preferredCuisine?: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return true;
  return normalizeCuisineLabel(meal.cuisine ?? "") === normalizeCuisineLabel(preferredCuisine);
}

function buildSafeMealReplacement({
  dietContext,
  conditions,
  recipeLanguage,
  preferredCuisine,
  replacementRecipes,
  slot,
  usedReplacementNames
}: {
  dietContext: DietEnforcementContext;
  conditions: string[];
  recipeLanguage: string;
  preferredCuisine?: string;
  replacementRecipes: RecipeCatalogDoc[];
  slot: "breakfast" | "lunch" | "dinner";
  usedReplacementNames: Set<string>;
}): { meal: MealPlanMeal; source: "catalog" | "default" } {
  const selectedRecipe =
    pickSafeReplacementRecipe(replacementRecipes, slot, dietContext, conditions, usedReplacementNames) ??
    pickSafeReplacementRecipe(replacementRecipes, undefined, dietContext, conditions, usedReplacementNames);

  if (selectedRecipe) {
    usedReplacementNames.add(selectedRecipe.title.toLowerCase());
    return {
      meal: mapCatalogRecipeToMeal(selectedRecipe),
      source: "catalog"
    };
  }

  const meal = buildDefaultSafeMeal(slot, preferredCuisine, recipeLanguage, usedReplacementNames);
  usedReplacementNames.add(meal.name.toLowerCase());
  return { meal, source: "default" };
}

function isPlaceholderMeal(meal: MealPlanMeal) {
  return /flexible meal slot|placeholder|tbd|to be decided|choose a meal/i.test(meal.name) || !meal.ingredients?.length;
}

function pickSafeReplacementRecipe(
  recipes: RecipeCatalogDoc[],
  slot: "breakfast" | "lunch" | "dinner" | undefined,
  dietContext: DietEnforcementContext,
  conditions: string[],
  usedReplacementNames: Set<string>
) {
  return recipes.find((recipe) => {
    if (slot && recipe.mealType !== slot) return false;
    if (usedReplacementNames.has(recipe.title.toLowerCase())) return false;
    return !findRecipeDietViolation(recipe, dietContext) && !findRecipeHealthViolation(recipe, conditions);
  });
}

function buildDefaultSafeMeal(
  slot: "breakfast" | "lunch" | "dinner",
  preferredCuisine: string | undefined,
  recipeLanguage: string,
  usedReplacementNames: Set<string>
): MealPlanMeal {
  const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
  const cuisine = wantsArabic
    ? getArabicCuisineLabel(preferredCuisine)
    : preferredCuisine && preferredCuisine !== "Any"
      ? preferredCuisine
      : "Mediterranean";
  const cuisineKey = (preferredCuisine ?? "").toLowerCase();
  const attach = (meal: MealPlanMeal): MealPlanMeal => {
    if (meal.photo_identity) return meal;
    const synthesized = synthesizeDefaultMealPhotoIdentity(meal, cuisine);
    return synthesized ? { ...meal, photo_identity: synthesized } : meal;
  };

  if (cuisineKey.includes("asian") || cuisineKey.includes("thai")) {
    return attach(buildDefaultAsianSafeMeal(slot, cuisine, wantsArabic, usedReplacementNames));
  }

  if (cuisineKey.includes("italian")) {
    return attach(buildDefaultItalianSafeMeal(slot, cuisine, wantsArabic, usedReplacementNames));
  }

  if (slot === "breakfast") {
    return attach(wantsArabic ? {
      name: "وعاء كينوا بالتوت",
      cuisine,
      image_search_index: "berry quinoa breakfast bowl",
      calories: 390,
      protein: "12غ",
      carbs: "68غ",
      fat: "9غ",
      ingredients: ["كينوا", "توت مشكل", "بذور شيا", "قرفة", "شراب القيقب"],
      steps: [
        "اطه الكينوا حتى تصبح طرية ومفلفلة.",
        "ضعها في وعاء مع التوت المشكل.",
        "أضف بذور الشيا والقرفة ورشة صغيرة من شراب القيقب."
      ]
    } : {
      name: "Berry quinoa breakfast bowl",
      cuisine,
      calories: 390,
      protein: "12g",
      carbs: "68g",
      fat: "9g",
      ingredients: ["quinoa", "mixed berries", "chia seeds", "cinnamon", "maple syrup"],
      steps: [
        "Cook quinoa until tender and fluffy.",
        "Spoon it into a bowl with mixed berries.",
        "Top with chia seeds, cinnamon, and a small drizzle of maple syrup."
      ]
    });
  }

  if (slot === "lunch") {
    return attach(wantsArabic ? {
      name: "سلطة أرز بالحمص",
      cuisine,
      image_search_index: "chickpea rice salad",
      calories: 520,
      protein: "18غ",
      carbs: "82غ",
      fat: "14غ",
      ingredients: ["حمص", "أرز", "خيار", "طماطم", "بقدونس", "زيت زيتون", "ليمون"],
      steps: [
        "اطه الأرز واتركه يهدأ قليلاً.",
        "اخلط الحمص مع الخيار والطماطم والبقدونس وزيت الزيتون والليمون.",
        "قدّم سلطة الحمص فوق الأرز."
      ]
    } : {
      name: "Chickpea rice salad",
      cuisine,
      calories: 520,
      protein: "18g",
      carbs: "82g",
      fat: "14g",
      ingredients: ["chickpeas", "rice", "cucumber", "tomato", "parsley", "olive oil", "lemon"],
      steps: [
        "Cook rice and let it cool slightly.",
        "Toss chickpeas with cucumber, tomato, parsley, olive oil, and lemon.",
        "Serve the chickpea salad over rice."
      ]
    });
  }

  return attach(wantsArabic ? {
    name: "يخنة عدس بالخضار مع الأرز",
    cuisine,
    image_search_index: "lentil vegetable stew with rice",
    calories: 560,
    protein: "24غ",
    carbs: "92غ",
    fat: "10غ",
    ingredients: ["عدس", "أرز", "جزر", "طماطم", "بصل", "ثوم", "زيت زيتون"],
    steps: [
      "اسلق العدس مع الطماطم والبصل والثوم والجزر حتى يطرى.",
      "اطه الأرز بشكل منفصل حتى يصبح مفلفلاً.",
      "قدّم يخنة العدس بالخضار فوق الأرز مع رشة صغيرة من زيت الزيتون."
    ]
  } : {
    name: "Lentil vegetable stew with rice",
    cuisine,
    calories: 560,
    protein: "24g",
    carbs: "92g",
    fat: "10g",
    ingredients: ["lentils", "rice", "carrot", "tomato", "onion", "garlic", "olive oil"],
    steps: [
      "Simmer lentils with tomato, onion, garlic, and carrot until tender.",
      "Cook rice separately until fluffy.",
      "Serve the lentil vegetable stew over rice with a small drizzle of olive oil."
    ]
  });
}

type DefaultMealVariant = Omit<MealPlanMeal, "cuisine">;

function selectDefaultMealVariant(variants: DefaultMealVariant[], usedReplacementNames: Set<string>) {
  return (
    variants.find((meal) => !usedReplacementNames.has(meal.name.toLowerCase())) ??
    variants[usedReplacementNames.size % variants.length]
  );
}

function buildDefaultItalianSafeMeal(
  slot: "breakfast" | "lunch" | "dinner",
  cuisine: string,
  wantsArabic: boolean,
  usedReplacementNames: Set<string>
) {
  const variants: Record<"breakfast" | "lunch" | "dinner", DefaultMealVariant[]> = {
    breakfast: wantsArabic
      ? [
          {
            name: "شوفان بالتفاح والقرفة",
            image_search_index: "apple cinnamon oatmeal",
            calories: 390,
            protein: "14غ",
            carbs: "62غ",
            fat: "9غ",
            ingredients: ["شوفان", "تفاح", "قرفة", "حليب شوفان", "جوز"],
            steps: ["اطهِ الشوفان بحليب الشوفان حتى يصبح كريميًا.", "أضف التفاح والقرفة واتركه يلين.", "قدمه مع كمية صغيرة من الجوز."]
          },
          {
            name: "توست طماطم وريحان",
            image_search_index: "tomato basil toast",
            calories: 360,
            protein: "10غ",
            carbs: "54غ",
            fat: "11غ",
            ingredients: ["خبز حبوب كاملة", "طماطم", "ريحان", "زيت زيتون", "فلفل أسود"],
            steps: ["حمص الخبز حتى يصبح مقرمشًا.", "قطع الطماطم واخلطها بالريحان.", "ضع خليط الطماطم فوق الخبز مع رشة زيت زيتون."]
          }
        ]
      : [
          {
            name: "Apple cinnamon oatmeal",
            image_search_index: "apple cinnamon oatmeal",
            calories: 390,
            protein: "14g",
            carbs: "62g",
            fat: "9g",
            ingredients: ["oats", "apple", "cinnamon", "oat milk", "walnuts"],
            steps: ["Simmer oats with oat milk until creamy.", "Fold in diced apple and cinnamon until the apple softens.", "Top with a small spoon of walnuts."]
          },
          {
            name: "Tomato basil toast",
            image_search_index: "tomato basil toast",
            calories: 360,
            protein: "10g",
            carbs: "54g",
            fat: "11g",
            ingredients: ["whole grain bread", "tomato", "basil", "olive oil", "black pepper"],
            steps: ["Toast the bread until crisp.", "Dice tomato and toss it with basil.", "Spoon the tomato mixture over toast with a light drizzle of olive oil."]
          }
        ],
    lunch: wantsArabic
      ? [
          {
            name: "مينستروني خضار وفاصوليا",
            image_search_index: "vegetable minestrone soup",
            calories: 510,
            protein: "20غ",
            carbs: "78غ",
            fat: "12غ",
            ingredients: ["فاصوليا بيضاء", "طماطم", "كوسة", "جزر", "مكرونة صغيرة", "ريحان"],
            steps: ["شوح الجزر والكوسة بكمية صغيرة من زيت الزيتون.", "أضف الطماطم والفاصوليا واتركها تغلي برفق.", "أضف المكرونة الصغيرة حتى تنضج وتصبح الشوربة كثيفة."]
          },
          {
            name: "باستا بريمافيرا بزيت الزيتون",
            image_search_index: "pasta primavera vegetables",
            calories: 540,
            protein: "18غ",
            carbs: "82غ",
            fat: "14غ",
            ingredients: ["مكرونة", "كوسة", "فلفل رومي", "طماطم", "ريحان", "زيت زيتون"],
            steps: ["اسلق المكرونة حتى تكون متماسكة.", "شوح الخضار حتى تلين وتبقى ملونة.", "قلب المكرونة مع الخضار والريحان وكمية صغيرة من زيت الزيتون."]
          }
        ]
      : [
          {
            name: "Vegetable white bean minestrone",
            image_search_index: "vegetable minestrone soup",
            calories: 510,
            protein: "20g",
            carbs: "78g",
            fat: "12g",
            ingredients: ["white beans", "tomato", "zucchini", "carrot", "small pasta", "basil"],
            steps: ["Saute carrot and zucchini in a small amount of olive oil.", "Add tomato and white beans and simmer gently.", "Add small pasta until tender and the soup looks hearty."]
          },
          {
            name: "Pasta primavera with olive oil",
            image_search_index: "pasta primavera vegetables",
            calories: 540,
            protein: "18g",
            carbs: "82g",
            fat: "14g",
            ingredients: ["pasta", "zucchini", "bell pepper", "tomato", "basil", "olive oil"],
            steps: ["Boil pasta until al dente.", "Saute the vegetables until tender and bright.", "Toss pasta with vegetables, basil, and a light olive oil finish."]
          }
        ],
    dinner: wantsArabic
      ? [
          {
            name: "راتاتوي إيطالي مع فاصوليا بيضاء",
            image_search_index: "italian vegetable bean stew",
            calories: 560,
            protein: "22غ",
            carbs: "74غ",
            fat: "15غ",
            ingredients: ["فاصوليا بيضاء", "باذنجان", "كوسة", "طماطم", "ثوم", "ريحان"],
            steps: ["حمص الباذنجان والكوسة حتى يظهرا بلون ذهبي.", "أضف الطماطم والثوم والفاصوليا واتركها تغلي.", "اختم بالريحان وقدمها كطبق خضار مشبع."]
          },
          {
            name: "باستا طماطم وسبانخ",
            image_search_index: "spinach tomato pasta",
            calories: 555,
            protein: "19غ",
            carbs: "84غ",
            fat: "14غ",
            ingredients: ["مكرونة", "سبانخ", "طماطم", "ثوم", "ريحان", "زيت زيتون"],
            steps: ["اسلق المكرونة حتى تكون متماسكة.", "اطبخ الطماطم والثوم حتى تتكاثف الصلصة.", "أضف السبانخ والمكرونة وقلب حتى تتغطى جيدًا."]
          }
        ]
      : [
          {
            name: "Italian vegetable white bean stew",
            image_search_index: "italian vegetable bean stew",
            calories: 560,
            protein: "22g",
            carbs: "74g",
            fat: "15g",
            ingredients: ["white beans", "eggplant", "zucchini", "tomato", "garlic", "basil"],
            steps: ["Roast eggplant and zucchini until lightly golden.", "Simmer tomato, garlic, and white beans until saucy.", "Finish with basil and serve as a hearty vegetable main."]
          },
          {
            name: "Spinach tomato pasta",
            image_search_index: "spinach tomato pasta",
            calories: 555,
            protein: "19g",
            carbs: "84g",
            fat: "14g",
            ingredients: ["pasta", "spinach", "tomato", "garlic", "basil", "olive oil"],
            steps: ["Boil pasta until al dente.", "Cook tomato and garlic until the sauce thickens.", "Fold in spinach and pasta until evenly coated."]
          }
        ]
  };

  return withCuisine(selectDefaultMealVariant(variants[slot], usedReplacementNames), cuisine)!;
}

function withCuisine(variant: DefaultMealVariant | undefined, cuisine: string): MealPlanMeal | undefined {
  if (!variant) return undefined;
  const meal: MealPlanMeal = {
    ...variant,
    cuisine
  };
  if (!meal.photo_identity) {
    const synthesized = synthesizeDefaultMealPhotoIdentity(meal, cuisine);
    if (synthesized) meal.photo_identity = synthesized;
  }
  return meal;
}

function synthesizeDefaultMealPhotoIdentity(meal: MealPlanMeal, cuisine: string | undefined) {
  const nameIsEnglish = meal.name && !/[؀-ۿ]/.test(meal.name);
  const englishSource = meal.image_search_index?.trim() || (nameIsEnglish ? meal.name.trim() : "");
  const dishSlug = toIdentityKey(englishSource);
  if (!dishSlug) return undefined;
  return normalizePhotoIdentity({
    dish_slug: dishSlug,
    english_name: englishSource,
    cuisine_key: toIdentityKey(cuisine)
  });
}

function getDefaultAsianMealVariants(slot: "breakfast" | "lunch" | "dinner", wantsArabic: boolean): DefaultMealVariant[] {
  const sharedArabicSteps = [
    "اطه قاعدة الأرز أو النودلز حتى تصبح طرية.",
    "شوّح الخضار مع الزنجبيل والثوم حتى تظهر الرائحة.",
    "اخلط المكونات وقدّم الطبق دافئاً مع الليمون الأخضر."
  ];
  const sharedEnglishSteps = [
    "Cook the rice or noodles until tender.",
    "Stir-fry the vegetables with ginger and garlic until fragrant.",
    "Toss everything together and serve warm with lime."
  ];

  if (wantsArabic) {
    const bySlot: Record<"breakfast" | "lunch" | "dinner", DefaultMealVariant[]> = {
      breakfast: [
        {
          name: "كونجي أرز بالزنجبيل والفطر",
          calories: 380,
          protein: "10غ",
          carbs: "72غ",
          fat: "6غ",
          ingredients: ["أرز", "فطر", "زنجبيل", "بصل أخضر", "خيار"],
          steps: sharedArabicSteps,
          image_search_index: "ginger mushroom rice congee"
        },
        {
          name: "أرز صباحي بالبصل الأخضر والخيار",
          calories: 395,
          protein: "11غ",
          carbs: "75غ",
          fat: "7غ",
          ingredients: ["أرز", "بصل أخضر", "خيار", "جزر", "زنجبيل"],
          steps: sharedArabicSteps,
          image_search_index: "scallion cucumber breakfast rice bowl"
        },
        {
          name: "وعاء أرز بالخضار والزنجبيل",
          calories: 410,
          protein: "12غ",
          carbs: "78غ",
          fat: "7غ",
          ingredients: ["أرز", "كرنب", "جزر", "زنجبيل", "ليمون أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "ginger vegetable rice bowl"
        },
        {
          name: "عصيدة أرز بالليمون والفطر",
          calories: 385,
          protein: "10غ",
          carbs: "74غ",
          fat: "6غ",
          ingredients: ["أرز", "فطر", "ليمون أخضر", "بصل أخضر", "زنجبيل"],
          steps: sharedArabicSteps,
          image_search_index: "lime mushroom rice porridge"
        },
        {
          name: "أرز بالريحان والخضار",
          calories: 420,
          protein: "12غ",
          carbs: "80غ",
          fat: "8غ",
          ingredients: ["أرز", "ريحان", "فلفل رومي", "جزر", "ثوم"],
          steps: sharedArabicSteps,
          image_search_index: "thai basil vegetable rice"
        },
        {
          name: "وعاء أرز بالخيار والجزر",
          calories: 390,
          protein: "10غ",
          carbs: "76غ",
          fat: "6غ",
          ingredients: ["أرز", "خيار", "جزر", "بصل أخضر", "ليمون أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "cucumber carrot rice bowl"
        },
        {
          name: "أرز بالبوك تشوي والزنجبيل",
          calories: 405,
          protein: "12غ",
          carbs: "77غ",
          fat: "7غ",
          ingredients: ["أرز", "بوك تشوي", "زنجبيل", "ثوم", "فطر"],
          steps: sharedArabicSteps,
          image_search_index: "bok choy ginger rice bowl"
        }
      ],
      lunch: [
        {
          name: "وعاء نودلز أرز بالخضار",
          calories: 510,
          protein: "14غ",
          carbs: "88غ",
          fat: "11غ",
          ingredients: ["نودلز أرز", "كرنب", "جزر", "خيار", "زنجبيل", "ليمون أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "vegetable rice noodle bowl"
        },
        {
          name: "نودلز أرز بالزنجبيل والحمص",
          calories: 535,
          protein: "18غ",
          carbs: "90غ",
          fat: "12غ",
          ingredients: ["نودلز أرز", "حمص", "جزر", "زنجبيل", "بصل أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "ginger chickpea rice noodles"
        },
        {
          name: "أرز بالخضار والليمون الأخضر",
          calories: 520,
          protein: "15غ",
          carbs: "86غ",
          fat: "13غ",
          ingredients: ["أرز", "فلفل رومي", "كرنب", "جزر", "ليمون أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "lime vegetable rice bowl"
        },
        {
          name: "وعاء أرز بالفطر والكرنب",
          calories: 525,
          protein: "16غ",
          carbs: "84غ",
          fat: "13غ",
          ingredients: ["أرز", "فطر", "كرنب", "ثوم", "زنجبيل"],
          steps: sharedArabicSteps,
          image_search_index: "mushroom cabbage rice bowl"
        },
        {
          name: "نودلز أرز بالحمص والفلفل",
          calories: 545,
          protein: "19غ",
          carbs: "92غ",
          fat: "12غ",
          ingredients: ["نودلز أرز", "حمص", "فلفل رومي", "جزر", "ثوم"],
          steps: sharedArabicSteps,
          image_search_index: "chickpea pepper rice noodles"
        },
        {
          name: "أرز بالبوك تشوي والثوم",
          calories: 500,
          protein: "14غ",
          carbs: "82غ",
          fat: "12غ",
          ingredients: ["أرز", "بوك تشوي", "فطر", "ثوم", "ليمون أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "garlic bok choy rice bowl"
        },
        {
          name: "كاري خضار بجوز الهند مع الأرز",
          calories: 560,
          protein: "15غ",
          carbs: "86غ",
          fat: "18غ",
          ingredients: ["أرز", "حليب جوز الهند", "جزر", "كرنب", "زنجبيل"],
          steps: sharedArabicSteps,
          image_search_index: "coconut vegetable curry rice"
        }
      ],
      dinner: [
        {
          name: "أرز مقلي بالزنجبيل والحمص",
          calories: 560,
          protein: "20غ",
          carbs: "90غ",
          fat: "12غ",
          ingredients: ["أرز", "حمص", "فلفل رومي", "جزر", "زنجبيل", "ثوم", "بصل أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "ginger chickpea fried rice"
        },
        {
          name: "أرز بالخضار والفطر المقلي",
          calories: 555,
          protein: "17غ",
          carbs: "88غ",
          fat: "14غ",
          ingredients: ["أرز", "فطر", "كرنب", "جزر", "ثوم"],
          steps: sharedArabicSteps,
          image_search_index: "mushroom vegetable stir fry rice"
        },
        {
          name: "كاري خضار بجوز الهند مع الأرز",
          calories: 590,
          protein: "16غ",
          carbs: "88غ",
          fat: "20غ",
          ingredients: ["أرز", "حليب جوز الهند", "فلفل رومي", "جزر", "زنجبيل"],
          steps: sharedArabicSteps,
          image_search_index: "coconut vegetable curry with rice"
        },
        {
          name: "نودلز أرز بالكرنب والثوم",
          calories: 540,
          protein: "15غ",
          carbs: "92غ",
          fat: "11غ",
          ingredients: ["نودلز أرز", "كرنب", "جزر", "ثوم", "ليمون أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "garlic cabbage rice noodles"
        },
        {
          name: "أرز بالريحان والحمص",
          calories: 575,
          protein: "21غ",
          carbs: "90غ",
          fat: "13غ",
          ingredients: ["أرز", "حمص", "ريحان", "فلفل رومي", "ثوم"],
          steps: sharedArabicSteps,
          image_search_index: "thai basil chickpea rice"
        },
        {
          name: "أرز بالبوك تشوي والفطر",
          calories: 550,
          protein: "17غ",
          carbs: "86غ",
          fat: "14غ",
          ingredients: ["أرز", "بوك تشوي", "فطر", "زنجبيل", "بصل أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "bok choy mushroom rice skillet"
        },
        {
          name: "نودلز أرز بالجزر والزنجبيل",
          calories: 535,
          protein: "14غ",
          carbs: "94غ",
          fat: "10غ",
          ingredients: ["نودلز أرز", "جزر", "كرنب", "زنجبيل", "ليمون أخضر"],
          steps: sharedArabicSteps,
          image_search_index: "ginger carrot rice noodle stir fry"
        }
      ]
    };

    return bySlot[slot];
  }

  const bySlot: Record<"breakfast" | "lunch" | "dinner", DefaultMealVariant[]> = {
    breakfast: [
      ["Ginger mushroom rice congee", 380, "10g", "72g", "6g", ["rice", "mushrooms", "ginger", "scallions", "cucumber"]],
      ["Scallion cucumber breakfast rice", 395, "11g", "75g", "7g", ["rice", "scallions", "cucumber", "carrot", "ginger"]],
      ["Ginger vegetable rice bowl", 410, "12g", "78g", "7g", ["rice", "cabbage", "carrot", "ginger", "lime"]],
      ["Lime mushroom rice porridge", 385, "10g", "74g", "6g", ["rice", "mushrooms", "lime", "scallions", "ginger"]],
      ["Thai basil vegetable rice", 420, "12g", "80g", "8g", ["rice", "basil", "bell pepper", "carrot", "garlic"]],
      ["Cucumber carrot rice bowl", 390, "10g", "76g", "6g", ["rice", "cucumber", "carrot", "scallions", "lime"]],
      ["Bok choy ginger rice bowl", 405, "12g", "77g", "7g", ["rice", "bok choy", "ginger", "garlic", "mushrooms"]]
    ].map(([name, calories, protein, carbs, fat, ingredients]) => ({
      name: name as string,
      calories: calories as number,
      protein: protein as string,
      carbs: carbs as string,
      fat: fat as string,
      ingredients: ingredients as string[],
      steps: sharedEnglishSteps,
      image_search_index: name as string
    })),
    lunch: [
      ["Vegetable rice noodle bowl", 510, "14g", "88g", "11g", ["rice noodles", "cabbage", "carrot", "cucumber", "ginger", "lime"]],
      ["Ginger chickpea rice noodles", 535, "18g", "90g", "12g", ["rice noodles", "chickpeas", "carrot", "ginger", "scallions"]],
      ["Lime vegetable rice bowl", 520, "15g", "86g", "13g", ["rice", "bell pepper", "cabbage", "carrot", "lime"]],
      ["Mushroom cabbage rice bowl", 525, "16g", "84g", "13g", ["rice", "mushrooms", "cabbage", "garlic", "ginger"]],
      ["Chickpea pepper rice noodles", 545, "19g", "92g", "12g", ["rice noodles", "chickpeas", "bell pepper", "carrot", "garlic"]],
      ["Garlic bok choy rice bowl", 500, "14g", "82g", "12g", ["rice", "bok choy", "mushrooms", "garlic", "lime"]],
      ["Coconut vegetable curry rice", 560, "15g", "86g", "18g", ["rice", "coconut milk", "carrot", "cabbage", "ginger"]]
    ].map(([name, calories, protein, carbs, fat, ingredients]) => ({
      name: name as string,
      calories: calories as number,
      protein: protein as string,
      carbs: carbs as string,
      fat: fat as string,
      ingredients: ingredients as string[],
      steps: sharedEnglishSteps,
      image_search_index: name as string
    })),
    dinner: [
      ["Ginger chickpea fried rice", 560, "20g", "90g", "12g", ["rice", "chickpeas", "bell pepper", "carrot", "ginger", "garlic", "scallions"]],
      ["Mushroom vegetable stir-fry rice", 555, "17g", "88g", "14g", ["rice", "mushrooms", "cabbage", "carrot", "garlic"]],
      ["Coconut vegetable curry with rice", 590, "16g", "88g", "20g", ["rice", "coconut milk", "bell pepper", "carrot", "ginger"]],
      ["Garlic cabbage rice noodles", 540, "15g", "92g", "11g", ["rice noodles", "cabbage", "carrot", "garlic", "lime"]],
      ["Thai basil chickpea rice", 575, "21g", "90g", "13g", ["rice", "chickpeas", "basil", "bell pepper", "garlic"]],
      ["Bok choy mushroom rice skillet", 550, "17g", "86g", "14g", ["rice", "bok choy", "mushrooms", "ginger", "scallions"]],
      ["Ginger carrot rice noodle stir-fry", 535, "14g", "94g", "10g", ["rice noodles", "carrot", "cabbage", "ginger", "lime"]]
    ].map(([name, calories, protein, carbs, fat, ingredients]) => ({
      name: name as string,
      calories: calories as number,
      protein: protein as string,
      carbs: carbs as string,
      fat: fat as string,
      ingredients: ingredients as string[],
      steps: sharedEnglishSteps,
      image_search_index: name as string
    }))
  };

  return bySlot[slot];
}

function buildDefaultAsianSafeMeal(
  slot: "breakfast" | "lunch" | "dinner",
  cuisine: string,
  wantsArabic: boolean,
  usedReplacementNames: Set<string>
): MealPlanMeal {
  const selectedVariant = withCuisine(
    selectDefaultMealVariant(getDefaultAsianMealVariants(slot, wantsArabic), usedReplacementNames),
    cuisine
  );
  if (selectedVariant) {
    return selectedVariant;
  }

  if (slot === "breakfast") {
    return wantsArabic ? {
      name: "كونجي أرز بالزنجبيل والفطر",
      cuisine,
      calories: 380,
      protein: "10غ",
      carbs: "72غ",
      fat: "6غ",
      ingredients: ["أرز", "فطر", "زنجبيل", "بصل أخضر", "خيار"],
      steps: [
        "اطه الأرز مع ماء إضافي حتى يصبح قوامه ناعماً مثل الكونجي.",
        "أضف الفطر والزنجبيل واتركه يغلي برفق حتى يطرى الفطر.",
        "قدّمه مع البصل الأخضر والخيار."
      ]
    } : {
      name: "Ginger mushroom rice congee",
      cuisine,
      calories: 380,
      protein: "10g",
      carbs: "72g",
      fat: "6g",
      ingredients: ["rice", "mushrooms", "ginger", "scallions", "cucumber"],
      steps: [
        "Cook rice with extra water until it softens into a congee texture.",
        "Add mushrooms and ginger, then simmer until the mushrooms are tender.",
        "Serve with scallions and cucumber."
      ]
    };
  }

  if (slot === "lunch") {
    return wantsArabic ? {
      name: "وعاء نودلز أرز بالخضار",
      cuisine,
      calories: 510,
      protein: "14غ",
      carbs: "88غ",
      fat: "11غ",
      ingredients: ["نودلز أرز", "كرنب", "جزر", "خيار", "زنجبيل", "ليمون أخضر"],
      steps: [
        "اسلق نودلز الأرز حتى تطرى ثم صفّها.",
        "شوّح الكرنب والجزر مع الزنجبيل حتى يلينان قليلاً.",
        "قدّم النودلز مع الخضار والخيار وعصرة ليمون أخضر."
      ]
    } : {
      name: "Vegetable rice noodle bowl",
      cuisine,
      calories: 510,
      protein: "14g",
      carbs: "88g",
      fat: "11g",
      ingredients: ["rice noodles", "cabbage", "carrot", "cucumber", "ginger", "lime"],
      steps: [
        "Boil rice noodles until tender, then drain them.",
        "Stir-fry cabbage and carrot with ginger until just softened.",
        "Serve the noodles with vegetables, cucumber, and lime."
      ]
    };
  }

  return wantsArabic ? {
    name: "أرز مقلي بالزنجبيل والحمص",
    cuisine,
    calories: 560,
    protein: "20غ",
    carbs: "90غ",
    fat: "12غ",
    ingredients: ["أرز", "حمص", "فلفل رومي", "جزر", "زنجبيل", "ثوم", "بصل أخضر"],
    steps: [
      "اطه الأرز حتى يصبح مفلفلاً واتركه يبرد قليلاً.",
      "شوّح الزنجبيل والثوم مع الجزر والفلفل الرومي حتى تظهر الرائحة.",
      "أضف الحمص والأرز وقلّب حتى يصبح الطبق ساخناً ومتماسكاً."
    ]
  } : {
    name: "Ginger chickpea fried rice",
    cuisine,
    calories: 560,
    protein: "20g",
    carbs: "90g",
    fat: "12g",
    ingredients: ["rice", "chickpeas", "bell pepper", "carrot", "ginger", "garlic", "scallions"],
    steps: [
      "Cook rice until fluffy, then let it cool slightly.",
      "Stir-fry ginger and garlic with carrot and bell pepper until fragrant.",
      "Add chickpeas and rice, then toss until hot and evenly mixed."
    ]
  };
}

function getArabicCuisineLabel(preferredCuisine?: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return "متوسطي";
  const normalized = preferredCuisine.toLowerCase();
  if (normalized.includes("egypt")) return "مصري";
  if (normalized.includes("middle")) return "شرق أوسطي";
  if (normalized.includes("mediterranean")) return "متوسطي";
  if (normalized.includes("turkish")) return "تركي";
  if (normalized.includes("italian")) return "إيطالي";
  if (normalized.includes("indian")) return "هندي";
  if (normalized.includes("mexican")) return "مكسيكي";
  if (normalized.includes("asian")) return "آسيوي";
  if (normalized.includes("american")) return "أمريكي";
  return preferredCuisine;
}

function addMealIngredientsToShoppingList(shoppingList: string[], meals: MealPlanMeal[]) {
  const existingItems = new Set(shoppingList.map(getShoppingListItemKey).filter(Boolean));
  const additions: string[] = [];

  meals
    .flatMap((meal) => meal.ingredients ?? [])
    .map((ingredient) => ingredient.trim())
    .filter(Boolean)
    .forEach((ingredient) => {
      const key = getShoppingListItemKey(ingredient);
      if (!key || existingItems.has(key)) return;
      existingItems.add(key);
      additions.push(`${ingredient} - 1 item`);
    });

  return [...shoppingList, ...additions];
}

function getShoppingListItemKey(value: string) {
  return value
    .split(" - ")[0]
    .trim()
    .toLowerCase();
}

async function persistMealPlanResultForUser({
  historyEntryId,
  historyIngredients,
  historyTitle,
  mealPlan,
  preferenceSignature,
  persistResult,
  uid
}: {
  historyEntryId?: string;
  historyIngredients: string[];
  historyTitle?: string;
  mealPlan: MealPlanData;
  preferenceSignature?: string;
  persistResult?: boolean;
  uid: string;
}) {
  if (!persistResult) return;

  try {
    const db = getAdminDb();
    const sanitized = sanitizeMealPlanForFirestore(mealPlan);
    await db.doc(`users/${uid}/plans/currentWeekly`).set(
      {
        mealPlan: preferenceSignature ? { ...sanitized, preferenceSignature } : sanitized,
        ...(preferenceSignature ? { preferenceSignature } : {}),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    if (historyEntryId) {
      await db.doc(`users/${uid}/history/${historyEntryId}`).set(
        {
          completedAt: new Date().toISOString(),
          generationMessage: null,
          generationStatus: "completed",
          ingredients: historyIngredients,
          recipes: stripUndefinedForFirestore(buildMealPlanHistoryRecipes(mealPlan)),
          sessionType: "weekly_meal_plan",
          timestamp: new Date().toISOString(),
          title: historyTitle ?? "7-Day Meal Plan",
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }
  } catch (error) {
    logger.warn("Server-side meal plan persistence failed after generation", {
      historyEntryId: historyEntryId ?? null,
      uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}

async function persistMealPlanFailureForUser({
  errorMessage,
  historyEntryId,
  uid
}: {
  errorMessage: string;
  historyEntryId?: string;
  uid?: string;
}) {
  if (!uid || !historyEntryId) return;

  try {
    await getAdminDb().doc(`users/${uid}/history/${historyEntryId}`).set(
      {
        generationMessage: errorMessage,
        generationStatus: "failed",
        sessionType: "weekly_meal_plan",
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    logger.warn("Server-side meal plan failure persistence failed", {
      historyEntryId,
      uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}

function buildMealPlanHistoryRecipes(mealPlan: MealPlanData): Recipe[] {
  return mealPlan.plan.flatMap((day, dayIndex) => [
    buildMealPlanHistoryRecipe(day.breakfast, day.day, "breakfast", dayIndex),
    buildMealPlanHistoryRecipe(day.lunch, day.day, "lunch", dayIndex),
    buildMealPlanHistoryRecipe(day.dinner, day.day, "dinner", dayIndex)
  ]);
}

function buildMealPlanHistoryRecipe(
  meal: MealPlanMeal,
  day: string,
  mealType: "breakfast" | "lunch" | "dinner",
  dayIndex: number
): Recipe {
  const ingredients = meal.ingredients ?? [];
  return {
    id: `weekly-meal-plan-${dayIndex}-${mealType}-${normalizeHistoryRecipeId(meal.name)}`,
    name: meal.name,
    cuisine: meal.cuisine ?? "Weekly meal plan",
    ingredients,
    missing_ingredients: ingredients,
    steps: meal.steps ?? [],
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    cook_time: day,
    difficulty: mealType,
    image_search_index: meal.image_search_index,
    image_search_indices: meal.image_search_indices,
    image_url: meal.image_url,
    image_source: meal.image_source,
    image_attribution_name: meal.image_attribution_name,
    image_attribution_url: meal.image_attribution_url,
    image_loading: false,
    image_error: false
  };
}

function normalizeHistoryRecipeId(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "meal";
}

function stripUndefinedForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function queueMealPlanCachePersist(input: {
  recipeLanguage: string;
  meals?: MealPlanMeal[];
  recipes?: Recipe[];
  uid?: string | null;
  dietContext?: DietEnforcementContext;
}) {
  void persistGeneratedRecipeCache(input).catch((error) => {
    logger.warn("Meal-plan cache persistence failed", {
      uid: input.uid ?? null,
      mealCount: input.meals?.length ?? 0,
      recipeCount: input.recipes?.length ?? 0,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  });
}

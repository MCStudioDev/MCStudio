import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { buildMealPlanPrompt } from "@/lib/aiPrompts";
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
import { searchCatalogRecipes } from "@/services/recipeSearchService";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import { isArabicRecipeLanguage, localizeMealPlanForArabic } from "@/lib/arabicRecipeLocalization";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { ensureDetailedMealPlanSteps } from "@/lib/recipeStepDetails";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { RecipeCatalogDoc } from "@/lib/domain";
import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  logger.info("Meal plan HTTP request received", { requestId });
  try {
    const accessCheck = await canUseApiFeature(request, "weekly_plan");
    const access = accessCheck.access;
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

    if (USE_MOCK) {
      const mockPlan = { ...MOCK_MEAL_PLAN, servedFrom: "mock" as const };
      const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
      const outputMockPlan = ensureDetailedMealPlanSteps(
        wantsArabic ? localizeMealPlanForArabic(mockPlan) : mockPlan,
        wantsArabic ? "Arabic" : "English"
      );
      queueMealPlanCachePersist({
        uid: access.uid,
        recipeLanguage,
        meals: outputMockPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]),
        recipes: outputMockPlan.recommendedRecipes
      });
      await persistMealPlanResultForUser({
        historyEntryId: parsed.data.historyEntryId,
        historyIngredients: parsed.data.historyIngredients ?? pantry,
        historyTitle: parsed.data.historyTitle,
        mealPlan: outputMockPlan,
        persistResult: parsed.data.persistResult,
        uid: access.uid
      });
      return Response.json({ result: JSON.stringify(outputMockPlan), access: accessPayload(nextAccess) });
    }

    const searchResult = await searchCatalogRecipes({
      ingredients: pantry,
      preferredCuisine: parsed.data.preferredCuisine,
      calorieTarget: parsed.data.calorieTarget,
      diets: parsed.data.diets,
      conditions: parsed.data.conditions,
      allergens: parsed.data.allergens,
      maxResults: 21,
      recipeLanguage,
      uid: access.uid
    });

    const pantryStock = pantryItems.length ? pantryItems : pantry.map((name) => ({ name, quantity: "1" }));
    const rankedRecipeMap = new Map(searchResult.candidateRecipes.map((recipe) => [recipe.id, recipe]));
    const orderedRankedRecipes = searchResult.rankedRecipeIds
      .map((recipeId) => rankedRecipeMap.get(recipeId))
      .filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe));
    const catalogRecipes = orderedRankedRecipes.length
      ? orderedRankedRecipes
      : searchResult.candidateRecipes;

    try {
      ensureAiAvailable();
      const text = await callOpenAIText(
        buildMealPlanPrompt({
          pantry,
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
        const reconciledMealPlan = { ...aiMealPlan, shoppingList: reconciledShoppingList };
        const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
        const outputMealPlan = ensureDetailedMealPlanSteps(
          wantsArabic ? localizeMealPlanForArabic(reconciledMealPlan) : reconciledMealPlan,
          wantsArabic ? "Arabic" : "English"
        );
        queueMealPlanCachePersist({
          uid: access.uid,
          recipeLanguage,
          meals: outputMealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]),
          recipes: outputMealPlan.recommendedRecipes
        });
        await persistMealPlanResultForUser({
          historyEntryId: parsed.data.historyEntryId,
          historyIngredients: parsed.data.historyIngredients ?? pantry,
          historyTitle: parsed.data.historyTitle,
          mealPlan: outputMealPlan,
          persistResult: parsed.data.persistResult,
          uid: access.uid
        });
        logger.info("Meal plan served from Gemini fallback AI", {
          days: outputMealPlan.plan.length,
          shoppingItems: outputMealPlan.shoppingList.length,
          shoppingItemsBeforeReconcile: aiMealPlan.shoppingList.length
        });
        return Response.json({
          result: JSON.stringify({ ...outputMealPlan, servedFrom: "fallback_ai" }),
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

    const emergencyMealPlan = {
      ...buildMealPlanData(catalogRecipes, pantryStock),
      servedFrom: "shared_pool" as const
    };
    const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
    const outputEmergencyMealPlan = ensureDetailedMealPlanSteps(
      wantsArabic ? localizeMealPlanForArabic(emergencyMealPlan) : emergencyMealPlan,
      wantsArabic ? "Arabic" : "English"
    );
    queueMealPlanCachePersist({
      uid: access.uid,
      recipeLanguage,
      meals: outputEmergencyMealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]),
      recipes: outputEmergencyMealPlan.recommendedRecipes
    });
    await persistMealPlanResultForUser({
      historyEntryId: parsed.data.historyEntryId,
      historyIngredients: parsed.data.historyIngredients ?? pantry,
      historyTitle: parsed.data.historyTitle,
      mealPlan: outputEmergencyMealPlan,
      persistResult: parsed.data.persistResult,
      uid: access.uid
    });
    logger.info("Meal plan served from shared recipe pool after AI failure", {
      days: outputEmergencyMealPlan.plan.length,
      shoppingItems: outputEmergencyMealPlan.shoppingList.length
    });
    return Response.json({
      result: JSON.stringify(outputEmergencyMealPlan),
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
    return Response.json({ error: safeMessage }, { status });
  }
}

function extractPantryFromPrompt(prompt: string): string[] {
  const match = prompt.match(/pantry items:\s*(.+?)\./i);
  if (!match?.[1]) return [];
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

async function persistMealPlanResultForUser({
  historyEntryId,
  historyIngredients,
  historyTitle,
  mealPlan,
  persistResult,
  uid
}: {
  historyEntryId?: string;
  historyIngredients: string[];
  historyTitle?: string;
  mealPlan: MealPlanData;
  persistResult?: boolean;
  uid: string;
}) {
  if (!persistResult) return;

  try {
    const db = getAdminDb();
    const sanitized = sanitizeMealPlanForFirestore(mealPlan);
    await db.doc(`users/${uid}/plans/currentWeekly`).set(
      {
        mealPlan: sanitized,
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

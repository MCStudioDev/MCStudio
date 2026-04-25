import { z } from "zod";
import { buildMealPlanPrompt } from "@/lib/aiPrompts";
import { USE_MOCK, callOpenAIText, ensureAiAvailable, extractJson } from "@/lib/openai";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { accessErrorResponse, accessPayload, requireUser } from "@/services/authService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { logger } from "@/lib/logger";
import { listSeededRecipes } from "@/repositories/recipeRepo";
import { buildMealPlanData, reconcileShoppingListWithPantry } from "@/services/mealPlanService";
import { searchCatalogRecipes } from "@/services/recipeSearchService";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import { isArabicRecipeLanguage, localizeMealPlanForArabic } from "@/lib/arabicRecipeLocalization";
import { normalizeRecipeLanguage } from "@/lib/language";
import { ensureDetailedMealPlanSteps } from "@/lib/recipeStepDetails";
import type { RecipeCatalogDoc } from "@/lib/domain";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().min(20).optional(),
  pantry: z.array(z.string()).optional(),
  pantryItems: z.array(z.object({ name: z.string(), quantity: z.string().optional() })).optional(),
  recipeLanguage: z.string().optional(),
  preferredCuisine: z.string().optional(),
  calorieTarget: z.number().optional(),
  diets: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional()
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
  try {
    const access = await requireUser(request);
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
    const recipeLanguage = normalizeRecipeLanguage(parsed.data.recipeLanguage, "English");

    if (!access.isPremium) {
      return Response.json(
        {
          error: "Weekly meal plans are a premium feature. Free users can keep using manual pantry and offline recipe discovery.",
          access: accessPayload(access)
        },
        { status: 403 }
      );
    }

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
      return Response.json({ result: JSON.stringify(outputMockPlan), access: accessPayload(access) });
    }

    const pantryItems = parsed.data.pantryItems ?? [];
    const pantry = parsed.data.pantry ?? (pantryItems.length ? pantryItems.map((item) => item.name) : extractPantryFromPrompt(parsed.data.prompt ?? ""));
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
      : searchResult.candidateRecipes.length
        ? searchResult.candidateRecipes
        : getCatalogFallbackRecipes(parsed.data.preferredCuisine);

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
        logger.info("Meal plan served from Gemini fallback AI", {
          days: outputMealPlan.plan.length,
          shoppingItems: outputMealPlan.shoppingList.length,
          shoppingItemsBeforeReconcile: aiMealPlan.shoppingList.length
        });
        return Response.json({
          result: JSON.stringify({ ...outputMealPlan, servedFrom: "fallback_ai" }),
          servedFrom: "fallback_ai",
          access: accessPayload(access)
        });
      }

      logger.warn("Premium meal plan AI response was not usable; using offline fallback", {
        topLevelType: Array.isArray(rawMealPlan) ? "array" : typeof rawMealPlan,
        keys: rawMealPlan && typeof rawMealPlan === "object" && !Array.isArray(rawMealPlan) ? Object.keys(rawMealPlan).slice(0, 10) : [],
        preview: json.slice(0, 600)
      });
    } catch (aiError) {
      logger.error("Premium meal plan API failed; using offline fallback", aiError);
    }

    const emergencyMealPlan = {
      ...buildMealPlanData(catalogRecipes.length ? catalogRecipes : getCatalogFallbackRecipes(parsed.data.preferredCuisine), pantryStock),
      servedFrom: "offline_catalog" as const
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
    logger.info("Meal plan served from offline catalog after AI failure", {
      days: outputEmergencyMealPlan.plan.length,
      shoppingItems: outputEmergencyMealPlan.shoppingList.length
    });
    return Response.json({
      result: JSON.stringify(outputEmergencyMealPlan),
      servedFrom: "offline_catalog",
      fallbackNotice: "The premium AI meal plan service was unavailable, so we used offline catalog recipes.",
      access: accessPayload(access)
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Sign in") || err.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : "Meal plan generation failed";
    return Response.json({ error: message }, { status: message.includes("GEMINI_API_KEY") ? 503 : 500 });
  }
}

function extractPantryFromPrompt(prompt: string): string[] {
  const match = prompt.match(/pantry items:\s*(.+?)\./i);
  if (!match?.[1]) return [];
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

function getCatalogFallbackRecipes(preferredCuisine?: string): RecipeCatalogDoc[] {
  const activeRecipes = listSeededRecipes().filter((recipe) => recipe.isActive);
  const cuisineMatches =
    preferredCuisine && preferredCuisine !== "Any"
      ? activeRecipes.filter((recipe) => cuisineMatchesPreference(recipe.cuisine, preferredCuisine))
      : [];

  const fallbackPool = cuisineMatches.length >= 7 ? cuisineMatches : activeRecipes;

  return fallbackPool
    .slice()
    .sort((left, right) => right.qualityScore + right.popularityScore - (left.qualityScore + left.popularityScore))
    .slice(0, 21);
}

function queueMealPlanCachePersist(input: {
  recipeLanguage: string;
  meals?: import("@/lib/types").MealPlanMeal[];
  recipes?: import("@/lib/types").Recipe[];
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

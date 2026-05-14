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
import { mapCatalogRecipeToMeal, searchCatalogRecipes } from "@/services/recipeSearchService";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import { isArabicRecipeLanguage, localizeMealPlanForArabic } from "@/lib/arabicRecipeLocalization";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { ensureDetailedMealPlanSteps } from "@/lib/recipeStepDetails";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { RecipeCatalogDoc } from "@/lib/domain";
import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";
import {
  findRecipeDietViolation,
  type DietEnforcementContext
} from "@/lib/dietEnforcement";

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
    // Server-side diet/allergen gate for meal-plan output. Any slot the AI
    // returns that violates the user's diet or allergen settings is repaired
    // into a real safe meal. Replacements may add missing ingredients to the
    // shopping list; pantry-only planning is less important than not showing
    // placeholders or unsafe meals.
    const dietContext: DietEnforcementContext = {
      diets: parsed.data.diets ?? [],
      allergens: parsed.data.allergens ?? []
    };
    const repairMealPlanSlots = (plan: MealPlanData, stage: string, replacementRecipes: RecipeCatalogDoc[] = []): MealPlanData => {
      let repairCount = 0;
      let dietViolationCount = 0;
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
            const placeholder = isPlaceholderMeal(meal);
            const cuisineMismatch = !mealMatchesPreferredCuisine(meal, parsed.data.preferredCuisine);
            if (violation || placeholder || cuisineMismatch) {
              repairCount += 1;
              if (violation) dietViolationCount += 1;
              if (placeholder) placeholderCount += 1;
              if (cuisineMismatch) cuisineRepairCount += 1;
              const replacement = buildSafeMealReplacement({
                dietContext,
                recipeLanguage,
                preferredCuisine: parsed.data.preferredCuisine,
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

    if (USE_MOCK) {
      const mockPlan = repairMealPlanSlots(
        { ...MOCK_MEAL_PLAN, servedFrom: "mock" as const },
        "mock"
      );
      const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
      const outputMockPlan = ensureDetailedMealPlanSteps(
        wantsArabic ? localizeMealPlanForArabic(mockPlan) : mockPlan,
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
    const rankedCatalogRecipes = orderedRankedRecipes.length
      ? orderedRankedRecipes
      : searchResult.candidateRecipes;
    const cuisineAlignedCatalogRecipes = getCuisineAlignedRecipes(rankedCatalogRecipes, parsed.data.preferredCuisine);
    const catalogRecipes = cuisineAlignedCatalogRecipes.length ? cuisineAlignedCatalogRecipes : rankedCatalogRecipes;

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
        const reconciledMealPlan = repairMealPlanSlots(
          { ...aiMealPlan, shoppingList: reconciledShoppingList },
          "ai_mealplan",
          catalogRecipes
        );
        const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
        const outputMealPlan = ensureDetailedMealPlanSteps(
          wantsArabic ? localizeMealPlanForArabic(reconciledMealPlan) : reconciledMealPlan,
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

    const emergencyMealPlan = repairMealPlanSlots(
      {
        ...buildMealPlanData(catalogRecipes, pantryStock),
        servedFrom: "shared_pool" as const
      },
      "catalog_emergency",
      catalogRecipes
    );
    const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
    const outputEmergencyMealPlan = ensureDetailedMealPlanSteps(
      wantsArabic ? localizeMealPlanForArabic(emergencyMealPlan) : emergencyMealPlan,
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

function getCuisineAlignedRecipes(recipes: RecipeCatalogDoc[], preferredCuisine?: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return recipes;
  return recipes.filter((recipe) => catalogRecipeMatchesPreferredCuisine(recipe, preferredCuisine));
}

function catalogRecipeMatchesPreferredCuisine(recipe: RecipeCatalogDoc, preferredCuisine: string) {
  return (
    cuisineMatchesPreference(recipe.cuisine, preferredCuisine) ||
    (recipe.regionalCuisines ?? []).some((cuisine) => cuisineMatchesPreference(cuisine, preferredCuisine)) ||
    cuisineMatchesPreference(recipe.localized?.English?.cuisine ?? "", preferredCuisine)
  );
}

function mealMatchesPreferredCuisine(meal: MealPlanMeal, preferredCuisine?: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return true;
  return cuisineMatchesPreference(meal.cuisine ?? "", preferredCuisine);
}

function buildSafeMealReplacement({
  dietContext,
  recipeLanguage,
  preferredCuisine,
  replacementRecipes,
  slot,
  usedReplacementNames
}: {
  dietContext: DietEnforcementContext;
  recipeLanguage: string;
  preferredCuisine?: string;
  replacementRecipes: RecipeCatalogDoc[];
  slot: "breakfast" | "lunch" | "dinner";
  usedReplacementNames: Set<string>;
}): { meal: MealPlanMeal; source: "catalog" | "default" } {
  const selectedRecipe =
    pickSafeReplacementRecipe(replacementRecipes, slot, dietContext, usedReplacementNames) ??
    pickSafeReplacementRecipe(replacementRecipes, undefined, dietContext, usedReplacementNames);

  if (selectedRecipe) {
    usedReplacementNames.add(selectedRecipe.title.toLowerCase());
    return {
      meal: mapCatalogRecipeToMeal(selectedRecipe),
      source: "catalog"
    };
  }

  const meal = buildDefaultSafeMeal(slot, preferredCuisine, recipeLanguage);
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
  usedReplacementNames: Set<string>
) {
  return recipes.find((recipe) => {
    if (slot && recipe.mealType !== slot) return false;
    if (usedReplacementNames.has(recipe.title.toLowerCase())) return false;
    return !findRecipeDietViolation(recipe, dietContext);
  });
}

function buildDefaultSafeMeal(slot: "breakfast" | "lunch" | "dinner", preferredCuisine: string | undefined, recipeLanguage: string): MealPlanMeal {
  const wantsArabic = isArabicRecipeLanguage(recipeLanguage);
  const cuisine = wantsArabic
    ? getArabicCuisineLabel(preferredCuisine)
    : preferredCuisine && preferredCuisine !== "Any"
      ? preferredCuisine
      : "Mediterranean";
  const cuisineKey = (preferredCuisine ?? "").toLowerCase();

  if (cuisineKey.includes("asian") || cuisineKey.includes("thai")) {
    return buildDefaultAsianSafeMeal(slot, cuisine, wantsArabic);
  }

  if (slot === "breakfast") {
    return wantsArabic ? {
      name: "وعاء كينوا بالتوت",
      cuisine,
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
    };
  }

  if (slot === "lunch") {
    return wantsArabic ? {
      name: "سلطة أرز بالحمص",
      cuisine,
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
    };
  }

  return wantsArabic ? {
    name: "يخنة عدس بالخضار مع الأرز",
    cuisine,
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
  };
}

function buildDefaultAsianSafeMeal(slot: "breakfast" | "lunch" | "dinner", cuisine: string, wantsArabic: boolean): MealPlanMeal {
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

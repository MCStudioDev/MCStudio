import { z } from "zod";
import { buildMealPlanPrompt } from "@/lib/aiPrompts";
import { USE_MOCK, callOpenAIText, ensureAiAvailable, extractJson } from "@/lib/openai";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { accessErrorResponse, accessPayload, requireUser } from "@/services/authService";
import { listSeededRecipes } from "@/repositories/recipeRepo";
import { buildMealPlanData } from "@/services/mealPlanService";
import { searchCatalogRecipes } from "@/services/recipeSearchService";
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
    breakfast: { name: "Greek yogurt with berries and granola", calories: 380, protein: "20g", carbs: "45g", fat: "10g" },
    lunch: { name: "Quinoa salad with grilled chicken", calories: 520, protein: "38g", carbs: "55g", fat: "16g" },
    dinner: { name: "Salmon with roasted vegetables", calories: 580, protein: "42g", carbs: "30g", fat: "26g" }
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
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

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
      return Response.json({ result: JSON.stringify({ ...MOCK_MEAL_PLAN, servedFrom: "mock" }), access: accessPayload(access) });
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
      maxResults: 21
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
          diets: parsed.data.diets ?? [],
          conditions: parsed.data.conditions ?? [],
          recipeLanguage: parsed.data.recipeLanguage,
          preferredCuisine: parsed.data.preferredCuisine,
          calorieTarget: parsed.data.calorieTarget,
          allergens: parsed.data.allergens ?? []
        })
      );
      const json = extractJson(text);
      const rawMealPlan = JSON.parse(json);
      const aiMealPlan = normalizeMealPlanData(rawMealPlan);

      if (aiMealPlan) {
        console.info("Meal plan served from Gemini fallback AI", {
          days: aiMealPlan.plan.length,
          shoppingItems: aiMealPlan.shoppingList.length
        });
        return Response.json({
          result: JSON.stringify({ ...aiMealPlan, servedFrom: "fallback_ai" }),
          servedFrom: "fallback_ai",
          access: accessPayload(access)
        });
      }

      console.error("Premium meal plan AI response was not usable; using offline fallback", {
        topLevelType: Array.isArray(rawMealPlan) ? "array" : typeof rawMealPlan,
        keys: rawMealPlan && typeof rawMealPlan === "object" && !Array.isArray(rawMealPlan) ? Object.keys(rawMealPlan).slice(0, 10) : [],
        preview: json.slice(0, 600)
      });
    } catch (aiError) {
      console.error("Premium meal plan API failed; using offline fallback:", aiError);
    }

    const emergencyMealPlan = {
      ...buildMealPlanData(catalogRecipes.length ? catalogRecipes : getCatalogFallbackRecipes(parsed.data.preferredCuisine), pantryStock),
      servedFrom: "offline_catalog" as const
    };
    console.info("Meal plan served from offline catalog after AI failure", {
      days: emergencyMealPlan.plan.length,
      shoppingItems: emergencyMealPlan.shoppingList.length
    });
    return Response.json({
      result: JSON.stringify(emergencyMealPlan),
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

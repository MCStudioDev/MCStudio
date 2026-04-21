import { z } from "zod";
import { USE_MOCK, callOpenAIText, ensureAiAvailable, extractJson } from "@/lib/openai";
import { cuisineMatchesPreference } from "@/lib/cuisines";
import { normalizeMealPlanData } from "@/lib/mealPlan";
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
  preferredCuisine: z.string().optional(),
  calorieTarget: z.number().optional(),
  diets: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional()
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
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    if (USE_MOCK) {
      return Response.json({ result: JSON.stringify(MOCK_MEAL_PLAN) });
    }

    const pantryItems = parsed.data.pantryItems ?? [];
    const pantry = parsed.data.pantry ?? (pantryItems.length ? pantryItems.map((item) => item.name) : extractPantryFromPrompt(parsed.data.prompt ?? ""));
    const searchResult = await searchCatalogRecipes({
      ingredients: pantry,
      preferredCuisine: parsed.data.preferredCuisine,
      calorieTarget: parsed.data.calorieTarget,
      diets: parsed.data.diets,
      conditions: parsed.data.conditions,
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

    if (catalogRecipes.length) {
      const mealPlan = {
        ...buildMealPlanData(catalogRecipes, pantryStock),
        servedFrom: "offline_catalog" as const
      };
      return Response.json({ result: JSON.stringify(mealPlan), servedFrom: "offline_catalog" });
    }

    ensureAiAvailable();
    const text = await callOpenAIText(buildFallbackPrompt(parsed.data, pantry));
    const json = extractJson(text);
    const aiMealPlan = normalizeMealPlanData(JSON.parse(json));

    if (aiMealPlan) {
      return Response.json({ result: JSON.stringify({ ...aiMealPlan, servedFrom: "fallback_ai" }), servedFrom: "fallback_ai" });
    }

    const emergencyMealPlan = {
      ...buildMealPlanData(getCatalogFallbackRecipes(parsed.data.preferredCuisine), pantryStock),
      servedFrom: "offline_catalog" as const
    };
    return Response.json({ result: JSON.stringify(emergencyMealPlan), servedFrom: "offline_catalog" });
  } catch (err) {
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

function buildFallbackPrompt(
  data: z.infer<typeof requestSchema>,
  pantry: string[]
) {
  return [
    "Generate a 7-day meal plan as valid JSON.",
    `Pantry items: ${pantry.join(", ") || "none provided"}.`,
    `Dietary preferences: ${data.diets?.join(", ") || "none"}.`,
    `Health conditions: ${data.conditions?.join(", ") || "none"}.`,
    `Preferred cuisine: ${data.preferredCuisine || "Any"}.`,
    `Daily calorie target: ${data.calorieTarget || 2000}.`,
    "Return an object with keys: plan and shoppingList.",
    "plan must be an array of 7 days. Each day must include breakfast, lunch, and dinner with name, calories, protein, carbs, and fat.",
    "shoppingList must include only missing items needed to cook the plan after pantry ingredients are used.",
    "Every shoppingList item must include the summed missing quantity and unit, for example: \"rice - 4 cup\" or \"tomato - 8 whole\"."
  ].join(" ");
}

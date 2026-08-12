import { IngredientGraph } from "@/food/IngredientGraph";
import type { CulinaryPath } from "@/lib/IngredientKnowledgeGraph";

export interface RecipeDiscoveryPlan {
  /** Dish Intent Engine output: named, authentic dish-family routes. */
  dishIntents: CulinaryPath[];
  /** Cuisine Predictor output used to rotate Any-cuisine search results. */
  predictedCuisines: Array<{ cuisine: string; confidence: number; signals: string[] }>;
  /** Technique Predictor output sourced from the selected dish routes. */
  predictedTechniques: string[];
}

const ingredientGraph = new IngredientGraph();

/**
 * Request-time deterministic intelligence between Ingredient Normalization and
 * Recipe Search. Source records retain their import-time CuisineClassifier
 * metadata; this plan predicts the culinary space of the user's pantry.
 */
export function buildRecipeDiscoveryPlan(input: {
  normalizedIngredients: string[];
  preferredCuisine?: string;
}): RecipeDiscoveryPlan {
  const preferredCuisine = input.preferredCuisine?.trim() || "Any";
  const expansion = ingredientGraph.smartExpansionPlan(input.normalizedIngredients, preferredCuisine);
  const dishIntents = expansion.routes.flatMap((route) => route.paths);
  const scores = new Map<string, { score: number; signals: Set<string> }>();

  for (const route of expansion.routes) {
    const entry = scores.get(route.cuisine) ?? { score: 0, signals: new Set<string>() };
    entry.score += route.paths.length * 30 + route.dishFamilies.length * 10;
    route.dishFamilies.forEach((family) => entry.signals.add(family));
    scores.set(route.cuisine, entry);
  }

  const highScore = Math.max(1, ...Array.from(scores.values(), (entry) => entry.score));
  return {
    dishIntents: Array.from(new Map(dishIntents.map((path) => [`${path.cuisine}|${path.dishFamily}`, path])).values()),
    predictedCuisines: Array.from(scores.entries())
      .map(([cuisine, entry]) => ({
        cuisine,
        confidence: Math.min(100, Math.round((entry.score / highScore) * 100)),
        signals: Array.from(entry.signals).slice(0, 4)
      }))
      .sort((left, right) => right.confidence - left.confidence || left.cuisine.localeCompare(right.cuisine)),
    predictedTechniques: Array.from(new Set(dishIntents.map((path) => path.technique)))
  };
}

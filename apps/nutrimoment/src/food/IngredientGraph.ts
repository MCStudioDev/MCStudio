import {
  buildIngredientKnowledgeProfile,
  getIngredientCulinaryPaths,
  resolveIngredientKnowledge,
  type CulinaryPath,
  type IngredientKnowledgeMatch,
  type IngredientKnowledgeProfile
} from "@/lib/IngredientKnowledgeGraph";
import { getDictionaryDishFamiliesForIngredientIds } from "@/food/FoodDictionary";
import { IngredientNormalizer } from "@/food/IngredientNormalizer";

export interface IngredientCuisineRoute {
  cuisine: string;
  dishFamilies: string[];
  paths: CulinaryPath[];
}

export interface SmartIngredientExpansionPlan {
  cuisines: string[];
  dishFamilies: string[];
  ingredientIds: string[];
  routes: IngredientCuisineRoute[];
}

export class IngredientGraph {
  private readonly normalizer = new IngredientNormalizer();

  resolve(ingredient: string): IngredientKnowledgeMatch | null {
    return resolveIngredientKnowledge(ingredient);
  }

  profile(ingredients: string[]): IngredientKnowledgeProfile {
    return buildIngredientKnowledgeProfile(ingredients);
  }

  possibleCuisines(ingredients: string[], preferredCuisine = "Any") {
    if (preferredCuisine && preferredCuisine !== "Any") return [preferredCuisine.toLocaleLowerCase()];

    const profile = this.profile(ingredients);
    const ordered = profile.matches.flatMap((match) => [
      ...(match.knowledge.culinaryPaths ?? []).map((path) => path.cuisine),
      ...match.knowledge.cuisines.map((cuisine) => cuisine.cuisine)
    ]);

    return Array.from(new Set(ordered));
  }

  cuisineRoutes(ingredients: string[], preferredCuisine = "Any"): IngredientCuisineRoute[] {
    return this.possibleCuisines(ingredients, preferredCuisine).map((cuisine) => {
      const paths = ingredients.flatMap((ingredient) => getIngredientCulinaryPaths(ingredient, cuisine));
      return {
        cuisine,
        dishFamilies: Array.from(new Set(paths.map((path) => path.dishFamily))),
        paths
      };
    });
  }

  smartExpansionPlan(ingredients: string[], preferredCuisine = "Any"): SmartIngredientExpansionPlan {
    const profile = this.profile(ingredients);
    const routes = this.cuisineRoutes(ingredients, preferredCuisine);
    const normalized = this.normalizer.normalize(ingredients);
    const normalizedIds = normalized.map((ingredient) => ingredient.id);
    const dictionaryDishFamilies = getDictionaryDishFamiliesForIngredientIds(normalizedIds);
    return {
      cuisines: routes.map((route) => route.cuisine),
      dishFamilies: Array.from(new Set([...routes.flatMap((route) => route.dishFamilies), ...dictionaryDishFamilies])),
      ingredientIds: Array.from(new Set([
        ...normalizedIds,
        ...profile.matches.map((match) => match.canonical)
      ])),
      routes
    };
  }
}

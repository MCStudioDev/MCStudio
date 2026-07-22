import {
  buildIngredientKnowledgeProfile,
  getIngredientCulinaryPaths,
  resolveIngredientKnowledge,
  type CulinaryPath,
  type IngredientKnowledgeMatch,
  type IngredientKnowledgeProfile
} from "@/lib/IngredientKnowledgeGraph";

export interface IngredientCuisineRoute {
  cuisine: string;
  dishFamilies: string[];
  paths: CulinaryPath[];
}

export class IngredientGraph {
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
}

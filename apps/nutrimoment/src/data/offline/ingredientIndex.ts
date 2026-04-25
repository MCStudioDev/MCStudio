import { OFFLINE_RECIPES } from "@/data/offline/recipes";

function buildIngredientRecipeIndex() {
  const index = new Map<string, Set<string>>();

  OFFLINE_RECIPES.forEach((recipe) => {
    recipe.ingredientCanonicals.forEach((canonical) => {
      const recipeIds = index.get(canonical) ?? new Set<string>();
      recipeIds.add(recipe.id);
      index.set(canonical, recipeIds);
    });
  });

  return Object.fromEntries(
    Array.from(index.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([canonical, recipeIds]) => [canonical, Array.from(recipeIds).sort()])
  ) as Record<string, string[]>;
}

export const OFFLINE_INGREDIENT_RECIPE_INDEX = buildIngredientRecipeIndex();

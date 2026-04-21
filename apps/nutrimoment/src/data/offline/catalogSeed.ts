import { OFFLINE_INGREDIENT_ALIASES } from "@/data/offline/aliases";
import { OFFLINE_INGREDIENT_RECIPE_INDEX } from "@/data/offline/ingredientIndex";
import { OFFLINE_INGREDIENTS } from "@/data/offline/ingredients";
import { OFFLINE_RECIPES } from "@/data/offline/recipes";

export function buildOfflineCatalogSeed() {
  const now = Date.now();

  const recipes = OFFLINE_RECIPES.map((recipe) => ({
    collection: "recipes",
    id: recipe.id,
    data: {
      ...recipe,
      updatedAt: now
    }
  }));

  const ingredients = OFFLINE_INGREDIENTS.map((ingredient) => ({
    collection: "ingredients",
    id: ingredient.name,
    data: ingredient
  }));

  const aliases = OFFLINE_INGREDIENT_ALIASES.map((alias) => ({
    collection: "ingredientAliases",
    id: alias.id,
    data: alias
  }));

  const indexDocs = Object.entries(OFFLINE_INGREDIENT_RECIPE_INDEX).map(([ingredient, recipeIds]) => ({
    collection: "ingredientRecipeIndex",
    id: ingredient,
    data: {
      ingredient,
      recipeIds,
      updatedAt: now
    }
  }));

  return {
    recipes,
    ingredients,
    aliases,
    indexDocs
  };
}

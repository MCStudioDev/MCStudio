import { OFFLINE_INGREDIENT_ALIASES } from "@/data/offline/aliases";
import { OFFLINE_HEALTH_TAGS } from "@/data/offline/healthTags";
import { OFFLINE_INGREDIENT_RECIPE_INDEX } from "@/data/offline/ingredientIndex";
import { OFFLINE_INGREDIENTS } from "@/data/offline/ingredients";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";
import { ensureBilingualRecipeCatalogDoc } from "@/data/offline/recipeMetadata";
import { OFFLINE_RECIPES } from "@/data/offline/recipes";

export function buildOfflineCatalogSeed() {
  const now = Date.now();

  const recipes = OFFLINE_RECIPES.map((recipe) => ({
    collection: "recipes",
    id: recipe.id,
    data: {
      ...ensureBilingualRecipeCatalogDoc(recipe),
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

  const ingredientLexicon = OFFLINE_INGREDIENT_TAXONOMY.map((ingredient) => ({
    collection: "ingredientLexicon",
    id: ingredient.canonical,
    data: ingredient
  }));

  const healthTags = OFFLINE_HEALTH_TAGS.map((tag) => ({
    collection: "healthTags",
    id: tag.id,
    data: tag
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
    ingredientLexicon,
    healthTags,
    indexDocs
  };
}

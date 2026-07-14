import type { Recipe } from "@/lib/types";
import { cuisineMatchesPreference } from "@/lib/cuisines";

export type RecipeStyle = "grilled" | "baked" | "pasta" | "rice" | "soup_stew" | "other";

export class RecipeRankingService {
  rank(recipes: Recipe[], input: { ingredients: string[]; preferredCuisine?: string; limit: number }) {
    const normalizedIngredients = new Set(input.ingredients.map(normalize));
    return recipes
      .map((recipe) => ({ recipe, score: this.score(recipe, normalizedIngredients, input.preferredCuisine) }))
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.recipe);
  }

  selectDiverse(recipes: Recipe[], limit: number) {
    const selected: Recipe[] = [];
    const usedStyles = new Set<RecipeStyle>();
    const seenNames = new Set<string>();
    for (const recipe of recipes) {
      const name = normalize(recipe.name);
      const style = getRecipeStyle(recipe);
      if (!name || seenNames.has(name) || (style !== "other" && usedStyles.has(style))) continue;
      selected.push(recipe);
      seenNames.add(name);
      if (style !== "other") usedStyles.add(style);
      if (selected.length === limit) return selected;
    }
    for (const recipe of recipes) {
      const name = normalize(recipe.name);
      if (!name || seenNames.has(name)) continue;
      selected.push(recipe);
      seenNames.add(name);
      if (selected.length === limit) break;
    }
    return selected;
  }

  private score(recipe: Recipe, ingredients: Set<string>, preferredCuisine?: string) {
    const recipeText = normalize([recipe.name, ...recipe.ingredients, ...recipe.missing_ingredients].join(" "));
    const ingredientScore = Array.from(ingredients).filter((ingredient) => recipeText.includes(ingredient)).length * 25;
    const cuisineScore = preferredCuisine && preferredCuisine !== "Any" && cuisineMatchesPreference(recipe.cuisine, preferredCuisine) ? 30 : 0;
    const sourceScore = recipe.recipe_source_type === "local_database" ? 20 : recipe.recipe_source_type === "external_source" ? 15 : -100;
    return ingredientScore + cuisineScore + sourceScore + Math.min(recipe.steps.length * 2, 16);
  }
}

export function getRecipeStyle(recipe: Recipe): RecipeStyle {
  const text = normalize([recipe.name, recipe.cook_time, ...recipe.steps].join(" "));
  if (/grill|grilled|barbecue|مشو/.test(text)) return "grilled";
  if (/bake|baked|roast|oven|يخبز|فرن/.test(text)) return "baked";
  if (/pasta|spaghetti|penne|macaroni|مكرون/.test(text)) return "pasta";
  if (/rice|risotto|pilaf|أرز/.test(text)) return "rice";
  if (/soup|stew|braise|simmer|شوربة|طاجن/.test(text)) return "soup_stew";
  return "other";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

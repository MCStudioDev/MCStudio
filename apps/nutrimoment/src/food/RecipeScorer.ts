import type { RankedRecipeResult, RecipeCatalogDoc } from "@/lib/domain";
import { buildPreferenceProfile } from "@/lib/preferences";
import { rankRecipes } from "@/services/rankingService";
import { IngredientGraph } from "@/food/IngredientGraph";
import { IngredientNormalizer } from "@/food/IngredientNormalizer";

export interface RecipeScorerInput {
  recipes: RecipeCatalogDoc[];
  ingredients: string[];
  preferredCuisine?: string;
  calorieTarget?: number;
  diets?: string[];
  conditions?: string[];
  allergens?: string[];
  mealType?: string;
}

export class RecipeScorer {
  constructor(
    private readonly ingredientGraph = new IngredientGraph(),
    private readonly ingredientNormalizer = new IngredientNormalizer()
  ) {}

  score(input: RecipeScorerInput): RankedRecipeResult[] {
    const preferredCuisine = input.preferredCuisine ?? "Any";
    const ingredientPlan = this.ingredientNormalizer.buildSearchPlan(input.ingredients);
    const expansionPlan = this.ingredientGraph.smartExpansionPlan(input.ingredients, preferredCuisine);
    const normalizedIngredients = Array.from(new Set([
      ...ingredientPlan.searchTerms,
      ...expansionPlan.ingredientIds,
      ...expansionPlan.ingredientIds.map((id) => id.replace(/_/g, " "))
    ]));
    const preferences = buildPreferenceProfile({
      preferredCuisine,
      calorieTarget: input.calorieTarget ?? 2000,
      diets: input.diets ?? [],
      conditions: input.conditions ?? [],
      allergens: input.allergens ?? []
    });
    const culinaryDishFamilies = expansionPlan.dishFamilies;

    return rankRecipes({
      recipes: input.recipes,
      normalizedIngredients,
      culinaryDishFamilies,
      preferredCuisine,
      maxCalories: preferences.nutritionGoals.maxCalories,
      mealType: input.mealType,
      preferences
    });
  }
}

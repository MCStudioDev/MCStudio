import { OFFLINE_RECIPES } from "@/data/offline/recipes";

export const runtime = "nodejs";

export async function GET() {
  const byMealType = OFFLINE_RECIPES.reduce<Record<string, number>>((acc, recipe) => {
    acc[recipe.mealType] = (acc[recipe.mealType] ?? 0) + 1;
    return acc;
  }, {});

  const byDiet = OFFLINE_RECIPES.reduce<Record<string, number>>((acc, recipe) => {
    recipe.dietTags.forEach((diet) => {
      acc[diet] = (acc[diet] ?? 0) + 1;
    });
    return acc;
  }, {});

  return Response.json({
    totalRecipes: OFFLINE_RECIPES.length,
    byMealType,
    byDiet
  });
}

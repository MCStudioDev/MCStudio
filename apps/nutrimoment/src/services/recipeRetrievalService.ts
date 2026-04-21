import { getRecipeIdsForIngredient } from "@/repositories/indexRepo";
import { getRecipesByIds, listSeededRecipes } from "@/repositories/recipeRepo";
import type { RecipeCatalogDoc } from "@/lib/domain";

export interface RetrieveRecipeCandidatesResult {
  candidateRecipes: RecipeCatalogDoc[];
  candidateRecipeIds: string[];
}

export async function retrieveRecipeCandidates(normalizedIngredients: string[]): Promise<RetrieveRecipeCandidatesResult> {
  if (!normalizedIngredients.length) {
    const seeded = listSeededRecipes()
      .filter((recipe) => recipe.isActive)
      .sort((left, right) => right.qualityScore + right.popularityScore - (left.qualityScore + left.popularityScore))
      .slice(0, 50);

    return {
      candidateRecipes: seeded,
      candidateRecipeIds: seeded.map((recipe) => recipe.id)
    };
  }

  const postings = await Promise.all(normalizedIngredients.map((ingredient) => getRecipeIdsForIngredient(ingredient)));
  const scoredIds = new Map<string, number>();

  postings.flat().forEach((recipeId) => {
    scoredIds.set(recipeId, (scoredIds.get(recipeId) ?? 0) + 1);
  });

  const sortedIds = Array.from(scoredIds.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 50)
    .map(([recipeId]) => recipeId);

  const candidateRecipes = await getRecipesByIds(sortedIds);
  return { candidateRecipes, candidateRecipeIds: sortedIds };
}

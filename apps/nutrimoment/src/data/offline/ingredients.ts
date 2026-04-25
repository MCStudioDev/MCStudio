import type { IngredientDoc } from "@/lib/domain";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";

export const OFFLINE_INGREDIENTS: IngredientDoc[] = OFFLINE_INGREDIENT_TAXONOMY.map((ingredient) => ({
  id: ingredient.id,
  name: ingredient.canonical,
  category: ingredient.category,
  broadCategory: ingredient.broadCategory,
  dietCompatibility: ingredient.dietCompatibility,
  commonSubstitutes: ingredient.commonSubstitutes,
  isActive: ingredient.isActive
}));

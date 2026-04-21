import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { OFFLINE_INGREDIENT_RECIPE_INDEX } from "@/data/offline/ingredientIndex";
import type { IngredientRecipeIndexDoc } from "@/lib/domain";

export async function getRecipeIdsForIngredient(canonicalIngredient: string): Promise<string[]> {
  const seeded = OFFLINE_INGREDIENT_RECIPE_INDEX[canonicalIngredient];
  if (seeded?.length) {
    return seeded;
  }

  try {
    const snap = await getDoc(doc(db, "ingredientRecipeIndex", canonicalIngredient));
    if (!snap.exists()) return [];
    const data = snap.data() as Omit<IngredientRecipeIndexDoc, "ingredient">;
    return Array.isArray(data.recipeIds) ? data.recipeIds : [];
  } catch {
    return [];
  }
}

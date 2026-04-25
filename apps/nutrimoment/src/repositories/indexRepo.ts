import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import { OFFLINE_INGREDIENT_RECIPE_INDEX } from "@/data/offline/ingredientIndex";
import type { IngredientRecipeIndexDoc } from "@/lib/domain";

export async function getRecipeIdsForIngredient(canonicalIngredient: string): Promise<string[]> {
  const seeded = OFFLINE_INGREDIENT_RECIPE_INDEX[canonicalIngredient] ?? [];
  const ids = new Set<string>(seeded);

  try {
    const snap = await getDoc(doc(db, "ingredientRecipeIndex", canonicalIngredient));
    if (snap.exists()) {
      const data = snap.data() as Omit<IngredientRecipeIndexDoc, "ingredient">;
      if (Array.isArray(data.recipeIds)) {
        data.recipeIds.forEach((recipeId) => ids.add(recipeId));
      }
    }
  } catch {
    // Ignore direct index lookup failure and continue to recipe query fallback.
  }

  try {
    const q = query(
      collection(db, "recipes"),
      where("ingredientCanonicals", "array-contains", canonicalIngredient),
      limit(600)
    );
    const snap = await getDocs(q);
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { id?: string; isActive?: boolean };
      const recipeId = typeof data.id === "string" ? data.id : docSnap.id;
      if (recipeId && data.isActive !== false) {
        ids.add(recipeId);
      }
    });
  } catch {
    // Ignore recipe fallback query failure and use whatever IDs we already have.
  }

  return Array.from(ids);
}

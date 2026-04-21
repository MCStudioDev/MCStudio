import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import { OFFLINE_RECIPES } from "@/data/offline/recipes";
import type { RecipeCatalogDoc } from "@/lib/domain";

export async function getRecipesByIds(recipeIds: string[]): Promise<RecipeCatalogDoc[]> {
  const ids = Array.from(new Set(recipeIds)).filter(Boolean);
  if (!ids.length) return [];

  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += 10) {
    chunks.push(ids.slice(index, index + 10));
  }

  const results: RecipeCatalogDoc[] = [];
  for (const chunk of chunks) {
    try {
      const q = query(collection(db, "recipes"), where("id", "in", chunk));
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        results.push(docSnap.data() as RecipeCatalogDoc);
      });
    } catch {
      // Ignore query failure and continue to direct doc fallback.
    }

    for (const id of chunk) {
      const seeded = OFFLINE_RECIPES.find((recipe) => recipe.id === id);
      if (seeded) {
        results.push(seeded);
        continue;
      }

      try {
        const snap = await getDoc(doc(db, "recipes", id));
        if (snap.exists()) {
          results.push(snap.data() as RecipeCatalogDoc);
        }
      } catch {
        // Ignore missing recipes during MVP retrieval.
      }
    }
  }

  return Array.from(new Map(results.filter((recipe) => recipe.isActive).map((recipe) => [recipe.id, recipe])).values());
}

export function listSeededRecipes(): RecipeCatalogDoc[] {
  return OFFLINE_RECIPES;
}

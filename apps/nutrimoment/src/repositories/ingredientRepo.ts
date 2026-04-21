import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/config/firebase";
import { OFFLINE_INGREDIENTS } from "@/data/offline/ingredients";
import type { IngredientDoc } from "@/lib/domain";

export async function getIngredientByName(name: string): Promise<IngredientDoc | null> {
  const normalized = name.trim().toLowerCase();
  const seeded = OFFLINE_INGREDIENTS.find((ingredient) => ingredient.name === normalized);
  if (seeded) return seeded;

  try {
    const snap = await getDoc(doc(db, "ingredients", normalized));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<IngredientDoc, "id">) };
  } catch {
    return null;
  }
}

export async function listSeededIngredients(): Promise<IngredientDoc[]> {
  try {
    const snap = await getDocs(collection(db, "ingredients"));
    const remote = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<IngredientDoc, "id">) }));
    return remote.length ? remote : OFFLINE_INGREDIENTS;
  } catch {
    return OFFLINE_INGREDIENTS;
  }
}

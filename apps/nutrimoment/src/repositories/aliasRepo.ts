import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import { OFFLINE_INGREDIENT_ALIASES } from "@/data/offline/aliases";
import type { IngredientAliasDoc } from "@/lib/domain";

export async function findIngredientAliases(rawTerms: string[]): Promise<IngredientAliasDoc[]> {
  const normalizedTerms = rawTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  if (!normalizedTerms.length) return [];

  const seeded = OFFLINE_INGREDIENT_ALIASES.filter((alias) => {
    const tokens = [alias.raw, ...alias.synonyms, ...alias.misspellings].map((value) => value.toLowerCase());
    return tokens.some((value) => normalizedTerms.includes(value));
  });

  try {
    const ref = collection(db, "ingredientAliases");
    const q = query(ref, where("raw", "in", normalizedTerms.slice(0, 10)));
    const snap = await getDocs(q);
    const remote = snap.docs.map((docSnap) => {
      const data = docSnap.data() as Omit<IngredientAliasDoc, "id">;
      return { id: docSnap.id, ...data };
    });
    return dedupeAliases([...seeded, ...remote]);
  } catch {
    return dedupeAliases(seeded);
  }
}

function dedupeAliases(aliases: IngredientAliasDoc[]) {
  return Array.from(new Map(aliases.map((alias) => [alias.id, alias])).values());
}

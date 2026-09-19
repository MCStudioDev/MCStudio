import { getAdminDb } from "@/lib/firebaseAdmin";
import { isSharedRecipeV2Searchable } from "@/services/sharedRecipeV2PolicyService";
import { arabicFingerprint } from "./fingerprint";
import type { Transaction } from "firebase-admin/firestore";
import type { RecipeCatalogDoc } from "@/lib/domain";
import type { Recipe } from "@/lib/types";
import { translateCuisineToEnglish } from "@/lib/arabicRecipeLocalization";
import { withTimeout } from "@/lib/utils";

/** Deliberately read-only: never import English cache repair/promotion helpers here. */
export async function readEnglishSource(id: string, transaction?: Transaction): Promise<RecipeCatalogDoc | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  const ref = getAdminDb().doc(`sharedRecipesV2/${id}`);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  if (!snapshot.exists) return null;
  const recipe = { ...snapshot.data(), id } as RecipeCatalogDoc;
  return isSharedRecipeV2Searchable(recipe) ? recipe : null;
}
export async function findEnglishSources(ingredients: string[], options: { pantryOptional?: boolean; cuisine?: string } = {}) {
  if (!ingredients.length && !options.pantryOptional) return [];
  const collection = getAdminDb().collection("sharedRecipesV2");
  const cuisine = translateCuisineToEnglish(options.cuisine ?? "Any");
  const queries = ingredients.length ? [collection.where("ingredientCanonicals", "array-contains-any", ingredients.slice(0, 10)).limit(50)] : [];
  if (options.pantryOptional) queries.push((cuisine.toLowerCase() !== "any" ? collection.where("cuisine", "==", cuisine) : collection).limit(200));
  const snapshots = await withTimeout(Promise.all(queries.map(query => query.get())), 5000, "Arabic English-source lookup");
  const sources = snapshots.flatMap(snapshot => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as RecipeCatalogDoc)).filter(isSharedRecipeV2Searchable);
  return [...new Map(sources.map(source => [source.id, source])).values()].slice(0, options.pantryOptional ? 200 : 50);
}
// Independent of the English publication receipt: quantities, units, times and
// localized ingredient text must also invalidate a translated derivative.
export function englishSourceFingerprint(source: RecipeCatalogDoc) {
  return `ar-source-v1-${arabicFingerprint({
    recipe: englishSourceRecipe(source), ingredients: source.ingredients,
    receipt: source.validationReceipt
  })}`;
}
export function englishSourceRecipe(source: RecipeCatalogDoc): Recipe {
  const localized = source.localized?.English;
  return {
    id: source.id,
    name: localized?.name ?? source.title,
    cuisine: localized?.cuisine ?? source.cuisine,
    ingredients: localized?.ingredients?.length ? localized.ingredients : source.ingredients.map(item => /^\s*\d/.test(item.name ?? "") ? item.name : `${item.quantity ?? ""} ${item.unit ?? ""} ${item.name || item.canonical}`.trim()),
    missing_ingredients: localized?.missing_ingredients ?? [],
    steps: localized?.steps?.length ? localized.steps : source.steps,
    calories: source.calories, protein: `${source.protein}g`, carbs: `${source.carbs}g`, fat: `${source.fat}g`,
    cook_time: `${source.totalMinutes} minutes`, difficulty: source.difficulty,
    image_url: localized?.image_url ?? source.image?.storagePath,
    image_source: localized?.image_source ?? (source.image?.source === "replicate" ? "replicate" : undefined),
    image_attribution_name: localized?.image_attribution_name,
    image_attribution_url: localized?.image_attribution_url,
    photo_identity: localized?.photo_identity,
    source_recipe_id: source.id
  };
}

import type { Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isDiscoverableRecipeReferenceDoc } from "@/data/offline/firestoreRecipeReferenceCatalog";
import { buildRecipeEditorCacheKey, type RecipeEditorCacheInput } from "@/services/recipeEditorSemanticCache";
import { findRecipeReferencesForGeneration } from "@/services/recipeReferenceService";
import type { RecipeReferenceDoc, RecipeReferencePromptRecipe } from "@/lib/recipeReferenceTypes";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { Recipe } from "@/lib/types";
import { arabicFingerprint } from "./fingerprint";
import { ARABIC_VALIDATOR_VERSION } from "./config";
import { logger } from "@/lib/logger";

const editorVersion = "recipe-editor-v11-validation-identity-v1";
export async function readEnglishEditorForArabic(input: RecipeEditorCacheInput) {
  // Only the pure key function is shared. No English cache get/set, memory
  // warming, repair, promotion or generation helper is called.
  const key = buildRecipeEditorCacheKey({ ...input, recipeLanguage: "English" });
  const value = (await getAdminDb().doc(`recipeEditorSemanticCache/${key}`).get()).data();
  if (value?.cacheVersion !== editorVersion || typeof value.expiresAt?.toMillis !== "function" || value.expiresAt.toMillis() <= Date.now() || !value.recipe) return null;
  return { key, recipe: value.recipe as Recipe, fingerprint: arabicFingerprint(value.recipe) };
}
export function arabicVariantKey(sourceFingerprint: string, input: RecipeEditorCacheInput) {
  const sorted = (values: string[]) => [...values].map(value => value.toLowerCase()).sort();
  return arabicFingerprint({ version: ARABIC_VALIDATOR_VERSION, sourceFingerprint, cuisine: input.preferredCuisine,
    pantry: input.availableIngredients.map(item => `${item.name}:${item.quantity ?? ""}`).sort(),
    diets: sorted(input.diets), conditions: sorted(input.conditions), allergens: sorted(input.allergens), exclusions: sorted(input.excludedIngredients) });
}
export function referenceFingerprint(source: RecipeReferenceDoc) {
  return arabicFingerprint({ title: source.title, ingredients: source.ingredients, directions: source.directions, cuisine: source.cuisine,
    publication: source.publishStatus, quality: source.qualityStatus, taxonomy: source.taxonomy, source: source.source, version: source.contentVersion });
}
export async function readArabicReferenceSource(id: string, transaction?: Transaction) {
  if (!/^[\w-]+$/.test(id)) return null;
  const ref = getAdminDb().doc(`${process.env.RECIPE_REFERENCE_COLLECTION || "recipeReferenceRecipes"}/${id}`);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  if (!snapshot.exists) return null;
  const source = { ...snapshot.data(), id } as RecipeReferenceDoc;
  return isDiscoverableRecipeReferenceDoc(source) ? source : null;
}
export interface ArabicReferenceCandidate {
  reference: RecipeReferencePromptRecipe; fingerprint: string; variantKey: string;
  edited?: Awaited<ReturnType<typeof readEnglishEditorForArabic>>;
}
export async function findArabicReferenceCandidates(ingredients: string[], cuisine: string, restrictions: GenerationRestrictions, count: number): Promise<ArabicReferenceCandidate[]> {
  // This existing retrieval service performs reads only. Dietary ranking is
  // merely retrieval; each resulting Arabic recipe is independently validated.
  const references = await findRecipeReferencesForGeneration({ ingredients, preferredCuisine: cuisine, ...restrictions, maxReferences: Math.min(count + 6, 30) });
  const results = await Promise.allSettled(references.map(async reference => {
    const source = await readArabicReferenceSource(reference.id);
    if (!source) return null;
    const fingerprint = referenceFingerprint(source);
    const input: RecipeEditorCacheInput = { sourceRecipe: reference, recipeLanguage: "English", preferredCuisine: cuisine,
      availableIngredients: ingredients.map(name => ({ name })), ...restrictions, excludedIngredients: [] };
    let edited: Awaited<ReturnType<typeof readEnglishEditorForArabic>> = null;
    try { edited = await readEnglishEditorForArabic(input); }
    catch { logger.warn("English editor cache unavailable to Arabic reader"); }
    return { reference, fingerprint, variantKey: arabicVariantKey(fingerprint, input), edited };
  }));
  if (results.some(result => result.status === "rejected")) logger.warn("Some Arabic reference candidates could not be read");
  return results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
}

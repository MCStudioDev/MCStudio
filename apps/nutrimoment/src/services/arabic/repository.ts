import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { completeFreeAiAction, type RequestAccess } from "@/services/authService";
import type { HistoryItem, MealPlanData, Recipe } from "@/lib/types";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { ArabicRecipeEntry } from "./types";
import { readEnglishSource, englishSourceFingerprint } from "./englishSources";
import { arabicSourceIsCurrent } from "./sourceEligibility";
export { arabicFingerprint } from "./fingerprint";

function segment(value: string) {
  if (!/^[\w-]+$/.test(value)) throw new Error("Invalid Arabic storage identifier");
  return value;
}
export const arabicPaths = {
  resolution: (id: string) => `ingredientResolutionsArabicV1/${segment(id)}`,
  variant: (id: string) => `recipeVariantsArabicV1/${segment(id)}`,
  image: (id: string) => `recipePhotoCacheArabicV1/${segment(id)}`,
  shared: (id: string) => `sharedRecipesArabicV1/${segment(id)}`,
  userCache: (uid: string, id: string) => `users/${segment(uid)}/offlineRecipeCacheArabicV1/${segment(id)}`,
  history: (uid: string, id: string) => `users/${segment(uid)}/historyArabicV1/${segment(id)}`,
  plan: (uid: string) => `users/${segment(uid)}/plans/currentWeeklyArabic`
};
export function assertArabicWritePath(path: string) {
  if (!/^(?:(?:sharedRecipesArabicV1|recipePhotoCacheArabicV1|ingredientResolutionsArabicV1|recipeVariantsArabicV1)\/[\w-]+|users\/[\w-]+\/(?:offlineRecipeCacheArabicV1\/[\w-]+|historyArabicV1\/[\w-]+|plans\/currentWeeklyArabic))$/.test(path)) {
    throw new Error("Write outside Arabic content namespace denied");
  }
}
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export async function listArabicRecipes(ingredients: string[]) {
  if (!ingredients.length) return [];
  const snapshot = await getAdminDb().collection("sharedRecipesArabicV1")
    .where("ingredientCanonicals", "array-contains-any", ingredients.slice(0, 10)).limit(50).get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as ArabicRecipeEntry);
}
export async function saveArabicResult(input: {
  uid: string; requestId: string; entries: ArabicRecipeEntry[]; ingredients: string[];
  restrictions: GenerationRestrictions; mealPlan?: MealPlanData; displayedRecipes?: Recipe[]; imageActionGrantId?: string;
  billing?: { access: RequestAccess; actionId?: string };
}) {
  const writes: Array<{ path: string; data: object }> = [];
  for (const entry of input.entries) {
    if (entry.variantKey) writes.push({ path: arabicPaths.variant(entry.variantKey), data: { recipeId: entry.id, fingerprint: entry.fingerprint, validatorVersion: entry.validatorVersion } });
    writes.push({ path: arabicPaths.shared(entry.id), data: entry });
    writes.push({ path: arabicPaths.userCache(input.uid, entry.id), data: entry });
  }
  const timestamp = new Date().toISOString();
  const englishSources = Object.fromEntries(input.entries.filter(entry => entry.source).map(entry => [entry.id, entry.source]));
  const history: Omit<HistoryItem, "id"> & { generationLanguage: string; effectiveRestrictions: GenerationRestrictions } = {
    timestamp, completedAt: timestamp, title: input.mealPlan ? "خطة أسبوعية بالعربية" : "وصفات بالعربية",
    sessionType: input.mealPlan ? "weekly_meal_plan" : "recipe_generation", ingredients: input.ingredients,
    recipes: input.displayedRecipes ?? input.entries.map(entry => entry.recipe), generationStatus: "completed", generationLanguage: "ar",
    effectiveRestrictions: input.restrictions, imageActionGrantId: input.imageActionGrantId
  };
  writes.push({ path: arabicPaths.history(input.uid, input.requestId), data: { ...history, englishSources } });
  if (input.mealPlan) writes.push({ path: arabicPaths.plan(input.uid), data: { mealPlan: input.mealPlan, effectiveRestrictions: input.restrictions, generationLanguage: "ar", englishSources } });
  writes.forEach(({ path }) => assertArabicWritePath(path));
  const db = getAdminDb();
  const publish = async (transaction: Transaction) => {
    // Firestore retries if a source changes during publication; all writes
    // remain in Arabic collections even though the transaction reads English.
    for (const entry of input.entries) if (entry.source) {
      if (!await arabicSourceIsCurrent(entry.source, transaction)) throw new Error("English source changed before Arabic publication");
    }
    for (const { path, data } of writes) transaction.set(db.doc(path), { ...clean(data), updatedAt: FieldValue.serverTimestamp() });
  };
  if (input.billing) return completeFreeAiAction(input.billing.access, input.billing.actionId, publish);
  await db.runTransaction(publish);
}
export async function readArabicHistory(uid: string) {
  const path = arabicPaths.history(uid, "placeholder").split("/").slice(0, -1).join("/");
  const snapshot = await getAdminDb().collection(path).orderBy("timestamp", "desc").limit(50).get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: `ar:${doc.id}` } as HistoryItem & { englishSources?: Record<string, { id: string; fingerprint: string }> }));
}
export async function removeArabicHistory(uid: string, id: string) {
  const path = arabicPaths.history(uid, id); assertArabicWritePath(path);
  await getAdminDb().doc(path).delete();
}

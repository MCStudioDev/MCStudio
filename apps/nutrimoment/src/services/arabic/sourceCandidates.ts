import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import { findUnverifiedCompositeProtein } from "@/lib/compositeProteinSafety";
import { findKnownDish } from "@/lib/recipePhotoIdentity";
import { withTimeout } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { Recipe } from "@/lib/types";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import { englishSourceFingerprint, englishSourceRecipe, findEnglishSources, readEnglishSource } from "./englishSources";
import { findArabicReferenceCandidates, readArabicReferenceSource, referenceFingerprint, type ArabicReferenceCandidate } from "./referenceSources";
import { listTrustedArabicSources, readTrustedArabicSource, trustedArabicSourceFingerprint } from "./trustedSources";
import { arabicCuisineMatches } from "./cuisineGuidance";
import { normalizeArabicInputs } from "./ingredients";
import { findArabicFood } from "./foodCatalog";
import { arabicFingerprint } from "./fingerprint";
import type { ArabicRecipeEntry } from "./types";

type Source = NonNullable<ArabicRecipeEntry["source"]>;
type Editor = { key: string; fingerprint: string; recipe: Recipe };
const editorVersion = "recipe-editor-v11-validation-identity-v1";
const READ_LIMIT = 200;

export function sameArabicSourceDish(left: string, right: string) {
  const a = findKnownDish(left), b = findKnownDish(right);
  return a && b ? a.key === b.key : left.trim().toLowerCase() === right.trim().toLowerCase();
}
export async function arabicSourceFoodIds(ingredients: string[]) {
  // Preparation suffixes are not extra ingredients. This is retrieval metadata;
  // the complete original lines remain in the correction prompt and validator.
  const normalized = await normalizeArabicInputs(ingredients.map(line => line.split(",")[0]));
  return { ids: [...new Set(normalized.canonical.flatMap(name => findArabicFood(name)?.id ?? []))],
    names: normalized.canonical, unclear: normalized.unclear.length > 0 || normalized.canonical.some(name => !findArabicFood(name)) };
}
function unsafe(recipe: Recipe, restrictions: GenerationRestrictions) {
  return findUnverifiedCompositeProtein(recipe) || findRecipeDietViolation(recipe, restrictions) || findRecipeHealthViolation(recipe, restrictions.conditions);
}
async function readCurrentEditors(): Promise<Editor[]> {
  // A bounded, indexed expiry query. No whole-collection scan, write-capable
  // English cache helper, cache warming, new English index, or migration.
  const snapshot = await withTimeout(getAdminDb().collection("recipeEditorSemanticCache")
    .where("expiresAt", ">", Timestamp.fromMillis(Date.now())).orderBy("expiresAt", "desc").limit(READ_LIMIT).get(), 5000, "Arabic semantic source lookup");
  return snapshot.docs.flatMap(doc => {
    const value = doc.data();
    if (!/^[a-f0-9]{64}$/.test(doc.id) || value.cacheVersion !== editorVersion || typeof value.expiresAt?.toMillis !== "function"
      || value.expiresAt.toMillis() <= Date.now() || !value.recipe?.source_recipe_id || !Array.isArray(value.recipe.ingredients) || !Array.isArray(value.recipe.steps)) return [];
    return [{ key: doc.id, fingerprint: arabicFingerprint(value.recipe), recipe: value.recipe as Recipe }];
  });
}
async function resolveEditorSource(editor: Editor) {
  const id = editor.recipe.source_recipe_id!;
  if (!/^[\w-]+$/.test(id)) return null;
  const trusted = readTrustedArabicSource(id);
  if (trusted) return { recipe: englishSourceRecipe(trusted), names: trusted.ingredientCanonicals, servings: trusted.servings,
    source: { kind: "trusted", id, fingerprint: trustedArabicSourceFingerprint(trusted) } as Source };
  const shared = await readEnglishSource(id);
  if (shared) return { recipe: englishSourceRecipe(shared), names: shared.ingredientCanonicals, servings: shared.servings,
    source: { kind: "shared", id, fingerprint: englishSourceFingerprint(shared) } as Source };
  const reference = await readArabicReferenceSource(id);
  if (!reference) return null;
  return { recipe: { name: reference.title, cuisine: reference.cuisine ?? "Any", ingredients: reference.ingredients, missing_ingredients: [], steps: reference.directions } as unknown as Recipe,
    source: { kind: "reference", id, fingerprint: referenceFingerprint(reference) } as Source, names: reference.ingredients, servings: undefined };
}

export async function findArabicSourceCandidates(ingredients: string[], cuisine: string, restrictions: GenerationRestrictions, count: number): Promise<ArabicReferenceCandidate[]> {
  if (!ingredients.length) return [];
  const limit = Math.min(count + 6, 20);
  const owned = new Set(ingredients.flatMap(name => findArabicFood(name)?.id ?? []));
  const results: Array<ArabicReferenceCandidate & { score: number }> = [];
  const add = async (recipe: Recipe, source: Source, names?: string[], edited?: Editor, servings?: number) => {
    if (!recipe?.name || !arabicCuisineMatches(recipe.cuisine, cuisine) || unsafe(recipe, restrictions)) return;
    if (edited && (unsafe(edited.recipe, restrictions) || !sameArabicSourceDish(edited.recipe.name, recipe.name))) return;
    const foods = await arabicSourceFoodIds(names ?? [...recipe.ingredients, ...(recipe.missing_ingredients ?? [])]);
    const matching = foods.ids.filter(id => owned.has(id));
    if (!matching.length || foods.unclear || !foods.ids.length) return;
    const linked = { ...source, ...(edited ? { editorKey: edited.key, editorFingerprint: edited.fingerprint } : {}) };
    const fingerprint = arabicFingerprint({ linked, version: "ar-source-correction-v1" });
    const key = arabicFingerprint({ fingerprint, cuisine, restrictions: { diets: [...restrictions.diets].sort(), conditions: [...restrictions.conditions].sort(), allergens: [...restrictions.allergens].sort() } });
    results.push({ source: linked, fingerprint: source.fingerprint, variantKey: key, requiredFoodIds: foods.ids, sourceServings: servings, edited,
      reference: { id: `ar-source-${fingerprint.slice(0, 24)}`, title: recipe.name, cuisine: recipe.cuisine,
        ingredients: [...recipe.ingredients, ...(recipe.missing_ingredients ?? [])], steps: recipe.steps,
        matchedIngredients: foods.names.filter(name => owned.has(findArabicFood(name)?.id ?? "")) },
      score: matching.length * 20 - (foods.ids.length - matching.length) * 2 + (edited ? 3 : 0) });
  };
  const batches = await Promise.allSettled([
    findArabicReferenceCandidates(ingredients, cuisine, restrictions, count),
    findEnglishSources(ingredients), readCurrentEditors()
  ]);
  const refs = batches[0];
  if (refs.status === "fulfilled") for (const row of refs.value) {
    const recipe = { name: row.reference.title, cuisine: row.reference.cuisine, ingredients: row.reference.ingredients, missing_ingredients: [], steps: row.reference.steps } as unknown as Recipe;
    await add(recipe, { kind: "reference", id: row.reference.id, fingerprint: row.fingerprint }, undefined, row.edited ?? undefined);
  }
  const shared = batches[1];
  if (shared.status === "fulfilled") for (const row of shared.value) await add(englishSourceRecipe(row), { kind: "shared", id: row.id, fingerprint: englishSourceFingerprint(row) }, row.ingredientCanonicals, undefined, row.servings);
  for (const row of listTrustedArabicSources()) await add(englishSourceRecipe(row), { kind: "trusted", id: row.id, fingerprint: trustedArabicSourceFingerprint(row) }, row.ingredientCanonicals, undefined, row.servings);
  const editors = batches[2];
  if (editors.status === "fulfilled") {
    // Check cuisine/diet/pantry before source hydration to bound Firestore reads.
    const ranked = await Promise.all(editors.value.filter(item => arabicCuisineMatches(item.recipe.cuisine, cuisine) && !unsafe(item.recipe, restrictions)).map(async item => {
      const foods = await arabicSourceFoodIds([...item.recipe.ingredients, ...(item.recipe.missing_ingredients ?? [])]);
      return { item, score: foods.ids.filter(id => owned.has(id)).length };
    }));
    const selected = ranked.filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    const hydrated = await Promise.allSettled(selected.map(async ({ item }) => {
      const source = await resolveEditorSource(item);
      if (source) await add(source.recipe, source.source, source.names, item, source.servings);
    }));
    if (hydrated.some(row => row.status === "rejected")) logger.warn("Some Arabic semantic sources could not be verified");
  }
  if (batches.some(row => row.status === "rejected")) logger.warn("Some Arabic source lookups failed; remaining sources remain available");
  const seen = new Set<string>();
  return results.sort((a, b) => b.score - a.score).filter(row => {
    const identity = findKnownDish(row.reference.title)?.key ?? row.reference.title.trim().toLowerCase();
    const key = `${identity}:${[...row.requiredFoodIds!].sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, limit).map(row => ({ reference: row.reference, source: row.source, fingerprint: row.fingerprint, variantKey: row.variantKey,
    requiredFoodIds: row.requiredFoodIds, sourceServings: row.sourceServings, edited: row.edited }));
}

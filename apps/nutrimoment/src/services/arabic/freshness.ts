import { z } from "zod";
import type { Recipe } from "@/lib/types";
import { arabicFingerprint } from "./fingerprint";
import { normalizeArabicInputs } from "./ingredients";
import { recipeFactsIdentity } from "./recipeFacts";
import type { ArabicRecipeEntry } from "./types";

export const ARABIC_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ARABIC_WEEKLY_FRESHNESS_WINDOW_MS = 7 * ARABIC_FRESHNESS_WINDOW_MS;
const storedSchema = z.object({
  version: z.literal("ar-freshness-v1"), ingredientKey: z.string(),
  keys: z.array(z.string()).max(200), names: z.array(z.string()).max(60)
});
export type ArabicFreshnessRecord = z.infer<typeof storedSchema>;
export type ArabicRecentRecipes = { shownAt: Map<string, number>; names: string[]; previousWeekKeys?: Set<string> };

const normalizeName = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const arabicRecipeNameKey = (name: string) => `name:${normalizeName(name)}`;
export const arabicSourceKey = (source: NonNullable<ArabicRecipeEntry["source"]>) => `source:${source.kind ?? "shared"}:${source.id}`;
export const arabicIngredientContextKey = (canonical: string[]) => arabicFingerprint([...new Set(canonical.map(normalizeName))].sort());

function recipeKeys(recipe: Pick<Recipe, "name" | "ingredients" | "steps"> & Partial<Recipe>) {
  return [
    ...(recipe.id ? [`id:${recipe.id}`] : []), arabicRecipeNameKey(recipe.name),
    `text:${arabicFingerprint({ ingredients: [...recipe.ingredients, ...(recipe.missing_ingredients ?? [])].map(normalizeName).sort(), steps: recipe.steps.map(normalizeName) })}`
  ];
}
export function arabicEntryFreshnessKeys(entry: ArabicRecipeEntry) {
  return [...new Set([...recipeKeys(entry.recipe), ...recipeKeys(entry.canonical),
    ...(entry.facts ? [`facts:${recipeFactsIdentity(entry.facts)}`] : []),
    ...(entry.source ? [arabicSourceKey(entry.source)] : [])])];
}
export function buildArabicFreshnessRecord(canonical: string[], entries: ArabicRecipeEntry[]): ArabicFreshnessRecord {
  return { version: "ar-freshness-v1", ingredientKey: arabicIngredientContextKey(canonical),
    keys: [...new Set(entries.flatMap(arabicEntryFreshnessKeys))],
    names: [...new Set(entries.flatMap(entry => [entry.recipe.name, entry.canonical.name]))] };
}

const oldRecipeSchema = z.object({ id: z.string().optional(), name: z.string(), ingredients: z.array(z.string()),
  missing_ingredients: z.array(z.string()).optional(), steps: z.array(z.string()) });
export async function buildArabicRecentRecipes(history: Record<string, unknown>[], canonical: string[], now = Date.now()): Promise<ArabicRecentRecipes> {
  const ingredientKey = arabicIngredientContextKey(canonical), shownAt = new Map<string, number>(), names = new Set<string>();
  for (const row of history) {
    const timestamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= now - ARABIC_FRESHNESS_WINDOW_MS || timestamp > now
      || row.sessionType !== "recipe_generation" || row.generationStatus !== "completed") continue;
    const saved = storedSchema.safeParse(row.recipeFreshness);
    let keys: string[], rowNames: string[];
    if (saved.success) {
      if (saved.data.ingredientKey !== ingredientKey) {
        // Alias corrections must not make previously shown dishes look new.
        // Re-read the original input without rewriting stored history.
        if (!Array.isArray(row.ingredients) || !row.ingredients.every(value => typeof value === "string")) continue;
        const normalized = await normalizeArabicInputs(row.ingredients);
        if (normalized.unclear.length || arabicIngredientContextKey(normalized.canonical) !== ingredientKey) continue;
      }
      keys = saved.data.keys; rowNames = saved.data.names;
    } else {
      // Read older Arabic history without migrating or rewriting its recipes.
      if (!Array.isArray(row.ingredients) || !row.ingredients.every(value => typeof value === "string")) continue;
      const normalized = await normalizeArabicInputs(row.ingredients);
      if (normalized.unclear.length || arabicIngredientContextKey(normalized.canonical) !== ingredientKey) continue;
      const recipes = z.array(oldRecipeSchema).safeParse(row.recipes);
      if (!recipes.success) continue;
      keys = recipes.data.flatMap(recipeKeys); rowNames = recipes.data.map(recipe => recipe.name);
    }
    for (const key of keys) shownAt.set(key, Math.max(shownAt.get(key) ?? 0, timestamp));
    rowNames.forEach(name => names.add(name));
  }
  return { shownAt, names: [...names] };
}
export function arabicLastShownAt(entry: ArabicRecipeEntry, recent: ArabicRecentRecipes) {
  return Math.max(0, ...arabicEntryFreshnessKeys(entry).map(key => recent.shownAt.get(key) ?? 0));
}
/** A changed pantry/cuisine must not erase the meals shown in recent weeks.
 * Older Arabic history is read in place; no English history is consulted.
 */
export function buildArabicRecentWeeklyMeals(history: Record<string, unknown>[], now = Date.now()): ArabicRecentRecipes {
  const shownAt = new Map<string, number>(), names = new Set<string>();
  let latest = 0, previousWeekKeys: Set<string> | undefined;
  for (const row of history) {
    const timestamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= now - ARABIC_WEEKLY_FRESHNESS_WINDOW_MS || timestamp > now
      || row.sessionType !== "weekly_meal_plan" || row.generationStatus !== "completed") continue;
    const saved = storedSchema.safeParse(row.recipeFreshness);
    const recipes = z.array(oldRecipeSchema).length(21).safeParse(row.recipes);
    if (!recipes.success) continue;
    const keys = saved.success ? saved.data.keys : recipes.data.flatMap(recipeKeys);
    const rowNames = saved.success ? saved.data.names : recipes.data.map(recipe => recipe.name);
    for (const key of keys) shownAt.set(key, Math.max(shownAt.get(key) ?? 0, timestamp));
    rowNames.forEach(name => names.add(name));
    if (timestamp > latest) { latest = timestamp; previousWeekKeys = new Set(keys); }
  }
  return { shownAt, names: [...names], previousWeekKeys };
}
export function repeatsPreviousArabicWeek(entries: ArabicRecipeEntry[], recent: ArabicRecentRecipes) {
  return !!recent.previousWeekKeys?.size && entries.every(entry =>
    arabicEntryFreshnessKeys(entry).some(key => recent.previousWeekKeys!.has(key)));
}
export function rotateArabicCandidates<T>(rows: T[], seed: string, key: (row: T) => string): T[] {
  return rows.map(row => ({ row, rank: arabicFingerprint({ seed, key: key(row) }) }))
    .sort((a, b) => a.rank.localeCompare(b.rank)).map(item => item.row);
}

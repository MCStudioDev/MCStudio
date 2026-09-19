import { FOOD_DICTIONARY } from "@/food/FoodDictionary";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";
import { ARABIC_CULINARY_DICTIONARY } from "@/data/culinary/arabicCulinaryDictionary";
import { IngredientKnowledgeGraph } from "@/lib/IngredientKnowledgeGraph";
import { getAllCuisineCatalogV2Entries } from "@/lib/cuisineCatalogs/v2";
import { translateIngredientToArabic } from "@/lib/arabicRecipeLocalization";
import { findUnverifiedCompositeProtein } from "@/lib/compositeProteinSafety";

export interface ArabicFood {
  id: string; en: string; ar: string; aliases: string[]; categories: string[];
}
export const ARABIC_FOOD_VERSION = "ar-food-v1";
export const foodTerm = (text: string) => text.toLowerCase().normalize("NFKC")
  .replace(/[ًٌٍَُِّْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
const foods = new Map<string, ArabicFood>();
function add(en: string, ar: string, aliases: string[] = [], categories: string[] = []) {
  if (!en || findUnverifiedCompositeProtein({ ingredients: [en] })) return;
  if (/[a-z]/i.test(ar) || !/[\u0600-\u06ff]/.test(ar)) ar = "";
  const inputKey = foodTerm(en);
  const previous = foods.get(inputKey) ?? foods.get(inputKey.replace(/s$/, "")) ?? foods.get(`${inputKey}s`);
  const key = previous ? foodTerm(previous.en) : inputKey;
  foods.set(key, { id: `food-${key.replace(/[^a-z0-9]+/g, "-")}`, en: previous?.en ?? en, ar: previous?.ar || ar,
    aliases: [...new Set([...(previous?.aliases ?? []), en, ar, ...aliases].filter(Boolean))],
    categories: [...new Set([...(previous?.categories ?? []), ...categories])] });
}
// Read the existing food knowledge. This index is private to Arabic and never
// promotes model output into a global dictionary or changes English profiles.
for (const item of FOOD_DICTIONARY.ingredients) add(item.canonicalEnglishName, item.canonicalArabicName,
  [...item.aliases, ...item.synonyms, ...item.pluralForms, ...item.spellingMistakes, ...item.ocrMistakes], item.category ? [item.category] : []);
for (const item of OFFLINE_INGREDIENT_TAXONOMY.filter(item => item.isActive)) add(item.canonical,
  item.variants.find(v => v.locale === "ar")?.values[0] ?? "", item.variants.flatMap(v => v.values).concat(item.misspellings ?? []), [item.category, item.broadCategory ?? ""]);
const knownNames = new Set([
  ...getAllCuisineCatalogV2Entries().flatMap(item => [...item.ingredients.required, ...item.ingredients.optional]),
  ...Object.values(IngredientKnowledgeGraph).flatMap(item => [item.ingredient, ...item.flavorPairings, ...item.commonHerbs, ...item.commonSpices, ...item.sauces])
]);
for (const [en, ar] of Object.entries(ARABIC_CULINARY_DICTIONARY.ingredients)) {
  if ([en, en.replace(/s$/, ""), `${en}s`].some(name => knownNames.has(name) || foods.has(foodTerm(name)))) add(en, ar);
}
for (const en of knownNames) add(en, translateIngredientToArabic(en));
// Composition/property inheritance, not a translation alias. A bread-derived
// ingredient retains the grain restriction even when its surface word differs.
for (const item of foods.values()) {
  const graph = IngredientKnowledgeGraph[item.en];
  if (graph) item.categories.push(graph.category);
  for (const parent of OFFLINE_INGREDIENT_TAXONOMY) {
    if (parent.canonical.length >= 4 && item.en.includes(parent.canonical)) item.categories.push(parent.category, parent.broadCategory ?? "");
  }
}
export const arabicFoods: readonly ArabicFood[] = [...foods.values()].sort((a, b) => a.id.localeCompare(b.id));
const byId = new Map(arabicFoods.map(item => [item.id, item]));
const canonicalNames = new Map(arabicFoods.map(item => [foodTerm(item.en), item]));
const preciseLabels = new Map<string, Set<ArabicFood>>();
for (const [english, arabic] of Object.entries(ARABIC_CULINARY_DICTIONARY.ingredients)) {
  const food = canonicalNames.get(foodTerm(english));
  if (!food) continue;
  const label = foodTerm(arabic);
  preciseLabels.set(label, new Set([...(preciseLabels.get(label) ?? []), food]));
}
// Prefer existing unambiguous, precise translations over broad taxonomy
// aliases. Do not infer a food identity from substring/parent-name similarity.
for (const [label, candidates] of preciseLabels) if (candidates.size === 1) canonicalNames.set(label, [...candidates][0]);
const aliases = new Map<string, ArabicFood>();
for (const item of arabicFoods) for (const alias of item.aliases) {
  const key = foodTerm(alias);
  // Prefer canonical exact names over broader aliases and singular/plural variants.
  if (!aliases.has(key) || key === foodTerm(item.en)) aliases.set(key, item);
}
for (const item of OFFLINE_INGREDIENT_TAXONOMY.filter(item => item.isActive)) {
  const food = foods.get(foodTerm(item.canonical));
  if (food) for (const alias of item.variants.flatMap(variant => variant.values)) aliases.set(foodTerm(alias), food);
}
export const arabicFoodById = (id: string) => byId.get(id);
export function findArabicFood(term: string): ArabicFood | undefined {
  const key = foodTerm(term);
  // Taxonomy aliases are useful fallbacks, never overrides of exact identities.
  return canonicalNames.get(key) ?? aliases.get(key) ?? aliases.get(key.replace(/s$/, "")) ?? aliases.get(`${key}s`);
}

export function rankArabicFoodCandidates(term: string, limit = 6) {
  const key = foodTerm(term), tokens = key.split(" ");
  const distance = (a: string, b: string) => {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
      row = next;
    }
    return row[b.length];
  };
  return arabicFoods.map(food => ({ food, score: Math.max(...food.aliases.map(alias => {
    const other = foodTerm(alias);
    return Math.max(1 - distance(key, other) / Math.max(key.length, other.length, 1), tokens.filter(t => other.split(" ").includes(t)).length / Math.max(tokens.length, other.split(" ").length));
  })) })).filter(item => item.score >= 0.55).sort((a, b) => b.score - a.score).slice(0, limit);
}

import { getCompleteCuisineCatalog } from "@/lib/cuisineCatalogs/completeCatalogs";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import { normalizeArabicInputs } from "./ingredients";
import { translateCuisineToEnglish } from "@/lib/arabicRecipeLocalization";
import type { ArabicRecipeEntry } from "./types";

export function arabicCuisineMatches(actual: string, requested: string) {
  if (!requested || requested.toLowerCase() === "any") return true;
  return translateCuisineToEnglish(actual).toLowerCase() === translateCuisineToEnglish(requested).toLowerCase();
}

/** Stable preference ranking; callers still validate every dietary/pantry rule. */
export function prioritizeArabicCuisine<T>(items: T[], requested: string, cuisine: (item: T) => string): T[] {
  return [...items].sort((a, b) => Number(arabicCuisineMatches(cuisine(b), requested)) - Number(arabicCuisineMatches(cuisine(a), requested)));
}

export function prioritizeArabicPantry(entries: ArabicRecipeEntry[], pantry: string[]) {
  const owned = new Set(pantry);
  const matches = (entry: ArabicRecipeEntry) => (Array.isArray(entry.ingredientCanonicals) ? entry.ingredientCanonicals : []).filter(name => owned.has(name)).length;
  return [...entries].sort((a, b) => matches(b) - matches(a));
}

export async function buildArabicCuisineGuidance(cuisine: string, pantry: string[], restrictions: GenerationRestrictions, pantryOptional = false) {
  const catalog = getCompleteCuisineCatalog(cuisine);
  if (!catalog) return [];
  // Read-only dish descriptions guide fresh generation; they are not cached
  // recipes, publication receipts, or permission to bypass validation.
  const candidates = [...catalog].filter(dish => {
    const subject = { name: dish.names.english[0], ingredients: dish.primaryIngredients };
    return !dish.mealTypes.every(type => type === "dessert" || type === "drink")
      && !findRecipeDietViolation(subject, restrictions)
      && !findRecipeHealthViolation(subject, restrictions.conditions);
  }).sort((a, b) => b.iconicScore - a.iconicScore).slice(0, 80);
  const ranked = await Promise.all(candidates.map(async dish => {
    const normalized = await normalizeArabicInputs(dish.primaryIngredients);
    const available = normalized.canonical.filter(name => pantry.includes(name));
    return { name: dish.names.english[0], nativeName: dish.names.native[0], description: dish.description,
      essentialIngredients: dish.primaryIngredients, mealTypes: dish.mealTypes, availableIngredients: available, score: dish.iconicScore + available.length * 20 };
  }));
  return ranked.filter(dish => dish.availableIngredients.length > 0 || pantryOptional)
    .sort((a, b) => b.score - a.score).slice(0, 20)
    .map(dish => ({ name: dish.name, nativeName: dish.nativeName, description: dish.description,
      essentialIngredients: dish.essentialIngredients, mealTypes: dish.mealTypes, availableIngredients: dish.availableIngredients }));
}

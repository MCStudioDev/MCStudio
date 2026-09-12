import { getCompleteCuisineCatalog } from "@/lib/cuisineCatalogs/completeCatalogs";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import { normalizeArabicInputs } from "./ingredients";

export async function buildArabicCuisineGuidance(cuisine: string, pantry: string[], restrictions: GenerationRestrictions) {
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
      essentialIngredients: dish.primaryIngredients, availableIngredients: available, score: dish.iconicScore + available.length * 20 };
  }));
  return ranked.filter(dish => dish.availableIngredients.length > 0)
    .sort((a, b) => b.score - a.score).slice(0, 20)
    .map(dish => ({ name: dish.name, nativeName: dish.nativeName, description: dish.description,
      essentialIngredients: dish.essentialIngredients, availableIngredients: dish.availableIngredients }));
}

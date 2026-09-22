import { arabicFingerprint } from "./fingerprint";
import { arabicRecipeNameKey } from "./freshness";
import { arabicSourceFoodIds } from "./sourceCandidates";
import type { ArabicRecipeEntry } from "./types";

export const ARABIC_IMAGE_IDENTITY_VERSION = "ar-photo-identity-v1";

/** Recipe versions retain their own validation/content fingerprints. Photos
 * share an identity only when the normalized dish name and all foods match.
 * Quantities, step wording/order, nutrition and source IDs do not alter a photo.
 * Keeping every food ID prevents protein/allergen substitutions from sharing.
 */
export async function arabicImageIdentity(entry: ArabicRecipeEntry) {
  const foods = entry.facts ? { ids: entry.facts.ingredients.map(item => item.foodId), unclear: false }
    : await arabicSourceFoodIds([...entry.canonical.ingredients, ...(entry.canonical.missing_ingredients ?? [])]);
  const fingerprint = arabicFingerprint({ version: ARABIC_IMAGE_IDENTITY_VERSION,
    ...(foods.unclear || !foods.ids.length ? { recipeId: entry.id }
      : { name: arabicRecipeNameKey(entry.recipe.name), foods: [...new Set(foods.ids)].sort() }) });
  return { id: `dish-${fingerprint.slice(0, 40)}`, fingerprint };
}

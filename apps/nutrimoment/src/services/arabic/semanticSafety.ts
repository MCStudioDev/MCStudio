import { FOOD_DICTIONARY } from "@/food/FoodDictionary";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";
import { IngredientKnowledgeGraph } from "@/lib/IngredientKnowledgeGraph";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { ArabicRecipeFacts } from "./recipeFacts";
import { findArabicFood } from "./foodCatalog";
import { arabicFingerprint } from "./fingerprint";

const classified = new Set([
  ...FOOD_DICTIONARY.ingredients.map(item => item.canonicalEnglishName),
  ...OFFLINE_INGREDIENT_TAXONOMY.filter(item => item.isActive).map(item => item.canonical),
  ...Object.keys(IngredientKnowledgeGraph),
  ...Object.values(IngredientKnowledgeGraph).flatMap(item => [...item.commonHerbs, ...item.commonSpices]),
  // Plain water has no dietary ingredient constituents to classify.
  "water"
].flatMap(name => findArabicFood(name)?.id ?? []));
export function needsArabicSemanticSafety(facts: ArabicRecipeFacts, restrictions: GenerationRestrictions) {
  return [...restrictions.diets, ...restrictions.conditions, ...restrictions.allergens].length > 0 &&
    facts.ingredients.some(item => !classified.has(item.foodId));
}
export function arabicSafetyFingerprint(facts: ArabicRecipeFacts, restrictions: GenerationRestrictions) {
  return `ar-safety-v1:${arabicFingerprint({ facts, restrictions: { diets: [...restrictions.diets].sort(), conditions: [...restrictions.conditions].sort(), allergens: [...restrictions.allergens].sort() } })}`;
}

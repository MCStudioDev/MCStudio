import { FOOD_DICTIONARY } from "@/food/FoodDictionary";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";
import { IngredientKnowledgeGraph } from "@/lib/IngredientKnowledgeGraph";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { ArabicRecipeFacts } from "./recipeFacts";
import { findArabicFood } from "./foodCatalog";
import { arabicFingerprint } from "./fingerprint";
import { arabicFoodById } from "./foodCatalog";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { z } from "zod";

const categories = z.enum(["plant", "fungi", "grain", "legume", "poultry", "meat", "fish", "shellfish", "dairy", "egg", "water", "mineral", "mixed", "unknown"]);
export const arabicFoodClassificationSchema = z.object({ foodId: z.string(), category: categories, contains: z.array(categories).max(12) });
const categoryExample: Record<z.infer<typeof categories>, string> = {
  plant: "vegetable", fungi: "mushroom", grain: "rice", legume: "lentils", poultry: "chicken", meat: "beef",
  fish: "salmon", shellfish: "shrimp", dairy: "milk", egg: "egg", water: "water", mineral: "salt", mixed: "", unknown: ""
};

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
export function arabicClassificationsAreSafe(facts: ArabicRecipeFacts, restrictions: GenerationRestrictions, classifications: z.infer<typeof arabicFoodClassificationSchema>[]) {
  return facts.ingredients.filter(item => !classified.has(item.foodId)).every(ingredient => {
    const matches = classifications.filter(item => item.foodId === ingredient.foodId);
    if (matches.length !== 1) return false;
    const item = matches[0];
    if (item.category === "unknown" || (item.category === "mixed" && !item.contains.length) || item.contains.some(category => category === "unknown" || category === "mixed")) return false;
    const identities = [arabicFoodById(ingredient.foodId)?.en ?? "", ...[item.category, ...item.contains].map(category => categoryExample[category])].filter(Boolean);
    return !findRecipeDietViolation({ ingredients: identities }, restrictions);
  });
}
export function arabicSafetyFingerprint(facts: ArabicRecipeFacts, restrictions: GenerationRestrictions) {
  return `ar-safety-v1:${arabicFingerprint({ facts, restrictions: { diets: [...restrictions.diets].sort(), conditions: [...restrictions.conditions].sort(), allergens: [...restrictions.allergens].sort() } })}`;
}

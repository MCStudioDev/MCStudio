import { normalizeIngredientText } from "@/food/IngredientNormalizer";

const ZERO_BURDEN_PANTRY_STAPLES = new Set([
  "black pepper",
  "oil",
  "olive oil",
  "salt",
  "water"
]);

export function countMissingIngredientPurchaseBurden(
  ingredients: string[],
  availableIngredientCount: number
) {
  return ingredients.reduce(
    (total, ingredient) => total + getMissingIngredientPurchaseWeight(ingredient, availableIngredientCount),
    0
  );
}

export function getMissingIngredientPurchaseWeight(
  ingredient: string,
  availableIngredientCount: number
) {
  const normalized = normalizeMissingIngredientForPolicy(ingredient);
  if (!normalized || ZERO_BURDEN_PANTRY_STAPLES.has(normalized)) return 0;

  if (isCommonPantrySupportIngredient(normalized)) {
    return availableIngredientCount <= 2 ? 0.15 : 0.35;
  }

  if (isRecipeStructureSupportIngredient(normalized)) {
    return availableIngredientCount <= 2 ? 0.45 : 0.75;
  }

  return 1;
}

function normalizeMissingIngredientForPolicy(value: string) {
  return normalizeIngredientText(value)
    .replace(/\b\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?\b/g, " ")
    .replace(/\b(cup|cups|tablespoon|tablespoons|tbsp|teaspoon|teaspoons|tsp|g|gram|grams|kg|lb|oz|can|cans|large|small|medium|whole|clove|cloves|fresh|frozen|dried|cooked|rinsed|drained|chopped|diced|sliced|pressed|crumbled|optional)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCommonPantrySupportIngredient(normalizedIngredient: string) {
  return /\b(cumin|coriander|paprika|turmeric|chili|chilli|cayenne|sumac|oregano|mint|parsley|cilantro|dill|basil|garlic|onion|butter|vinegar|lemon|lime|tomato paste|pepper paste|tahini|yogurt|stock|broth)\b/.test(
    normalizedIngredient
  );
}

function isRecipeStructureSupportIngredient(normalizedIngredient: string) {
  return /\b(rice|bread|pita|flatbread|baladi bread|pasta|penne|macaroni|spaghetti|flour|dough|pide dough|phyllo|filo|yufka|potato|carrot|celery|tomato|tomato sauce|green pepper|bell pepper|eggplant|aubergine|cheese|mozzarella)\b/.test(
    normalizedIngredient
  );
}

import { formatIngredientFromDictionary, type RecipeLanguage } from "@/services/ingredientDictionaryService";

export interface ShoppingListSections {
  availableIngredients: string[];
  pantryStaples: string[];
  requiredIngredients: string[];
  optionalIngredients: string[];
}

const PANTRY_STAPLES = new Set(["salt", "black pepper", "oil", "olive oil", "water"]);
const OPTIONAL_MARKER = /\b(optional|to serve|for garnish|for serving)\b/i;

export class ShoppingListBuilder {
  build(input: { available: string[]; recipeIngredients: string[]; language: RecipeLanguage }): ShoppingListSections {
    const available = new Set(input.available.map(normalize));
    const sections: ShoppingListSections = {
      availableIngredients: [],
      pantryStaples: [],
      requiredIngredients: [],
      optionalIngredients: []
    };

    for (const item of input.recipeIngredients) {
      const canonical = normalize(item);
      if (!canonical) continue;
      const display = formatIngredientFromDictionary(canonical, input.language);
      if (PANTRY_STAPLES.has(canonical)) sections.pantryStaples.push(display);
      else if (available.has(canonical)) sections.availableIngredients.push(display);
      else if (OPTIONAL_MARKER.test(item)) sections.optionalIngredients.push(display);
      else sections.requiredIngredients.push(display);
    }

    return {
      availableIngredients: Array.from(new Set(sections.availableIngredients)),
      pantryStaples: Array.from(new Set(sections.pantryStaples)),
      requiredIngredients: Array.from(new Set(sections.requiredIngredients)),
      optionalIngredients: Array.from(new Set(sections.optionalIngredients))
    };
  }
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\b(cup|cups|tbsp|tsp|gram|grams|kg|lb|oz|large|small|medium|fresh|cooked|chopped|diced|sliced)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

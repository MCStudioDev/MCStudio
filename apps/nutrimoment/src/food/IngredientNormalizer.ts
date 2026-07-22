import { expandIngredientFamilies } from "@/lib/ingredientFamilies";

export interface NormalizedIngredient {
  raw: string;
  normalized: string;
}

export class IngredientNormalizer {
  normalize(ingredients: string[]): NormalizedIngredient[] {
    return ingredients
      .map((raw) => ({
        raw,
        normalized: normalizeIngredientText(raw)
      }))
      .filter((ingredient) => ingredient.normalized.length > 0);
  }

  expand(ingredients: string[]) {
    return expandIngredientFamilies(this.normalize(ingredients).map((ingredient) => ingredient.normalized));
  }
}

export function normalizeIngredientText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DiversityCandidate<T> {
  value: T;
  score: number;
  cuisine: string;
  dishFamily: string;
  cookingMethod?: string;
}

export interface DiversityOptions {
  limit: number;
  rotateCuisines: boolean;
}

/**
 * Selects high-scoring candidates while avoiding a repeated cuisine, dish
 * family, or cooking form whenever alternatives exist.
 */
export class RecipeDiversityEngine {
  select<T>(candidates: DiversityCandidate<T>[], options: DiversityOptions): T[] {
    const remaining = [...candidates].sort((left, right) => right.score - left.score);
    const selected: T[] = [];
    const cuisines = new Set<string>();
    const dishFamilies = new Set<string>();
    const cookingMethods = new Set<string>();

    while (remaining.length && selected.length < options.limit) {
      const index = remaining.findIndex((candidate) => {
        const cuisine = normalize(candidate.cuisine);
        const family = normalize(candidate.dishFamily);
        const method = normalize(candidate.cookingMethod ?? "");
        if (family && dishFamilies.has(family)) return false;
        if (options.rotateCuisines && cuisine && cuisines.has(cuisine)) return false;
        return !method || !cookingMethods.has(method);
      });
      const fallbackIndex = remaining
        .map((candidate, index) => ({
          index,
          penalty:
            (dishFamilies.has(normalize(candidate.dishFamily)) ? 100 : 0) +
            (options.rotateCuisines && cuisines.has(normalize(candidate.cuisine)) ? 2 : 0) +
            (candidate.cookingMethod && cookingMethods.has(normalize(candidate.cookingMethod)) ? 1 : 0)
        }))
        .filter((candidate) => candidate.penalty < 100)
        .sort((left, right) => left.penalty - right.penalty || left.index - right.index)[0]?.index ?? -1;
      const selectedIndex = index >= 0 ? index : fallbackIndex;
      if (selectedIndex < 0) break;

      const [candidate] = remaining.splice(selectedIndex, 1);
      selected.push(candidate.value);
      if (candidate.cuisine) cuisines.add(normalize(candidate.cuisine));
      if (candidate.dishFamily) dishFamilies.add(normalize(candidate.dishFamily));
      if (candidate.cookingMethod) cookingMethods.add(normalize(candidate.cookingMethod));
    }

    return selected;
  }
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

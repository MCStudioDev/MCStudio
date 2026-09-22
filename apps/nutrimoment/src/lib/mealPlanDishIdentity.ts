import type { MealPlanMeal } from "./types";

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function mealPlanDishKeys(meal: Pick<MealPlanMeal, "name" | "photo_identity" | "source_recipe_id">): string[] {
  const names = [meal.name, meal.photo_identity?.english_name, meal.photo_identity?.dish_slug]
    .filter((name): name is string => typeof name === "string" && !!name.trim()).map(normalize);
  return [...new Set([...names.map(name => `dish:${name}`),
    ...(meal.source_recipe_id ? [`source:${meal.source_recipe_id}`] : [])])];
}

/** Link aliases by any shared name, photo dish identity or source. A changed
 * recipe ID, quantity or instruction cannot disguise an already used dish.
 */
export function mealPlanIdentityIndex(meals: MealPlanMeal[]) {
  const parents = new Map<string, string>();
  const root = (key: string): string => {
    const parent = parents.get(key);
    if (!parent) { parents.set(key, key); return key; }
    if (parent === key) return key;
    const result = root(parent); parents.set(key, result); return result;
  };
  for (const meal of meals) {
    const keys = mealPlanDishKeys(meal);
    if (!keys.length) continue;
    for (const key of keys.slice(1)) parents.set(root(key), root(keys[0]));
  }
  return (meal: MealPlanMeal) => {
    const key = mealPlanDishKeys(meal)[0];
    return key ? root(key) : "";
  };
}

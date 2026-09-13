import type { ArabicRecipeEntry } from "./types";

export function selectArabicWeeklyMeals(entries: ArabicRecipeEntry[]): ArabicRecipeEntry[] | null {
  const slots = Array.from({ length: 21 }, (_, index) => ["breakfast", "lunch", "dinner"][index % 3]);
  if (entries.length < slots.length) return null;
  const owners = new Map<number, number>();
  const assign = (slot: number, visited: Set<number>): boolean => {
    for (let index = 0; index < entries.length; index++) {
      if (visited.has(index) || (entries[index].facts && !entries[index].facts!.mealTypes.includes(slots[slot] as "breakfast" | "lunch" | "dinner"))) continue;
      visited.add(index);
      const previous = owners.get(index);
      if (previous === undefined || assign(previous, visited)) { owners.set(index, slot); return true; }
    }
    return false;
  };
  if (!slots.every((_, index) => assign(index, new Set()))) return null;
  const result: ArabicRecipeEntry[] = [];
  for (const [index, slot] of owners) result[slot] = entries[index];
  return result;
}

import type { ArabicRecipeEntry } from "./types";
import { arabicCuisineMatches, prioritizeArabicPantry } from "./cuisineGuidance";

// Matches the English weekly fallback: at most 2 repeated slots out of 21
// (less than 10%). Content, validation and persistence remain Arabic-only.
export const ARABIC_WEEKLY_MAX_REPEATED_SLOTS = 2;
export const arabicWeeklyMealTypes = ["breakfast", "lunch", "dinner"] as const;
export function arabicWeeklyMealCounts(entries: ArabicRecipeEntry[]) {
  return Object.fromEntries(arabicWeeklyMealTypes.map(type => [type,
    entries.filter(entry => !entry.facts || entry.facts.mealTypes.includes(type)).length])) as Record<typeof arabicWeeklyMealTypes[number], number>;
}

type Edge = { to: number; reverse: number; capacity: number; cost: number };

/** Minimum-cost assignment maximizes distinct dishes before allowing repeats.
 * Recipe/day nodes forbid the same dish twice on one day; source edges allow
 * each dish at most twice. Every selected entry has already passed validation.
 */
export function selectArabicWeeklyMeals(input: ArabicRecipeEntry[], options: { allowLimitedRepeats?: boolean; preferredCuisine?: string; pantry?: string[] } = {}): ArabicRecipeEntry[] | null {
  const uniqueEntries = [...new Map(input.map(entry => [entry.id, entry])).values()];
  const entries = options.pantry?.length ? prioritizeArabicPantry(uniqueEntries, options.pantry) : uniqueEntries;
  const maxRepeats = options.allowLimitedRepeats ? ARABIC_WEEKLY_MAX_REPEATED_SLOTS : 0;
  if (entries.length < 21 - maxRepeats) return null;
  const graph: Edge[][] = [[], []], source = 0, sink = 1;
  const node = () => { graph.push([]); return graph.length - 1; };
  const link = (from: number, to: number, capacity: number, cost = 0) => {
    const edge = { to, reverse: graph[to].length, capacity, cost };
    graph[from].push(edge);
    graph[to].push({ to: from, reverse: graph[from].length - 1, capacity: 0, cost: -cost });
    return edge;
  };
  const slots = Array.from({ length: 21 }, () => node());
  slots.forEach(slot => link(slot, sink, 1));
  const assignments: Array<{ edge: Edge; slot: number; entry: ArabicRecipeEntry }> = [];
  // A repeated slot costs more than all 21 cuisine alternatives combined:
  // keep distinct meals first, then maximize the preferred cuisine.
  const repeatCost = 22;
  for (const entry of entries) {
    const recipe = node();
    const cuisineCost = options.preferredCuisine && !arabicCuisineMatches(entry.canonical.cuisine, options.preferredCuisine) ? 1 : 0;
    link(source, recipe, 1, cuisineCost);
    if (maxRepeats) link(source, recipe, 1, repeatCost + cuisineCost);
    for (let day = 0; day < 7; day++) {
      const recipeDay = node(); link(recipe, recipeDay, 1);
      arabicWeeklyMealTypes.forEach((type, index) => {
        if (entry.facts && !entry.facts.mealTypes.includes(type)) return;
        const slot = day * 3 + index;
        assignments.push({ edge: link(recipeDay, slots[slot], 1), slot, entry });
      });
    }
  }
  let totalCost = 0;
  for (let filled = 0; filled < 21; filled++) {
    const distance = graph.map(() => Infinity), previous = graph.map(() => ({ node: -1, edge: -1 }));
    const queue = [source], queued = new Set([source]); distance[source] = 0;
    // Residual reverse edges let a later meal reassign earlier flexible dishes
    // instead of incorrectly rejecting a feasible breakfast/lunch/dinner mix.
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]; queued.delete(current);
      graph[current].forEach((edge, index) => {
        if (!edge.capacity || distance[edge.to] <= distance[current] + edge.cost) return;
        distance[edge.to] = distance[current] + edge.cost;
        previous[edge.to] = { node: current, edge: index };
        if (!queued.has(edge.to)) { queue.push(edge.to); queued.add(edge.to); }
      });
    }
    if (!Number.isFinite(distance[sink]) || totalCost + distance[sink] > maxRepeats * repeatCost + 21) return null;
    totalCost += distance[sink];
    for (let current = sink; current !== source;) {
      const parent = previous[current], edge = graph[parent.node][parent.edge];
      edge.capacity--; graph[current][edge.reverse].capacity++; current = parent.node;
    }
  }
  const result: ArabicRecipeEntry[] = [];
  for (const { edge, slot, entry } of assignments) if (!edge.capacity) result[slot] = entry;
  if (21 - new Set(result.map(entry => entry.id)).size > maxRepeats) return null;
  return result;
}

import { describe, expect, it } from "vitest";
import { selectArabicWeeklyMeals } from "@/services/arabic/weeklyFacts";
import type { ArabicRecipeEntry } from "@/services/arabic/types";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";

const entries = () => weeklyFactFixtures().map((facts, index) => ({ id: `recipe-${index}`, facts, canonical: { cuisine: facts.cuisine } }) as ArabicRecipeEntry);
const assertComplete = (plan: ArabicRecipeEntry[]) => {
  expect(plan).toHaveLength(21);
  for (const [index, meal] of plan.entries()) expect(meal.facts!.mealTypes).toContain(["breakfast", "lunch", "dinner"][index % 3]);
  expect(Math.max(...plan.map(meal => plan.filter(item => item.id === meal.id).length))).toBeLessThanOrEqual(2);
  for (let day = 0; day < 7; day++) expect(new Set(plan.slice(day * 3, day * 3 + 3).map(meal => meal.id)).size).toBe(3);
};

describe("Arabic weekly completion with limited repeats", () => {
  it("prefers pantry-using meals among equally valid cuisine and slot choices", () => {
    const preferred = entries().map(entry => ({ ...entry, ingredientCanonicals: ["rice"] }));
    const alternatives = entries().map(entry => ({ ...entry, id: `other-${entry.id}`, ingredientCanonicals: ["oats"] }));
    const plan = selectArabicWeeklyMeals([...alternatives, ...preferred], { pantry: ["rice"], preferredCuisine: "Mediterranean" })!;
    assertComplete(plan);
    expect(plan.every(entry => entry.ingredientCanonicals.includes("rice"))).toBe(true);
  });
  it("maximizes the preferred cuisine even when other cuisines arrive first", () => {
    const preferred = entries();
    const alternatives = preferred.map(entry => ({ ...entry, id: `other-${entry.id}`, canonical: { ...entry.canonical, cuisine: "Italian" } }));
    const plan = selectArabicWeeklyMeals([...alternatives, ...preferred], { preferredCuisine: "Mediterranean", allowLimitedRepeats: true })!;
    assertComplete(plan);
    expect(plan.every(entry => entry.canonical.cuisine === "Mediterranean")).toBe(true);
  });
  it("uses distinct alternative dishes for missing meal slots before repeating preferred dishes", () => {
    const preferred = entries().filter((_, index) => ![6, 13].includes(index));
    const alternatives = entries().map(entry => ({ ...entry, id: `other-${entry.id}`, canonical: { ...entry.canonical, cuisine: "Italian" } }));
    const plan = selectArabicWeeklyMeals([...alternatives, ...preferred], { preferredCuisine: "Mediterranean", allowLimitedRepeats: true })!;
    assertComplete(plan);
    expect(new Set(plan.map(entry => entry.id)).size).toBe(21);
    expect(plan.filter(entry => entry.canonical.cuisine === "Mediterranean")).toHaveLength(19);
  });
  it("matches the English two-repeat limit by filling 21 slots from 19 validated dishes", () => {
    const pool = entries().filter((_, index) => ![6, 13].includes(index));
    expect(selectArabicWeeklyMeals(pool)).toBeNull();
    const plan = selectArabicWeeklyMeals(pool, { allowLimitedRepeats: true });
    expect(plan).not.toBeNull(); assertComplete(plan!);
    expect(new Set(plan!.map(meal => meal.id)).size).toBe(19);
  });
  it("does not exceed 10 percent repetition to fill a week from only 18 dishes", () => {
    expect(selectArabicWeeklyMeals(entries().filter((_, index) => index % 7 !== 6), { allowLimitedRepeats: true })).toBeNull();
  });
  it("keeps 21 distinct dishes when full variety is available", () => {
    const plan = selectArabicWeeklyMeals(entries(), { allowLimitedRepeats: true })!;
    assertComplete(plan); expect(new Set(plan.map(meal => meal.id)).size).toBe(21);
  });
  it("handles flexible meal types without repeating a recipe within the same day", () => {
    const pool = entries().slice(0, 19).map(entry => ({ ...entry, facts: { ...entry.facts!, mealTypes: ["breakfast", "lunch", "dinner"] as const } })) as unknown as ArabicRecipeEntry[];
    const plan = selectArabicWeeklyMeals(pool, { allowLimitedRepeats: true })!;
    assertComplete(plan); expect(new Set(plan.map(meal => meal.id)).size).toBe(19);
  });
  it("rejects inadequate breakfast coverage even when the total pool is large", () => {
    const pool = entries().filter((_, index) => index < 3 || index >= 7);
    expect(selectArabicWeeklyMeals(pool, { allowLimitedRepeats: true })).toBeNull();
  });
  it("cannot use duplicate cache IDs to bypass the two-use limit", () => {
    const pool = entries().slice(0, 7).map(entry => ({ ...entry, facts: undefined }));
    expect(selectArabicWeeklyMeals([...pool, ...pool, ...pool], { allowLimitedRepeats: true })).toBeNull();
  });
});

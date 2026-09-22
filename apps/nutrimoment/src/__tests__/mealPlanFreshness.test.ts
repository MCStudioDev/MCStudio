import { describe, expect, it } from "vitest";
import type { MealPlanData, MealPlanMeal } from "@/lib/types";
import { buildRecentWeeklyMeals, rankWeeklyCandidates, summarizeWeeklyFreshness, weeklyFreshnessIssues, weeklyFreshnessNotice, WEEKLY_FRESHNESS_WINDOW_MS } from "@/services/mealPlanFreshnessService";
import { mealPlanDishKeys, mealPlanIdentityIndex } from "@/lib/mealPlanDishIdentity";
import { buildMealPlanPrompt, buildMealPlanRepairPrompt } from "@/ai/PromptBuilder";

const now = Date.parse("2026-09-22T02:00:00Z");
const meals = Array.from({ length: 21 }, (_, i) => ({ name: `Distinct Meal ${i}`, ingredients: [], steps: [], calories: 400,
  protein: "20g", carbs: "40g", fat: "10g" }));
const plan = (input: MealPlanMeal[]): MealPlanData => ({ plan: Array.from({ length: 7 }, (_, i) => ({ day: `Day ${i}`,
  breakfast: input[i * 3], lunch: input[i * 3 + 1], dinner: input[i * 3 + 2] })), shoppingList: [] });
const history = (overrides = {}) => ({ timestamp: new Date(now - 1000).toISOString(), sessionType: "weekly_meal_plan", generationStatus: "completed", recipes: meals, ...overrides });

describe("English weekly freshness", () => {
  it("recognizes changed quantities, instructions and record IDs without rewriting history", () => {
    const row = history(), before = structuredClone(row), recent = buildRecentWeeklyMeals([row], now);
    const changed = meals.map(meal => ({ ...meal, id: "new-record", ingredients: ["2 cups rice"], steps: ["Different steps"] }));
    expect(summarizeWeeklyFreshness(plan(changed), recent)).toMatchObject({ unchanged: true, freshCount: 0, backfilledCount: 21 });
    expect(row).toEqual(before);
  });
  it("links renamed plates by their stored dish identity without merging different dishes", () => {
    const first = { ...meals[0], name: "Vegetable Tacos", photo_identity: { dish_slug: "roasted-vegetable-tacos", english_name: "Vegetable Tacos" } };
    const renamed = { ...meals[1], name: "Roasted Vegetable Tacos", photo_identity: { dish_slug: "roasted-vegetable-tacos", english_name: "Roasted Vegetable Tacos" } };
    const identify = mealPlanIdentityIndex([first, renamed, meals[2]] as MealPlanMeal[]);
    expect(identify(first as MealPlanMeal)).toBe(identify(renamed as MealPlanMeal));
    expect(identify(first as MealPlanMeal)).not.toBe(identify(meals[2]));
    expect(weeklyFreshnessIssues(plan([first, renamed, ...meals.slice(2)] as MealPlanMeal[]), buildRecentWeeklyMeals([], now))).toHaveLength(1);
  });
  it("counts Bekhit's pattern as 10 recent slots and one same-name duplicate", () => {
    const recent = buildRecentWeeklyMeals([history()], now);
    const next = [...meals.slice(0, 9), meals[0], ...meals.slice(10).map(meal => ({ ...meal, name: `New ${meal.name}` }))];
    const summary = summarizeWeeklyFreshness(plan(next), recent);
    expect(summary).toMatchObject({ backfilledCount: 10, freshCount: 11, duplicateSlots: 1, unchanged: false });
    expect(weeklyFreshnessNotice(summary)).toContain("10 previously shown meals");
  });
  it.each([{ timestamp: new Date(now - WEEKLY_FRESHNESS_WINDOW_MS).toISOString() }, { timestamp: "bad" },
    { timestamp: new Date(now + 1).toISOString() }, { generationStatus: "failed" }, { sessionType: "recipe_generation" }, { recipes: [] }])("ignores invalid or unrelated history %j", overrides => {
    expect(buildRecentWeeklyMeals([history(overrides)], now).shownAt.size).toBe(0);
  });
  it("tracks the newest completed week independently of pantry and cuisine changes", () => {
    const newer = meals.map(meal => ({ ...meal, name: `New ${meal.name}` }));
    const recent = buildRecentWeeklyMeals([history(), history({ recipes: newer, timestamp: new Date(now - 500).toISOString(), ingredients: ["different pantry"] })], now);
    expect(summarizeWeeklyFreshness(plan(newer), recent).unchanged).toBe(true);
    expect(summarizeWeeklyFreshness(plan(meals), recent)).toMatchObject({ unchanged: false, backfilledCount: 21 });
  });
  it("ranks unseen meals first and rotates equivalent cached choices per request", () => {
    const pool = [...meals, ...meals.map(meal => ({ ...meal, name: `New ${meal.name}` }))];
    const recent = buildRecentWeeklyMeals([history()], now);
    const first = rankWeeklyCandidates(pool, meal => meal, recent, "one");
    expect(first.slice(0, 21).every(meal => meal.name.startsWith("New"))).toBe(true);
    expect(rankWeeklyCandidates([...pool].reverse(), meal => meal, recent, "one")).toEqual(first);
    expect(rankWeeklyCandidates(pool, meal => meal, recent, "two")).not.toEqual(first);
    expect(mealPlanDishKeys({ ...meals[0], name: "  HUEVOS-RANCHEROS " })).toContain("dish:huevos rancheros");
  });
  it("passes bounded recent-dish exclusions to both the initial prompt and the existing repair pass", () => {
    const input = { pantry: [], diets: [], conditions: [], recentMealNames: ["Huevos Rancheros", "Roasted Vegetable Tacos"], variationSeed: "request-one" };
    for (const prompt of [buildMealPlanPrompt(input), buildMealPlanRepairPrompt({ ...input, mealPlan: plan(meals), issues: [{ kind: "recentWeeklyMeal" }] })]) {
      expect(prompt).toContain("last seven days"); expect(prompt).toContain("Roasted Vegetable Tacos"); expect(prompt).toContain("request-one");
    }
  });
});

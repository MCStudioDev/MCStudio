import { z } from "zod";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { withTimeout } from "@/lib/utils";
import type { MealPlanData, MealPlanMeal } from "@/lib/types";
import { mealPlanDishKeys, mealPlanIdentityIndex } from "@/lib/mealPlanDishIdentity";

export const WEEKLY_FRESHNESS_WINDOW_MS = 7 * 86400000;
export interface RecentWeeklyMeals {
  shownAt: Map<string, number>;
  names: string[];
  previousKeys: Set<string>;
}
const historyMeal = z.object({ name: z.string().min(1).max(300), source_recipe_id: z.string().optional(),
  photo_identity: z.object({ dish_slug: z.string().optional(), english_name: z.string().optional() }).optional() });

export function buildRecentWeeklyMeals(history: Record<string, unknown>[], now = Date.now()): RecentWeeklyMeals {
  const shownAt = new Map<string, number>(), names = new Set<string>();
  let latest = 0, previousKeys = new Set<string>();
  const rows = [...history].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  for (const row of rows) {
    const timestamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (!Number.isFinite(timestamp) || timestamp > now || timestamp <= now - WEEKLY_FRESHNESS_WINDOW_MS
      || row.sessionType !== "weekly_meal_plan" || row.generationStatus !== "completed") continue;
    const parsed = z.array(historyMeal).length(21).safeParse(row.recipes);
    if (!parsed.success) continue;
    const keys: string[] = [];
    for (const meal of parsed.data) {
      const dishKeys = mealPlanDishKeys(meal as MealPlanMeal); keys.push(...dishKeys);
      for (const key of dishKeys) shownAt.set(key, Math.max(shownAt.get(key) ?? 0, timestamp));
      names.add(meal.name);
      if (meal.photo_identity?.english_name) names.add(meal.photo_identity.english_name);
    }
    if (timestamp > latest) { latest = timestamp; previousKeys = new Set(keys); }
  }
  return { shownAt, names: [...names], previousKeys };
}

export async function readRecentWeeklyMeals(uid: string) {
  const db = getAdminDb();
  const [history, current] = await withTimeout(Promise.all([
    db.collection(`users/${uid}/history`).orderBy("timestamp", "desc").limit(100).get(),
    db.doc(`users/${uid}/plans/currentWeekly`).get()
  ]), 5000, "Weekly meal history");
  const rows: Record<string, unknown>[] = history.docs.map(doc => doc.data());
  const saved = current.data();
  if (saved?.mealPlan?.plan?.length === 7) rows.push({ sessionType: "weekly_meal_plan", generationStatus: "completed",
    timestamp: saved.updatedAt?.toDate?.().toISOString(), recipes: weeklyMeals(saved.mealPlan) });
  return buildRecentWeeklyMeals(rows);
}
export function weeklyMeals(plan: MealPlanData): MealPlanMeal[] {
  return plan.plan.flatMap(day => (["breakfast", "lunch", "dinner"] as const)
    .map(slot => ({ ...day[slot], meal_type: day[slot].meal_type ?? slot })));
}
export function mealLastShownAt(meal: MealPlanMeal, recent: RecentWeeklyMeals) {
  return Math.max(0, ...mealPlanDishKeys(meal).map(key => recent.shownAt.get(key) ?? 0));
}
export function summarizeWeeklyFreshness(plan: MealPlanData, recent: RecentWeeklyMeals) {
  const meals = weeklyMeals(plan), identify = mealPlanIdentityIndex(meals);
  const backfilledCount = meals.filter(meal => mealLastShownAt(meal, recent)).length;
  return { freshCount: meals.length - backfilledCount, backfilledCount,
    duplicateSlots: meals.length - new Set(meals.map(identify)).size,
    unchanged: recent.previousKeys.size > 0 && meals.length === 21 && meals.every(meal => mealPlanDishKeys(meal).some(key => recent.previousKeys.has(key))) };
}
export function weeklyFreshnessIssues(plan: MealPlanData, recent: RecentWeeklyMeals) {
  const meals = weeklyMeals(plan), identify = mealPlanIdentityIndex(meals), seen = new Set<string>();
  return meals.flatMap((meal, index) => {
    const key = identify(meal), duplicate = seen.has(key); seen.add(key);
    return duplicate || mealLastShownAt(meal, recent) ? [{ kind: duplicate ? "duplicateDish" : "recentWeeklyMeal",
      dayIndex: Math.floor(index / 3), slot: meal.meal_type, name: meal.name,
      reason: duplicate ? "Replace this duplicate dish, including renamed versions." : "Replace this dish shown in the user's last seven days of plans." }] : [];
  });
}
export function weeklyFreshnessNotice(summary: ReturnType<typeof summarizeWeeklyFreshness>) {
  return summary.backfilledCount ? `This plan includes ${summary.freshCount} meals not shown in your plans in the last 7 days and ${summary.backfilledCount} previously shown meals because there were not enough validated new options.` : undefined;
}
export function rankWeeklyCandidates<T>(rows: T[], mealOf: (row: T) => MealPlanMeal, recent: RecentWeeklyMeals, seed: string): T[] {
  return rows.map(row => { const meal = mealOf(row); return { row, shownAt: mealLastShownAt(meal, recent),
    rank: createHash("sha256").update(JSON.stringify([seed, mealPlanDishKeys(meal)])).digest("hex") }; })
    .sort((a, b) => a.shownAt - b.shownAt || a.rank.localeCompare(b.rank)).map(item => item.row);
}

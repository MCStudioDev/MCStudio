/**
 * Read-only diagnostic. Usage:
 *   npm run inspect:user-recipes -- <email-or-uid>
 *
 * Resolves a user by email (or trusts the value as a uid if it isn't an
 * email), then dumps profile, settings, pantry, recent history, current
 * weekly plan, and per-recipe diet/allergen analysis to
 * `.generated/user-inspection-<uid>-<timestamp>.json` so the output stays
 * out of the terminal scrollback. The file is gitignored via the
 * existing `.generated/` rule already in apps/nutrimoment/.gitignore.
 *
 * Findings the script flags automatically:
 *   - profile.diets / .allergens / .preferredCuisine
 *   - history items whose recipes contain ingredients forbidden by the
 *     active diet (using src/lib/dietEnforcement.ts)
 *   - history items where multiple recipes share the same image URL
 *   - mealplan slots that contain dairy/meat/fish for restrictive diets
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

config({ path: ".env.local", quiet: true });

import { getAdminAuth, getAdminDb } from "../src/lib/firebaseAdmin";
import {
  findRecipeDietViolation,
  type DietEnforcementContext,
  type ForbiddenReason
} from "../src/lib/dietEnforcement";
import { normalizeMealPlanData } from "../src/lib/mealPlan";

interface InspectionEntry {
  id: string;
  data: Record<string, unknown>;
}

async function resolveUid(input: string): Promise<{ uid: string; email?: string }> {
  if (!input.includes("@")) {
    return { uid: input };
  }
  const auth = getAdminAuth();
  const userRecord = await auth.getUserByEmail(input);
  return { uid: userRecord.uid, email: userRecord.email ?? undefined };
}

async function readDocSafe(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminDb().doc(path).get();
    return snap.exists ? (snap.data() ?? null) : null;
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
}

async function readCollectionSafe(path: string, limit = 50): Promise<InspectionEntry[]> {
  try {
    const snap = await getAdminDb().collection(path).limit(limit).get();
    return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  } catch (error) {
    return [{ id: "__error", data: { message: error instanceof Error ? error.message : String(error) } }];
  }
}

interface RecipeShape {
  name?: string;
  cuisine?: string;
  ingredients?: string[];
  missing_ingredients?: string[];
  image_url?: string;
  dish_intent?: { dish_name?: string };
}

function analyzeHistoryEntry(
  entry: InspectionEntry,
  dietCtx: DietEnforcementContext
) {
  const recipes = Array.isArray(entry.data.recipes) ? (entry.data.recipes as RecipeShape[]) : [];
  const dietHits: Array<{ index: number; name?: string; reason: ForbiddenReason }> = [];
  const imageCounts = new Map<string, number>();

  recipes.forEach((recipe, index) => {
    const violation = findRecipeDietViolation(recipe, dietCtx);
    if (violation) dietHits.push({ index, name: recipe.name, reason: violation });
    if (recipe.image_url) {
      imageCounts.set(recipe.image_url, (imageCounts.get(recipe.image_url) ?? 0) + 1);
    }
  });

  const repeatedImages = Array.from(imageCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url, count }));

  return {
    id: entry.id,
    title: entry.data.title,
    sessionType: entry.data.sessionType,
    ingredientsRequested: entry.data.ingredients,
    recipeCount: recipes.length,
    recipeNames: recipes.map((recipe) => recipe.name ?? "(no name)"),
    dietHits,
    repeatedImages
  };
}

function analyzeMealPlan(mealPlan: Record<string, unknown> | null, dietCtx: DietEnforcementContext) {
  if (!mealPlan) return null;
  const normalized = normalizeMealPlanData((mealPlan as { mealPlan?: unknown }).mealPlan ?? mealPlan);
  const plan = normalized?.plan ?? [];
  const violations: Array<{ day: string; slot: string; name?: string; reason: ForbiddenReason }> = [];

  for (const day of plan) {
    for (const slot of ["breakfast", "lunch", "dinner"] as const) {
      const meal = day[slot] as RecipeShape | undefined;
      if (!meal) continue;
      const violation = findRecipeDietViolation(meal, dietCtx);
      if (violation) {
        violations.push({
          day: String(day.day ?? ""),
          slot,
          name: meal.name,
          reason: violation
        });
      }
    }
  }

  return {
    days: plan.length,
    violations
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: tsx scripts/inspect-user-recipes.ts <email-or-uid>");
    process.exit(1);
  }

  const { uid, email } = await resolveUid(input);
  console.log(`Resolved ${input} -> uid=${uid}${email ? ` email=${email}` : ""}`);

  const [profile, settings, healthProfile, entitlement, weeklyPlan, history, pantry, usage] = await Promise.all([
    readDocSafe(`users/${uid}`),
    readDocSafe(`users/${uid}/profile/settings`),
    readDocSafe(`users/${uid}/profile/health`),
    readDocSafe(`entitlements/${uid}`),
    readDocSafe(`users/${uid}/plans/currentWeekly`),
    readCollectionSafe(`users/${uid}/history`, 50),
    readCollectionSafe(`users/${uid}/pantry`, 200),
    readDocSafe(`users/${uid}/usage/aiCredits`)
  ]);

  const profileDiets = (healthProfile?.diets as string[] | undefined) ?? [];
  const settingsDiets = (settings?.diets as string[] | undefined) ?? [];
  const profileAllergens = (healthProfile?.allergens as string[] | undefined) ?? [];
  const settingsAllergens = (settings?.allergens as string[] | undefined) ?? [];
  const diets = Array.from(new Set([...profileDiets, ...settingsDiets]));
  const allergens = Array.from(new Set([...profileAllergens, ...settingsAllergens]));
  const preferredCuisine =
    (settings?.preferredCuisine as string | undefined) ?? (profile?.preferredCuisine as string | undefined) ?? "Any";
  const dietCtx: DietEnforcementContext = { diets, allergens };

  const analyzedHistory = history.map((entry) => analyzeHistoryEntry(entry, dietCtx));
  const totalRecipes = analyzedHistory.reduce((sum, entry) => sum + entry.recipeCount, 0);
  const totalDietHits = analyzedHistory.reduce((sum, entry) => sum + entry.dietHits.length, 0);
  const totalRepeatedImageGroups = analyzedHistory.reduce((sum, entry) => sum + entry.repeatedImages.length, 0);
  const analyzedMealPlan = analyzeMealPlan(weeklyPlan, dietCtx);

  const report = {
    resolvedAt: new Date().toISOString(),
    input,
    uid,
    email,
    profile,
    settings,
    healthProfile,
    entitlement,
    usage,
    pantrySize: pantry.length,
    pantryFirst20: pantry.slice(0, 20),
    activeDietContext: dietCtx,
    preferredCuisine,
    weeklyPlanAnalysis: analyzedMealPlan,
    historyAnalysis: {
      totalEntries: history.length,
      totalRecipes,
      totalDietHits,
      totalRepeatedImageGroups,
      entries: analyzedHistory
    }
  };

  const outDir = resolve(".generated");
  mkdirSync(outDir, { recursive: true });
  const filename = `user-inspection-${uid}-${Date.now()}.json`;
  const outPath = resolve(outDir, filename);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Wrote inspection report to ${outPath}`);
  console.log(
    `Summary: diets=[${diets.join(", ") || "none"}] allergens=[${allergens.join(", ") || "none"}] preferredCuisine=${preferredCuisine} history=${history.length} recipes=${totalRecipes} dietHits=${totalDietHits} repeatedImageGroups=${totalRepeatedImageGroups}`
  );
  if (analyzedMealPlan) {
    console.log(`Weekly plan: ${analyzedMealPlan.days} days, ${analyzedMealPlan.violations.length} diet/allergen violations`);
  }
}

main().catch((error) => {
  console.error("inspect-user-recipes failed:", error);
  process.exit(1);
});

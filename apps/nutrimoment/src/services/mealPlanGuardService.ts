import { normalizeCuisineLabel } from "@/lib/cuisines";
import {
  findRecipeDietViolation,
  type DietEnforcementContext,
  type ForbiddenReason
} from "@/lib/dietEnforcement";
import { findRecipeHealthViolation, type HealthViolation } from "@/lib/healthEnforcement";
import type { MealPlanData, MealPlanMeal } from "@/lib/types";

export type MealSlot = "breakfast" | "lunch" | "dinner";

export type MealPlanGuardIssue =
  | { kind: "shape"; message: string; actual: number; expected: number }
  | { kind: "placeholder"; day: string; slot: MealSlot; name: string }
  | { kind: "diet"; day: string; slot: MealSlot; name: string; reason: ForbiddenReason }
  | { kind: "health"; day: string; slot: MealSlot; name: string; reason: HealthViolation }
  | { kind: "cuisine"; day: string; slot: MealSlot; name: string; cuisine?: string; preferredCuisine: string }
  | { kind: "seafoodQuota"; actual: number; expected: number }
  | { kind: "cuisineQuota"; actual: number; expected: number; preferredCuisine: string }
  | { kind: "ingredientCluster"; ingredient: "rice" | "legume"; actual: number; allowed: number }
  | { kind: "repeat"; name: string; actual: number; allowed: number }
  | { kind: "unique"; actual: number; expected: number };

export interface MealPlanGuardPreferences {
  dietContext: DietEnforcementContext;
  conditions?: string[];
  preferredCuisine?: string;
  maxMealRepeatCount?: number;
  minUniqueMeals?: number;
  minPescatarianSeafoodSlots?: number;
  minPreferredCuisineSlots?: number;
  maxPlantBasedRiceSlots?: number;
  maxPlantBasedLegumeSlots?: number;
  maxSimilarMealFamilySlots?: number;
}

interface MealSlotEntry {
  dayIndex: number;
  day: string;
  slot: MealSlot;
  meal: MealPlanMeal;
}

export interface MealPlanRepairResult {
  mealPlan: MealPlanData;
  initialIssues: MealPlanGuardIssue[];
  finalIssues: MealPlanGuardIssue[];
  repairedSlots: number;
}

const PLAN_DAYS = 7;
const PLAN_SLOTS = 21;
const DEFAULT_MAX_REPEAT = 2;
const DEFAULT_MIN_UNIQUE = 15;
const DEFAULT_PESCATARIAN_SEAFOOD_SLOTS = 6;
const DEFAULT_PLANT_BASED_RICE_SLOTS = 7;
const DEFAULT_PLANT_BASED_LEGUME_SLOTS = 9;
const DEFAULT_MAX_SIMILAR_MEAL_FAMILY_SLOTS = 3;

const SEAFOOD_TERMS = [
  "fish",
  "seafood",
  "shrimp",
  "prawn",
  "salmon",
  "tuna",
  "tilapia",
  "cod",
  "bass",
  "snapper",
  "calamari",
  "crab",
  "clam",
  "\u0633\u0645\u0643",
  "\u0633\u0644\u0645\u0648\u0646",
  "\u062c\u0645\u0628\u0631\u064a",
  "\u0631\u0648\u0628\u064a\u0627\u0646",
  "\u062a\u0648\u0646\u0629",
  "\u0628\u0644\u0637\u064a",
  "\u0642\u0627\u0631\u0648\u0635",
  "\u0645\u0623\u0643\u0648\u0644\u0627\u062a \u0628\u062d\u0631\u064a\u0629"
];

const MEXICAN_IDENTITY_TERMS = [
  "mexican",
  "taco",
  "tacos",
  "tostada",
  "tostadas",
  "burrito",
  "fajita",
  "quesadilla",
  "enchilada",
  "tamale",
  "pozole",
  "caldo",
  "salsa",
  "pico de gallo",
  "corn tortilla",
  "black bean",
  "chipotle",
  "cilantro",
  "lime",
  "\u0645\u0643\u0633\u064a\u0643\u064a",
  "\u0645\u0643\u0633\u064a\u0643\u064a\u0629",
  "\u062a\u0627\u0643\u0648",
  "\u062a\u0627\u0643\u0648\u0633",
  "\u062a\u0648\u0631\u062a\u064a\u0644\u0627",
  "\u062a\u0648\u0633\u062a\u0627\u062f\u0627",
  "\u0628\u0648\u0631\u064a\u062a\u0648",
  "\u0641\u0627\u0647\u064a\u062a\u0627",
  "\u0643\u064a\u0633\u0627\u062f\u064a\u0627",
  "\u0625\u0646\u0634\u064a\u0644\u0627\u062f\u0627",
  "\u0633\u0627\u0644\u0633\u0627",
  "\u0628\u064a\u0643\u0648",
  "\u0641\u0627\u0635\u0648\u0644\u064a\u0627 \u0633\u0648\u062f\u0627\u0621",
  "\u0630\u0631\u0629"
];

const RICE_TERMS = ["rice", "\u0623\u0631\u0632", "\u0627\u0631\u0632", "رز"];
const LEGUME_TERMS = [
  "lentil",
  "lentils",
  "chickpea",
  "chickpeas",
  "garbanzo",
  "fava",
  "ful",
  "bean",
  "beans",
  "hummus",
  "falafel",
  "\u0639\u062f\u0633",
  "\u062d\u0645\u0635",
  "\u0641\u0648\u0644",
  "\u0641\u0627\u0635\u0648\u0644\u064a\u0627",
  "\u0644\u0648\u0628\u064a\u0627",
  "\u0628\u0635\u0627\u0631\u0629"
];

const MEAL_FAMILY_PATTERNS: Array<[string, RegExp[]]> = [
  ["shakshuka", [/\bshakshou?ka\b/i, /\u0634\u0643\u0634\u0648\u0643/]],
  ["ful", [/\bful\b|\bfoul\b/i, /\u0641\u0648\u0644/]],
  ["koshary", [/\bkoshari\b|\bkoshary\b/i, /\u0643\u0634\u0631\u064a|\u0643\u0648\u0634\u0627\u0631\u064a/]],
  ["lentil-rice", [/\blentils?\b.*\brice\b|\brice\b.*\blentils?\b/i, /\u0639\u062f\u0633.*[\u0623\u0627]\u0631\u0632|[\u0623\u0627]\u0631\u0632.*\u0639\u062f\u0633/]],
  ["chickpea-rice", [/\bchickpeas?\b.*\brice\b|\brice\b.*\bchickpeas?\b/i, /\u062d\u0645\u0635.*[\u0623\u0627]\u0631\u0632|[\u0623\u0627]\u0631\u0632.*\u062d\u0645\u0635/]],
  ["chickpea-salad", [/\bchickpeas?\b.*\bsalad\b|\bsalad\b.*\bchickpeas?\b/i, /\u0633\u0644\u0637\u0629.*\u062d\u0645\u0635|\u062d\u0645\u0635.*\u0633\u0644\u0637\u0629/]],
  ["lentil-soup", [/\blentils?\b.*\bsoup\b|\bsoup\b.*\blentils?\b/i, /\u0634\u0648\u0631\u0628\u0629.*\u0639\u062f\u0633|\u0639\u062f\u0633.*\u0634\u0648\u0631\u0628\u0629/]],
  ["egg-toast", [/\begg\b.*\btoast\b|\btoast\b.*\begg\b/i, /\u062a\u0648\u0633\u062a.*\u0628\u064a\u0636|\u0628\u064a\u0636.*\u062a\u0648\u0633\u062a/]],
  ["kofta", [/\bkofta\b|\bkafta\b|\bkofte\b/i, /\u0643\u0641\u062a[\u0629\u0647]/]],
  ["chicken-rice", [/\bchicken\b.*\brice\b|\brice\b.*\bchicken\b/i, /\u062f\u062c\u0627\u062c.*[\u0623\u0627]\u0631\u0632|[\u0623\u0627]\u0631\u0632.*\u062f\u062c\u0627\u062c/]],
  ["vegetable-soup", [/\bvegetable\b.*\bsoup\b|\bsoup\b.*\bvegetable\b/i, /\u0634\u0648\u0631\u0628\u0629.*\u062e\u0636\u0627\u0631|\u062e\u0636\u0627\u0631.*\u0634\u0648\u0631\u0628\u0629/]]
];

export function validateMealPlan(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences
): MealPlanGuardIssue[] {
  const issues: MealPlanGuardIssue[] = [];
  const slots = flattenMealPlanSlots(mealPlan);
  const maxRepeat = preferences.maxMealRepeatCount ?? DEFAULT_MAX_REPEAT;
  const maxSimilarFamily = preferences.maxSimilarMealFamilySlots ?? DEFAULT_MAX_SIMILAR_MEAL_FAMILY_SLOTS;
  const minUnique = preferences.minUniqueMeals ?? Math.min(DEFAULT_MIN_UNIQUE, slots.length);

  if (mealPlan.plan.length !== PLAN_DAYS) {
    issues.push({ kind: "shape", message: "Weekly plan must contain 7 days.", actual: mealPlan.plan.length, expected: PLAN_DAYS });
  }
  if (slots.length !== PLAN_SLOTS) {
    issues.push({ kind: "shape", message: "Weekly plan must contain 21 meal slots.", actual: slots.length, expected: PLAN_SLOTS });
  }

  for (const entry of slots) {
    const placeholder = isPlaceholderMeal(entry.meal);
    if (placeholder) {
      issues.push({ kind: "placeholder", day: entry.day, slot: entry.slot, name: entry.meal.name });
    }

    const violation = findRecipeDietViolation(entry.meal, preferences.dietContext);
    if (violation) {
      issues.push({ kind: "diet", day: entry.day, slot: entry.slot, name: entry.meal.name, reason: violation });
    }

    const healthViolation = findRecipeHealthViolation(entry.meal, preferences.conditions ?? []);
    if (healthViolation) {
      issues.push({ kind: "health", day: entry.day, slot: entry.slot, name: entry.meal.name, reason: healthViolation });
    }

    const preferredCuisine = preferences.preferredCuisine;
    if (preferredCuisine && preferredCuisine !== "Any" && !mealMatchesPreferredCuisineIdentity(entry.meal, preferredCuisine)) {
      issues.push({
        kind: "cuisine",
        day: entry.day,
        slot: entry.slot,
        name: entry.meal.name,
        cuisine: entry.meal.cuisine,
        preferredCuisine
      });
    }
  }

  if (shouldEnforcePescatarianSeafoodQuota(preferences)) {
    const seafoodSlots = slots.filter((entry) => isSeafoodMeal(entry.meal)).length;
    const expected = preferences.minPescatarianSeafoodSlots ?? DEFAULT_PESCATARIAN_SEAFOOD_SLOTS;
    if (seafoodSlots < expected) {
      issues.push({ kind: "seafoodQuota", actual: seafoodSlots, expected });
    }
  }

  const preferredCuisine = preferences.preferredCuisine;
  if (preferredCuisine && preferredCuisine !== "Any") {
    const preferredCuisineSlots = slots.filter((entry) => mealMatchesPreferredCuisineIdentity(entry.meal, preferredCuisine)).length;
    const expected = preferences.minPreferredCuisineSlots ?? Math.min(slots.length, Math.ceil(slots.length * 0.75));
    if (preferredCuisineSlots < expected) {
      issues.push({ kind: "cuisineQuota", actual: preferredCuisineSlots, expected, preferredCuisine });
    }
  }

  const mealCounts = countMealsByName(slots);
  for (const [name, count] of mealCounts.entries()) {
    if (count > maxRepeat) {
      issues.push({ kind: "repeat", name, actual: count, allowed: maxRepeat });
    }
  }

  const familyCounts = countMealsByFamily(slots);
  for (const [name, count] of familyCounts.entries()) {
    if (count > maxSimilarFamily) {
      issues.push({ kind: "repeat", name, actual: count, allowed: maxSimilarFamily });
    }
  }

  if (mealCounts.size < minUnique) {
    issues.push({ kind: "unique", actual: mealCounts.size, expected: minUnique });
  }

  if (shouldEnforcePlantBasedVariety(preferences)) {
    const riceSlots = slots.filter((entry) => isRiceHeavyMeal(entry.meal)).length;
    const legumeSlots = slots.filter((entry) => isLegumeHeavyMeal(entry.meal)).length;
    const maxRiceSlots = preferences.maxPlantBasedRiceSlots ?? DEFAULT_PLANT_BASED_RICE_SLOTS;
    const maxLegumeSlots = preferences.maxPlantBasedLegumeSlots ?? DEFAULT_PLANT_BASED_LEGUME_SLOTS;
    if (riceSlots > maxRiceSlots) {
      issues.push({ kind: "ingredientCluster", ingredient: "rice", actual: riceSlots, allowed: maxRiceSlots });
    }
    if (legumeSlots > maxLegumeSlots) {
      issues.push({ kind: "ingredientCluster", ingredient: "legume", actual: legumeSlots, allowed: maxLegumeSlots });
    }
  }

  return issues;
}

export function repairMealPlanWithGuard(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences
): MealPlanRepairResult {
  const initialIssues = validateMealPlan(mealPlan, preferences);
  if (!initialIssues.length) {
    return {
      mealPlan: {
        ...mealPlan,
        shoppingList: sanitizeShoppingListForDiet(mealPlan.shoppingList ?? [], preferences.dietContext)
      },
      initialIssues,
      finalIssues: [],
      repairedSlots: 0
    };
  }

  const fallbackBank = buildFallbackBank(preferences);
  const hasShapeIssue = initialIssues.some((issue) => issue.kind === "shape");
  const nextPlan: MealPlanData = hasShapeIssue
    ? buildFallbackMealPlan(fallbackBank, mealPlan)
    : {
        ...mealPlan,
        plan: mealPlan.plan.map((day) => ({ ...day }))
      };
  let repairedSlots = hasShapeIssue ? PLAN_SLOTS : 0;
  const usedFallbackNames = new Set(flattenMealPlanSlots(nextPlan).map((entry) => normalizeMealName(entry.meal.name)));

  repairedSlots += replaceInvalidSlots(nextPlan, preferences, fallbackBank, usedFallbackNames);
  repairedSlots += repairSeafoodQuota(nextPlan, preferences, fallbackBank, usedFallbackNames);
  repairedSlots += repairCuisineQuota(nextPlan, preferences, fallbackBank, usedFallbackNames);
  repairedSlots += repairRepeatedMeals(nextPlan, preferences, fallbackBank, usedFallbackNames);
  repairedSlots += repairRepeatedMealFamilies(nextPlan, preferences, fallbackBank, usedFallbackNames);
  repairedSlots += repairPlantBasedIngredientClusters(nextPlan, preferences, fallbackBank, usedFallbackNames);
  nextPlan.shoppingList = sanitizeShoppingListForDiet(
    mergeShoppingList(nextPlan.shoppingList, flattenMealPlanSlots(nextPlan).map((entry) => entry.meal)),
    preferences.dietContext
  );

  const finalIssues = validateMealPlan(nextPlan, preferences);
  return { mealPlan: nextPlan, initialIssues, finalIssues, repairedSlots };
}

export function summarizeMealPlanIssues(issues: MealPlanGuardIssue[]) {
  return issues.reduce<Record<string, number>>((summary, issue) => {
    summary[issue.kind] = (summary[issue.kind] ?? 0) + 1;
    return summary;
  }, {});
}

export function isSeafoodMeal(meal: MealPlanMeal): boolean {
  return includesAny(mealSearchText(meal), SEAFOOD_TERMS);
}

export function mealMatchesPreferredCuisineIdentity(meal: MealPlanMeal, preferredCuisine: string): boolean {
  if (!preferredCuisine || preferredCuisine === "Any") return true;
  if (normalizeCuisineLabel(meal.cuisine ?? "") !== normalizeCuisineLabel(preferredCuisine)) return false;

  if (preferredCuisine.toLowerCase() !== "mexican") return true;
  return includesAny(mealSearchText(meal), MEXICAN_IDENTITY_TERMS);
}

function replaceInvalidSlots(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences,
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  usedFallbackNames: Set<string>
) {
  let repaired = 0;
  for (const entry of flattenMealPlanSlots(mealPlan)) {
    const violation = findRecipeDietViolation(entry.meal, preferences.dietContext);
    const healthViolation = findRecipeHealthViolation(entry.meal, preferences.conditions ?? []);
    const cuisineMismatch =
      preferences.preferredCuisine && preferences.preferredCuisine !== "Any"
        ? !mealMatchesPreferredCuisineIdentity(entry.meal, preferences.preferredCuisine)
        : false;
    if (!violation && !healthViolation && !isPlaceholderMeal(entry.meal) && !cuisineMismatch) continue;

    setMealAtSlot(mealPlan, entry, pickFallbackMeal(fallbackBank, entry.slot, usedFallbackNames));
    repaired += 1;
  }
  return repaired;
}

function repairSeafoodQuota(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences,
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  usedFallbackNames: Set<string>
) {
  if (!shouldEnforcePescatarianSeafoodQuota(preferences)) return 0;

  let repaired = 0;
  let seafoodSlots = flattenMealPlanSlots(mealPlan).filter((entry) => isSeafoodMeal(entry.meal)).length;
  const expected = preferences.minPescatarianSeafoodSlots ?? DEFAULT_PESCATARIAN_SEAFOOD_SLOTS;
  if (seafoodSlots >= expected) return 0;

  const candidates = flattenMealPlanSlots(mealPlan)
    .filter((entry) => !isSeafoodMeal(entry.meal))
    .sort((a, b) => mealSlotPriority(b.slot) - mealSlotPriority(a.slot));

  for (const entry of candidates) {
    const fallback = pickFallbackMeal(fallbackBank, entry.slot, usedFallbackNames, isSeafoodMeal);
    if (!fallback) continue;
    setMealAtSlot(mealPlan, entry, fallback);
    repaired += 1;
    seafoodSlots += 1;
    if (seafoodSlots >= expected) break;
  }

  return repaired;
}

function repairCuisineQuota(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences,
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  usedFallbackNames: Set<string>
) {
  const preferredCuisine = preferences.preferredCuisine;
  if (!preferredCuisine || preferredCuisine === "Any") return 0;

  let repaired = 0;
  const expected = preferences.minPreferredCuisineSlots ?? Math.ceil(flattenMealPlanSlots(mealPlan).length * 0.75);
  let cuisineSlots = flattenMealPlanSlots(mealPlan).filter((entry) => mealMatchesPreferredCuisineIdentity(entry.meal, preferredCuisine)).length;
  if (cuisineSlots >= expected) return 0;

  for (const entry of flattenMealPlanSlots(mealPlan).filter((item) => !mealMatchesPreferredCuisineIdentity(item.meal, preferredCuisine))) {
    setMealAtSlot(mealPlan, entry, pickFallbackMeal(fallbackBank, entry.slot, usedFallbackNames));
    repaired += 1;
    cuisineSlots += 1;
    if (cuisineSlots >= expected) break;
  }

  return repaired;
}

function repairRepeatedMeals(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences,
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  usedFallbackNames: Set<string>
) {
  let repaired = 0;
  const maxRepeat = preferences.maxMealRepeatCount ?? DEFAULT_MAX_REPEAT;
  const counts = new Map<string, number>();

  for (const entry of flattenMealPlanSlots(mealPlan)) {
    const key = normalizeMealName(entry.meal.name);
    const nextCount = (counts.get(key) ?? 0) + 1;
    counts.set(key, nextCount);
    if (nextCount <= maxRepeat) continue;

    setMealAtSlot(mealPlan, entry, pickFallbackMeal(fallbackBank, entry.slot, usedFallbackNames));
    repaired += 1;
  }

  return repaired;
}

function repairRepeatedMealFamilies(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences,
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  usedFallbackNames: Set<string>
) {
  let repaired = 0;
  const maxSimilarFamily = preferences.maxSimilarMealFamilySlots ?? DEFAULT_MAX_SIMILAR_MEAL_FAMILY_SLOTS;
  const counts = new Map<string, number>();

  for (const entry of flattenMealPlanSlots(mealPlan)) {
    const key = getMealFamilyKey(entry.meal);
    const nextCount = (counts.get(key) ?? 0) + 1;
    counts.set(key, nextCount);
    if (nextCount <= maxSimilarFamily) continue;

    setMealAtSlot(
      mealPlan,
      entry,
      pickFallbackMeal(fallbackBank, entry.slot, usedFallbackNames, (meal) => getMealFamilyKey(meal) !== key)
    );
    repaired += 1;
  }

  return repaired;
}

function repairPlantBasedIngredientClusters(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences,
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  usedFallbackNames: Set<string>
) {
  if (!shouldEnforcePlantBasedVariety(preferences)) return 0;

  let repaired = 0;
  const maxRiceSlots = preferences.maxPlantBasedRiceSlots ?? DEFAULT_PLANT_BASED_RICE_SLOTS;
  const maxLegumeSlots = preferences.maxPlantBasedLegumeSlots ?? DEFAULT_PLANT_BASED_LEGUME_SLOTS;

  for (let pass = 0; pass < 3; pass += 1) {
    const repairedBeforePass = repaired;
    repaired += repairIngredientCluster(mealPlan, fallbackBank, usedFallbackNames, isRiceHeavyMeal, maxRiceSlots);
    repaired += repairIngredientCluster(mealPlan, fallbackBank, usedFallbackNames, isLegumeHeavyMeal, maxLegumeSlots);

    const slots = flattenMealPlanSlots(mealPlan);
    const riceSlots = slots.filter((entry) => isRiceHeavyMeal(entry.meal)).length;
    const legumeSlots = slots.filter((entry) => isLegumeHeavyMeal(entry.meal)).length;
    if (riceSlots <= maxRiceSlots && legumeSlots <= maxLegumeSlots) break;
    if (repaired === repairedBeforePass) break;
  }

  return repaired;
}

function repairIngredientCluster(
  mealPlan: MealPlanData,
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  usedFallbackNames: Set<string>,
  isClusterMeal: (meal: MealPlanMeal) => boolean,
  allowed: number
) {
  let repaired = 0;
  let clusterSlots = flattenMealPlanSlots(mealPlan).filter((entry) => isClusterMeal(entry.meal));
  if (clusterSlots.length <= allowed) return 0;

  const protectedSlots = new Set(clusterSlots.slice(0, allowed).map(slotKey));
  const candidates = clusterSlots
    .filter((entry) => !protectedSlots.has(slotKey(entry)))
    .sort((a, b) => mealSlotPriority(b.slot) - mealSlotPriority(a.slot));

  for (const entry of candidates) {
    if (clusterSlots.length <= allowed) break;
    const fallback = pickFallbackMeal(fallbackBank, entry.slot, usedFallbackNames, (meal) => !isClusterMeal(meal));
    if (!fallback) break;

    setMealAtSlot(mealPlan, entry, fallback);
    repaired += 1;
    clusterSlots = flattenMealPlanSlots(mealPlan).filter((item) => isClusterMeal(item.meal));
  }

  return repaired;
}

function buildFallbackBank(preferences: MealPlanGuardPreferences): Record<MealSlot, MealPlanMeal[]> {
  const diets = preferences.dietContext.diets;
  const hasDiet = (diet: string) => diets.includes(diet);

  if (hasDiet("paleo") && (hasDiet("vegan") || hasDiet("vegetarian"))) {
    return PALEO_PLANT_FALLBACKS;
  }

  if ((hasDiet("keto") || hasDiet("paleo")) && hasDiet("pescatarian")) {
    return LOW_CARB_PESCATARIAN_FALLBACKS;
  }

  if (hasDiet("paleo")) {
    return KETO_FALLBACKS;
  }

  if (hasDiet("keto") && (hasDiet("vegan") || hasDiet("vegetarian"))) {
    return KETO_PLANT_FALLBACKS;
  }

  if (hasDiet("keto")) {
    return KETO_FALLBACKS;
  }

  if (hasDiet("glutenFree") && hasDiet("pescatarian")) {
    return LOW_CARB_PESCATARIAN_FALLBACKS;
  }

  if (hasDiet("glutenFree")) {
    return GLUTEN_FREE_PLANT_FALLBACKS;
  }

  if (hasDiet("vegan")) {
    return VEGAN_FALLBACKS;
  }

  const preferredCuisine = normalizeCuisineLabel(preferences.preferredCuisine ?? "");

  if (hasDiet("pescatarian")) {
    return MEXICAN_PESCATARIAN_FALLBACKS;
  }

  if (preferredCuisine === "Mexican") {
    return MEXICAN_GENERAL_FALLBACKS;
  }

  if (preferredCuisine === "Egyptian") {
    return EGYPTIAN_GENERAL_FALLBACKS;
  }

  return GENERAL_FALLBACKS;
}

function buildFallbackMealPlan(
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  sourcePlan: MealPlanData
): MealPlanData {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const plan = days.map((day, index) => ({
    day,
    breakfast: cloneMeal(fallbackBank.breakfast[index % fallbackBank.breakfast.length]),
    lunch: cloneMeal(fallbackBank.lunch[index % fallbackBank.lunch.length]),
    dinner: cloneMeal(fallbackBank.dinner[index % fallbackBank.dinner.length])
  }));

  return {
    ...sourcePlan,
    plan,
    shoppingList: mergeShoppingList(sourcePlan.shoppingList ?? [], plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]))
  };
}

function shouldEnforcePescatarianSeafoodQuota(preferences: MealPlanGuardPreferences) {
  return preferences.dietContext.diets.includes("pescatarian") && !preferences.dietContext.diets.includes("vegan");
}

function shouldEnforcePlantBasedVariety(preferences: MealPlanGuardPreferences) {
  return preferences.dietContext.diets.includes("vegan") || preferences.dietContext.diets.includes("vegetarian");
}

function isRiceHeavyMeal(meal: MealPlanMeal): boolean {
  return includesAny(mealSearchText(meal), RICE_TERMS);
}

function isLegumeHeavyMeal(meal: MealPlanMeal): boolean {
  return includesAny(mealSearchText(meal), LEGUME_TERMS);
}

function slotKey(entry: MealSlotEntry) {
  return `${entry.dayIndex}:${entry.slot}`;
}

function pickFallbackMeal(
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  slot: MealSlot,
  usedFallbackNames: Set<string>,
  predicate: (meal: MealPlanMeal) => boolean = () => true
) {
  const options = [...fallbackBank[slot], ...fallbackBank.lunch, ...fallbackBank.dinner, ...fallbackBank.breakfast].filter(predicate);
  const selected = options.find((meal) => !usedFallbackNames.has(normalizeMealName(meal.name)));
  if (!selected) return undefined;
  usedFallbackNames.add(normalizeMealName(selected.name));
  return cloneMeal(selected);
}

function cloneMeal(meal: MealPlanMeal): MealPlanMeal {
  return { ...meal, ingredients: [...(meal.ingredients ?? [])], steps: [...(meal.steps ?? [])] };
}

function setMealAtSlot(mealPlan: MealPlanData, entry: MealSlotEntry, meal: MealPlanMeal | undefined) {
  if (!meal) return;
  mealPlan.plan[entry.dayIndex][entry.slot] = meal;
}

function flattenMealPlanSlots(mealPlan: MealPlanData): MealSlotEntry[] {
  return mealPlan.plan.flatMap((day, dayIndex) =>
    (["breakfast", "lunch", "dinner"] as const).map((slot) => ({
      dayIndex,
      day: day.day,
      slot,
      meal: day[slot]
    }))
  );
}

function countMealsByName(slots: MealSlotEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of slots) {
    const key = normalizeMealName(entry.meal.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function countMealsByFamily(slots: MealSlotEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of slots) {
    const key = getMealFamilyKey(entry.meal);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function getMealFamilyKey(meal: MealPlanMeal) {
  const text = mealSearchText(meal);
  for (const [family, patterns] of MEAL_FAMILY_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(text))) return family;
  }

  const protein = detectMealToken(text, [
    ["chicken", /\bchicken\b|\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e/],
    ["beef", /\bbeef\b|\bmeat\b|\u0644\u062d\u0645|\u0644\u062d\u0645\u0629|\u0628\u0642\u0631\u064a/],
    ["fish", /\bfish\b|\bsalmon\b|\btuna\b|\btilapia\b|\u0633\u0645\u0643|\u0633\u0644\u0645\u0648\u0646|\u062a\u0648\u0646\u0629/],
    ["shrimp", /\bshrimp\b|\bprawn\b|\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646/],
    ["egg", /\begg\b|\u0628\u064a\u0636/],
    ["lentil", /\blentils?\b|\u0639\u062f\u0633/],
    ["chickpea", /\bchickpeas?\b|\bhummus\b|\u062d\u0645\u0635/],
    ["bean", /\bbeans?\b|\bfava\b|\bful\b|\u0641\u0648\u0644|\u0641\u0627\u0635\u0648\u0644\u064a\u0627/],
    ["tofu", /\btofu\b|\u062a\u0648\u0641\u0648/]
  ]);
  const method = detectMealToken(text, [
    ["soup", /\bsoup\b|\u0634\u0648\u0631\u0628\u0629/],
    ["salad", /\bsalad\b|\u0633\u0644\u0637\u0629/],
    ["toast", /\btoast\b|\u062a\u0648\u0633\u062a/],
    ["bowl", /\bbowl\b|\u0648\u0639\u0627\u0621|\u0637\u0628\u0642/],
    ["stew", /\bstew\b|\u0637\u0627\u062c\u0646|\u064a\u062e\u0646\u0629|\u064a\u062e\u0646\u0647/],
    ["grilled", /\bgrilled\b|\u0645\u0634\u0648\u064a/],
    ["skillet", /\bskillet\b|\u0645\u0642\u0644\u0627\u0629/]
  ]);

  const familyParts = [protein, method].filter(Boolean);
  return familyParts.length >= 2 ? familyParts.join("-") : normalizeMealName(meal.name);
}

function detectMealToken(text: string, patterns: Array<[string, RegExp]>) {
  return patterns.find(([, pattern]) => pattern.test(text))?.[0];
}

function isPlaceholderMeal(meal: MealPlanMeal) {
  return /flexible meal slot|placeholder|tbd|to be decided|choose a meal/i.test(meal.name) || !meal.ingredients?.length;
}

function mealSearchText(meal: MealPlanMeal) {
  return [
    meal.name,
    meal.cuisine,
    meal.image_search_index,
    ...(meal.image_search_indices ?? []),
    ...(meal.ingredients ?? []),
    ...(meal.steps ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function normalizeMealName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function mealSlotPriority(slot: MealSlot) {
  return slot === "dinner" ? 3 : slot === "lunch" ? 2 : 1;
}

function mergeShoppingList(shoppingList: string[], meals: MealPlanMeal[]) {
  const seen = new Set(shoppingList.map((item) => item.split(" - ")[0].trim().toLowerCase()));
  const next = [...shoppingList];

  for (const ingredient of meals.flatMap((meal) => meal.ingredients ?? [])) {
    const key = ingredient.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(`${ingredient} - 1 item`);
  }

  return next;
}

function sanitizeShoppingListForDiet(shoppingList: string[], dietContext: DietEnforcementContext) {
  return shoppingList.filter((item) => !findRecipeDietViolation({ name: item, ingredients: [item] }, dietContext));
}

function meal(
  name: string,
  slot: MealSlot,
  ingredients: string[],
  calories: number,
  protein: string,
  imageSearchIndex?: string
): MealPlanMeal {
  return {
    name,
    cuisine: "Mexican",
    calories,
    protein,
    carbs: slot === "breakfast" ? "48g" : "56g",
    fat: slot === "breakfast" ? "14g" : "18g",
    ingredients,
    steps: [
      "Prep the vegetables, salsa, and citrus.",
      "Cook the protein with olive oil, lime, and mild Mexican spices.",
      "Assemble with beans, corn tortillas, rice, or vegetables and serve warm."
    ],
    image_search_index: imageSearchIndex ?? name.toLowerCase()
  };
}

const MEXICAN_PESCATARIAN_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    meal("Black bean avocado breakfast tacos", "breakfast", ["black beans", "corn tortillas", "avocado", "pico de gallo", "cilantro"], 410, "17g"),
    meal("Avocado corn tostada with tomato salsa", "breakfast", ["corn tostada", "avocado", "tomato salsa", "black beans", "lime"], 420, "16g"),
    meal("Mexican quinoa breakfast bowl", "breakfast", ["quinoa", "black beans", "corn", "salsa", "avocado"], 390, "17g"),
    meal("Nopales black bean breakfast tacos", "breakfast", ["nopales", "black beans", "corn tortillas", "salsa verde", "cilantro"], 405, "16g"),
    meal("Sweet potato black bean hash", "breakfast", ["sweet potato", "black beans", "bell pepper", "salsa", "lime"], 395, "16g"),
    meal("Chilaquiles verdes with black beans", "breakfast", ["baked tortilla chips", "salsa verde", "black beans", "cilantro", "avocado"], 440, "17g"),
    meal("Breakfast rice and black bean bowl", "breakfast", ["brown rice", "black beans", "corn", "salsa", "avocado"], 430, "16g")
  ],
  lunch: [
    meal("Grilled fish tacos with cabbage salsa", "lunch", ["white fish", "corn tortillas", "cabbage", "pico de gallo", "lime"], 520, "36g"),
    meal("Shrimp fajita bowl", "lunch", ["shrimp", "brown rice", "bell pepper", "onion", "salsa"], 540, "38g"),
    meal("Tuna tostadas with avocado salsa", "lunch", ["tuna", "corn tostadas", "avocado", "tomato", "lime"], 500, "34g"),
    meal("Ceviche tostadas with black beans", "lunch", ["white fish", "corn tostadas", "lime", "tomato", "black beans"], 510, "35g"),
    meal("Grilled tilapia taco salad", "lunch", ["tilapia", "romaine", "black beans", "corn", "salsa"], 485, "37g"),
    meal("Shrimp black bean tacos", "lunch", ["shrimp", "black beans", "corn tortillas", "cabbage", "salsa"], 530, "39g"),
    meal("Salmon rice bowl with corn salsa", "lunch", ["salmon", "brown rice", "corn salsa", "avocado", "lime"], 560, "40g")
  ],
  dinner: [
    meal("Baked tilapia Veracruz", "dinner", ["tilapia", "tomato", "bell pepper", "olive", "brown rice"], 570, "42g"),
    meal("Shrimp caldo with vegetables", "dinner", ["shrimp", "zucchini", "tomato", "carrot", "lime"], 500, "36g"),
    meal("Salmon with roasted corn salsa", "dinner", ["salmon", "corn", "tomato", "black beans", "lime"], 590, "43g"),
    meal("Fish burrito bowl no dairy", "dinner", ["white fish", "brown rice", "black beans", "pico de gallo", "avocado"], 580, "40g"),
    meal("Shrimp enchilada skillet with salsa roja", "dinner", ["shrimp", "corn tortillas", "tomato enchilada sauce", "bell pepper", "onion"], 560, "38g"),
    meal("Seafood pozole verde", "dinner", ["white fish", "shrimp", "hominy", "tomatillo salsa", "cabbage"], 570, "41g"),
    meal("Tuna stuffed poblano peppers", "dinner", ["tuna", "poblano peppers", "brown rice", "tomato salsa", "corn"], 540, "37g")
  ]
};

const VEGAN_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    veganMeal("Ful medames with tomato cucumber salad", "breakfast", ["fava beans", "tomato", "cucumber", "parsley", "lemon", "olive oil"], 430, "19g", "ful medames tomato cucumber"),
    veganMeal("Mushroom potato breakfast hash", "breakfast", ["potatoes", "mushrooms", "bell pepper", "onion", "parsley", "olive oil"], 430, "12g", "mushroom potato breakfast hash"),
    veganMeal("Avocado tomato sourdough toast", "breakfast", ["whole grain bread", "avocado", "tomato", "cucumber", "lemon"], 420, "12g", "avocado tomato toast"),
    veganMeal("Vegetable tofu breakfast scramble", "breakfast", ["tofu", "spinach", "mushrooms", "bell pepper", "turmeric", "olive oil"], 410, "24g", "vegan tofu scramble vegetables"),
    veganMeal("Cinnamon apple oatmeal", "breakfast", ["oats", "apple", "cinnamon", "almond milk", "walnuts"], 395, "13g", "apple cinnamon oatmeal"),
    veganMeal("Date tahini oatmeal", "breakfast", ["oats", "dates", "tahini", "cinnamon", "almond milk"], 390, "13g", "date tahini oatmeal"),
    veganMeal("Berry chia almond pudding", "breakfast", ["chia seeds", "almond milk", "berries", "pumpkin seeds", "cinnamon"], 380, "14g", "berry chia pudding")
  ],
  lunch: [
    veganMeal("Pasta primavera with roasted vegetables", "lunch", ["pasta", "zucchini", "bell pepper", "tomato", "basil", "olive oil"], 545, "18g", "vegan pasta primavera"),
    veganMeal("Mushroom shawarma pita with tahini", "lunch", ["mushrooms", "pita bread", "cucumber", "tomato", "tahini", "shawarma spices"], 535, "18g", "mushroom shawarma pita"),
    veganMeal("Vegetable sushi rolls with edamame", "lunch", ["nori", "sushi rice", "cucumber", "avocado", "carrot", "edamame"], 520, "18g", "vegetable sushi rolls edamame"),
    veganMeal("Tofu soba noodle salad", "lunch", ["tofu", "soba noodles", "cucumber", "carrot", "sesame", "ginger"], 540, "26g", "tofu soba noodle salad"),
    veganMeal("Roasted eggplant tahini flatbread", "lunch", ["eggplant", "flatbread", "tahini", "tomato", "parsley", "lemon"], 550, "17g", "roasted eggplant tahini flatbread"),
    veganMeal("Quinoa roasted vegetable bowl", "lunch", ["quinoa", "zucchini", "carrot", "bell pepper", "pumpkin seeds", "lemon"], 535, "19g", "quinoa roasted vegetable bowl"),
    veganMeal("Falafel chickpea salad bowl", "lunch", ["falafel", "chickpeas", "romaine", "tomato", "cucumber", "tahini"], 560, "23g", "falafel chickpea salad bowl"),
    veganMeal("Stuffed grape leaves with cucumber salad", "lunch", ["grape leaves", "rice", "tomato", "parsley", "cucumber", "lemon"], 520, "12g", "stuffed grape leaves cucumber salad"),
    veganMeal("Chickpea shawarma vegetable bowl", "lunch", ["chickpeas", "cucumber", "tomato", "tahini", "cabbage", "shawarma spices"], 545, "21g", "chickpea shawarma vegetable bowl")
  ],
  dinner: [
    veganMeal("Eggplant tomato pasta bake", "dinner", ["eggplant", "pasta", "tomato sauce", "garlic", "basil", "olive oil"], 590, "19g", "vegan eggplant tomato pasta bake"),
    veganMeal("Thai tofu vegetable curry", "dinner", ["tofu", "coconut milk", "zucchini", "bell pepper", "carrot", "basil"], 575, "25g", "thai tofu vegetable curry"),
    veganMeal("Stuffed peppers with quinoa vegetables", "dinner", ["bell peppers", "quinoa", "zucchini", "tomato", "onion", "parsley"], 555, "18g", "quinoa stuffed peppers"),
    veganMeal("Mushroom noodle stir fry", "dinner", ["noodles", "mushrooms", "broccoli", "carrot", "ginger", "soy sauce"], 560, "20g", "mushroom vegetable noodle stir fry"),
    veganMeal("Okra tomato stew with potatoes", "dinner", ["okra", "potatoes", "tomato sauce", "onion", "garlic", "coriander"], 535, "14g", "okra tomato potato stew"),
    veganMeal("Cauliflower shawarma tray with tahini", "dinner", ["cauliflower", "potatoes", "tahini", "tomato", "parsley", "shawarma spices"], 555, "17g", "cauliflower shawarma tray"),
    veganMeal("Vegetable moussaka no dairy", "dinner", ["eggplant", "zucchini", "tomato sauce", "potatoes", "onion", "olive oil"], 570, "15g", "vegan vegetable moussaka"),
    veganMeal("Koshari-inspired lentil rice bowl", "dinner", ["rice", "lentils", "chickpeas", "tomato sauce", "onion"], 590, "24g", "vegan koshari lentil rice"),
    veganMeal("Lentil vegetable stew with roasted potatoes", "dinner", ["lentils", "potatoes", "carrot", "tomato", "onion", "garlic", "olive oil"], 560, "24g", "lentil vegetable stew potatoes")
  ]
};

const GLUTEN_FREE_PLANT_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    veganMeal("Ful medames with tomato cucumber salad", "breakfast", ["fava beans", "tomato", "cucumber", "parsley", "lemon", "olive oil"], 430, "19g", "ful medames tomato cucumber"),
    veganMeal("Mushroom potato breakfast hash", "breakfast", ["potatoes", "mushrooms", "bell pepper", "onion", "parsley", "olive oil"], 430, "12g", "mushroom potato breakfast hash"),
    veganMeal("Vegetable tofu breakfast scramble", "breakfast", ["tofu", "spinach", "mushrooms", "bell pepper", "turmeric", "olive oil"], 410, "24g", "vegan tofu scramble vegetables"),
    veganMeal("Berry chia almond pudding", "breakfast", ["chia seeds", "almond milk", "berries", "pumpkin seeds", "cinnamon"], 380, "14g", "berry chia pudding"),
    veganMeal("Coconut chia fruit bowl", "breakfast", ["chia seeds", "coconut milk", "berries", "walnuts", "cinnamon"], 410, "13g", "coconut chia fruit bowl"),
    veganMeal("Sweet potato mushroom skillet", "breakfast", ["sweet potato", "mushrooms", "bell pepper", "spinach", "olive oil"], 425, "12g", "sweet potato mushroom skillet"),
    veganMeal("Quinoa apple cinnamon bowl", "breakfast", ["quinoa", "apple", "cinnamon", "almond milk", "pumpkin seeds"], 405, "14g", "quinoa apple cinnamon bowl")
  ],
  lunch: [
    veganMeal("Vegetable sushi rolls with edamame", "lunch", ["nori", "sushi rice", "cucumber", "avocado", "carrot", "edamame"], 520, "18g", "vegetable sushi rolls edamame"),
    veganMeal("Quinoa roasted vegetable bowl", "lunch", ["quinoa", "zucchini", "carrot", "bell pepper", "pumpkin seeds", "lemon"], 535, "19g", "quinoa roasted vegetable bowl"),
    veganMeal("Chickpea shawarma vegetable bowl", "lunch", ["chickpeas", "cucumber", "tomato", "tahini", "cabbage", "shawarma spices"], 545, "21g", "chickpea shawarma vegetable bowl"),
    veganMeal("Falafel chickpea salad bowl", "lunch", ["falafel", "chickpeas", "romaine", "tomato", "cucumber", "tahini"], 560, "23g", "falafel chickpea salad bowl"),
    veganMeal("Stuffed grape leaves with cucumber salad", "lunch", ["grape leaves", "rice", "tomato", "parsley", "cucumber", "lemon"], 520, "12g", "stuffed grape leaves cucumber salad"),
    veganMeal("Zucchini noodle tofu stir fry", "lunch", ["tofu", "zucchini noodles", "broccoli", "ginger", "sesame"], 505, "30g", "zucchini noodle tofu stir fry"),
    veganMeal("Cauliflower tabbouleh tofu bowl", "lunch", ["tofu", "cauliflower", "parsley", "cucumber", "tahini"], 520, "31g", "cauliflower tabbouleh tofu bowl")
  ],
  dinner: [
    veganMeal("Thai tofu vegetable curry", "dinner", ["tofu", "coconut milk", "zucchini", "bell pepper", "carrot", "basil"], 575, "25g", "thai tofu vegetable curry"),
    veganMeal("Stuffed peppers with quinoa vegetables", "dinner", ["bell peppers", "quinoa", "zucchini", "tomato", "onion", "parsley"], 555, "18g", "quinoa stuffed peppers"),
    veganMeal("Okra tomato stew with potatoes", "dinner", ["okra", "potatoes", "tomato sauce", "onion", "garlic", "coriander"], 535, "14g", "okra tomato potato stew"),
    veganMeal("Cauliflower shawarma tray with tahini", "dinner", ["cauliflower", "potatoes", "tahini", "tomato", "parsley", "shawarma spices"], 555, "17g", "cauliflower shawarma tray"),
    veganMeal("Vegetable moussaka no dairy", "dinner", ["eggplant", "zucchini", "tomato sauce", "potatoes", "onion", "olive oil"], 570, "15g", "vegan vegetable moussaka"),
    veganMeal("Koshari-inspired lentil rice bowl", "dinner", ["rice", "lentils", "chickpeas", "tomato sauce", "onion"], 590, "24g", "vegan koshari lentil rice"),
    veganMeal("Lentil vegetable stew with roasted potatoes", "dinner", ["lentils", "potatoes", "carrot", "tomato", "onion", "garlic", "olive oil"], 560, "24g", "lentil vegetable stew potatoes")
  ]
};

const LOW_CARB_PESCATARIAN_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    fallbackMeal("Smoked salmon cucumber avocado plate", "breakfast", "Global", ["smoked salmon", "cucumber", "avocado", "lemon", "dill"], 390, "29g", "salmon cucumber avocado plate", "10g", "27g"),
    fallbackMeal("Tuna tomato cucumber plate", "breakfast", "Mediterranean", ["tuna", "tomato", "cucumber", "olive", "lettuce"], 380, "32g", "tuna tomato cucumber plate", "12g", "25g"),
    fallbackMeal("Shrimp avocado breakfast cabbage bowl", "breakfast", "Global", ["shrimp", "cabbage", "avocado", "lime", "olive oil"], 405, "33g", "shrimp avocado breakfast cabbage bowl", "12g", "28g"),
    fallbackMeal("Salmon zucchini herb skillet", "breakfast", "Global", ["salmon", "zucchini", "parsley", "olive oil", "mushrooms"], 395, "32g", "salmon zucchini herb skillet", "13g", "26g"),
    fallbackMeal("White fish lettuce herb cups", "breakfast", "Global", ["white fish", "lettuce", "cucumber", "parsley", "lemon"], 385, "34g", "white fish lettuce herb cups", "9g", "24g"),
    fallbackMeal("Tuna avocado lettuce wraps", "breakfast", "Global", ["tuna", "lettuce", "avocado", "cucumber", "olive oil"], 405, "31g", "tuna avocado lettuce wraps", "11g", "28g"),
    fallbackMeal("Shrimp spinach mushroom skillet", "breakfast", "Global", ["shrimp", "spinach", "mushrooms", "olive oil", "avocado"], 410, "34g", "shrimp spinach mushroom skillet", "14g", "28g")
  ],
  lunch: [
    fallbackMeal("Salmon cauliflower rice bowl", "lunch", "Global", ["salmon", "cauliflower rice", "zucchini", "lemon", "olive oil"], 540, "39g", "salmon cauliflower rice bowl", "15g", "35g"),
    fallbackMeal("Shrimp lime cabbage salad", "lunch", "Global", ["shrimp", "cabbage", "avocado", "lime", "olive oil"], 505, "37g", "shrimp lime cabbage salad", "14g", "30g"),
    fallbackMeal("Tuna lettuce tahini salad", "lunch", "Mediterranean", ["tuna", "lettuce", "cucumber", "tahini", "lemon"], 500, "38g", "tuna lettuce tahini salad", "12g", "33g"),
    fallbackMeal("Baked fish broccoli tahini plate", "lunch", "Mediterranean", ["white fish", "broccoli", "tahini", "lemon", "olive oil"], 535, "41g", "baked fish broccoli tahini", "16g", "33g"),
    fallbackMeal("Salmon asparagus herb tray", "lunch", "Global", ["salmon", "asparagus", "zucchini", "lemon", "olive oil"], 565, "42g", "salmon asparagus herb tray", "12g", "39g"),
    fallbackMeal("Shrimp zucchini noodle skillet", "lunch", "Global", ["shrimp", "zucchini noodles", "garlic", "olive oil", "parsley"], 500, "38g", "shrimp zucchini noodle skillet", "14g", "30g"),
    fallbackMeal("Tuna cucumber herb plate", "lunch", "Mediterranean", ["tuna", "cucumber", "celery", "parsley", "olive oil"], 385, "34g", "tuna cucumber herb plate", "9g", "24g")
  ],
  dinner: [
    fallbackMeal("Shrimp cauliflower vegetable skillet", "dinner", "Global", ["shrimp", "cauliflower", "zucchini", "bell pepper", "olive oil"], 510, "39g", "shrimp cauliflower vegetable skillet", "18g", "28g"),
    fallbackMeal("Baked fish with broccoli and tahini", "dinner", "Mediterranean", ["white fish", "broccoli", "tahini", "lemon", "olive oil"], 535, "41g", "baked fish broccoli tahini", "16g", "33g"),
    fallbackMeal("Salmon asparagus dinner tray", "dinner", "Global", ["salmon", "asparagus", "zucchini", "lemon", "olive oil"], 565, "42g", "salmon asparagus dinner tray", "12g", "39g"),
    fallbackMeal("Tuna cucumber tahini plate", "dinner", "Mediterranean", ["tuna", "lettuce", "cucumber", "tahini", "lemon"], 500, "38g", "tuna cucumber tahini plate", "12g", "33g"),
    fallbackMeal("Shrimp avocado lettuce plate", "dinner", "Global", ["shrimp", "lettuce", "avocado", "lime", "olive oil"], 505, "37g", "shrimp avocado lettuce plate", "14g", "30g"),
    fallbackMeal("White fish zucchini tomato skillet", "dinner", "Mediterranean", ["white fish", "zucchini", "tomato", "garlic", "olive oil"], 545, "44g", "white fish zucchini tomato skillet", "20g", "30g"),
    fallbackMeal("Salmon cauliflower mash plate", "dinner", "Global", ["salmon", "cauliflower", "asparagus", "olive oil", "herbs"], 560, "44g", "salmon cauliflower mash", "18g", "34g")
  ]
};

const KETO_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    fallbackMeal("Chicken spinach avocado skillet", "breakfast", "Global", ["chicken", "spinach", "mushrooms", "olive oil", "avocado"], 410, "34g", "chicken spinach avocado skillet", "14g", "28g"),
    fallbackMeal("Smoked salmon cucumber avocado plate", "breakfast", "Global", ["smoked salmon", "cucumber", "avocado", "lemon", "dill"], 390, "29g", "salmon cucumber avocado plate", "10g", "27g"),
    fallbackMeal("Tuna Greek salad bowl", "breakfast", "Mediterranean", ["tuna", "cucumber", "tomato", "olive", "lettuce"], 380, "32g", "tuna greek salad bowl", "12g", "25g"),
    fallbackMeal("Turkey avocado lettuce wraps", "breakfast", "Global", ["turkey", "lettuce", "avocado", "cucumber", "olive oil"], 405, "31g", "turkey avocado lettuce wraps", "11g", "28g"),
    fallbackMeal("Tuna cucumber herb plate", "breakfast", "Mediterranean", ["tuna", "cucumber", "celery", "parsley", "olive oil"], 385, "34g", "tuna cucumber herb plate", "9g", "24g"),
    fallbackMeal("Chicken avocado salad cup", "breakfast", "Global", ["chicken", "lettuce", "tomato", "avocado", "lemon"], 415, "35g", "keto chicken salad lettuce cup", "12g", "27g"),
    fallbackMeal("Salmon zucchini herb skillet", "breakfast", "Global", ["salmon", "zucchini", "parsley", "olive oil", "mushrooms"], 395, "32g", "salmon zucchini herb skillet", "13g", "26g")
  ],
  lunch: [
    fallbackMeal("Chicken lettuce shawarma bowl", "lunch", "Middle Eastern", ["chicken", "romaine lettuce", "cucumber", "tahini", "shawarma spices"], 520, "42g", "chicken lettuce shawarma bowl", "16g", "31g"),
    fallbackMeal("Salmon cauliflower rice bowl", "lunch", "Global", ["salmon", "cauliflower rice", "zucchini", "lemon", "olive oil"], 540, "39g", "salmon cauliflower rice bowl", "15g", "35g"),
    fallbackMeal("Beef kofta salad plate", "lunch", "Middle Eastern", ["ground beef", "lettuce", "cucumber", "parsley", "tahini"], 560, "38g", "beef kofta salad plate", "13g", "39g"),
    fallbackMeal("Shrimp avocado cabbage bowl", "lunch", "Global", ["shrimp", "cabbage", "avocado", "lime", "olive oil"], 505, "37g", "shrimp avocado cabbage bowl", "14g", "30g"),
    fallbackMeal("Turkey zucchini skillet", "lunch", "Global", ["turkey", "zucchini", "mushrooms", "garlic", "olive oil"], 530, "40g", "turkey zucchini skillet", "15g", "34g"),
    fallbackMeal("Tuna lettuce tahini salad", "lunch", "Mediterranean", ["tuna", "lettuce", "cucumber", "tahini", "lemon"], 500, "38g", "tuna lettuce tahini salad", "12g", "33g"),
    fallbackMeal("Chicken broccoli olive plate", "lunch", "Mediterranean", ["chicken", "broccoli", "olive", "tomato", "olive oil"], 545, "43g", "chicken broccoli olive plate", "17g", "35g")
  ],
  dinner: [
    fallbackMeal("Shrimp zucchini noodle skillet", "dinner", "Global", ["shrimp", "zucchini noodles", "garlic", "olive oil", "parsley"], 500, "38g", "shrimp zucchini noodle skillet", "14g", "30g"),
    fallbackMeal("Chicken cauliflower mash plate", "dinner", "Global", ["chicken", "cauliflower", "asparagus", "olive oil", "herbs"], 560, "44g", "chicken cauliflower mash", "18g", "34g"),
    fallbackMeal("Baked fish with broccoli and tahini", "dinner", "Mediterranean", ["white fish", "broccoli", "tahini", "lemon", "olive oil"], 535, "41g", "baked fish broccoli tahini", "16g", "33g"),
    fallbackMeal("Beef mushroom lettuce bowl", "dinner", "Global", ["beef", "mushrooms", "lettuce", "cucumber", "olive oil"], 555, "39g", "beef mushroom lettuce bowl", "13g", "38g"),
    fallbackMeal("Salmon asparagus herb tray", "dinner", "Global", ["salmon", "asparagus", "zucchini", "lemon", "olive oil"], 565, "42g", "salmon asparagus herb tray", "12g", "39g"),
    fallbackMeal("Turkey cauliflower shawarma plate", "dinner", "Middle Eastern", ["turkey", "cauliflower", "cucumber", "tahini", "shawarma spices"], 540, "41g", "turkey cauliflower shawarma plate", "15g", "34g"),
    fallbackMeal("Chicken pepper tomato skillet", "dinner", "Global", ["chicken", "bell pepper", "tomato", "zucchini", "olive oil"], 525, "43g", "chicken pepper tomato skillet", "16g", "31g")
  ]
};

const KETO_PLANT_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    fallbackMeal("Tofu avocado cucumber bowl", "breakfast", "Global", ["tofu", "avocado", "cucumber", "spinach", "olive oil"], 410, "24g", "tofu avocado cucumber bowl", "15g", "30g"),
    fallbackMeal("Chia coconut seed pudding", "breakfast", "Global", ["chia seeds", "coconut milk", "pumpkin seeds", "cinnamon", "berries"], 390, "15g", "chia coconut seed pudding", "16g", "29g"),
    fallbackMeal("Mushroom spinach tofu scramble", "breakfast", "Global", ["tofu", "mushrooms", "spinach", "turmeric", "olive oil"], 395, "25g", "mushroom spinach tofu scramble", "14g", "27g")
  ],
  lunch: [
    fallbackMeal("Cauliflower tabbouleh tofu bowl", "lunch", "Middle Eastern", ["tofu", "cauliflower", "parsley", "cucumber", "tahini"], 520, "31g", "cauliflower tabbouleh tofu bowl", "18g", "35g"),
    fallbackMeal("Zucchini noodle tofu stir fry", "lunch", "Asian", ["tofu", "zucchini noodles", "broccoli", "ginger", "sesame"], 505, "30g", "zucchini noodle tofu stir fry", "17g", "34g"),
    fallbackMeal("Eggplant tahini walnut salad", "lunch", "Mediterranean", ["eggplant", "tahini", "walnuts", "cucumber", "parsley"], 540, "18g", "eggplant tahini walnut salad", "20g", "42g")
  ],
  dinner: [
    fallbackMeal("Coconut tofu vegetable curry", "dinner", "Thai", ["tofu", "coconut milk", "zucchini", "mushrooms", "basil"], 560, "28g", "coconut tofu vegetable curry", "18g", "40g"),
    fallbackMeal("Stuffed zucchini with cauliflower and walnuts", "dinner", "Mediterranean", ["zucchini", "cauliflower", "walnuts", "tomato", "herbs"], 535, "17g", "stuffed zucchini cauliflower walnuts", "20g", "39g"),
    fallbackMeal("Mushroom lettuce taco cups", "dinner", "Mexican", ["mushrooms", "lettuce", "avocado", "salsa", "pumpkin seeds"], 500, "16g", "mushroom lettuce taco cups", "19g", "36g")
  ]
};

const PALEO_PLANT_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    fallbackMeal("Avocado cucumber seed plate", "breakfast", "Global", ["avocado", "cucumber", "pumpkin seeds", "spinach", "lemon"], 395, "12g", "avocado cucumber seed plate", "18g", "31g"),
    fallbackMeal("Coconut chia berry bowl", "breakfast", "Global", ["chia seeds", "coconut milk", "berries", "walnuts", "cinnamon"], 410, "13g", "coconut chia berry bowl", "22g", "32g"),
    fallbackMeal("Mushroom spinach avocado skillet", "breakfast", "Global", ["mushrooms", "spinach", "avocado", "olive oil", "herbs"], 385, "10g", "mushroom spinach avocado skillet", "16g", "30g")
  ],
  lunch: [
    fallbackMeal("Cauliflower tabbouleh walnut bowl", "lunch", "Middle Eastern", ["cauliflower", "parsley", "cucumber", "walnuts", "olive oil"], 510, "13g", "cauliflower tabbouleh walnut bowl", "23g", "41g"),
    fallbackMeal("Roasted eggplant avocado salad", "lunch", "Mediterranean", ["eggplant", "avocado", "tomato", "parsley", "olive oil"], 525, "10g", "roasted eggplant avocado salad", "28g", "39g"),
    fallbackMeal("Stuffed zucchini with mushrooms and walnuts", "lunch", "Mediterranean", ["zucchini", "mushrooms", "walnuts", "tomato", "herbs"], 500, "13g", "stuffed zucchini mushrooms walnuts", "24g", "37g")
  ],
  dinner: [
    fallbackMeal("Cauliflower mushroom shawarma plate", "dinner", "Middle Eastern", ["cauliflower", "mushrooms", "tahini", "cucumber", "shawarma spices"], 545, "16g", "cauliflower mushroom shawarma plate", "26g", "42g"),
    fallbackMeal("Vegetable coconut curry", "dinner", "Thai", ["coconut milk", "zucchini", "mushrooms", "cauliflower", "basil"], 560, "11g", "vegetable coconut curry", "24g", "45g"),
    fallbackMeal("Eggplant zucchini tomato bake", "dinner", "Mediterranean", ["eggplant", "zucchini", "tomato", "olive oil", "herbs"], 520, "11g", "eggplant zucchini tomato bake", "30g", "36g")
  ]
};

const MEXICAN_GENERAL_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = MEXICAN_PESCATARIAN_FALLBACKS;

const EGYPTIAN_GENERAL_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = {
  breakfast: [
    fallbackMeal("Ful medames with baladi salad", "breakfast", "Egyptian", ["fava beans", "tomato", "cucumber", "parsley", "lemon", "olive oil"], 430, "19g", "ful medames fava bean puree baladi salad", "58g", "14g"),
    fallbackMeal("Taameya cucumber tomato plate", "breakfast", "Egyptian", ["fava bean falafel", "cucumber", "tomato", "parsley", "tahini", "baladi bread"], 455, "20g", "egyptian taameya fava falafel cucumber tomato plate", "62g", "16g"),
    fallbackMeal("Bessara with crisp onion salad", "breakfast", "Egyptian", ["split fava beans", "dill", "parsley", "onion", "lemon", "olive oil"], 405, "22g", "egyptian bessara green fava bean dip onion salad", "54g", "12g"),
    fallbackMeal("Baladi tomato cucumber tahini plate", "breakfast", "Egyptian", ["baladi bread", "tomato", "cucumber", "tahini", "mint", "lemon"], 390, "13g", "egyptian baladi bread tomato cucumber tahini plate", "56g", "13g"),
    fallbackMeal("Fava bean salad with roasted pepper", "breakfast", "Egyptian", ["fava beans", "roasted pepper", "tomato", "cumin", "parsley", "lemon"], 410, "20g", "egyptian fava bean salad roasted pepper", "55g", "12g"),
    fallbackMeal("Dukkah potato breakfast plate", "breakfast", "Egyptian", ["potatoes", "dukkah", "tomato", "cucumber", "parsley", "olive oil"], 420, "11g", "egyptian dukkah roasted potato breakfast plate", "60g", "14g"),
    fallbackMeal("Tahini mushroom baladi toast", "breakfast", "Egyptian", ["mushrooms", "baladi bread", "tahini", "tomato", "parsley", "lemon"], 435, "16g", "egyptian tahini mushroom baladi bread toast", "58g", "16g")
  ],
  lunch: [
    fallbackMeal("Koshary with tomato sauce and salad", "lunch", "Egyptian", ["rice", "lentils", "chickpeas", "tomato sauce", "crispy onion", "cucumber"], 590, "24g", "egyptian koshary tomato sauce lentils chickpeas", "92g", "13g"),
    fallbackMeal("Molokhia chicken with rice", "lunch", "Egyptian", ["chicken breast", "molokhia", "rice", "garlic", "coriander", "lemon"], 560, "42g", "egyptian molokhia chicken rice", "58g", "17g"),
    fallbackMeal("Sayadeya fish rice with tomato salad", "lunch", "Egyptian", ["white fish", "brown rice", "onion", "tomato", "cumin", "lemon"], 545, "38g", "egyptian sayadeya fish rice tomato salad", "62g", "15g"),
    fallbackMeal("Okra tomato stew with chicken", "lunch", "Egyptian", ["chicken", "okra", "tomato sauce", "garlic", "coriander", "rice"], 535, "39g", "egyptian okra tomato stew chicken", "54g", "16g"),
    fallbackMeal("Alexandrian shrimp rice bowl", "lunch", "Egyptian", ["shrimp", "rice", "bell pepper", "tomato", "cumin", "parsley"], 540, "37g", "egyptian alexandrian shrimp rice bowl", "61g", "14g"),
    fallbackMeal("Stuffed peppers with herbed rice", "lunch", "Egyptian", ["bell peppers", "rice", "tomato", "parsley", "dill", "mint"], 510, "13g", "egyptian mahshi stuffed peppers herbed rice", "80g", "10g"),
    fallbackMeal("Grilled kofta salad plate", "lunch", "Egyptian", ["lean ground beef", "parsley", "onion", "tomato", "cucumber", "baladi bread"], 565, "38g", "egyptian grilled kofta salad plate", "48g", "24g")
  ],
  dinner: [
    fallbackMeal("Hawawshi baladi stuffed bread", "dinner", "Egyptian", ["baladi bread", "lean ground beef", "onion", "pepper", "parsley", "spices"], 585, "36g", "egyptian hawawshi opened baladi bread stuffed ground meat", "60g", "22g"),
    fallbackMeal("Fish tagine with potatoes and tomato", "dinner", "Egyptian", ["white fish", "potatoes", "tomato", "bell pepper", "garlic", "lemon"], 540, "39g", "egyptian fish tagine potatoes tomato", "48g", "16g"),
    fallbackMeal("Chicken shawarma baladi bowl", "dinner", "Egyptian", ["chicken", "baladi bread", "cucumber", "tomato", "tahini", "shawarma spices"], 560, "42g", "egyptian chicken shawarma baladi bowl", "52g", "19g"),
    fallbackMeal("Vegetable mahshi grape leaves", "dinner", "Egyptian", ["grape leaves", "rice", "tomato", "parsley", "dill", "mint"], 520, "12g", "egyptian stuffed grape leaves vegetarian mahshi", "82g", "11g"),
    fallbackMeal("Fasolia tomato stew with rice", "dinner", "Egyptian", ["white beans", "tomato sauce", "rice", "garlic", "coriander", "carrot"], 540, "22g", "egyptian white bean tomato stew rice", "86g", "9g"),
    fallbackMeal("Grilled tilapia with tahini salad", "dinner", "Egyptian", ["tilapia", "tahini", "tomato", "cucumber", "parsley", "lemon"], 505, "41g", "egyptian grilled tilapia tahini salad", "28g", "20g"),
    fallbackMeal("Egyptian lentil vegetable soup", "dinner", "Egyptian", ["red lentils", "carrot", "tomato", "onion", "cumin", "lemon"], 475, "24g", "egyptian lentil vegetable soup bowl", "68g", "9g")
  ]
};

const GENERAL_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = VEGAN_FALLBACKS;

function fallbackMeal(
  name: string,
  slot: MealSlot,
  cuisine: string,
  ingredients: string[],
  calories: number,
  protein: string,
  imageSearchIndex: string,
  carbs: string,
  fat: string
): MealPlanMeal {
  return {
    name,
    cuisine,
    calories,
    protein,
    carbs,
    fat,
    ingredients,
    steps: [
      "Prep all vegetables, protein, herbs, and sauce ingredients before cooking.",
      "Cook the main ingredient with the cuisine-appropriate aromatics until tender and well seasoned.",
      "Plate with a clear vegetable base, fresh garnish, and a matching sauce or citrus finish."
    ],
    image_search_index: imageSearchIndex
  };
}

function veganMeal(
  name: string,
  slot: MealSlot,
  ingredients: string[],
  calories: number,
  protein: string,
  imageSearchIndex?: string
): MealPlanMeal {
  return {
    name,
    cuisine: "Middle Eastern",
    calories,
    protein,
    carbs: slot === "breakfast" ? "58g" : "78g",
    fat: slot === "breakfast" ? "13g" : "15g",
    ingredients,
    steps: [
      "Prep the vegetables, starch or plant protein, herbs, and sauce ingredients.",
      "Cook the main vegetable, starch, plant protein, or legume component until tender and well seasoned.",
      "Assemble the meal with contrasting texture, a fresh finish, and a clear plated form."
    ],
    image_search_index: imageSearchIndex ?? name.toLowerCase()
  };
}

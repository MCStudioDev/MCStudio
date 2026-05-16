import { cuisineMatchesPreference } from "@/lib/cuisines";
import {
  findRecipeDietViolation,
  type DietEnforcementContext,
  type ForbiddenReason
} from "@/lib/dietEnforcement";
import type { MealPlanData, MealPlanMeal } from "@/lib/types";

export type MealSlot = "breakfast" | "lunch" | "dinner";

export type MealPlanGuardIssue =
  | { kind: "shape"; message: string; actual: number; expected: number }
  | { kind: "placeholder"; day: string; slot: MealSlot; name: string }
  | { kind: "diet"; day: string; slot: MealSlot; name: string; reason: ForbiddenReason }
  | { kind: "cuisine"; day: string; slot: MealSlot; name: string; cuisine?: string; preferredCuisine: string }
  | { kind: "seafoodQuota"; actual: number; expected: number }
  | { kind: "cuisineQuota"; actual: number; expected: number; preferredCuisine: string }
  | { kind: "repeat"; name: string; actual: number; allowed: number }
  | { kind: "unique"; actual: number; expected: number };

export interface MealPlanGuardPreferences {
  dietContext: DietEnforcementContext;
  preferredCuisine?: string;
  maxMealRepeatCount?: number;
  minUniqueMeals?: number;
  minPescatarianSeafoodSlots?: number;
  minPreferredCuisineSlots?: number;
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

export function validateMealPlan(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences
): MealPlanGuardIssue[] {
  const issues: MealPlanGuardIssue[] = [];
  const slots = flattenMealPlanSlots(mealPlan);
  const maxRepeat = preferences.maxMealRepeatCount ?? DEFAULT_MAX_REPEAT;
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

  if (mealCounts.size < minUnique) {
    issues.push({ kind: "unique", actual: mealCounts.size, expected: minUnique });
  }

  return issues;
}

export function repairMealPlanWithGuard(
  mealPlan: MealPlanData,
  preferences: MealPlanGuardPreferences
): MealPlanRepairResult {
  const initialIssues = validateMealPlan(mealPlan, preferences);
  if (!initialIssues.length) {
    return { mealPlan, initialIssues, finalIssues: [], repairedSlots: 0 };
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
  nextPlan.shoppingList = mergeShoppingList(nextPlan.shoppingList, flattenMealPlanSlots(nextPlan).map((entry) => entry.meal));

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
  if (!cuisineMatchesPreference(meal.cuisine ?? "", preferredCuisine)) return false;

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
    const cuisineMismatch =
      preferences.preferredCuisine && preferences.preferredCuisine !== "Any"
        ? !mealMatchesPreferredCuisineIdentity(entry.meal, preferences.preferredCuisine)
        : false;
    if (!violation && !isPlaceholderMeal(entry.meal) && !cuisineMismatch) continue;

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

function buildFallbackBank(preferences: MealPlanGuardPreferences): Record<MealSlot, MealPlanMeal[]> {
  if (preferences.dietContext.diets.includes("vegan")) {
    return VEGAN_FALLBACKS;
  }

  if (preferences.preferredCuisine === "Mexican" && preferences.dietContext.diets.includes("pescatarian")) {
    return MEXICAN_PESCATARIAN_FALLBACKS;
  }

  if (preferences.preferredCuisine === "Mexican") {
    return MEXICAN_GENERAL_FALLBACKS;
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

function pickFallbackMeal(
  fallbackBank: Record<MealSlot, MealPlanMeal[]>,
  slot: MealSlot,
  usedFallbackNames: Set<string>,
  predicate: (meal: MealPlanMeal) => boolean = () => true
) {
  const options = [...fallbackBank[slot], ...fallbackBank.lunch, ...fallbackBank.dinner, ...fallbackBank.breakfast].filter(predicate);
  const selected = options.find((meal) => !usedFallbackNames.has(normalizeMealName(meal.name))) ?? options[0];
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
    veganMeal("Zaatar chickpea breakfast bowl", "breakfast", ["chickpeas", "cucumber", "tomato", "zaatar", "lemon", "olive oil"], 410, "18g", "zaatar chickpea bowl"),
    veganMeal("Lentil breakfast rice bowl", "breakfast", ["lentils", "rice", "tomato", "parsley", "cumin", "lemon"], 440, "20g", "middle eastern lentil rice bowl"),
    veganMeal("Hummus vegetable pita plate", "breakfast", ["hummus", "pita bread", "cucumber", "tomato", "mint", "olive oil"], 420, "16g", "hummus vegetable pita plate"),
    veganMeal("Fava bean avocado toast", "breakfast", ["fava beans", "whole grain bread", "avocado", "tomato", "lemon"], 450, "18g", "fava bean avocado toast"),
    veganMeal("Date tahini oatmeal", "breakfast", ["oats", "dates", "tahini", "cinnamon", "almond milk"], 390, "13g", "date tahini oatmeal"),
    veganMeal("Baladi bean salad bowl", "breakfast", ["white beans", "tomato", "cucumber", "parsley", "lemon", "olive oil"], 405, "17g", "middle eastern white bean salad")
  ],
  lunch: [
    veganMeal("Mujadara with cucumber tomato salad", "lunch", ["lentils", "rice", "onion", "cucumber", "tomato", "parsley"], 540, "22g", "mujadara cucumber tomato salad"),
    veganMeal("Falafel chickpea salad bowl", "lunch", ["falafel", "chickpeas", "romaine", "tomato", "cucumber", "tahini"], 560, "23g", "falafel chickpea salad bowl"),
    veganMeal("Stuffed grape leaves with lentil salad", "lunch", ["grape leaves", "rice", "lentils", "tomato", "parsley", "lemon"], 520, "18g", "stuffed grape leaves lentil salad"),
    veganMeal("Hummus tabbouleh rice plate", "lunch", ["hummus", "parsley", "bulgur", "tomato", "rice", "lemon"], 535, "19g", "hummus tabbouleh rice plate"),
    veganMeal("Chickpea shawarma bowl", "lunch", ["chickpeas", "rice", "cucumber", "tomato", "tahini", "shawarma spices"], 555, "21g", "chickpea shawarma rice bowl"),
    veganMeal("Roasted eggplant lentil plate", "lunch", ["eggplant", "lentils", "tomato", "parsley", "rice", "lemon"], 545, "22g", "roasted eggplant lentil plate"),
    veganMeal("Fasolya white bean stew with rice", "lunch", ["white beans", "tomato sauce", "onion", "garlic", "rice"], 550, "23g", "middle eastern white bean stew rice")
  ],
  dinner: [
    veganMeal("Lentil vegetable stew with rice", "dinner", ["lentils", "rice", "carrot", "tomato", "onion", "garlic", "olive oil"], 560, "24g", "lentil vegetable stew rice"),
    veganMeal("Okra tomato stew with rice", "dinner", ["okra", "tomato sauce", "onion", "garlic", "rice", "coriander"], 525, "16g", "okra tomato stew rice"),
    veganMeal("Eggplant chickpea tagine with rice", "dinner", ["eggplant", "chickpeas", "tomato", "rice", "cumin", "parsley"], 575, "22g", "eggplant chickpea tagine rice"),
    veganMeal("Molokhia with chickpeas and rice", "dinner", ["molokhia", "chickpeas", "rice", "garlic", "coriander", "lemon"], 540, "20g", "vegan molokhia chickpeas rice"),
    veganMeal("Koshari-inspired lentil rice bowl", "dinner", ["rice", "lentils", "chickpeas", "tomato sauce", "onion"], 590, "24g", "vegan koshari lentil rice"),
    veganMeal("Zucchini tomato stew with beans", "dinner", ["zucchini", "white beans", "tomato", "onion", "rice", "parsley"], 535, "21g", "zucchini tomato bean stew rice"),
    veganMeal("Cauliflower chickpea rice tray", "dinner", ["cauliflower", "chickpeas", "rice", "tomato", "cumin", "tahini"], 555, "21g", "cauliflower chickpea rice tray")
  ]
};

const MEXICAN_GENERAL_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = MEXICAN_PESCATARIAN_FALLBACKS;

const GENERAL_FALLBACKS: Record<MealSlot, MealPlanMeal[]> = VEGAN_FALLBACKS;

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
      "Prep the vegetables, grains, legumes, herbs, and lemon.",
      "Cook the grains or legumes until tender, then season with cumin, garlic, herbs, and olive oil.",
      "Assemble the meal with fresh vegetables and serve warm or at room temperature."
    ],
    image_search_index: imageSearchIndex ?? name.toLowerCase()
  };
}

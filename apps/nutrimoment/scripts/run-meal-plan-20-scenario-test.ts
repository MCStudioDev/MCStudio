import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cuisineMatchesPreference } from "../src/lib/cuisines";
import { findRecipeDietViolation } from "../src/lib/dietEnforcement";
import { getAdminAuth } from "../src/lib/firebaseAdmin";
import { normalizeMealPlanData } from "../src/lib/mealPlan";
import { normalizePantryIngredientName } from "../src/lib/pantryQuantity";
import { validateMealPlanRecipeContracts } from "../src/services/mealPlanRecipeContractService";
import { normalizeRecipeIngredientIdentity } from "../src/services/recipeQualityGate";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const BASE_URL = process.env.FRESH_ACCOUNT_CHECK_BASE_URL ?? "http://127.0.0.1:3000";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PREMIUM_EMAIL = "mina.naguib42@gmail.com";
const REQUEST_TIMEOUT_MS = 240_000;
const CONCURRENCY = 2;
const REQUESTED_SCENARIO_IDS = new Set(
  (process.env.MEAL_PLAN_SCENARIO_IDS ?? "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite)
);

interface PantryItem {
  name: string;
  quantity: string;
}

interface Scenario {
  id: number;
  label: string;
  cuisine: string;
  diets: string[];
  allergens?: string[];
  calorieTarget: number;
  pantryItems: PantryItem[];
}

const scenarios: Scenario[] = [
  scenario(1, "Egyptian vegan staples", "Egyptian", ["vegan"], 1900, [
    ["rice", "12 cup"], ["chickpeas", "10 can"], ["lentils", "10 cup"], ["tomato", "20 whole"],
    ["pasta", "8 cup"], ["onion", "20 whole"], ["garlic", "40 clove"]
  ]),
  scenario(2, "Italian vegetarian pasta pantry", "Italian", ["vegetarian"], 2100, [
    ["pasta", "12 cup"], ["tomato sauce", "8 can"], ["mushroom", "8 cup"], ["spinach", "8 cup"],
    ["greek yogurt", "5 cup"], ["onion", "12 whole"], ["garlic", "30 clove"]
  ]),
  scenario(3, "Middle Eastern vegan legumes", "Middle Eastern", ["vegan"], 1850, [
    ["chickpeas", "10 can"], ["lentils", "10 cup"], ["bulgur", "8 cup"], ["eggplant", "10 whole"],
    ["tahini", "20 tbsp"], ["tomato", "16 whole"], ["parsley", "5 bunch"]
  ]),
  scenario(4, "Mediterranean pescatarian seafood", "Mediterranean", ["pescatarian"], 2200, [
    ["salmon", "4 fillet"], ["shrimp", "3 kg"], ["rice", "8 cup"], ["tomato", "12 whole"],
    ["spinach", "8 cup"], ["lemon", "12 whole"], ["olive oil", "30 tbsp"]
  ]),
  scenario(5, "Indian vegan pulse pantry", "Indian", ["vegan"], 2000, [
    ["lentils", "12 cup"], ["chickpeas", "8 can"], ["rice", "12 cup"], ["tofu", "80 oz"],
    ["tomato", "12 whole"], ["onion", "15 whole"], ["coconut milk", "8 can"]
  ]),
  scenario(6, "Mexican vegetarian bean pantry", "Mexican", ["vegetarian"], 2050, [
    ["black beans", "10 can"], ["rice", "10 cup"], ["corn", "12 can"], ["avocado", "10 whole"],
    ["tomato", "15 whole"], ["egg", "18 whole"], ["lime", "12 whole"]
  ]),
  scenario(7, "American dairy-free chicken pantry", "American", ["dairy-free"], 2300, [
    ["chicken breast", "5 kg"], ["potato", "15 whole"], ["rice", "10 cup"], ["broccoli", "10 cup"],
    ["carrot", "12 whole"], ["tomato", "10 whole"], ["olive oil", "30 tbsp"]
  ]),
  scenario(8, "Asian pescatarian rice and shrimp", "Asian", ["pescatarian"], 2000, [
    ["shrimp", "4 kg"], ["salmon", "4 fillet"], ["rice", "14 cup"], ["noodles", "8 cup"],
    ["mushroom", "8 cup"], ["broccoli", "8 cup"], ["tofu", "50 oz"]
  ]),
  scenario(9, "Thai vegan coconut tofu", "Thai", ["vegan"], 1950, [
    ["tofu", "80 oz"], ["coconut milk", "10 can"], ["rice", "12 cup"], ["mushroom", "8 cup"],
    ["broccoli", "8 cup"], ["lime", "12 whole"], ["basil", "5 tsp"]
  ]),
  scenario(10, "Turkish vegetarian produce", "Turkish", ["vegetarian"], 1900, [
    ["eggplant", "12 whole"], ["greek yogurt", "8 cup"], ["bulgur", "10 cup"], ["lentils", "8 cup"],
    ["tomato", "16 whole"], ["onion", "15 whole"], ["egg", "18 whole"]
  ]),
  scenario(11, "Any cuisine mixed leftovers", "Any", [], 2400, [
    ["chicken", "4 kg"], ["beef", "3 kg"], ["rice", "10 cup"], ["pasta", "8 cup"],
    ["tomato", "10 whole"], ["broccoli", "8 cup"], ["egg", "18 whole"]
  ]),
  scenario(12, "Egyptian pescatarian pantry", "Egyptian", ["pescatarian"], 2050, [
    ["fish", "5 kg"], ["shrimp", "3 kg"], ["rice", "12 cup"], ["tahini", "20 tbsp"],
    ["tomato", "15 whole"], ["lemon", "12 whole"], ["garlic", "30 clove"]
  ]),
  scenario(13, "Italian vegan tomato and mushroom", "Italian", ["vegan"], 1850, [
    ["pasta", "14 cup"], ["tomato sauce", "10 can"], ["mushroom", "10 cup"], ["spinach", "8 cup"],
    ["chickpeas", "8 can"], ["garlic", "30 clove"], ["olive oil", "30 tbsp"]
  ]),
  scenario(14, "Mediterranean gluten-free chicken", "Mediterranean", ["gluten-free"], 2150, [
    ["chicken breast", "5 kg"], ["quinoa", "12 cup"], ["rice", "10 cup"], ["tomato", "15 whole"],
    ["cucumber", "12 whole"], ["spinach", "8 cup"], ["lemon", "12 whole"]
  ], ["wheat"]),
  scenario(15, "Indian vegetarian dairy and pulses", "Indian", ["vegetarian"], 2100, [
    ["greek yogurt", "8 cup"], ["lentils", "12 cup"], ["chickpeas", "8 can"], ["rice", "14 cup"],
    ["spinach", "8 cup"], ["tomato", "14 whole"], ["onion", "14 whole"]
  ]),
  scenario(16, "Mexican vegan high-fiber pantry", "Mexican", ["vegan"], 2000, [
    ["black beans", "12 can"], ["kidney beans", "8 can"], ["rice", "12 cup"], ["tofu", "60 oz"],
    ["avocado", "10 whole"], ["tomato", "15 whole"], ["lime", "12 whole"]
  ]),
  scenario(17, "American vegetarian breakfast pantry", "American", ["vegetarian"], 1800, [
    ["egg", "24 whole"], ["oats", "12 cup"], ["greek yogurt", "10 cup"], ["potato", "12 whole"],
    ["spinach", "8 cup"], ["mushroom", "8 cup"], ["mixed berries", "8 cup"]
  ]),
  scenario(18, "Asian dairy-free beef and noodles", "Asian", ["dairy-free"], 2300, [
    ["beef", "5 kg"], ["noodles", "12 cup"], ["rice", "10 cup"], ["broccoli", "10 cup"],
    ["mushroom", "8 cup"], ["carrot", "12 whole"], ["garlic", "30 clove"]
  ]),
  scenario(19, "Thai pescatarian shrimp pantry", "Thai", ["pescatarian"], 2050, [
    ["shrimp", "5 kg"], ["fish", "4 kg"], ["coconut milk", "8 can"], ["rice", "12 cup"],
    ["noodles", "8 cup"], ["lime", "12 whole"], ["mushroom", "8 cup"]
  ]),
  scenario(20, "Turkish vegan lentil pantry", "Turkish", ["vegan"], 1900, [
    ["lentils", "14 cup"], ["chickpeas", "10 can"], ["bulgur", "12 cup"], ["eggplant", "12 whole"],
    ["tomato", "16 whole"], ["onion", "16 whole"], ["parsley", "5 bunch"]
  ])
];

async function main() {
  if (!FIREBASE_API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required.");
  const token = await createActualAccountIdToken(PREMIUM_EMAIL);
  const startedAt = Date.now();
  const results: Awaited<ReturnType<typeof runScenario>>[] = [];
  const activeScenarios = REQUESTED_SCENARIO_IDS.size
    ? scenarios.filter((entry) => REQUESTED_SCENARIO_IDS.has(entry.id))
    : scenarios;

  for (let index = 0; index < activeScenarios.length; index += CONCURRENCY) {
    const batch = activeScenarios.slice(index, index + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((entry) => runScenario(entry, token)));
    results.push(...batchResults);
    batchResults.forEach((result) => {
      console.log(JSON.stringify({ progress: `${results.length}/${activeScenarios.length}`, ...result.summary }));
    });
  }

  const passed = results.filter((result) => result.summary.passed);
  const average = (values: number[]) => values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
  const report = {
    account: PREMIUM_EMAIL,
    baseUrl: BASE_URL,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    scenarioCount: results.length,
    passedCount: passed.length,
    failedCount: results.length - passed.length,
    aggregate: {
      averageLatencyMs: average(results.map((result) => result.summary.elapsedMs)),
      averagePantryUseRate: Number((results.reduce((sum, result) => sum + result.summary.pantryUseRate, 0) / results.length).toFixed(3)),
      totalContractIssues: results.reduce((sum, result) => sum + result.summary.contractIssueCount, 0),
      totalDietViolations: results.reduce((sum, result) => sum + result.summary.dietViolationCount, 0),
      totalCuisineViolations: results.reduce((sum, result) => sum + result.summary.cuisineViolationCount, 0),
      totalGeneratedMeals: results.reduce((sum, result) => sum + result.summary.generatedMealCount, 0),
      totalPromotedRecipes: results.reduce((sum, result) => sum + result.summary.promotedRecipeCount, 0),
      totalRejectedPromotions: results.reduce((sum, result) => sum + result.summary.rejectedPromotionCount, 0)
    },
    results
  };
  const outputDirectory = path.join(process.cwd(), ".generated");
  await mkdir(outputDirectory, { recursive: true });
  const reportFileName = REQUESTED_SCENARIO_IDS.size
    ? `meal-plan-scenarios-${Array.from(REQUESTED_SCENARIO_IDS).sort((left, right) => left - right).join("-")}-report.json`
    : "meal-plan-20-scenario-report.json";
  const outputPath = path.join(outputDirectory, reportFileName);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ finalReport: outputPath, ...report.aggregate, passedCount: report.passedCount, failedCount: report.failedCount }, null, 2));

  if (report.failedCount) process.exitCode = 1;
}

async function runScenario(entry: Scenario, token: string) {
  const requestBody = {
    allergens: entry.allergens ?? [],
    calorieTarget: entry.calorieTarget,
    conditions: [] as string[],
    diets: entry.diets,
    pantry: entry.pantryItems.map((item) => item.name),
    pantryItems: entry.pantryItems,
    persistResult: false,
    preferredCuisine: entry.cuisine,
    uiLanguage: "en"
  };
  const startedAt = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/mealplan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const payload = await response.json() as {
      error?: string;
      result?: string;
      servedFrom?: string;
      sharedPublication?: {
        generatedMealCount?: number;
        promotedRecipeCount?: number;
        rejectedPromotionCount?: number;
        persistenceSucceeded?: boolean;
      };
      repeatFallback?: {
        maxRepeatedSlots: number;
        repeatedSlots: number;
        uniqueMealCount: number;
      };
    };
    const parsedResult = payload.result ? JSON.parse(payload.result) : null;
    const mealPlan = normalizeMealPlanData(parsedResult);
    const meals = mealPlan?.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]) ?? [];
    const contractIssues = mealPlan ? validateMealPlanRecipeContracts(mealPlan, {
      conditions: [],
      dietContext: { diets: entry.diets, allergens: entry.allergens ?? [] },
      maxSimilarMealSlots: 2,
      preferredCuisine: entry.cuisine,
      recipeLanguage: "English"
    }) : [];
    const dietViolations = meals.flatMap((meal) => {
      const violation = findRecipeDietViolation(meal, {
        diets: entry.diets,
        allergens: entry.allergens ?? []
      });
      return violation ? [{ meal: meal.name, violation }] : [];
    });
    const cuisineViolations = entry.cuisine === "Any"
      ? []
      : meals.filter((meal) => !cuisineMatchesPreference(meal.cuisine ?? "", entry.cuisine)).map((meal) => meal.name);
    const pantryKeys = new Set(entry.pantryItems.map((item) => normalizePantryIngredientName(item.name)));
    const mealsUsingPantry = meals.filter((meal) =>
      (meal.ingredients ?? []).some((ingredient) => ingredientMatchesPantry(ingredient, pantryKeys))
    );
    const uniqueMealCount = new Set(meals.map((meal) => meal.name.trim().toLowerCase())).size;
    const minimumStepCount = meals.length ? Math.min(...meals.map((meal) => meal.steps?.length ?? 0)) : 0;
    const generatedMealCount = payload.sharedPublication?.generatedMealCount ?? 0;
    const promotedRecipeCount = payload.sharedPublication?.promotedRecipeCount ?? 0;
    const rejectedPromotionCount = payload.sharedPublication?.rejectedPromotionCount ?? 0;
    const failures = [
      ...(!response.ok ? [`HTTP ${response.status}: ${payload.error ?? "unknown error"}`] : []),
      ...(mealPlan?.plan.length !== 7 ? [`days:${mealPlan?.plan.length ?? 0}`] : []),
      ...(meals.length !== 21 ? [`meals:${meals.length}`] : []),
      ...(contractIssues.length ? [`contract:${contractIssues.length}`] : []),
      ...(dietViolations.length ? [`diet:${dietViolations.length}`] : []),
      ...(cuisineViolations.length ? [`cuisine:${cuisineViolations.length}`] : []),
      ...(meals.length && mealsUsingPantry.length < 14 ? [`pantry:${mealsUsingPantry.length}/21`] : []),
      ...(meals.length && minimumStepCount < 7 ? [`steps:min-${minimumStepCount}`] : []),
      ...(generatedMealCount && !payload.sharedPublication?.persistenceSucceeded ? ["publication:failed"] : []),
      ...(generatedMealCount && !promotedRecipeCount ? ["publication:none"] : [])
    ];
    const summary = {
      id: entry.id,
      label: entry.label,
      cuisine: entry.cuisine,
      diets: entry.diets,
      httpStatus: response.status,
      servedFrom: payload.servedFrom ?? parsedResult?.servedFrom,
      elapsedMs: Date.now() - startedAt,
      dayCount: mealPlan?.plan.length ?? 0,
      mealCount: meals.length,
      uniqueMealCount,
      minimumStepCount,
      contractIssueCount: contractIssues.length,
      dietViolationCount: dietViolations.length,
      cuisineViolationCount: cuisineViolations.length,
      pantryMealCount: mealsUsingPantry.length,
      pantryUseRate: meals.length ? Number((mealsUsingPantry.length / meals.length).toFixed(3)) : 0,
      shoppingItemCount: mealPlan?.shoppingList.length ?? 0,
      generatedMealCount,
      promotedRecipeCount,
      rejectedPromotionCount,
      repeatFallback: payload.repeatFallback,
      passed: failures.length === 0,
      failures
    };
    return {
      scenario: entry,
      summary,
      qualitative: {
        contractReasons: Array.from(new Set(contractIssues.flatMap((issue) => issue.reasons))),
        dietViolations,
        cuisineViolationMeals: cuisineViolations,
        sampleMeals: meals.slice(0, 6).map((meal) => meal.name),
        shoppingSample: mealPlan?.shoppingList.slice(0, 12) ?? []
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      scenario: entry,
      summary: {
        id: entry.id,
        label: entry.label,
        cuisine: entry.cuisine,
        diets: entry.diets,
        httpStatus: 0,
        servedFrom: undefined,
        elapsedMs: Date.now() - startedAt,
        dayCount: 0,
        mealCount: 0,
        uniqueMealCount: 0,
        minimumStepCount: 0,
        contractIssueCount: 0,
        dietViolationCount: 0,
        cuisineViolationCount: 0,
        pantryMealCount: 0,
        pantryUseRate: 0,
        shoppingItemCount: 0,
        generatedMealCount: 0,
        promotedRecipeCount: 0,
        rejectedPromotionCount: 0,
        repeatFallback: undefined,
        passed: false,
        failures: [message]
      },
      qualitative: {
        contractReasons: [],
        dietViolations: [],
        cuisineViolationMeals: [],
        sampleMeals: [],
        shoppingSample: []
      }
    };
  }
}

function scenario(
  id: number,
  label: string,
  cuisine: string,
  diets: string[],
  calorieTarget: number,
  pantry: Array<[string, string]>,
  allergens: string[] = []
): Scenario {
  return {
    id,
    label,
    cuisine,
    diets,
    allergens,
    calorieTarget,
    pantryItems: pantry.map(([name, quantity]) => ({ name, quantity }))
  };
}

function ingredientMatchesPantry(ingredient: string, pantryKeys: Set<string>) {
  const identity = normalizePantryIngredientName(normalizeRecipeIngredientIdentity(ingredient));
  if (!identity) return false;
  return Array.from(pantryKeys).some((pantryKey) =>
    identity === pantryKey ||
    identity.startsWith(`${pantryKey} `) ||
    identity.endsWith(` ${pantryKey}`) ||
    identity.includes(` ${pantryKey} `)
  );
}

async function createActualAccountIdToken(email: string) {
  const user = await getAdminAuth().getUserByEmail(email);
  const customToken = await getAdminAuth().createCustomToken(user.uid);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true, token: customToken }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json() as { error?: { message?: string }; idToken?: string };
  if (!response.ok || !payload.idToken) {
    throw new Error(`Could not authenticate ${email}: ${payload.error?.message ?? response.status}`);
  }
  return payload.idToken;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

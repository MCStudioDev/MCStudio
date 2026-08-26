import { config as loadEnv } from "dotenv";
import path from "node:path";
import { findRecipeDietViolation } from "../src/lib/dietEnforcement";
import { getAdminAuth, getAdminDb } from "../src/lib/firebaseAdmin";
import { normalizeMealPlanData } from "../src/lib/mealPlan";
import { normalizePantryIngredientName } from "../src/lib/pantryQuantity";
import { validateMealPlanRecipeContracts } from "../src/services/mealPlanRecipeContractService";
import { normalizeRecipeIngredientIdentity } from "../src/services/recipeQualityGate";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const BASE_URL = process.env.FRESH_ACCOUNT_CHECK_BASE_URL ?? "http://127.0.0.1:3000";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PREMIUM_EMAIL = "mina.naguib42@gmail.com";
const REQUEST_TIMEOUT_MS = 240_000;

async function main() {
  if (!FIREBASE_API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required.");

  const pantryItems = [
    { name: "rice", quantity: "12 cup" },
    { name: "chickpeas", quantity: "10 can" },
    { name: "lentils", quantity: "10 cup" },
    { name: "tomato", quantity: "20 whole" },
    { name: "pasta", quantity: "8 cup" },
    { name: "onion", quantity: "20 whole" },
    { name: "garlic", quantity: "40 clove" }
  ];
  const requestBody = {
    allergens: [] as string[],
    calorieTarget: 1900,
    conditions: [] as string[],
    diets: ["vegan"],
    pantry: pantryItems.map((item) => item.name),
    pantryItems,
    persistResult: false,
    preferredCuisine: "Egyptian",
    uiLanguage: "en"
  };
  const token = await createActualAccountIdToken(PREMIUM_EMAIL);
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/mealplan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json() as {
    error?: string;
    result?: string;
    servedFrom?: string;
    sharedPublication?: {
      generatedMealCount: number;
      validatedRecipeCount: number;
      promotedRecipeCount: number;
      rejectedPromotionCount: number;
      supersededRecipeCount: number;
      persistenceSucceeded: boolean;
    };
  };
  const parsedResult = payload.result ? JSON.parse(payload.result) : null;
  const mealPlan = normalizeMealPlanData(parsedResult);
  const meals = mealPlan?.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]) ?? [];
  const contractIssues = mealPlan
    ? validateMealPlanRecipeContracts(mealPlan, {
        conditions: requestBody.conditions,
        dietContext: { diets: requestBody.diets, allergens: requestBody.allergens },
        preferredCuisine: requestBody.preferredCuisine,
        recipeLanguage: "English"
      })
    : [];
  const dietViolations = meals.flatMap((meal) => {
    const violation = findRecipeDietViolation(meal, {
      diets: requestBody.diets,
      allergens: requestBody.allergens
    });
    return violation ? [{ meal: meal.name, violation }] : [];
  });
  const pantryKeys = new Set(pantryItems.map((item) => normalizePantryIngredientName(item.name)));
  const mealsUsingPantry = meals.filter((meal) =>
    (meal.ingredients ?? []).some((ingredient) => ingredientMatchesPantry(ingredient, pantryKeys))
  );
  const shoppingPantryOverlaps = (mealPlan?.shoppingList ?? []).filter((item) =>
    pantryKeys.has(normalizePantryIngredientName(item.split(" - ")[0] ?? item))
  );
  const generatedTitles = Array.from(new Set(meals
    .filter((meal) => meal.recipe_source_type !== "local_database" && !meal.source_recipe_id)
    .map((meal) => meal.name)));
  const sharedSnapshot = generatedTitles.length
    ? await getAdminDb().collection("sharedOfflineRecipeCache").where("title", "in", generatedTitles.slice(0, 30)).get()
    : null;
  const sharedPublished = (sharedSnapshot?.docs ?? [])
    .map((doc) => doc.data() as { isActive?: boolean; qualityStatus?: string; source?: { provider?: string }; title?: string })
    .filter((doc) => doc.isActive && doc.qualityStatus === "verified" && doc.source?.provider === "premium-validated");

  const report = {
    account: PREMIUM_EMAIL,
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    httpStatus: response.status,
    error: payload.error,
    servedFrom: payload.servedFrom ?? parsedResult?.servedFrom,
    dayCount: mealPlan?.plan.length ?? 0,
    mealCount: meals.length,
    contractIssueCount: contractIssues.length,
    contractReasons: Array.from(new Set(contractIssues.flatMap((issue) => issue.reasons))),
    dietViolationCount: dietViolations.length,
    dietViolations,
    mealsUsingPantry: mealsUsingPantry.length,
    pantryUseRate: meals.length ? Number((mealsUsingPantry.length / meals.length).toFixed(3)) : 0,
    shoppingItemCount: mealPlan?.shoppingList.length ?? 0,
    shoppingPantryOverlaps,
    generatedMealCount: generatedTitles.length,
    sharedPublication: payload.sharedPublication,
    sharedPublishedCount: sharedPublished.length,
    sharedPublishedTitles: sharedPublished.map((doc) => doc.title)
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [
    ...(!response.ok ? [`HTTP ${response.status}: ${payload.error ?? "unknown error"}`] : []),
    ...(report.dayCount !== 7 ? [`Expected 7 days, received ${report.dayCount}`] : []),
    ...(report.mealCount !== 21 ? [`Expected 21 meals, received ${report.mealCount}`] : []),
    ...(contractIssues.length ? [`${contractIssues.length} recipe-contract issue(s)`] : []),
    ...(dietViolations.length ? [`${dietViolations.length} vegan violation(s)`] : []),
    ...(meals.length && mealsUsingPantry.length < 14 ? [`Only ${mealsUsingPantry.length}/21 meals use pantry ingredients`] : []),
    ...(generatedTitles.length && !payload.sharedPublication?.persistenceSucceeded
      ? ["Generated meal persistence did not succeed"]
      : []),
    ...(generatedTitles.length && !payload.sharedPublication?.promotedRecipeCount
      ? ["No generated validated meal was published to the shared pool"]
      : [])
  ];
  if (failures.length) throw new Error(failures.join(" | "));
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

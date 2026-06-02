import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildMealPlanPrompt } from "../src/lib/aiPrompts";
import { CUISINE_OPTIONS } from "../src/lib/cuisines";
import { findIngredientDietViolation } from "../src/lib/dietEnforcement";
import { findRecipeHealthViolation } from "../src/lib/healthEnforcement";
import { getCuisineDishReferenceText } from "../src/lib/cuisineDishCatalog";
import { resolveEffectiveAccessTier } from "../src/services/authService";
import { repairMealPlanWithGuard, summarizeMealPlanIssues, validateMealPlan } from "../src/services/mealPlanGuardService";
import type { MealPlanData, MealPlanMeal } from "../src/lib/types";

type CheckStatus = "pass" | "fail" | "warn";

interface QaCheck {
  area: string;
  detail: string;
  status: CheckStatus;
}

const checks: QaCheck[] = [];

const dietCases = [
  ["vegetarian"],
  ["vegan"],
  ["pescatarian"],
  ["dairyFree"],
  ["glutenFree"],
  ["keto"],
  ["paleo"],
  ["vegetarian", "dairyFree"],
  ["vegan", "dairyFree"],
  ["pescatarian", "dairyFree"],
  ["vegetarian", "glutenFree"],
  ["vegan", "glutenFree"],
  ["pescatarian", "glutenFree"],
  ["keto", "dairyFree"],
  ["paleo", "dairyFree"],
  ["pescatarian", "keto"],
  ["pescatarian", "paleo"]
];

const mixedPantry = [
  "chicken breast",
  "ground beef",
  "salmon",
  "shrimp",
  "egg",
  "milk",
  "cheese",
  "yogurt",
  "bread",
  "pasta",
  "rice",
  "potato",
  "lentils",
  "chickpeas",
  "tofu",
  "mushrooms",
  "zucchini",
  "broccoli",
  "tomato",
  "almond milk",
  "oat milk",
  "coconut milk"
];

function addCheck(area: string, detail: string, ok: boolean, warn = false) {
  checks.push({ area, detail, status: ok ? "pass" : warn ? "warn" : "fail" });
}

function buildBadMealPlan(): MealPlanData {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const breakfast = meal("Cheese egg omelette with wheat toast", "American", ["eggs", "cheese", "milk", "butter", "wheat toast"]);
  const lunch = meal("Chicken shawarma pita with yogurt sauce", "Levantine", ["chicken", "pita bread", "yogurt", "garlic sauce"]);
  const dinner = meal("Beef shrimp pasta with butter sauce", "Italian", ["ground beef", "shrimp", "pasta", "butter", "parmesan"]);

  return {
    plan: days.map((day) => ({ day, breakfast, lunch, dinner })),
    shoppingList: ["eggs - 12", "chicken - 1 kg", "milk - 1 carton", "pasta - 1 box", "shrimp - 1 kg"]
  };
}

function meal(name: string, cuisine: string, ingredients: string[]): MealPlanMeal {
  return {
    name,
    cuisine,
    calories: 500,
    protein: "25g",
    carbs: "40g",
    fat: "18g",
    ingredients,
    steps: [`Cook ${ingredients.join(", ")}.`],
    image_search_index: name.toLowerCase()
  };
}

function sentenceAfter(prompt: string, marker: string) {
  const index = prompt.indexOf(marker);
  if (index < 0) return "";
  const text = prompt.slice(index);
  const end = text.indexOf(".");
  return end >= 0 ? text.slice(0, end + 1) : text.slice(0, 500);
}

function itemAppearsInSafeLine(line: string, item: string) {
  const normalizedItem = item.trim().toLowerCase();
  const value = line
    .split(":")
    .slice(1)
    .join(":")
    .replace(/\.$/, "");
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .includes(normalizedItem);
}

function runCuisineCoverage() {
  for (const cuisine of CUISINE_OPTIONS) {
    if (cuisine === "Any") continue;
    const references = getCuisineDishReferenceText(cuisine, 999)
      .split(/,\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
    addCheck(
      "cuisine coverage",
      `${cuisine}: ${references.length} dish references`,
      references.length >= 20,
      references.length >= 15
    );
  }
}

function runDietPromptAndRepairMatrix() {
  const pantryItems = mixedPantry.map((name) => ({ name, quantity: "1" }));
  const badPlan = buildBadMealPlan();

  for (const diets of dietCases) {
    const label = diets.join("+");
    const dietContext = { diets, allergens: [] };
    const ignored = mixedPantry.filter((item) => findIngredientDietViolation(item, dietContext));

    const englishPrompt = buildMealPlanPrompt({
      pantry: mixedPantry,
      pantryItems,
      diets,
      conditions: [],
      allergens: [],
      recipeLanguage: "English",
      preferredCuisine: "Any"
    });
    const englishSafeLine = sentenceAfter(englishPrompt, "Diet-compatible pantry items for this user:");
    const englishLeaks = ignored.filter((item) => itemAppearsInSafeLine(englishSafeLine, item));
    addCheck("diet prompt", `${label}: English safe pantry line excludes forbidden items`, englishLeaks.length === 0);

    const arabicPrompt = buildMealPlanPrompt({
      pantry: mixedPantry,
      pantryItems,
      diets,
      conditions: [],
      allergens: [],
      recipeLanguage: "Arabic",
      preferredCuisine: "Any"
    });
    const arabicSafeLine = sentenceAfter(arabicPrompt, "مكونات المستخدم المتوافقة");
    const arabicLeaks = ignored.filter((item) => itemAppearsInSafeLine(arabicSafeLine, item));
    addCheck("diet prompt", `${label}: Arabic safe pantry line excludes forbidden items`, arabicLeaks.length === 0);

    const preferences = {
      dietContext,
      conditions: [],
      preferredCuisine: "Any",
      maxMealRepeatCount: 2,
      minUniqueMeals: 15
    };
    const repaired = repairMealPlanWithGuard(badPlan, preferences);
    const finalIssues = validateMealPlan(repaired.mealPlan, preferences);
    const finalSummary = summarizeMealPlanIssues(finalIssues);
    const uniqueMeals = new Set(
      repaired.mealPlan.plan.flatMap((day) => [day.breakfast.name, day.lunch.name, day.dinner.name])
        .map((name) => name.toLowerCase())
    ).size;
    addCheck("diet repair", `${label}: final issues ${JSON.stringify(finalSummary)}`, finalIssues.length === 0);
    addCheck("diet variety", `${label}: ${uniqueMeals} unique repaired meals`, uniqueMeals >= 15);
  }
}

function runHealthMatrix() {
  const cases = [
    {
      conditions: ["diabetes"],
      expected: { condition: "diabetes", match: "sugar>15g" },
      meal: { name: "Sweet rice bowl", ingredients: ["rice", "dates"], calories: 520, carbs: "78g", sugar: "22g", protein: "8g" }
    },
    {
      conditions: ["highBloodPressure"],
      expected: { condition: "highBloodPressure", match: "sodium>700mg" },
      meal: { name: "Salty soup", ingredients: ["broth", "vegetables"], sodium: "980mg", calories: 420, protein: "18g" }
    },
    {
      conditions: ["lowBloodPressure"],
      expected: { condition: "lowBloodPressure", match: "calories<320" },
      meal: { name: "Tiny salad", ingredients: ["lettuce", "cucumber"], calories: 180, sodium: "80mg" }
    },
    {
      conditions: ["weightGain"],
      expected: { condition: "weightGain", match: "calories<430" },
      meal: { name: "Light broth", ingredients: ["vegetable broth"], calories: 240, protein: "7g" }
    },
    {
      conditions: ["weightLoss"],
      expected: { condition: "weightLoss", match: "calories>700" },
      meal: { name: "Large creamy plate", ingredients: ["rice", "chicken"], calories: 760, fat: "20g" }
    },
    {
      conditions: ["cholesterol"],
      expected: { condition: "cholesterol", match: "fat>26g" },
      meal: { name: "Rich lamb plate", ingredients: ["lamb", "rice"], calories: 640, fat: "32g", fiber: "2g" }
    }
  ];

  for (const item of cases) {
    const result = findRecipeHealthViolation(item.meal, item.conditions);
    addCheck(
      "health enforcement",
      `${item.conditions.join("+")}: ${result?.match ?? "none"}`,
      result?.condition === item.expected.condition && result.match === item.expected.match
    );
  }
}

function runAccessMatrix() {
  const cases = [
    { entitlement: { tier: "free", status: "active" }, claim: undefined, expected: "free" },
    { entitlement: { tier: "free", status: "trialing" }, claim: "premium", expected: "free" },
    { entitlement: { tier: "premium", status: "active" }, claim: undefined, expected: "premium" },
    { entitlement: { status: "active" }, claim: undefined, expected: "premium" },
    { entitlement: { tier: "premium", status: "canceled" }, claim: undefined, expected: "free" },
    { entitlement: { tier: "premium", status: "active", expiresAt: "2020-01-01T00:00:00.000Z" }, claim: undefined, expected: "free" }
  ];

  for (const item of cases) {
    const actual = resolveEffectiveAccessTier(item.entitlement, item.claim);
    addCheck("access", `${JSON.stringify(item.entitlement)} => ${actual}`, actual === item.expected);
  }
}

async function writeReports() {
  const summary = checks.reduce<Record<CheckStatus, number>>((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, { pass: 0, fail: 0, warn: 0 });
  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");
  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    checks
  };
  const outputDir = path.join(process.cwd(), ".generated");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "qa-matrix-report.json"), JSON.stringify(report, null, 2));
  await writeFile(
    path.join(outputDir, "qa-matrix-report.md"),
    [
      "# NutriMoment QA Matrix Report",
      "",
      `Generated: ${report.generatedAt}`,
      "",
      `Summary: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`,
      "",
      "## Failures",
      failed.length ? failed.map((check) => `- [${check.area}] ${check.detail}`).join("\n") : "- None",
      "",
      "## Warnings",
      warned.length ? warned.map((check) => `- [${check.area}] ${check.detail}`).join("\n") : "- None",
      "",
      "## All Checks",
      ...checks.map((check) => `- ${check.status.toUpperCase()} [${check.area}] ${check.detail}`)
    ].join("\n")
  );
  console.log(`QA matrix: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`);
  console.log(`Report: ${path.join(outputDir, "qa-matrix-report.md")}`);
  if (failed.length) process.exitCode = 1;
}

async function main() {
  runCuisineCoverage();
  runDietPromptAndRepairMatrix();
  runHealthMatrix();
  runAccessMatrix();
  await writeReports();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

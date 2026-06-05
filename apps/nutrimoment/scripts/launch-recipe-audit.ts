import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { cuisineMatchesPreference } from "../src/lib/cuisines";
import { getCompleteCuisineCatalog } from "../src/lib/cuisineCatalogs/completeCatalogs";
import { findRecipeDietViolation } from "../src/lib/dietEnforcement";
import { findRecipeHealthViolation } from "../src/lib/healthEnforcement";
import type { Recipe } from "../src/lib/types";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const BASE_URL = process.env.LAUNCH_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const CREATED_AT = new Date().toISOString();
const ACCESS_MODE = process.argv.includes("--free") || process.env.LAUNCH_AUDIT_ACCESS_MODE === "free"
  ? "free"
  : "premium";
const QA_EMAIL = `nutrimoment-launch-audit-${ACCESS_MODE}-${Date.now()}@example.test`;
const REQUEST_DELAY_MS = Number(process.env.LAUNCH_AUDIT_DELAY_MS ?? 750);
const REQUEST_TIMEOUT_MS = Number(process.env.LAUNCH_AUDIT_TIMEOUT_MS ?? 90_000);
const SCENARIO_LIMIT = process.argv.includes("--all")
  ? Number.POSITIVE_INFINITY
  : Number(process.env.LAUNCH_AUDIT_LIMIT ?? 4);

type AuditStatus = "pass" | "warn" | "fail";

interface AuditScenario {
  allergens?: string[];
  calorieTarget?: number;
  conditions?: string[];
  diets?: string[];
  expectedTerms?: string[];
  ingredients: string[];
  minAuthenticCards?: number;
  minCuisineMatches?: number;
  minDistinctCuisines?: number;
  minUniqueFamilies?: number;
  name: string;
  preferredCuisine: string;
  recipeCount: number;
  uiLanguage?: string;
}

interface ScenarioReport {
  checks: Array<{ detail: string; status: AuditStatus }>;
  cuisineCounts: Record<string, number>;
  genericRiskNames: string[];
  names: string[];
  recipeCount: number;
  scenario: string;
  servedFrom?: string;
  status: AuditStatus;
}

const scenarios: AuditScenario[] = [
  {
    name: "Egyptian heart-aware meat chicken bread",
    ingredients: ["ground beef", "chicken breast", "baladi bread", "onion", "tomato"],
    preferredCuisine: "Egyptian",
    conditions: ["cholesterol", "highBloodPressure"],
    expectedTerms: ["hawawshi", "kofta", "dawood", "basha", "shawarma", "fatta", "fatteh", "kebab"],
    recipeCount: 10,
    minAuthenticCards: 5,
    minCuisineMatches: 8,
    minUniqueFamilies: 8
  },
  {
    name: "Italian vegetarian gluten-free diabetes",
    ingredients: ["zucchini", "eggplant", "tomato", "white beans", "polenta"],
    preferredCuisine: "Italian",
    diets: ["vegetarian", "glutenFree"],
    conditions: ["diabetes"],
    expectedTerms: ["minestrone", "ribollita", "caponata", "polenta", "parmigiana", "fagioli", "ciambotta"],
    recipeCount: 10,
    minAuthenticCards: 5,
    minCuisineMatches: 8,
    minUniqueFamilies: 8
  },
  {
    name: "Thai pescatarian dairy-free high blood pressure",
    ingredients: ["shrimp", "white fish", "rice noodles", "coconut milk", "thai basil", "broccoli"],
    preferredCuisine: "Thai",
    diets: ["pescatarian", "dairyFree"],
    conditions: ["highBloodPressure"],
    expectedTerms: ["tom yum", "tom kha", "pad thai", "green curry", "red curry", "larb", "yum", "hor mok"],
    recipeCount: 10,
    minAuthenticCards: 5,
    minCuisineMatches: 8,
    minUniqueFamilies: 8
  },
  {
    name: "Indian vegan diabetes",
    ingredients: ["lentils", "chickpeas", "spinach", "cauliflower", "tomato"],
    preferredCuisine: "Indian",
    diets: ["vegan"],
    conditions: ["diabetes"],
    expectedTerms: ["dal", "chana", "palak", "saag", "gobi", "tikka", "sambar", "rasam"],
    recipeCount: 10,
    minAuthenticCards: 5,
    minCuisineMatches: 8,
    minUniqueFamilies: 8
  },
  {
    name: "Turkish keto dairy-free",
    ingredients: ["ground beef", "eggplant", "tomato", "pepper", "zucchini", "parsley"],
    preferredCuisine: "Turkish",
    diets: ["keto", "dairyFree"],
    expectedTerms: ["kofte", "kebab", "karniyarik", "imam", "menemen", "guvec", "saksuka", "dolma"],
    recipeCount: 10,
    minAuthenticCards: 5,
    minCuisineMatches: 8,
    minUniqueFamilies: 8
  },
  {
    name: "Mexican weight-loss gluten-free",
    ingredients: ["chicken breast", "black beans", "corn tortilla", "tomato", "pepper", "avocado"],
    preferredCuisine: "Mexican",
    diets: ["glutenFree"],
    conditions: ["weightLoss"],
    expectedTerms: ["taco", "tostada", "enchilada", "pozole", "sopa", "tinga", "fajita", "mole"],
    recipeCount: 10,
    minAuthenticCards: 5,
    minCuisineMatches: 8,
    minUniqueFamilies: 8
  },
  {
    name: "Any cuisine seafood produce grains heart-aware",
    ingredients: ["salmon", "shrimp", "quinoa", "brown rice", "broccoli", "tomato", "kiwi"],
    preferredCuisine: "Any",
    conditions: ["cholesterol", "highBloodPressure"],
    recipeCount: 10,
    minDistinctCuisines: 4,
    minUniqueFamilies: 8
  },
  {
    name: "Middle Eastern low-blood-pressure weight-gain",
    ingredients: ["lamb", "rice", "yogurt", "cucumber", "chickpeas", "bread"],
    preferredCuisine: "Middle Eastern",
    conditions: ["lowBloodPressure", "weightGain"],
    expectedTerms: ["mansaf", "maqluba", "fatteh", "kibbeh", "mujadara", "kabsa", "shawarma", "kofta"],
    recipeCount: 10,
    minAuthenticCards: 5,
    minCuisineMatches: 8,
    minUniqueFamilies: 8
  }
];

async function main() {
  if (!hasFirebaseAdminConfig()) throw new Error("Firebase Admin credentials are not configured.");
  if (!API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required.");

  const auth = getAdminAuth();
  const db = getAdminDb();
  let uid = "";

  try {
    const user = await auth.createUser({
      disabled: false,
      displayName: "NutriMoment Launch Audit",
      email: QA_EMAIL,
      emailVerified: true
    });
    uid = user.uid;
    if (ACCESS_MODE === "premium") {
      await db.doc(`entitlements/${uid}`).set({
        uid,
        email: QA_EMAIL,
        tier: "premium",
        role: "admin",
        status: "active",
        source: "launch_recipe_audit",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const idToken = await createIdToken(uid);
    const reports: ScenarioReport[] = [];

    const selectedScenarios = scenarios.slice(0, Number.isFinite(SCENARIO_LIMIT) ? SCENARIO_LIMIT : scenarios.length);
    process.stdout.write(`Launch recipe audit selected ${selectedScenarios.length}/${scenarios.length} scenarios.\n`);

    for (const scenario of selectedScenarios) {
      reports.push(await runScenario(scenario, idToken));
      await sleep(REQUEST_DELAY_MS);
    }

    await writeReport(reports);
    const failCount = reports.filter((report) => report.status === "fail").length;
    const warnCount = reports.filter((report) => report.status === "warn").length;
    console.log(`Launch recipe audit: ${reports.length - failCount - warnCount} pass, ${warnCount} warn, ${failCount} fail`);
    console.log(`Report: ${path.join(process.cwd(), ".generated", "launch-recipe-audit.md")}`);
    if (failCount) process.exitCode = 1;
  } finally {
    if (uid) {
      await cleanupUser(uid).catch((error) => {
        console.error(`Cleanup failed for ${uid}:`, error);
      });
    }
  }
}

async function createIdToken(uid: string) {
  const customToken = await getAdminAuth().createCustomToken(uid, {
    email: QA_EMAIL,
    role: ACCESS_MODE === "premium" ? "admin" : "user",
    tier: ACCESS_MODE
  });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true, token: customToken })
  });

  if (!response.ok) throw new Error(`Custom-token exchange failed: ${response.status} ${await response.text()}`);
  const payload = (await response.json()) as { idToken?: string };
  if (!payload.idToken) throw new Error("Custom-token exchange returned no idToken.");
  return payload.idToken;
}

async function runScenario(scenario: AuditScenario, idToken: string): Promise<ScenarioReport> {
  process.stdout.write(`Running scenario: ${scenario.name}\n`);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/generate-recipes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        allergens: scenario.allergens ?? [],
        calorieTarget: scenario.calorieTarget ?? 2000,
        conditions: scenario.conditions ?? [],
        diets: scenario.diets ?? [],
        ingredients: scenario.ingredients,
        maxMissingIngredients: 5,
        preferredCuisine: scenario.preferredCuisine,
        recipeCount: scenario.recipeCount,
        uiLanguage: scenario.uiLanguage ?? "en"
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    return {
      checks: [{ detail: `request failed or timed out: ${error instanceof Error ? error.message : String(error)}`, status: "fail" }],
      cuisineCounts: {},
      genericRiskNames: [],
      names: [],
      recipeCount: 0,
      scenario: scenario.name,
      status: "fail"
    };
  }
  const payload = (await response.json()) as { error?: string; recipes?: Recipe[]; result?: string; servedFrom?: string };
  if (!response.ok) {
    return {
      checks: [{ detail: `HTTP ${response.status}: ${payload.error ?? "unknown error"}`, status: "fail" }],
      cuisineCounts: {},
      genericRiskNames: [],
      names: [],
      recipeCount: 0,
      scenario: scenario.name,
      servedFrom: payload.servedFrom,
      status: "fail"
    };
  }

  const recipes = readRecipes(payload);
  const checks = scoreRecipes(scenario, recipes);
  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  return {
    checks,
    cuisineCounts: countCuisines(recipes),
    genericRiskNames: recipes.filter((recipe) => isGenericRiskRecipe(recipe, scenario.preferredCuisine)).map(readRecipeName),
    names: recipes.map(readRecipeName),
    recipeCount: recipes.length,
    scenario: scenario.name,
    servedFrom: payload.servedFrom,
    status
  };
}

function readRecipes(payload: { recipes?: Recipe[]; result?: string }) {
  if (Array.isArray(payload.recipes)) return payload.recipes;
  if (!payload.result) return [];
  try {
    const parsed = JSON.parse(payload.result) as unknown;
    if (Array.isArray(parsed)) return parsed as Recipe[];
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { recipes?: unknown }).recipes)) {
      return (parsed as { recipes: Recipe[] }).recipes;
    }
  } catch {
    return [];
  }
  return [];
}

function scoreRecipes(scenario: AuditScenario, recipes: Recipe[]) {
  const checks: Array<{ detail: string; status: AuditStatus }> = [];
  const dietContext = { diets: scenario.diets ?? [], allergens: scenario.allergens ?? [] };
  const dietHits = recipes
    .map((recipe) => ({ name: readRecipeName(recipe), reason: findRecipeDietViolation(recipe, dietContext) }))
    .filter((entry) => entry.reason);
  const healthHits = recipes
    .map((recipe) => ({ name: readRecipeName(recipe), reason: findRecipeHealthViolation(recipe, scenario.conditions ?? []) }))
    .filter((entry) => entry.reason);
  const cuisineMatches = scenario.preferredCuisine === "Any"
    ? recipes.length
    : recipes.filter((recipe) => cuisineMatchesPreference(recipe.cuisine ?? "", scenario.preferredCuisine)).length;
  const distinctCuisines = new Set(recipes.map((recipe) => normalizeText(recipe.cuisine ?? "")).filter(Boolean)).size;
  const familyCount = new Set(recipes.map(readVisibleDishFamily).filter(Boolean)).size;
  const authenticCount = scenario.preferredCuisine === "Any"
    ? recipes.length
    : recipes.filter((recipe) => hasAuthenticCuisineSignal(recipe, scenario)).length;
  const genericRisks = recipes.filter((recipe) => isGenericRiskRecipe(recipe, scenario.preferredCuisine));

  checks.push({
    detail: `returned ${recipes.length}/${scenario.recipeCount} requested recipes`,
    status: recipes.length === scenario.recipeCount ? "pass" : "fail"
  });
  checks.push({
    detail: `${familyCount} unique dish families`,
    status: familyCount >= (scenario.minUniqueFamilies ?? Math.min(scenario.recipeCount, 7)) ? "pass" : "fail"
  });
  checks.push({
    detail: `${dietHits.length} diet/allergen violations`,
    status: dietHits.length === 0 ? "pass" : "fail"
  });
  checks.push({
    detail: `${healthHits.length} health-condition violations`,
    status: healthHits.length === 0 ? "pass" : "fail"
  });

  if (scenario.preferredCuisine === "Any") {
    checks.push({
      detail: `${distinctCuisines} distinct cuisines for Any-cuisine rotation`,
      status: distinctCuisines >= (scenario.minDistinctCuisines ?? 4) ? "pass" : "fail"
    });
  } else {
    checks.push({
      detail: `${cuisineMatches}/${recipes.length} cuisine labels match ${scenario.preferredCuisine}`,
      status: cuisineMatches >= (scenario.minCuisineMatches ?? Math.ceil(recipes.length * 0.8)) ? "pass" : "fail"
    });
    checks.push({
      detail: `${authenticCount}/${recipes.length} cards show named/authentic cuisine signal`,
      status: authenticCount >= (scenario.minAuthenticCards ?? Math.ceil(recipes.length * 0.45)) ? "pass" : "warn"
    });
  }

  checks.push({
    detail: `${genericRisks.length} generic-looking names without catalog signal`,
    status: genericRisks.length <= 2 ? "pass" : "warn"
  });

  if (dietHits.length) checks.push({ detail: `diet hits: ${dietHits.map((hit) => `${hit.name} -> ${hit.reason?.match}`).join("; ")}`, status: "fail" });
  if (healthHits.length) checks.push({ detail: `health hits: ${healthHits.map((hit) => `${hit.name} -> ${hit.reason?.match}`).join("; ")}`, status: "fail" });

  return checks;
}

function hasAuthenticCuisineSignal(recipe: Recipe, scenario: AuditScenario) {
  const haystack = normalizeText([
    readRecipeName(recipe),
    recipe.cuisine,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.photo_identity?.dish_slug,
    recipe.photo_identity?.english_name,
    recipe.dish_intent?.dish_name
  ].filter(Boolean).join(" "));
  const expectedHit = (scenario.expectedTerms ?? []).some((term) => haystack.includes(normalizeText(term)));
  if (expectedHit) return true;

  const aliases = getCuisineAliases(scenario.preferredCuisine);
  return aliases.some((alias) => haystack.includes(alias));
}

function isGenericRiskRecipe(recipe: Recipe, preferredCuisine: string) {
  if (preferredCuisine !== "Any" && hasAuthenticCuisineSignal(recipe, { name: "", ingredients: [], preferredCuisine, recipeCount: 10 })) {
    return false;
  }
  const name = normalizeText(readRecipeName(recipe));
  return /\b(bowl|plate|skillet|tray|salad|soup|stew|wrap)\b/.test(name) &&
    !/\b(shakshuka|ful|hawawshi|kofta|koshary|mujadara|mansaf|maqluba|dal|chana|palak|saag|gobi|pad thai|tom yum|tom kha|curry|kofte|kebab|menemen|taco|tostada|enchilada|pozole|fatteh|shawarma)\b/.test(name);
}

function getCuisineAliases(cuisine: string) {
  return (getCompleteCuisineCatalog(cuisine) ?? [])
    .flatMap((dish) => [
      dish.id.replace(/-/g, " "),
      ...dish.names.english,
      ...dish.names.native,
      ...(dish.names.other ?? [])
    ])
    .map(normalizeText)
    .filter((alias) => alias.length >= 5)
    .filter((alias) => alias.split(/\s+/).length >= 2 || /^(dal|chana|palak|gobi|koshary|hawawshi|mansaf|maqluba|kofte|menemen|pozole|mole)$/.test(alias));
}

function countCuisines(recipes: Recipe[]) {
  const counts: Record<string, number> = {};
  for (const recipe of recipes) {
    const cuisine = recipe.cuisine || "Unknown";
    counts[cuisine] = (counts[cuisine] ?? 0) + 1;
  }
  return counts;
}

function readRecipeName(recipe: Recipe) {
  return recipe.localized?.English?.name ?? recipe.name ?? "Unnamed recipe";
}

function readVisibleDishFamily(recipe: Recipe) {
  return normalizeText([
    readRecipeName(recipe),
    recipe.dish_intent?.dish_name,
    recipe.image_search_index
  ].filter(Boolean).join(" "))
    .replace(/\b(low carb|gluten free|dairy free|high protein|low sodium|diabetes friendly|heart healthy)\b/g, " ")
    .replace(/\b(recipe|dish|meal|plate|bowl|dinner|lunch|breakfast|style|traditional)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function writeReport(reports: ScenarioReport[]) {
  const outputDir = path.join(process.cwd(), ".generated");
  await mkdir(outputDir, { recursive: true });
  const summary = reports.reduce<Record<AuditStatus, number>>((acc, report) => {
    acc[report.status] = (acc[report.status] ?? 0) + 1;
    return acc;
  }, { pass: 0, warn: 0, fail: 0 });
  const json = { accessMode: ACCESS_MODE, baseUrl: BASE_URL, generatedAt: CREATED_AT, qaEmail: QA_EMAIL, summary, reports };
  await writeFile(path.join(outputDir, "launch-recipe-audit.json"), JSON.stringify(json, null, 2));
  await writeFile(path.join(outputDir, "launch-recipe-audit.md"), renderMarkdownReport(json));
}

function renderMarkdownReport(input: {
  baseUrl: string;
  accessMode: string;
  generatedAt: string;
  qaEmail: string;
  reports: ScenarioReport[];
  summary: Record<AuditStatus, number>;
}) {
  return [
    "# NutriMoment Launch Recipe Audit",
    "",
    `Generated: ${input.generatedAt}`,
    `Base URL: ${input.baseUrl}`,
    `Access mode: ${input.accessMode}`,
    `Temporary QA user: ${input.qaEmail} (deleted after run)`,
    "",
    `Summary: ${input.summary.pass} pass, ${input.summary.warn} warn, ${input.summary.fail} fail`,
    "",
    ...input.reports.flatMap((report) => [
      `## ${report.status.toUpperCase()} ${report.scenario}`,
      "",
      `Served from: ${report.servedFrom ?? "unknown"}`,
      `Recipe count: ${report.recipeCount}`,
      `Cuisines: ${JSON.stringify(report.cuisineCounts)}`,
      "",
      "Checks:",
      ...report.checks.map((check) => `- ${check.status.toUpperCase()} ${check.detail}`),
      "",
      "Names:",
      ...report.names.map((name) => `- ${name}`),
      report.genericRiskNames.length ? ["", "Generic-risk names:", ...report.genericRiskNames.map((name) => `- ${name}`)].join("\n") : "",
      ""
    ])
  ].filter(Boolean).join("\n");
}

async function cleanupUser(uid: string) {
  const db = getAdminDb();
  await db.recursiveDelete(db.collection("users").doc(uid));
  await db.doc(`entitlements/${uid}`).delete();
  await getAdminAuth().deleteUser(uid);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

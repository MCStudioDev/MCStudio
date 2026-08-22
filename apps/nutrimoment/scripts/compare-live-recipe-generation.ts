import { config as loadEnv } from "dotenv";
import path from "node:path";
import { getAdminAuth } from "../src/lib/firebaseAdmin";
import type { Recipe } from "../src/lib/types";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const BASE_URL = process.env.LIVE_RECIPE_CHECK_BASE_URL ?? "http://127.0.0.1:3000";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const REQUEST_TIMEOUT_MS = 180_000;
const ACCOUNTS = {
  free: "gamal.mina2013@gmail.com",
  premium: "mina.naguib42@gmail.com"
} as const;

async function main() {
  if (!FIREBASE_API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required.");

  const scenario = {
    allergens: [],
    calorieTarget: 1650,
    conditions: [],
    diets: [],
    ingredients: ["beef", "meat", "ground beef"],
    maxMissingIngredients: 5,
    preferredCuisine: "Egyptian",
    recipeCount: 10,
    uiLanguage: "en",
    debug: true
  };

  const premium = await generateForAccount(ACCOUNTS.premium, scenario);
  const free = await generateForAccount(ACCOUNTS.free, scenario);
  const premiumNames = new Set(premium.recipes.map((recipe) => recipe.name.toLowerCase()));

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    scenario,
    premium: summarize(premium),
    free: summarize(free),
    overlap: free.recipes.filter((recipe) => premiumNames.has(recipe.name.toLowerCase())).map((recipe) => recipe.name)
  }, null, 2));
}

async function generateForAccount(email: string, scenario: Record<string, unknown>) {
  const idToken = await createIdToken(email);
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/generate-recipes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(scenario),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json() as Record<string, unknown> & { recipes?: Recipe[]; result?: string };
  return {
    email,
    elapsedMs: Date.now() - startedAt,
    httpStatus: response.status,
    payload,
    recipes: readRecipes(payload)
  };
}

function summarize(result: Awaited<ReturnType<typeof generateForAccount>>) {
  return {
    email: result.email,
    elapsedMs: result.elapsedMs,
    httpStatus: result.httpStatus,
    servedFrom: result.payload.servedFrom,
    generationStatus: result.payload.generationStatus,
    requestedCount: result.payload.requestedCount,
    returnedCount: result.payload.returnedCount ?? result.recipes.length,
    message: result.payload.message,
    searchCandidatesFound: result.payload.search_candidates_found,
    compatibleCandidatesFound: result.payload.compatible_candidates_found,
    recipes: result.recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      source: recipe.recipe_source_type,
      acceptanceScore: recipe.acceptance_score,
      ingredients: recipe.ingredients,
      missingIngredients: recipe.missing_ingredients
    }))
  };
}

async function createIdToken(email: string) {
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  const customToken = await auth.createCustomToken(user.uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true, token: customToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }
  );
  const payload = await response.json() as { error?: { message?: string }; idToken?: string };
  if (!response.ok || !payload.idToken) {
    throw new Error(`Could not authenticate ${email}: ${payload.error?.message ?? response.status}`);
  }
  return payload.idToken;
}

function readRecipes(payload: { recipes?: Recipe[]; result?: string }) {
  if (Array.isArray(payload.recipes)) return payload.recipes;
  if (!payload.result) return [];
  try {
    const parsed = JSON.parse(payload.result) as Recipe[] | { recipes?: Recipe[] };
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed.recipes) ? parsed.recipes : [];
  } catch {
    return [];
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { getAdminAuth } from "../src/lib/firebaseAdmin";
import { findRecipeDietViolation } from "../src/lib/dietEnforcement";
import type { Recipe } from "../src/lib/types";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const BASE_URL = process.env.FRESH_ACCOUNT_CHECK_BASE_URL ?? "http://127.0.0.1:3000";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const REQUEST_TIMEOUT_MS = 120_000;
const ACCOUNTS = {
  free: "gamal.mina2013@gmail.com",
  premium: "mina.naguib42@gmail.com"
} as const;

type Tier = keyof typeof ACCOUNTS;

type RecipePhotoResult = {
  elapsedMs?: number;
  error?: string;
  imageSource?: string;
  imageUrl?: string;
  ok?: boolean;
  resolutionPath?: "embedded" | "lookup";
  signature?: string;
  source?: string;
  status?: number;
  tier?: Tier;
};

type GenerationPayload = {
  error?: string;
  generationStatus?: string;
  recipes?: Recipe[];
  result?: string;
  servedFrom?: string;
};

async function main() {
  if (!FIREBASE_API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required.");

  const scenario = {
    allergens: [] as string[],
    calorieTarget: 2000,
    conditions: [] as string[],
    diets: [] as string[],
    ingredients: ["chicken", "rice", "shrimp", "pasta", "tomato", "tahini", "lemon", "garlic"],
    maxMissingIngredients: 5,
    preferredCuisine: "Egyptian",
    recipeCount: 6,
    uiLanguage: "en"
  };

  const cacheReuse = await runExactPhotoReuseCheck();
  if (process.argv.includes("--photo-only")) {
    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      checkedAt: new Date().toISOString(),
      cacheReuse
    }, null, 2));
    if (cacheReuse.failures.length) {
      throw new Error(`Fresh photo cache check failed: ${cacheReuse.failures.join(" | ")}`);
    }
    return;
  }
  if (process.argv.includes("--free-only")) {
    const free = await runFreshGeneration("free", scenario);
    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      checkedAt: new Date().toISOString(),
      cacheReuse,
      scenario,
      accounts: { free }
    }, null, 2));
    const failures = [...cacheReuse.failures, ...free.failures];
    if (failures.length) {
      throw new Error(`Fresh free generation check failed: ${failures.join(" | ")}`);
    }
    return;
  }
  const premium = await runFreshGeneration("premium", scenario);
  const free = await runFreshGeneration("free", scenario);
  const report = {
    baseUrl: BASE_URL,
    checkedAt: new Date().toISOString(),
    scenario,
    cacheReuse,
    accounts: { premium, free }
  };

  console.log(JSON.stringify(report, null, 2));

  const failures = [...cacheReuse.failures, ...premium.failures, ...free.failures];
  if (failures.length) {
    throw new Error(`Fresh account generation check failed: ${failures.join(" | ")}`);
  }
}

async function runExactPhotoReuseCheck() {
  const premiumToken = await createActualAccountIdToken(ACCOUNTS.premium);
  const freeToken = await createActualAccountIdToken(ACCOUNTS.free);
  const premiumFirst = await fetchExactPhoto("premium", premiumToken, false);
  const premiumSecond = await fetchExactPhoto("premium", premiumToken, false);
  const free = await fetchExactPhoto("free", freeToken, true);
  const freeCard = await fetchFreeCardPhoto(freeToken);
  const failures: string[] = [];

  if (!premiumFirst.imageUrl) failures.push("Frakh Meshwi premium first lookup returned no photo");
  if (!premiumSecond.imageUrl) failures.push("Frakh Meshwi premium second lookup returned no photo");
  if (!free.imageUrl) failures.push("Frakh Meshwi free cache lookup returned no photo");
  if (premiumFirst.imageUrl && premiumSecond.imageUrl && premiumFirst.imageUrl !== premiumSecond.imageUrl) {
    failures.push("Frakh Meshwi premium repeated lookup returned a different URL");
  }
  if (premiumSecond.imageSource !== "cache") failures.push(`Frakh Meshwi premium repeat source was ${premiumSecond.imageSource ?? "missing"}`);
  if (free.imageSource !== "cache") failures.push(`Frakh Meshwi free source was ${free.imageSource ?? "missing"}`);
  if (freeCard.imageSource !== "cache") failures.push(`Farakh Meshwi card source was ${freeCard.imageSource ?? "missing"}`);
  if (premiumSecond.imageUrl && free.imageUrl && premiumSecond.imageUrl !== free.imageUrl) {
    failures.push("Frakh Meshwi premium and free lookups returned different URLs");
  }

  return { recipe: "Frakh Meshwi", premiumFirst, premiumSecond, free, freeCard, failures };
}

async function fetchFreeCardPhoto(idToken: string): Promise<RecipePhotoResult> {
  const params = new URLSearchParams({
    cacheOnly: "1",
    cuisine: "Egyptian",
    photoCuisineKey: "egyptian",
    photoMethod: "grilled",
    photoProtein: "chicken",
    photoSlug: "farakh-meshwi",
    query: "Farakh Meshwi"
  });
  ["Farakh Meshwi", "Farakh Meshwi Egyptian"].forEach((value) => params.append("exact", value));
  ["Farakh Meshwi Egyptian"].forEach((value) => params.append("alt", value));
  ["1 serving chicken", "1 portion lemon", "1 portion garlic"].forEach((value) => params.append("ingredient", value));
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/recipe-photo?${params.toString()}`, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = (await response.json()) as RecipePhotoResult;
  return { ...payload, elapsedMs: Date.now() - startedAt, ok: response.ok && Boolean(payload.imageUrl), status: response.status, tier: "free" };
}

async function fetchExactPhoto(tier: Tier, idToken: string, cacheOnly: boolean): Promise<RecipePhotoResult> {
  const params = new URLSearchParams({
    cuisine: "Egyptian",
    query: "Frakh Meshwi"
  });
  ["Frakh Meshwi", "Farakh Meshwi", "Egyptian Grilled Chicken"].forEach((value) => params.append("exact", value));
  ["chicken", "lemon", "garlic", "rice"].forEach((value) => params.append("ingredient", value));
  if (cacheOnly) params.set("cacheOnly", "1");
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/recipe-photo?${params.toString()}`, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = (await response.json()) as RecipePhotoResult;
  return {
    ...payload,
    elapsedMs: Date.now() - startedAt,
    ok: response.ok && Boolean(payload.imageUrl),
    status: response.status,
    tier
  };
}

async function runFreshGeneration(tier: Tier, scenario: Record<string, unknown>) {
  const email = ACCOUNTS[tier];
  const idToken = await createActualAccountIdToken(email);
  const generationStartedAt = Date.now();
  const generationResponse = await fetch(`${BASE_URL}/api/generate-recipes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(scenario),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const generation = (await generationResponse.json()) as GenerationPayload;
  const recipes = readRecipes(generation);
  const generationMs = Date.now() - generationStartedAt;
  const photoStartedAt = Date.now();
  const photoResults = await resolveFreshPhotos(recipes, idToken, tier);
  const photoMs = Date.now() - photoStartedAt;
  const diets = Array.isArray(scenario.diets) ? scenario.diets.filter((value): value is string => typeof value === "string") : [];
  const dietViolations = recipes
    .map((recipe) => ({ name: recipe.name, violation: findRecipeDietViolation(recipe, { diets, allergens: [] }) }))
    .filter((entry) => Boolean(entry.violation));
  const failures: string[] = [];

  if (!generationResponse.ok) failures.push(`${tier} generation returned HTTP ${generationResponse.status}: ${generation.error ?? "unknown error"}`);
  if (recipes.length !== Number(scenario.recipeCount)) failures.push(`${tier} returned ${recipes.length}/${scenario.recipeCount} recipes`);
  if (photoResults.some((photo) => !photo.imageUrl)) failures.push(`${tier} returned ${photoResults.filter((photo) => photo.imageUrl).length}/${recipes.length} photos`);
  if (dietViolations.length) failures.push(`${tier} returned ${dietViolations.length} diet violations`);
  if (tier === "free" && photoResults.some((photo) => photo.resolutionPath !== "embedded" && photo.imageSource !== "cache")) {
    failures.push(`free photos required a non-cache lookup: ${photoResults.map((photo) => `${photo.resolutionPath ?? "missing"}:${photo.imageSource ?? "missing"}`).join(", ")}`);
  }

  return {
    email,
    tier,
    httpStatus: generationResponse.status,
    generationMs,
    photoMs,
    generationStatus: generation.generationStatus,
    servedFrom: generation.servedFrom,
    recipeCount: recipes.length,
    embeddedPhotoCount: recipes.filter((recipe) => isDurableImageUrl(recipe.image_url)).length,
    finalPhotoCount: photoResults.filter((photo) => Boolean(photo.imageUrl)).length,
    photoSources: photoResults.map((photo) => photo.imageSource ?? "missing"),
    photoResolutionPaths: photoResults.map((photo) => photo.resolutionPath ?? "missing"),
    photoHosts: photoResults.map((photo) => readHost(photo.imageUrl)),
    recipes: recipes.map((recipe, index) => ({
      name: recipe.name,
      cuisine: recipe.cuisine,
      photoSource: photoResults[index]?.imageSource ?? "missing",
      photoHost: readHost(photoResults[index]?.imageUrl),
      photoResult: photoResults[index],
      photoRequest: buildBatchItem(recipe, index)
    })),
    dietViolationCount: dietViolations.length,
    failures
  };
}

async function resolveFreshPhotos(recipes: Recipe[], idToken: string, tier: Tier) {
  const resolved: RecipePhotoResult[] = recipes.map((recipe) => isDurableImageUrl(recipe.image_url)
    ? { imageSource: recipe.image_source, imageUrl: recipe.image_url, ok: true, resolutionPath: "embedded", status: 200 }
    : { ok: false });
  const missingIndexes = recipes.flatMap((recipe, index) => resolved[index].imageUrl ? [] : [{ recipe, index }]);
  if (!missingIndexes.length) return resolved;

  const batchItems = missingIndexes.map(({ recipe, index }) => buildBatchItem(recipe, index));
  const batchResponse = await fetch(`${BASE_URL}/api/recipe-photo/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items: batchItems }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const batchPayload = (await batchResponse.json()) as { results?: Record<string, RecipePhotoResult> };
  missingIndexes.forEach(({ index }, itemIndex) => {
    const result = batchPayload.results?.[batchItems[itemIndex].queryKey];
    if (result) resolved[index] = { ...result, resolutionPath: "lookup" };
  });

  if (tier === "free") return resolved;

  for (const { recipe, index } of missingIndexes) {
    if (resolved[index].imageUrl) continue;
    resolved[index] = { ...await fetchPremiumPhoto(recipe, idToken), resolutionPath: "lookup" };
  }
  return resolved;
}

function buildBatchItem(recipe: Recipe, index: number) {
  const exact = [recipe.name, recipe.localized?.English?.name, recipe.dish_intent?.dish_name]
    .filter((value): value is string => Boolean(value?.trim()));
  return {
    alt: exact.slice(1),
    cacheOnly: true,
    cuisine: recipe.cuisine,
    diet: [],
    exact,
    ingredient: recipe.ingredients.slice(0, 10),
    photoCuisineKey: recipe.photo_identity?.cuisine_key,
    photoMethod: recipe.photo_identity?.method,
    photoProtein: recipe.photo_identity?.protein,
    photoSauce: recipe.photo_identity?.sauce,
    photoSlug: recipe.photo_identity?.dish_slug,
    photoStarch: recipe.photo_identity?.starch,
    query: exact[0] ?? `${recipe.cuisine} plated recipe`,
    queryKey: `${index}:${exact[0] ?? recipe.id ?? "recipe"}`
  };
}

async function fetchPremiumPhoto(recipe: Recipe, idToken: string): Promise<RecipePhotoResult> {
  const item = buildBatchItem(recipe, 0);
  const params = new URLSearchParams({ query: item.query });
  item.alt.forEach((value) => params.append("alt", value));
  item.exact.forEach((value) => params.append("exact", value));
  item.ingredient.forEach((value) => params.append("ingredient", value));
  if (item.cuisine) params.set("cuisine", item.cuisine);
  setParam(params, "photoCuisineKey", item.photoCuisineKey);
  setParam(params, "photoMethod", item.photoMethod);
  setParam(params, "photoProtein", item.photoProtein);
  setParam(params, "photoSauce", item.photoSauce);
  setParam(params, "photoSlug", item.photoSlug);
  setParam(params, "photoStarch", item.photoStarch);

  const response = await fetch(`${BASE_URL}/api/recipe-photo?${params.toString()}`, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = (await response.json()) as RecipePhotoResult;
  return { ...payload, ok: response.ok && Boolean(payload.imageUrl), status: response.status };
}

async function createActualAccountIdToken(email: string) {
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  const customToken = await auth.createCustomToken(user.uid);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true, token: customToken }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = (await response.json()) as { error?: { message?: string }; idToken?: string };
  if (!response.ok || !payload.idToken) {
    throw new Error(`Could not authenticate ${email}: ${payload.error?.message ?? response.status}`);
  }
  return payload.idToken;
}

function readRecipes(payload: GenerationPayload) {
  if (Array.isArray(payload.recipes)) return payload.recipes;
  if (!payload.result) return [];
  try {
    const parsed = JSON.parse(payload.result) as { recipes?: Recipe[] };
    return Array.isArray(parsed.recipes) ? parsed.recipes : [];
  } catch {
    return [];
  }
}

function isDurableImageUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function readHost(value: string | undefined) {
  if (!value) return "missing";
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid";
  }
}

function setParam(params: URLSearchParams, key: string, value: string | undefined) {
  if (value?.trim()) params.set(key, value.trim());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

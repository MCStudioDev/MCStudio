import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { canonical, arabic, restrictions, veganCanonical, veganArabic } from "./fixtures/arabic";
import livePairs from "./fixtures/arabic-live-rejection.json";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";

const mock = vi.hoisted(() => ({
  rows: [] as unknown[], writes: [] as Array<{ path: string; data: unknown }>,
  allowed: true, source: null as unknown, history: [] as Record<string, unknown>[], uid: "sandy-test", historyFailure: false,
  generate: vi.fn(), translate: vi.fn(), repair: vi.fn(), reserve: vi.fn(), complete: vi.fn(), release: vi.fn(),
  profile: vi.fn(), readSource: vi.fn(), findSources: vi.fn(), candidates: vi.fn(), commit: vi.fn()
}));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ path, get: async () => ({ exists: false, data: () => undefined }) }),
  collection: (path: string) => {
    if (path !== "sharedRecipesArabicV1" && path !== `users/${mock.uid}/historyArabicV1`) throw new Error(`Unexpected query ${path}`);
    const query = { where: () => query, orderBy: () => query, limit: () => query, get: async () => {
      if (path.includes("historyArabicV1") && mock.historyFailure) throw new Error("History unavailable");
      const rows = path === "sharedRecipesArabicV1" ? mock.rows : [...mock.history, ...mock.writes.filter(write => write.path.startsWith(`${path}/`)).map(write => write.data)];
      return { docs: rows.map((row: any) => ({ id: row.id, data: () => structuredClone(row) })) };
    } };
    return query;
  },
  runTransaction: async (action: (transaction: unknown) => Promise<void>) => {
    await action({ set: (ref: { path: string }, data: unknown) => mock.writes.push({ path: ref.path, data }) });
    await mock.commit();
  }
}) }));
vi.mock("@/services/authService", () => ({
  canUseApiFeature: async () => ({ allowed: mock.allowed, access: { uid: mock.uid, isAdmin: false } }),
  accessPayload: (a: unknown) => a, accessErrorResponse: () => Response.json({}, { status: 401 }),
  reserveFreeAiAction: mock.reserve, completeFreeAiAction: mock.complete, releaseFreeAiAction: mock.release
}));
vi.mock("@/services/generationProfileService", () => ({ loadGenerationRestrictions: mock.profile }));
vi.mock("@/services/arabic/rateLimit", () => ({ applyArabicRateLimit: () => ({ decision: { allowed: true } }) }));
vi.mock("@/services/arabic/gemini", () => ({ generateArabicRecipes: mock.generate, translateArabicSource: mock.translate, callArabicModel: mock.repair }));
vi.mock("@/services/arabic/factsGemini", () => ({ generateArabicFactBatch: mock.generate }));
vi.mock("@/services/arabic/referenceSources", () => ({ findArabicReferenceCandidates: async () => [] }));
vi.mock("@/services/arabic/sourceCandidates", () => ({ findArabicSourceCandidates: mock.candidates }));
vi.mock("@/services/arabic/englishSources", () => ({
  findEnglishSources: mock.findSources, readEnglishSource: mock.readSource,
  englishSourceFingerprint: (source: { fingerprint: string }) => source.fingerprint,
  englishSourceRecipe: (source: { recipe: unknown }) => source.recipe
}));
import { handleArabicGeneration } from "@/services/arabic/generation";
import { buildArabicEntry } from "@/services/arabic/validation";
import { assertArabicWritePath } from "@/services/arabic/repository";
import { ProfileUnavailableError } from "@/lib/profileSafety";
import { buildArabicFactsEntry } from "@/services/arabic/recipeFacts";

const request = (body = {}) => new Request("http://localhost/api/ar/generate-recipes", { method: "POST", body: JSON.stringify({ ingredients: ["rice", "salmon", "water"], recipeCount: 1, ...body }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ARABIC_GENERATION_ENABLED", "true");
  mock.rows = []; mock.writes = []; mock.allowed = true; mock.history = []; mock.uid = "sandy-test"; mock.historyFailure = false;
  mock.profile.mockResolvedValue(restrictions); mock.reserve.mockResolvedValue({ actionId: "action-1" });
  mock.complete.mockImplementation(async (access, _actionId, publish) => {
    if (publish) await publish({ set: (ref: { path: string }, data: unknown) => mock.writes.push({ path: ref.path, data }) });
    return access;
  }); mock.release.mockResolvedValue(true); mock.commit.mockResolvedValue(undefined);
  mock.findSources.mockResolvedValue([]); mock.readSource.mockResolvedValue(null); mock.candidates.mockResolvedValue([]);
  mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: arabic }] });
  mock.repair.mockResolvedValue({ repairs: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("Arabic request integration with write recording", () => {
  it.each([{ ingredients: [] }, { ingredients: ["rice"] }])("uses enough corrected sources to complete a premium week with pantry $ingredients", async ({ ingredients }) => {
    const facts = weeklyFactFixtures();
    mock.rows = await Promise.all(facts.slice(0, 11).map(async facts => (await buildArabicFactsEntry(facts, restrictions)).entry));
    mock.candidates.mockResolvedValue(facts.slice(11).map((fact, index) => ({ reference: { id: `source-${index}`, title: fact.name }, variantKey: `source-${index}` })));
    mock.generate.mockImplementation(async (input: { sourceOnly?: boolean; references?: Array<{ reference: { id: string } }> }) => ({ recipes:
      input.sourceOnly ? input.references!.map(source => ({ facts: facts[11 + Number(source.reference.id.split("-")[1])] })) : [] }));
    const response = await handleArabicGeneration(request({ ingredients, maxMissingIngredients: "unlimited" }), "mealplan");
    const data = await response.json(); expect(response.status, JSON.stringify(data)).toBe(200);
    expect(JSON.parse(data.result).plan).toHaveLength(7);
    const corrections = mock.generate.mock.calls.map(call => call[0]).filter(input => input.sourceOnly);
    expect(corrections.flatMap(input => input.references)).toHaveLength(10);
    expect(corrections.every(input => input.references.length <= 7)).toBe(true);
    expect(mock.reserve).toHaveBeenCalledOnce(); expect(mock.complete).toHaveBeenCalledOnce();
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
  });
  it.each([false, true])("supports weekly planning with an empty pantry, AI access=%s", async allowed => {
    const facts = weeklyFactFixtures(); mock.allowed = allowed;
    if (!allowed) mock.rows = await Promise.all(facts.map(async fact => (await buildArabicFactsEntry(fact, restrictions)).entry));
    mock.generate.mockImplementation(async (input: { mealTypesNeeded?: string[] }) => ({ recipes: facts.filter(fact => input.mealTypesNeeded?.some(type => fact.mealTypes.includes(type as "breakfast" | "lunch" | "dinner"))).map(facts => ({ facts })) }));
    const response = await handleArabicGeneration(request({ ingredients: [], pantry: [], maxMissingIngredients: "unlimited" }), "mealplan");
    const data = await response.json(); expect(response.status, JSON.stringify(data)).toBe(200);
    expect(JSON.parse(data.result).plan).toHaveLength(7);
    expect(JSON.parse(data.result).shoppingList).toContain("4200 غرام سلمون");
    if (allowed) expect(mock.generate.mock.calls.every(call => call[0].allowEmptyPantry === true)).toBe(true);
    else expect(mock.generate).not.toHaveBeenCalled();
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
  });
  it("still requires scanner ingredients and enforces the weekly empty-pantry missing limit", async () => {
    expect((await handleArabicGeneration(request({ ingredients: [] }), "recipes")).status).toBe(400);
    mock.allowed = false;
    mock.rows = await Promise.all(weeklyFactFixtures().map(async facts => (await buildArabicFactsEntry(facts, restrictions)).entry));
    expect((await handleArabicGeneration(request({ ingredients: [], maxMissingIngredients: 0 }), "mealplan")).status).toBe(503);
    expect(mock.writes).toEqual([]);
  });
  it.each([false, true])("completes a 19-dish weekly pool with the English repeat limit, AI access=%s", async allowed => {
    const facts = weeklyFactFixtures().filter((_, index) => ![6, 13].includes(index));
    mock.allowed = allowed;
    if (!allowed) mock.rows = await Promise.all(facts.map(async fact => (await buildArabicFactsEntry(fact, restrictions)).entry));
    mock.generate.mockImplementation(async (input: { mealTypesNeeded?: string[] }) => ({ recipes: facts.filter(fact => input.mealTypesNeeded?.some(type => fact.mealTypes.includes(type as "breakfast" | "lunch" | "dinner"))).map(facts => ({ facts })) }));
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 3 }), "mealplan");
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    const plan = JSON.parse(data.result);
    expect(plan.plan).toHaveLength(7);
    expect(data.repeatFallback).toEqual({ uniqueMealCount: 19, repeatedSlots: 2, maxRepeatedSlots: 2 });
    expect(data.message).toContain("10٪");
    expect(plan.shoppingList).toContain("4200 غرام سلمون");
    expect(new Set(mock.writes.map(write => write.path)).size).toBe(mock.writes.length);
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
    expect(mock.reserve).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(mock.complete).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (!allowed) { expect(mock.generate).not.toHaveBeenCalled(); expect(mock.candidates).not.toHaveBeenCalled(); }
  });
  it("explains an incomplete week instead of claiming all accepted recipes failed validation", async () => {
    const facts = weeklyFactFixtures().filter((_, index) => index < 3 || index >= 7);
    mock.generate.mockImplementation(async (input: { mealTypesNeeded?: string[] }) => ({ recipes: facts.filter(fact => input.mealTypesNeeded?.some(type => fact.mealTypes.includes(type as "breakfast" | "lunch" | "dinner"))).map(facts => ({ facts })), diagnostics: [{ stage: "validation", status: "rejected", issues: ["raw_protein_not_cooked"] }] }));
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 3 }), "mealplan");
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.code).toBe("ARABIC_WEEKLY_PLAN_INCOMPLETE");
    expect(data.validatedRecipeCount).toBe(17);
    expect(data.error).toContain("17"); expect(data.error).toContain("فطور");
    expect(data.error).not.toContain("تعذر التحقق من دقة الوصفات");
    expect(mock.writes).toEqual([]); expect(mock.release).toHaveBeenCalledOnce();
  });
  it("releases the AI reservation when an unsuccessful refresh falls back to a complete cached week", async () => {
    mock.rows = await Promise.all(weeklyFactFixtures().filter((_, index) => ![6, 13].includes(index)).map(async facts => (await buildArabicFactsEntry(facts, restrictions)).entry));
    mock.generate.mockResolvedValue({ recipes: [], diagnostics: [{ stage: "generation", status: "rejected", issues: ["generation_unavailable"] }] });
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 3 }), "mealplan");
    expect(response.status).toBe(200);
    expect(mock.reserve).toHaveBeenCalledOnce(); expect(mock.release).toHaveBeenCalledOnce();
    expect(mock.complete).not.toHaveBeenCalled(); expect(mock.writes.some(write => write.path.endsWith("currentWeeklyArabic"))).toBe(true);
  });
  it("tries one bounded weekly top-up for an 18-dish result before applying the two-repeat fallback", async () => {
    const facts = weeklyFactFixtures();
    mock.generate.mockImplementation(async (input: { variationSeed?: string; mealTypesNeeded?: string[] }) => ({ recipes:
      input.variationSeed?.endsWith(":weekly-top-up") ? [{ facts: facts[6] }] : facts.filter((fact, index) => index % 7 !== 6 && input.mealTypesNeeded?.some(type => fact.mealTypes.includes(type as "breakfast" | "lunch" | "dinner"))).map(facts => ({ facts })) }));
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 3 }), "mealplan");
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.repeatFallback.repeatedSlots).toBe(2);
    expect(mock.generate).toHaveBeenCalledTimes(5);
    expect(mock.reserve).toHaveBeenCalledOnce(); expect(mock.complete).toHaveBeenCalledOnce();
  });
  it("fills weekly discovery omissions in a separate bounded batch under the same action", async () => {
    const facts = weeklyFactFixtures();
    mock.rows = await Promise.all(facts.slice(0, 15).map(async facts => (await buildArabicFactsEntry(facts, restrictions)).entry));
    mock.generate.mockImplementation(async (input: { discoveryOnly?: boolean }) => ({ recipes: input.discoveryOnly ? facts.slice(15).map(facts => ({ facts })) : [],
      diagnostics: input.discoveryOnly ? [] : [{ stage: "planning", status: "rejected", issues: ["dish_omitted"] }] }));
    const response = await handleArabicGeneration(request({ ingredients: [], maxMissingIngredients: "unlimited" }), "mealplan");
    const data = await response.json(); expect(response.status, JSON.stringify(data)).toBe(200);
    expect(JSON.parse(data.result).plan).toHaveLength(7);
    const discovery = mock.generate.mock.calls.map(call => call[0]).filter(input => input.discoveryOnly);
    expect(discovery).toHaveLength(1);
    expect(discovery[0].count).toBeLessThanOrEqual(7);
    expect(discovery[0].excludeNames).toEqual(expect.arrayContaining(facts.slice(0, 15).map(fact => fact.name)));
    expect(mock.reserve).toHaveBeenCalledOnce(); expect(mock.complete).toHaveBeenCalledOnce();
  });
  it("starts fresh generation while source correction is pending under the same billing action", async () => {
    mock.candidates.mockResolvedValue([{ reference: { id: "source-candidate", title: "Koshary" }, variantKey: "v" }]);
    let releaseSource!: (value: unknown) => void;
    const pending = new Promise(resolve => { releaseSource = resolve; });
    let freshStarted = false;
    mock.generate.mockImplementation(async (input: { sourceOnly?: boolean }) => {
      if (input.sourceOnly) return pending;
      freshStarted = true; return { recipes: [{ canonical, recipe: arabic }] };
    });
    const response = handleArabicGeneration(request({ recipeCount: 3 }), "recipes");
    try { await vi.waitFor(() => expect(freshStarted).toBe(true), { timeout: 500 }); }
    finally { releaseSource({ recipes: [], diagnostics: [] }); await response; }
    expect(mock.reserve).toHaveBeenCalledOnce();
    expect(mock.complete).toHaveBeenCalledOnce();
  });
  it("persists per-dish rejection diagnostics in Arabic history and explains a failed refresh", async () => {
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    await handleArabicGeneration(request(), "recipes");
    const diagnostic = { candidateId: `dish-${"a".repeat(24)}`, name: "طعمية", stage: "validation", status: "rejected", issues: ["incorrect_cooking_sequence"] };
    mock.generate.mockResolvedValue({ recipes: [], diagnostics: [diagnostic] });
    const data = await (await handleArabicGeneration(request(), "recipes")).json();
    expect(data.backfilledCount).toBe(1);
    expect(data.message).toContain("لم تجتز");
    const histories = mock.writes.filter(write => write.path.includes("historyArabicV1"));
    expect(histories.at(-1)?.data).toMatchObject({ generationDiagnostics: [diagnostic] });
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
    expect(mock.release).toHaveBeenCalledOnce();
  });
  it.each([false, true])("returns a different cached dish on the next click, AI access=%s", async allowed => {
    mock.allowed = allowed;
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry, (await buildArabicEntry(veganCanonical, veganArabic, restrictions)).entry];
    const body = { ingredients: ["rice"], maxMissingIngredients: "unlimited" };
    const first = await (await handleArabicGeneration(request({ ...body, actionId: "click-1" }), "recipes")).json();
    const second = await (await handleArabicGeneration(request({ ...body, ingredients: ["أرز"], actionId: "click-2" }), "recipes")).json();
    expect(first.recipes).toHaveLength(1); expect(second.recipes).toHaveLength(1);
    expect(second.recipes[0].id).not.toBe(first.recipes[0].id);
    expect(second.freshCount).toBe(1); expect(second.backfilledCount).toBe(0);
    expect(mock.generate).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled();
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
  });
  it("labels repeats when the free Arabic pool is exhausted and keeps the image-cache identity", async () => {
    mock.allowed = false;
    const entry = (await buildArabicEntry(canonical, arabic, restrictions)).entry!;
    mock.rows = [entry];
    await handleArabicGeneration(request(), "recipes");
    const data = await (await handleArabicGeneration(request(), "recipes")).json();
    expect(data).toMatchObject({ freshCount: 0, backfilledCount: 1, generationStatus: "PARTIAL_RESULTS" });
    expect(data.recipes[0]).toMatchObject({ freshness_origin: "backfilled_recent", id: entry.id });
    expect(data.recipes[0].image_action_grant_id).toBeUndefined();
    expect(data.message).toContain("24");
    expect(mock.generate).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled();
  });
  it("uses AI for a new premium dish and passes previously shown names to the prompt", async () => {
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    const body = { ingredients: ["rice"], maxMissingIngredients: "unlimited" };
    await handleArabicGeneration(request(body), "recipes");
    mock.generate.mockResolvedValue({ recipes: [{ canonical: veganCanonical, recipe: veganArabic }] });
    const data = await (await handleArabicGeneration(request(body), "recipes")).json();
    expect(data.recipes[0].name).toBe(veganArabic.name);
    expect(mock.generate.mock.calls[0][0].excludeNames).toEqual(expect.arrayContaining([canonical.name, arabic.name]));
    expect(mock.reserve).toHaveBeenCalledOnce(); expect(mock.complete).toHaveBeenCalledOnce();
  });
  it("does not charge when AI produces only a renamed repeat", async () => {
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    await handleArabicGeneration(request(), "recipes");
    mock.generate.mockResolvedValue({ recipes: [{ canonical: { ...canonical, name: "Another Salmon Bowl" }, recipe: { ...arabic, name: "طبق سلمون آخر" } }] });
    const data = await (await handleArabicGeneration(request(), "recipes")).json();
    expect(data).toMatchObject({ freshCount: 0, backfilledCount: 1 });
    expect(mock.release).toHaveBeenCalledOnce(); expect(mock.complete).not.toHaveBeenCalled();
    expect(data.recipes[0].image_action_grant_id).toBeUndefined();
  });
  it("keeps safe cached results after a freshness history failure without claiming they are new", async () => {
    mock.allowed = false; mock.historyFailure = true;
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    const data = await (await handleArabicGeneration(request(), "recipes")).json();
    expect(data.recipes).toHaveLength(1);
    expect(data.freshnessUnavailable).toBe(true);
    expect(data.recipes[0].freshness_origin).toBeUndefined();
    expect(data.message).toContain("السجل");
  });
  it("does not reuse an unsafe recent dish after preferences change", async () => {
    mock.allowed = false; mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    await handleArabicGeneration(request(), "recipes");
    mock.profile.mockResolvedValue({ diets: ["vegan"], conditions: [], allergens: [] });
    const response = await handleArabicGeneration(request(), "recipes");
    expect(response.status).toBe(503); expect((await response.json()).recipes).toEqual([]);
  });
  it.each([true, false])("serves validated cache with unlimited missing ingredients, AI access=%s", async allowed => {
    mock.allowed = allowed;
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: "unlimited" }), "recipes");
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.recipes[0].missing_ingredients).toHaveLength(2);
    expect(data.suggestions).toEqual([]);
    expect(mock.generate).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled();
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
  });
  it("keeps dietary restrictions enforced with unlimited missing ingredients", async () => {
    mock.allowed = false;
    mock.profile.mockResolvedValue({ diets: ["vegan"], allergens: [], conditions: [] });
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: "unlimited" }), "recipes");
    expect(response.status).toBe(503);
    expect((await response.json()).recipes).toEqual([]);
    expect(mock.writes).toEqual([]);
  });
  it("forwards unlimited to every weekly batch and saves a complete plan", async () => {
    const facts = weeklyFactFixtures();
    mock.generate.mockImplementation(async (input: { mealTypesNeeded?: string[] }) => ({ recipes: facts.filter(fact => input.mealTypesNeeded?.some(type => fact.mealTypes.includes(type as "breakfast" | "lunch" | "dinner"))).map(facts => ({ facts })) }));
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: "unlimited" }), "mealplan");
    expect(response.status).toBe(200);
    expect(JSON.parse((await response.json()).result).plan).toHaveLength(7);
    expect(mock.generate).toHaveBeenCalledTimes(3);
    expect(mock.generate.mock.calls.every(([input]) => input.missingLimit === "unlimited")).toBe(true);
  });
  it("does not recommend raising a missing limit that is already unlimited", async () => {
    mock.generate.mockResolvedValue({ recipes: [], diagnostics: [{ issues: ["no_feasible_ingredient_manifest"] }] });
    const response = await handleArabicGeneration(request({ maxMissingIngredients: "unlimited" }), "recipes");
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toContain("لا يوجد حد");
    expect(data.error).not.toContain("unlimited");
    expect(data.error).not.toContain("عدّل هذا الحد");
    expect(mock.release).toHaveBeenCalledOnce();
  });
  it("uses source corrections before fresh generation for entitled users and bills once", async () => {
    mock.candidates.mockResolvedValue([{ reference: { id: "source-candidate", title: canonical.name }, variantKey: "candidate-variant" }]);
    const response = await handleArabicGeneration(request(), "recipes");
    expect(response.status).toBe(200);
    expect(mock.candidates).toHaveBeenCalledOnce();
    expect(mock.generate.mock.calls[0][0].sourceOnly).toBe(true);
    expect(mock.reserve).toHaveBeenCalledOnce(); expect(mock.complete).toHaveBeenCalledOnce();
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
  });
  it("does not discover English sources or call Gemini for free users without credits", async () => {
    mock.allowed = false;
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    expect((await handleArabicGeneration(request({ recipeCount: 10 }), "recipes")).status).toBe(200);
    expect(mock.candidates).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled();
  });
  it("saves all 21 classified fact meals and their Arabic shopping list atomically", async () => {
    const facts = weeklyFactFixtures();
    mock.generate.mockImplementation(async (input: { mealTypesNeeded?: string[] }) => ({ recipes: facts.filter(fact => input.mealTypesNeeded?.some(type => fact.mealTypes.includes(type as "breakfast" | "lunch" | "dinner"))).map(facts => ({ facts })) }));
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 3 }), "mealplan");
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    const plan = JSON.parse(data.result);
    expect(plan.plan).toHaveLength(7);
    expect(plan.shoppingList.join(" ")).toContain("سلمون");
    expect(plan.shoppingList.join(" ")).not.toMatch(/[A-Za-z]/);
    expect(mock.reserve).toHaveBeenCalledTimes(1); expect(mock.complete).toHaveBeenCalledTimes(1);
    expect(mock.generate).toHaveBeenCalledTimes(3);
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
  });
  it("returns valid recipes from the real rejected Gemini response for the screenshot settings", async () => {
    mock.profile.mockResolvedValue({ diets: ["vegan"], conditions: [], allergens: [] });
    mock.generate.mockResolvedValue({ recipes: livePairs });
    const response = await handleArabicGeneration(request({ ingredients: ["رز", "طماطم", "فول"], preferredCuisine: "Egyptian", recipeCount: 10, maxMissingIngredients: 5 }), "recipes");
    expect(response.status).toBe(200);
    expect((await response.json()).recipes.some((recipe: { name: string }) => recipe.name === "أرز بالطماطم البسيط")).toBe(true);
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
  });
  it("explains the extra ingredients for a safe dish excluded by the missing limit", async () => {
    mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: arabic }] });
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 0 }), "recipes");
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.suggestions).toEqual([{ name: arabic.name, missingIngredients: [arabic.ingredients[0], arabic.ingredients[2]], maxMissingIngredients: 0 }]);
    expect(mock.writes).toEqual([]);
  });
  it("keeps a newly found source dish visible ahead of equally distant cached suggestions", async () => {
    mock.rows = await Promise.all([1, 2, 3].map(async number => (await buildArabicEntry({ ...canonical, name: `${canonical.name} ${number}` }, { ...arabic, name: `${arabic.name} ${number}` }, restrictions)).entry));
    mock.candidates.mockResolvedValue([{ reference: { id: "source-candidate", title: canonical.name }, variantKey: "candidate-variant" }]);
    mock.readSource.mockResolvedValue({ fingerprint: "original", recipe: canonical });
    mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: arabic, source: { id: "english-1", fingerprint: "original" } }] });
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 0 }), "recipes");
    const data = await response.json();
    expect(data.suggestions).toHaveLength(3);
    expect(data.suggestions[0].name).toBe(arabic.name);
    expect(mock.writes).toEqual([]);
  });
  it("still rejects negative structured quantities after simplifying the provider schema", async () => {
    const { materializeArabicGeneration } = await import("@/services/arabic/modelSchemas");
    mock.generate.mockResolvedValue(materializeArabicGeneration({ recipes: [{
      canonical: { ...canonical, ingredients: [{ name: "salmon", quantity: -200, unit: "g" }, "1 cup rice", "1 cup water"] },
      recipe: arabic
    }] }));
    const response = await handleArabicGeneration(request(), "recipes");
    expect(response.status).toBe(503);
    expect(mock.writes).toEqual([]);
    expect(mock.complete).not.toHaveBeenCalled();
  });
  it("generates safely and writes zero English content destinations", async () => {
    const response = await handleArabicGeneration(request(), "recipes");
    expect(response.status).toBe(200);
    expect(mock.writes).toHaveLength(3);
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
    expect(mock.complete).toHaveBeenCalledTimes(1);
    expect(mock.reserve).toHaveBeenCalledTimes(1);
    expect(mock.release).not.toHaveBeenCalled();
  });
  it("asks about unclear input before reservations or writes", async () => {
    const response = await handleArabicGeneration(request({ ingredients: ["شاورما"] }), "recipes");
    expect(response.status).toBe(422);
    expect(mock.reserve).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled(); expect(mock.writes).toEqual([]);
  });
  it("fails closed on profile loading failure", async () => {
    mock.profile.mockRejectedValue(new ProfileUnavailableError());
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.reserve).not.toHaveBeenCalled(); expect(mock.writes).toEqual([]);
  });
  it("serves validated Arabic cache without AI access or credits", async () => {
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry]; mock.allowed = false;
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(200);
    expect(mock.generate).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled(); expect(mock.complete).not.toHaveBeenCalled();
  });
  it("reports a cache shortage without AI access", async () => {
    mock.allowed = false;
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.generate).not.toHaveBeenCalled(); expect(mock.writes).toEqual([]);
  });
  it.each([null, { fingerprint: "changed", recipe: canonical }])("excludes blocked or changed English derivatives", async source => {
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions, { id: "english-1", fingerprint: "original" })).entry];
    mock.readSource.mockResolvedValue(source); mock.allowed = false;
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.writes).toEqual([]);
  });
  it("checks source again before publication", async () => {
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions, { id: "english-1", fingerprint: "original" })).entry];
    mock.readSource.mockResolvedValueOnce({ fingerprint: "original", recipe: canonical }).mockResolvedValue(null);
    mock.allowed = false;
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.writes).toEqual([]);
  });
  it("releases reservation after Gemini failure", async () => {
    mock.generate.mockRejectedValue(new Error("Gemini unavailable"));
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.release).toHaveBeenCalledTimes(1); expect(mock.complete).not.toHaveBeenCalled(); expect(mock.writes).toEqual([]);
  });
  it("repairs wrong language only once and charges once", async () => {
    mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: { ...arabic, name: "English title" } }] });
    mock.repair.mockResolvedValue({ repairs: [{ index: 0, recipe: arabic }] });
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(200);
    expect(mock.repair).toHaveBeenCalledTimes(1); expect(mock.complete).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mock.repair.mock.calls[0][0].split("\n").at(-1));
    expect(payload[0].index).toBe(0);
  });
  it("never saves after failed repair", async () => {
    mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: { ...arabic, calories: 700 } }] });
    mock.repair.mockResolvedValue({ repairs: [{ index: 0, recipe: { ...arabic, calories: 700 } }] });
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.repair).toHaveBeenCalledTimes(1); expect(mock.writes).toEqual([]); expect(mock.release).toHaveBeenCalledTimes(1);
  });
  it("returns a partial recipe result but never saves an incomplete weekly plan", async () => {
    const partial = await handleArabicGeneration(request({ recipeCount: 10 }), "recipes");
    expect((await partial.json()).generationStatus).toBe("PARTIAL_RESULTS");
    mock.writes = []; mock.complete.mockClear();
    expect((await handleArabicGeneration(request(), "mealplan")).status).toBe(503);
    expect(mock.writes).toEqual([]); expect(mock.complete).not.toHaveBeenCalled();
  });
  it("fails safely on malformed model output", async () => {
    mock.generate.mockResolvedValue({ recipes: "broken" });
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.writes).toEqual([]);
  });
  it("refuses to manufacture a week from 21 renamed copies of one dish", async () => {
    mock.generate.mockResolvedValue({ recipes: Array.from({ length: 21 }, (_, index) => ({
      canonical: { ...canonical, name: `${canonical.name} ${index + 1}` },
      recipe: { ...arabic, name: `${arabic.name} ${index + 1}` }
    })) });
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 2 }), "mealplan");
    expect(response.status).toBe(503);
    expect(mock.writes).toEqual([]);
    expect(mock.release).toHaveBeenCalledTimes(1);
  });
  it("honors disabling Arabic while a request is running", async () => {
    mock.generate.mockImplementation(async () => {
      vi.stubEnv("ARABIC_GENERATION_ENABLED", "false");
      return { recipes: [{ canonical, recipe: arabic }] };
    });
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.writes).toEqual([]); expect(mock.release).toHaveBeenCalledTimes(1);
  });
  it("does not publish results when credit completion fails", async () => {
    mock.complete.mockRejectedValue(new Error("credit completion failed"));
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(503);
    expect(mock.writes).toEqual([]);
  });
  it("identifies model failures instead of telling premium users to change ingredients", async () => {
    mock.generate.mockRejectedValue(new Error("Gemini unavailable"));
    const response = await handleArabicGeneration(request(), "recipes");
    const data = await response.json();
    expect(data.code).toBe("ARABIC_AI_UNAVAILABLE");
    expect(data.error).not.toContain("الحد الأقصى للمكونات");
  });
  it("reports provider failure when rejected sources are followed by a generation error", async () => {
    mock.findSources.mockResolvedValue([{ id: "english-1", recipe: { ...canonical, ingredients: ["salmon", "rice", "water"] }, fingerprint: "original" }]);
    mock.translate.mockResolvedValue({ recipe: arabic });
    mock.generate.mockRejectedValue(new Error("400: schema has too many states for serving"));
    const response = await handleArabicGeneration(request(), "recipes");
    expect((await response.json()).code).toBe("ARABIC_AI_UNAVAILABLE");
    expect(mock.writes).toEqual([]);
  });
  it("identifies rejected translations instead of blaming the missing-ingredient setting", async () => {
    mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: { ...arabic, calories: 700 } }] });
    const response = await handleArabicGeneration(request(), "recipes");
    const data = await response.json();
    expect(data.code).toBe("ARABIC_VALIDATION_FAILED");
    expect(data.error).not.toContain("الحد الأقصى للمكونات");
    expect(mock.writes).toEqual([]);
  });
  it("serves the screenshot's vegan Egyptian ingredients with only Arabic content writes", async () => {
    mock.profile.mockResolvedValue({ diets: ["vegan"], conditions: [], allergens: [] });
    mock.generate.mockResolvedValue({ recipes: [{ canonical: veganCanonical, recipe: veganArabic }] });
    const response = await handleArabicGeneration(request({ ingredients: ["رز", "طماطم", "فول"], preferredCuisine: "Egyptian", maxMissingIngredients: 5, recipeCount: 10 }), "recipes");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.recipes).toHaveLength(1);
    expect(data.generationStatus).toBe("PARTIAL_RESULTS");
    expect(mock.generate.mock.calls[0][0].ingredients).toEqual(["rice", "tomato", "fava beans"]);
    expect(mock.writes).toHaveLength(3);
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
    expect(mock.complete).toHaveBeenCalledTimes(1);
  });
  it("does not spend a translation request on the wrong cuisine", async () => {
    mock.findSources.mockResolvedValue([{ id: "english-1", recipe: canonical, fingerprint: "original" }]);
    await handleArabicGeneration(request({ preferredCuisine: "Mexican" }), "recipes");
    expect(mock.translate).not.toHaveBeenCalled();
  });
  it("preserves partial cached results when Gemini is unavailable", async () => {
    mock.rows = [(await buildArabicEntry(canonical, arabic, restrictions)).entry];
    mock.generate.mockRejectedValue(new Error("Gemini unavailable"));
    const response = await handleArabicGeneration(request({ recipeCount: 10 }), "recipes");
    expect(response.status).toBe(200);
    expect((await response.json()).recipes).toHaveLength(1);
  });
  it("repairs malformed Arabic fields while keeping the canonical recipe", async () => {
    mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: { ...arabic, steps: "broken" } }] });
    mock.repair.mockResolvedValue({ repairs: [{ index: 0, recipe: arabic }] });
    expect((await handleArabicGeneration(request(), "recipes")).status).toBe(200);
    expect(mock.repair).toHaveBeenCalledTimes(1);
  });
  it("does not attempt translation repair when canonical quantities are missing", async () => {
    mock.generate.mockResolvedValue({ recipes: [{ canonical: { ...canonical, ingredients: ["salmon", "rice", "water"] }, recipe: arabic }] });
    const response = await handleArabicGeneration(request(), "recipes");
    expect((await response.json()).code).toBe("ARABIC_VALIDATION_FAILED");
    expect(mock.repair).not.toHaveBeenCalled();
    expect(mock.writes).toEqual([]);
  });
  it("records failed source corrections and repairs without exposing ingredient text", async () => {
    const { logger } = await import("@/lib/logger");
    const log = vi.spyOn(logger, "warn");
    mock.candidates.mockResolvedValue([{ reference: { id: "source-candidate", title: canonical.name }, variantKey: "candidate-variant" }]);
    mock.generate.mockRejectedValueOnce(new Error("correction unavailable")).mockResolvedValue({ recipes: [{ canonical, recipe: { ...arabic, ingredients: ["سلمون", "أرز", "ماء"] } }] });
    mock.repair.mockRejectedValue(new Error("repair unavailable"));
    await handleArabicGeneration(request(), "recipes");
    const context = log.mock.calls.find(call => call[0] === "Arabic generation produced insufficient validated results")?.[1];
    expect(context).toMatchObject({ modelFailureCount: 2, rejectionCounts: { source_correction_failed: 1, repair_request_failed: 1 } });
    expect(JSON.stringify(context)).not.toContain("سلمون");
    log.mockRestore();
  });
});

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { canonical, arabic, restrictions, veganCanonical, veganArabic } from "./fixtures/arabic";
import livePairs from "./fixtures/arabic-live-rejection.json";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";

const mock = vi.hoisted(() => ({
  rows: [] as unknown[], writes: [] as Array<{ path: string; data: unknown }>,
  allowed: true, source: null as unknown,
  generate: vi.fn(), translate: vi.fn(), repair: vi.fn(), reserve: vi.fn(), complete: vi.fn(), release: vi.fn(),
  profile: vi.fn(), readSource: vi.fn(), findSources: vi.fn(), candidates: vi.fn(), commit: vi.fn()
}));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ path, get: async () => ({ exists: false, data: () => undefined }) }),
  collection: (path: string) => {
    if (path !== "sharedRecipesArabicV1") throw new Error(`Unexpected query ${path}`);
    const query = { where: () => query, limit: () => query, get: async () => ({ docs: mock.rows.map((row: any) => ({ id: row.id, data: () => structuredClone(row) })) }) };
    return query;
  },
  runTransaction: async (action: (transaction: unknown) => Promise<void>) => {
    await action({ set: (ref: { path: string }, data: unknown) => mock.writes.push({ path: ref.path, data }) });
    await mock.commit();
  }
}) }));
vi.mock("@/services/authService", () => ({
  canUseApiFeature: async () => ({ allowed: mock.allowed, access: { uid: "sandy-test", isAdmin: false } }),
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

const request = (body = {}) => new Request("http://localhost/api/ar/generate-recipes", { method: "POST", body: JSON.stringify({ ingredients: ["rice", "salmon", "water"], recipeCount: 1, ...body }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ARABIC_GENERATION_ENABLED", "true");
  mock.rows = []; mock.writes = []; mock.allowed = true;
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

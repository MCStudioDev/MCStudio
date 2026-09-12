import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { canonical, arabic, restrictions } from "./fixtures/arabic";

const mock = vi.hoisted(() => ({
  rows: [] as unknown[], writes: [] as Array<{ path: string; data: unknown }>,
  allowed: true, source: null as unknown,
  generate: vi.fn(), translate: vi.fn(), repair: vi.fn(), reserve: vi.fn(), complete: vi.fn(), release: vi.fn(),
  profile: vi.fn(), readSource: vi.fn(), findSources: vi.fn(), commit: vi.fn()
}));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ path }),
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
vi.mock("@/services/rateLimitService", () => ({ applyRateLimit: () => ({ decision: { allowed: true } }) }));
vi.mock("@/services/arabic/gemini", () => ({ generateArabicRecipes: mock.generate, translateArabicSource: mock.translate, callArabicModel: mock.repair }));
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
  mock.findSources.mockResolvedValue([]); mock.readSource.mockResolvedValue(null);
  mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: arabic }] });
  mock.repair.mockResolvedValue({ repairs: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("Arabic request integration with write recording", () => {
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
  it("saves a complete Arabic week and includes absent ingredients in the shopping list", async () => {
    mock.generate.mockResolvedValue({ recipes: Array.from({ length: 21 }, (_, index) => ({
      canonical: { ...canonical, name: `${canonical.name} ${index + 1}` },
      recipe: { ...arabic, name: `${arabic.name} ${index + 1}` }
    })) });
    const response = await handleArabicGeneration(request({ ingredients: ["rice"], maxMissingIngredients: 2 }), "mealplan");
    expect(response.status).toBe(200);
    const saved = mock.writes.find(write => write.path === "users/sandy-test/plans/currentWeeklyArabic")?.data as any;
    expect(saved.mealPlan.plan).toHaveLength(7);
    expect(saved.mealPlan.plan.every((day: any) => [day.breakfast, day.lunch, day.dinner].every((meal: any) => meal.ingredients.length === 3))).toBe(true);
    expect(saved.mealPlan.shoppingList.join(" ")).toMatch(/سلمون/);
    mock.writes.forEach(write => expect(() => assertArabicWritePath(write.path)).not.toThrow());
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
  it("identifies rejected translations instead of blaming the missing-ingredient setting", async () => {
    mock.generate.mockResolvedValue({ recipes: [{ canonical, recipe: { ...arabic, calories: 700 } }] });
    const response = await handleArabicGeneration(request(), "recipes");
    const data = await response.json();
    expect(data.code).toBe("ARABIC_VALIDATION_FAILED");
    expect(data.error).not.toContain("الحد الأقصى للمكونات");
    expect(mock.writes).toEqual([]);
  });
});

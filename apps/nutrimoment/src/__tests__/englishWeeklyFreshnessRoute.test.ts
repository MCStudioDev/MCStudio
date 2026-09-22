import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlanData, MealPlanMeal } from "@/lib/types";
const mock = vi.hoisted(() => ({ model: vi.fn(), reserve: vi.fn(), complete: vi.fn(), release: vi.fn(), publish: vi.fn(),
  history: [] as Record<string, unknown>[], current: null as unknown, historyFailure: false, allowed: true,
  catalog: [] as ReturnType<typeof catalogMeals>, reads: [] as string[], writes: [] as Array<{ path: string; data: any }> }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ get: async () => { mock.reads.push(path); return { data: () => mock.current, exists: !!mock.current }; },
    set: async (data: unknown) => { mock.writes.push({ path, data }); } }),
  collection: (path: string) => {
    mock.reads.push(path);
    const query = { orderBy: () => query, limit: () => query, get: async () => {
      if (mock.historyFailure) throw new Error("History unavailable");
      return { docs: mock.history.map(row => ({ data: () => row })) };
    } }; return query;
  }
}) }));
vi.mock("@/services/authService", () => ({ AccessError: class extends Error {}, accessErrorResponse: () => Response.json({}, { status: 401 }),
  canUseApiFeature: async () => ({ allowed: mock.allowed, access: { uid: "weekly-test", isPremium: mock.allowed } }),
  reserveFreeAiAction: mock.reserve, completeFreeAiAction: mock.complete, releaseFreeAiAction: mock.release,
  accessPayload: (access: unknown) => access, isFirebaseTransientError: () => false }));
vi.mock("@/services/generationProfileService", () => ({ loadGenerationRestrictions: async () => ({ diets: [], conditions: [], allergens: [] }) }));
vi.mock("@/services/rateLimitService", () => ({ applyRateLimit: () => ({ decision: { allowed: true } }) }));
vi.mock("@/lib/openai", () => ({ USE_MOCK: false, ensureAiAvailable: () => {}, callOpenAIText: mock.model,
  extractJson: (text: string) => text, isTransientModelError: () => false, getClientFacingAiErrorMessage: () => "AI unavailable" }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/recipeSearchService", () => ({ searchCatalogRecipes: async () => ({ candidateRecipes: mock.catalog, rankedRecipeIds: mock.catalog.map(r => r.id) }),
  mapCatalogRecipeToMeal: (recipe: { meal: unknown }) => recipe.meal }));
// Safety/contract evaluation is real; bypass the independent cuisine/slot
// repair heuristic so these tests isolate freshness and publication ordering.
vi.mock("@/services/mealPlanGuardService", () => ({ validateMealPlan: () => [], summarizeMealPlanIssues: () => ({}), isSeafoodMeal: () => false,
  repairMealPlanWithGuard: (mealPlan: unknown) => ({ mealPlan, initialIssues: [], finalIssues: [], repairedSlots: 0 }) }));
vi.mock("@/services/userRecipeCacheService", () => ({ persistGeneratedRecipeCache: mock.publish, persistPremiumValidatedRecipeCache: mock.publish }));
import { POST } from "@/app/api/mealplan/route";
import { weeklyMeals } from "@/services/mealPlanFreshnessService";

function fixture(prefix: string): MealPlanData {
  const meal = (i: number, slot: MealPlanMeal["meal_type"]): MealPlanMeal => ({ name: `${prefix} Chickpea Tomato Stew ${i}`, cuisine: "Mediterranean",
    recipe_source_type: "local_database", source_recipe_id: `${prefix}-${i}`, meal_type: slot,
    calories: 450, protein: "18g", carbs: "62g", fat: "14g", cook_time: "25 minutes", difficulty: "Easy",
    ingredients: ["1 cup chickpeas", "1 cup tomato", "1 tbsp olive oil"], steps: [
      "Warm 1 tbsp olive oil in a pot over medium heat for 2 minutes until shimmering.",
      "Add 1 cup tomato and simmer for 8 minutes until the sauce thickens.",
      "Stir in 1 cup chickpeas and cook for 12 minutes until tender and evenly coated." ] });
  return { plan: Array.from({ length: 7 }, (_, i) => ({ day: `Day ${i}`, breakfast: meal(i * 3, "breakfast"), lunch: meal(i * 3 + 1, "lunch"), dinner: meal(i * 3 + 2, "dinner") })), shoppingList: [] };
}
function setPrevious(plan = fixture("Earlier")) {
  mock.history = [{ sessionType: "weekly_meal_plan", generationStatus: "completed", timestamp: new Date(Date.now() - 1000).toISOString(), recipes: weeklyMeals(plan) }];
  return plan;
}
function catalogMeals(meals: MealPlanMeal[]) {
  return meals.map(meal => ({ id: meal.source_recipe_id!, meal, mealType: meal.meal_type,
    ingredientCanonicals: ["chickpeas", "tomato", "olive oil"],
    ingredients: [{ canonical: "chickpeas", quantity: 1, unit: "cup" },
      { canonical: "tomato", quantity: 1, unit: "cup" }, { canonical: "olive oil", quantity: 1, unit: "tbsp" }] }));
}
const request = () => new Request("http://localhost/api/mealplan", { method: "POST", body: JSON.stringify({ pantry: [], uiLanguage: "en", persistResult: true, historyEntryId: "pending", actionId: "client-reused-id" }) });
beforeEach(() => {
  vi.clearAllMocks(); mock.history = []; mock.current = null; mock.catalog = []; mock.writes = []; mock.reads = []; mock.historyFailure = false; mock.allowed = true;
  mock.reserve.mockResolvedValue({ actionId: "reservation", access: { uid: "weekly-test" } }); mock.complete.mockResolvedValue({ uid: "weekly-test" });
  mock.release.mockResolvedValue(true); mock.publish.mockResolvedValue({ documents: [] }); mock.model.mockReset().mockResolvedValue(JSON.stringify(fixture("Unseen")));
});
describe("English weekly route freshness and charging", () => {
  it("excludes previous dishes and saves an unseen plan with one completed action", async () => {
    setPrevious(); const response = await POST(request()), data = await response.json();
    expect(response.status).toBe(200); expect(data.freshness).toMatchObject({ freshCount: 21, backfilledCount: 0 });
    expect(mock.model.mock.calls[0][0]).toContain("Earlier Chickpea Tomato Stew 0");
    expect(mock.reserve).toHaveBeenCalledTimes(1); expect(mock.complete).toHaveBeenCalledTimes(1); expect(mock.release).not.toHaveBeenCalled();
    expect(mock.reserve.mock.calls[0][2]).not.toBe("client-reused-id");
    expect(mock.writes.find(w => w.path.endsWith("currentWeekly"))?.data.mealPlan.servedFrom).toBe("fallback_ai");
  });
  it("uses the same action for one repair when Gemini repeats the last plan", async () => {
    const previous = setPrevious(); mock.model.mockResolvedValueOnce(JSON.stringify(previous)).mockResolvedValueOnce(JSON.stringify(fixture("Unseen")));
    const response = await POST(request()), data = await response.json();
    expect(response.status).toBe(200); expect(data.freshness.freshCount).toBe(21);
    expect(mock.model).toHaveBeenCalledTimes(2); expect(mock.model.mock.calls[1][0]).toContain("recentWeeklyMeal");
    expect(mock.reserve).toHaveBeenCalledTimes(1); expect(mock.complete).toHaveBeenCalledTimes(1);
  });
  it("preserves the saved week and releases its credit when AI and repair only repeat it", async () => {
    const previous = setPrevious(); mock.model.mockResolvedValue(JSON.stringify(previous));
    const response = await POST(request()), data = await response.json();
    expect(response.status).toBe(503); expect(data.code).toBe("WEEKLY_NO_NEW_MEALS");
    expect(mock.model).toHaveBeenCalledTimes(2); expect(mock.complete).not.toHaveBeenCalled(); expect(mock.release).toHaveBeenCalledTimes(1);
    expect(mock.publish).not.toHaveBeenCalled(); expect(mock.writes.some(w => w.path.includes("/plans/"))).toBe(false);
    expect(mock.writes.every(w => w.data.generationStatus === "failed")).toBe(true);
  });
  it("rotates the shared-pool fallback to unseen meals after Gemini failure", async () => {
    const previous = setPrevious(), fresh = fixture("Unseen");
    mock.model.mockRejectedValue(new Error("Model unavailable"));
    mock.catalog = catalogMeals([...weeklyMeals(previous), ...weeklyMeals(fresh)]);
    const response = await POST(request()), data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200); expect(data.servedFrom).toBe("shared_pool"); expect(data.freshness.freshCount).toBe(21);
    expect(mock.complete).toHaveBeenCalledTimes(1);
  });
  it("does not charge for a shared-pool fallback containing only the previous week", async () => {
    const previous = setPrevious(); mock.model.mockRejectedValue(new Error("Model unavailable"));
    mock.catalog = catalogMeals(weeklyMeals(previous));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(mock.complete).not.toHaveBeenCalled(); expect(mock.release).toHaveBeenCalledTimes(1);
    expect(mock.publish).not.toHaveBeenCalled(); expect(mock.writes.some(w => w.path.includes("/plans/"))).toBe(false);
  });
  it("reports partial freshness in the existing yellow-box notice", async () => {
    const previous = setPrevious(), partial = fixture("Unseen");
    partial.plan[0].breakfast = previous.plan[0].breakfast;
    mock.model.mockResolvedValue(JSON.stringify(partial));
    const response = await POST(request()), data = await response.json();
    expect(response.status).toBe(200); expect(data.freshness).toMatchObject({ freshCount: 20, backfilledCount: 1 });
    expect(data.fallbackNotice).toContain("1 previously shown meals");
    expect(mock.writes.find(w => w.path.includes("/history/"))?.data.generationMessage).toBe(data.fallbackNotice);
  });
  it("stops before reserving a credit when previous plans cannot be checked", async () => {
    mock.historyFailure = true; const response = await POST(request());
    expect(response.status).toBe(503); expect(mock.reserve).not.toHaveBeenCalled(); expect(mock.model).not.toHaveBeenCalled();
    expect(mock.writes.some(w => w.path.includes("/plans/"))).toBe(false);
  });
  it("also checks the saved current week when history has been deleted", async () => {
    const previous = fixture("Earlier");
    mock.current = { mealPlan: previous, updatedAt: { toDate: () => new Date(Date.now() - 1000) } };
    mock.model.mockResolvedValue(JSON.stringify(previous));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mock.reads).toEqual(["users/weekly-test/history", "users/weekly-test/plans/currentWeekly"]);
    expect(mock.publish).not.toHaveBeenCalled(); expect(mock.complete).not.toHaveBeenCalled();
    expect(mock.writes.some(w => w.path.includes("/plans/"))).toBe(false);
  });
  it("retains zero-credit denial before reading history or calling Gemini", async () => {
    mock.allowed = false; expect((await POST(request())).status).toBe(402);
    expect(mock.reads).toEqual([]); expect(mock.reserve).not.toHaveBeenCalled(); expect(mock.model).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadGenerationRestrictions } from "@/services/generationProfileService";
import { filterSafeRecipeResponse, assertSafeMealPlan } from "@/lib/generationSafety";

const mocks = vi.hoisted(() => ({ get: vi.fn(), doc: vi.fn() }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({ doc: mocks.doc }) }));
const context = { diets: ["pescatarian"], allergens: [], conditions: [] };

describe("server generation safety", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.doc.mockImplementation(() => ({ get: mocks.get }));
  });
  it("loads restrictions from the authenticated user's saved health profile", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => context });
    expect(await loadGenerationRestrictions("user-123")).toEqual(context);
    expect(mocks.doc).toHaveBeenCalledWith("users/user-123/profile/health");
  });
  it.each([undefined, {}, { diets: "pescatarian" }, { diets: [null] }])("blocks absent or malformed profiles: %j", async data => {
    mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });
    await expect(loadGenerationRestrictions("user-123")).rejects.toThrow(/profile/i);
  });
  it("blocks unavailable reads instead of using client defaults", async () => {
    mocks.get.mockRejectedValue(new Error("unavailable"));
    await expect(loadGenerationRestrictions("user-123")).rejects.toThrow(/profile/i);
  });
  it("times out a profile read that never settles", async () => {
    vi.useFakeTimers();
    try {
      mocks.get.mockReturnValue(new Promise(() => {}));
      const pending = expect(loadGenerationRestrictions("user-123")).rejects.toThrow(/profile/i);
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;
    } finally { vi.useRealTimers(); }
  });
  it("preserves an error-only response without adding recipe results", () => {
    expect(filterSafeRecipeResponse({ error: "Sign in" }, null)).toEqual({ error: "Sign in" });
  });
  it("removes unsafe fallback recipes and synchronizes the serialized result", () => {
    const recipes = [{ name: "Chicken shawarma", ingredients: ["chicken"] }, { name: "Salmon", ingredients: ["salmon"] }];
    const result = filterSafeRecipeResponse({ recipes, result: JSON.stringify(recipes), returnedCount: 2 }, context);
    expect(result.recipes).toEqual([recipes[1]]);
    expect(JSON.parse(result.result as string)).toEqual([recipes[1]]);
    expect(result.returnedCount).toBe(1);
  });
  it("never releases fallback recipes without a verified profile", () => {
    expect(filterSafeRecipeResponse({ recipes: [{ name: "rice" }] }, null).recipes).toEqual([]);
  });
  it("rejects the entire final plan when one slot is unsafe", () => {
    expect(() => assertSafeMealPlan({ plan: [{ breakfast: { ingredients: ["rice"] }, lunch: { ingredients: ["shawrma"] }, dinner: { ingredients: ["fish"] } }] }, context)).toThrow();
  });
  it("accepts an explicit mushroom and fish plan", () => {
    expect(() => assertSafeMealPlan({ plan: [{ breakfast: { ingredients: ["rice"] }, lunch: { name: "Mushroom shawarma", ingredients: ["mushrooms"] }, dinner: { ingredients: ["fish"] } }] }, context)).not.toThrow();
  });
});

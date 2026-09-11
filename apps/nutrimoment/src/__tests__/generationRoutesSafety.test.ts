import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), search: vi.fn(), reserve: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: () => ({
    doc: () => ({ get: mocks.get, set: mocks.write }),
    collection: () => { throw new Error("No history in this isolated test"); }
  })
}));
vi.mock("@/services/authService", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/authService")>(),
  canUseApiFeature: async () => ({ allowed: false, access: { uid: "authenticated-user", isPremium: false, isAdmin: false, tier: "free" } }),
  reserveFreeAiAction: mocks.reserve
}));
vi.mock("@/services/rateLimitService", () => ({ applyRateLimit: () => ({ decision: { allowed: true } }) }));
vi.mock("@/services/recipeSearchService", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/recipeSearchService")>(), searchCatalogRecipes: mocks.search
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/services/ingredientNormalizationService", () => ({
  normalizeIngredients: async (ingredients: string[]) => ({ normalized: ingredients, resolved: [], searchTerms: ingredients })
}));
vi.mock("@/services/recipeValidationRepairService", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/recipeValidationRepairService")>(),
  persistRecipeValidationReport: async () => undefined,
  persistRecipePipelineReport: async () => ({})
}));

import { POST as recipes } from "@/app/api/generate-recipes/route";
import { POST as mealplan } from "@/app/api/mealplan/route";

describe("generation routes reject unavailable saved profiles before any generation or credit charge", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("explains zero-missing empty results using search evidence and saves the explanation", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ diets: ["pescatarian"], allergens: [], conditions: [] }) });
    mocks.search.mockResolvedValue({ recipes: [], missingLimitRejected: 4 });
    const response = await recipes(new Request("http://localhost/api/generate-recipes", {
      method: "POST", body: JSON.stringify({ ingredients: ["rice"], maxMissingIngredients: 0, recipeCount: 2, historyEntryId: "empty-history" })
    }));
    const body = await response.json();
    expect(body.recipes).toEqual([]);
    expect(body.guidance.reasons.join(" ")).toContain("set to 0");
    expect(body.guidance.reasons.join(" ")).toContain("needed more missing ingredients");
    expect(body.guidance.suggestions.join(" ")).toContain("1 or 2");
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ generationMessage: body.message, recipes: [] }), { merge: true });
  });
  it("uses saved pescatarian restrictions and filters an unsafe cached result before both response and history", async () => {
    const restrictions = { diets: ["pescatarian"], allergens: [], conditions: [] };
    mocks.get.mockResolvedValue({ exists: true, data: () => restrictions });
    mocks.write.mockResolvedValue(undefined);
    const base = { cuisine: "Mexican", missing_ingredients: [], steps: ["Cook and serve."], calories: 400, protein: "20g", carbs: "40g", fat: "10g", cook_time: "20 mins", difficulty: "Easy" };
    const fish = { ...base, id: "salmon", name: "Salmon Rice", ingredients: ["salmon", "rice"] };
    mocks.search.mockResolvedValue({ recipes: [
      { ...base, id: "chicken", name: "Chicken Shawarma", ingredients: ["chicken"] }, fish
    ] });
    const response = await recipes(new Request("http://localhost/api/generate-recipes", {
      method: "POST", body: JSON.stringify({ ingredients: ["rice"], diets: [], recipeCount: 2, historyEntryId: "test-history" })
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining(restrictions));
    expect(body.recipes.map((recipe: { id: string }) => recipe.id)).toEqual(["salmon"]);
    expect(JSON.parse(body.result)).toEqual(body.recipes);
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ recipes: body.recipes, effectiveRestrictions: restrictions }), { merge: true });
  });
  it.each([
    { handler: recipes, name: "recipes", missing: true },
    { handler: recipes, name: "recipes", missing: false },
    { handler: mealplan, name: "mealplan", missing: true },
    { handler: mealplan, name: "mealplan", missing: false }
  ])("$name blocks a missing=$missing profile even when the client sends diets=[]", async ({ handler, missing }) => {
    if (missing) mocks.get.mockResolvedValue({ exists: false });
    else mocks.get.mockRejectedValue(new Error("permission-denied"));
    const response = await handler(new Request("http://localhost/api/test", {
      method: "POST", body: JSON.stringify({ ingredients: ["rice"], pantry: ["rice"], diets: [], historyEntryId: "test-history" })
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "PROFILE_UNAVAILABLE" });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ queries: [] as Array<{ path: string; ingredients?: string[]; limit: number }> }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  collection: (path: string) => {
    const rows = [{ id: "shrimp-dinner", ingredientCanonicals: ["shrimp"] }, { id: "oat-breakfast", ingredientCanonicals: ["oats"] }];
    const query = (ingredients?: string[], limit = 200) => ({
      where: (_field: string, _operator: string, values: string[]) => query(values, limit),
      limit: (value: number) => query(ingredients, value),
      get: async () => {
        mock.queries.push({ path, ingredients, limit });
        return { docs: rows.filter(row => !ingredients || row.ingredientCanonicals.some(name => ingredients.includes(name))).slice(0, limit)
          .map(row => ({ id: row.id, data: () => row })) };
      }
    });
    return query();
  }
}) }));
import { listArabicRecipes } from "@/services/arabic/repository";

beforeEach(() => { mock.queries = []; });
describe("Arabic weekly pantry cache retrieval", () => {
  it("retrieves breakfast outside a shrimp pantry while keeping matching recipes first and unique", async () => {
    const entries = await listArabicRecipes(["shrimp"], 200, true);
    expect(entries.map(entry => entry.id)).toEqual(["shrimp-dinner", "oat-breakfast"]);
    expect(mock.queries).toEqual([
      { path: "sharedRecipesArabicV1", ingredients: ["shrimp"], limit: 100 },
      { path: "sharedRecipesArabicV1", ingredients: undefined, limit: 200 }
    ]);
  });
  it("keeps scanner retrieval restricted to pantry matches", async () => {
    expect((await listArabicRecipes(["shrimp"], 200)).map(entry => entry.id)).toEqual(["shrimp-dinner"]);
    expect(mock.queries).toHaveLength(1);
    mock.queries = [];
    expect(await listArabicRecipes([])).toEqual([]);
    expect(mock.queries).toEqual([]);
  });
});

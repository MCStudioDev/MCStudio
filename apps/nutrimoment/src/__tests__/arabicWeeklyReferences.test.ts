import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonical } from "./fixtures/arabic";
const mock = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], queries: [] as unknown[][], retrieval: vi.fn() }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  collection: (path: string) => {
    mock.queries.push(["collection", path]);
    const query = { where: (...args: unknown[]) => { mock.queries.push(args); return query; }, limit: (count: number) => { mock.queries.push(["limit", count]); return query; },
      get: async () => ({ docs: mock.rows.map(row => ({ id: row.id, data: () => row })) }) };
    return query;
  },
  doc: (path: string) => ({ get: async () => { const row = mock.rows.find(row => path.endsWith(`/${row.id}`)); return { exists: !!row, data: () => row }; } })
}) }));
vi.mock("@/services/recipeReferenceService", () => ({ findRecipeReferencesForGeneration: mock.retrieval }));
vi.mock("@/data/offline/firestoreRecipeReferenceCatalog", () => ({ isDiscoverableRecipeReferenceDoc: (row: { publishStatus: string }) => row.publishStatus === "ready" }));
import { findArabicReferenceCandidates } from "@/services/arabic/referenceSources";
const restrictions = { diets: ["pescatarian"], conditions: [], allergens: [] };
beforeEach(() => { mock.rows = []; mock.queries = []; mock.retrieval.mockReset().mockResolvedValue([]); });
describe("Arabic weekly reference discovery without pantry ingredients", () => {
  it("reads a bounded cuisine bucket and checks publication without inventing owned ingredients", async () => {
    mock.rows = [
      { id: "ready", title: canonical.name, cuisine: "Mediterranean", ingredients: canonical.ingredients, directions: canonical.steps, publishStatus: "ready" },
      { id: "blocked", title: "Blocked recipe", cuisine: "Mediterranean", ingredients: canonical.ingredients, directions: canonical.steps, publishStatus: "needs_review" },
      { id: "malformed", publishStatus: "ready" }
    ];
    const result = await findArabicReferenceCandidates([], "Mediterranean", restrictions, 21, true);
    expect(result.map(row => row.reference.id)).toEqual(["ready"]);
    expect(result[0].reference.matchedIngredients).toEqual([]);
    expect(mock.queries).toContainEqual(["cuisineKey", "==", "mediterranean"]);
    expect(mock.queries).toContainEqual(["limit", 200]);
    expect(mock.retrieval).not.toHaveBeenCalled();
  });
  it("keeps ordinary scanner reference lookup unchanged", async () => {
    expect(await findArabicReferenceCandidates([], "Any", restrictions, 1)).toEqual([]);
    expect(mock.queries).toEqual([]);
    await findArabicReferenceCandidates(["rice"], "Any", restrictions, 1);
    expect(mock.retrieval).toHaveBeenLastCalledWith(expect.objectContaining({ ingredients: ["rice"] }));
  });
});

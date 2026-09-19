import { describe, expect, it, vi } from "vitest";
import { canonical } from "./fixtures/arabic";
import type { RecipeCatalogDoc } from "@/lib/domain";
const mock = vi.hoisted(() => ({ row: {} as Record<string, unknown>, reads: [] as string[], filters: [] as unknown[][], limits: [] as number[] }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ get: async () => { mock.reads.push(path); return { exists: true, data: () => mock.row }; } }),
  collection: (path: string) => {
    mock.reads.push(path);
    const query = { where: (...args: unknown[]) => { mock.filters.push(args); return query; }, limit: (limit: number) => { mock.limits.push(limit); return query; }, get: async () => ({ docs: [{ id: "source-1", data: () => mock.row }] }) };
    return query;
  }
}) }));
vi.mock("@/services/sharedRecipeV2PolicyService", () => ({ isSharedRecipeV2Searchable: (row: { publicationStatus: string }) => row.publicationStatus === "published" }));
import { englishSourceFingerprint, englishSourceRecipe, readEnglishSource, findEnglishSources } from "@/services/arabic/englishSources";
const source = { id: "source-1", title: canonical.name, cuisine: canonical.cuisine, ingredients: [{ name: "rice", canonical: "rice", quantity: 1, unit: "cup" }], localized: { English: canonical }, steps: canonical.steps, calories: 500, protein: 40, carbs: 50, fat: 15, totalMinutes: 25, difficulty: "Easy", image: { storagePath: "", status: "pending" } } as RecipeCatalogDoc;
describe("read-only English source repository", () => {
  it("fingerprints quantities and cooking time, not just English publication identity", () => {
    const hash = englishSourceFingerprint(source);
    expect(englishSourceFingerprint({ ...source, ingredients: [{ ...source.ingredients[0], quantity: 2 }] })).not.toBe(hash);
    expect(englishSourceFingerprint({ ...source, totalMinutes: 30 })).not.toBe(hash);
    expect(englishSourceFingerprint({ ...source, localized: { English: { ...canonical, ingredients: ["300 g salmon"] } } })).not.toBe(hash);
  });
  it("queries only English sources and preserves publication filtering", async () => {
    mock.row = { ...source, publicationStatus: "published" };
    expect(await readEnglishSource("source-1")).not.toBeNull();
    expect(await findEnglishSources(["rice"])).toHaveLength(1);
    mock.row = { ...source, publicationStatus: "quarantined" };
    expect(await readEnglishSource("source-1")).toBeNull(); expect(await findEnglishSources(["rice"])).toEqual([]);
    expect(mock.reads.every(path => path.startsWith("sharedRecipesV2"))).toBe(true);
  });
  it("rejects path traversal and avoids empty queries", async () => {
    expect(await readEnglishSource("../users/u")).toBeNull(); expect(await findEnglishSources([])).toEqual([]);
  });
  it("allows an explicit pantry-free weekly cuisine lookup but still excludes quarantined sources", async () => {
    mock.filters = []; mock.limits = []; mock.row = { ...source, publicationStatus: "published" };
    expect(await findEnglishSources([], { pantryOptional: true, cuisine: "Egyptian" })).toHaveLength(1);
    expect(mock.filters).toEqual([["cuisine", "==", "Egyptian"]]);
    expect(mock.limits).toEqual([200]);
    mock.row = { ...source, publicationStatus: "quarantined" };
    expect(await findEnglishSources([], { pantryOptional: true, cuisine: "Egyptian" })).toEqual([]);
  });
  it("uses canonical quantities when localized content is absent", () => {
    expect(englishSourceRecipe({ ...source, localized: undefined }).ingredients).toEqual(["1 cup rice"]);
  });
  it("includes a cuisine search beyond a nonempty weekly pantry and deduplicates read-only results", async () => {
    mock.filters = []; mock.limits = []; mock.row = { ...source, publicationStatus: "published" };
    expect(await findEnglishSources(["shrimp"], { pantryOptional: true, cuisine: "Mediterranean" })).toHaveLength(1);
    expect(mock.filters).toEqual([["ingredientCanonicals", "array-contains-any", ["shrimp"]], ["cuisine", "==", "Mediterranean"]]);
    expect(mock.limits).toEqual([50, 200]);
  });
});

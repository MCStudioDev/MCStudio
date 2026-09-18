import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonical } from "./fixtures/arabic";
const mock = vi.hoisted(() => ({
  editors: [] as Array<{ id: string; data: Record<string, unknown> }>, rows: new Map<string, unknown>(),
  queries: [] as string[], reads: [] as string[], references: vi.fn(), shared: vi.fn()
}));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  collection: (path: string) => {
    mock.queries.push(path);
    const query = { where: () => query, orderBy: () => query, limit: () => query,
      get: async () => ({ docs: mock.editors.map(row => ({ id: row.id, data: () => row.data })) }) };
    return query;
  },
  doc: (path: string) => ({ get: async () => { mock.reads.push(path); return { exists: mock.rows.has(path), data: () => mock.rows.get(path) }; } })
}) }));
vi.mock("@/services/arabic/referenceSources", () => ({ findArabicReferenceCandidates: mock.references,
  readArabicReferenceSource: async () => null, referenceFingerprint: () => "reference-hash" }));
vi.mock("@/services/arabic/englishSources", async importOriginal => ({ ...await importOriginal<typeof import("@/services/arabic/englishSources")>(), findEnglishSources: mock.shared,
  readEnglishSource: async (id: string) => mock.rows.get(`sharedRecipesV2/${id}`) ?? null,
  englishSourceFingerprint: () => "shared-hash", englishSourceRecipe: (row: { recipe?: unknown; title?: string; cuisine?: string; ingredients?: Array<{ name: string; quantity?: number; unit?: string }>; steps?: string[] }) => row.recipe ?? { name: row.title, cuisine: row.cuisine, ingredients: row.ingredients?.map(item => `${item.quantity} ${item.unit} ${item.name}`), missing_ingredients: [], steps: row.steps } }));
import { findArabicSourceCandidates } from "@/services/arabic/sourceCandidates";
import { arabicSourceIsCurrent } from "@/services/arabic/sourceEligibility";
import { arabicFingerprint } from "@/services/arabic/fingerprint";
import { arabicRecipeNameKey, arabicSourceKey } from "@/services/arabic/freshness";
const vegan = { diets: ["vegan"], conditions: [], allergens: [] };
function editor(id: string, sourceId: string, recipe = canonical) {
  return { id, data: { cacheVersion: "recipe-editor-v11-validation-identity-v1", expiresAt: { toMillis: () => Date.now() + 60000 }, recipe: { ...recipe, source_recipe_id: sourceId } } };
}
beforeEach(() => { vi.clearAllMocks(); mock.editors = []; mock.rows.clear(); mock.queries = []; mock.reads = []; mock.references.mockResolvedValue([]); mock.shared.mockResolvedValue([]); });
describe("Arabic independent English source retrieval", () => {
  it("retrieves safe shared, semantic and trusted sources for an explicitly pantry-free week", async () => {
    mock.shared.mockResolvedValue([{ id: "fish-source", recipe: canonical }]);
    mock.rows.set("sharedRecipesV2/fish-source", { recipe: canonical });
    mock.editors = [editor("a".repeat(64), "fish-source")];
    const result = await findArabicSourceCandidates([], "Mediterranean", { ...vegan, diets: ["pescatarian"] }, 21, undefined, true);
    expect(result.some(row => row.source?.editorKey === "a".repeat(64))).toBe(true);
    expect(result[0].reference.matchedIngredients).toEqual([]);
    expect((await findArabicSourceCandidates([], "Egyptian", vegan, 21, undefined, true)).some(row => /koshary/i.test(row.reference.title))).toBe(true);
    expect(await findArabicSourceCandidates([], "Egyptian", vegan, 21)).toEqual([]);
    expect(await findArabicSourceCandidates([], "Mediterranean", vegan, 21, undefined, true)).toEqual([]);
  });
  it("excludes recently shown English sources before choosing correction candidates", async () => {
    mock.shared.mockResolvedValue([{ id: "seen-source", recipe: canonical }, { id: "new-source", recipe: { ...canonical, name: "Salmon Pilaf" } }]);
    const result = await findArabicSourceCandidates(["rice"], "Mediterranean", { ...vegan, diets: ["pescatarian"] }, 1,
      { recentKeys: [arabicSourceKey({ id: "seen-source", fingerprint: "old" }), arabicRecipeNameKey(canonical.name)], seed: "next-click" });
    expect(result.map(row => row.source?.id)).toEqual(["new-source"]);
  });
  it("finds trusted koshary when the Firebase reference lookup returns nothing", async () => {
    const result = await findArabicSourceCandidates(["rice", "lentils", "chickpeas"], "Egyptian", vegan, 10);
    expect(result.find(row => /koshary/i.test(row.reference.title))?.source).toMatchObject({ kind: "trusted", id: "trusted-source-egyptian-classic-koshary" });
    expect(mock.queries).toEqual(["recipeEditorSemanticCache"]);
  });
  it("discovers a semantic cache entry backed by a shared recipe without a reference hit", async () => {
    mock.rows.set("sharedRecipesV2/fish-source", { recipe: canonical });
    mock.editors = [editor("a".repeat(64), "fish-source")];
    const result = await findArabicSourceCandidates(["rice"], "Mediterranean", { ...vegan, diets: ["pescatarian"] }, 3);
    const selected = result.find(row => row.source?.editorKey);
    expect(selected?.source).toMatchObject({ kind: "shared", id: "fish-source", fingerprint: "shared-hash", editorKey: "a".repeat(64) });
    expect(selected?.requiredFoodIds).toEqual(expect.arrayContaining(["food-rice", "food-salmon"]));
    expect(selected?.reference.matchedIngredients).toEqual(["rice"]);
  });
  it("rejects expired, changed-version, orphaned, blocked and unsafe semantic candidates", async () => {
    mock.editors = [editor("a".repeat(64), "missing"),
      { ...editor("b".repeat(64), "expired"), data: { ...editor("b", "expired").data, expiresAt: { toMillis: () => 0 } } },
      { ...editor("c".repeat(64), "old"), data: { ...editor("c", "old").data, cacheVersion: "old" } }];
    const result = await findArabicSourceCandidates(["rice"], "Mediterranean", vegan, 3);
    expect(result).toEqual([]);
  });
  it("does not substitute an incompatible semantic edit for a safe source", async () => {
    mock.rows.set("sharedRecipesV2/fish-source", { recipe: canonical });
    mock.editors = [editor("a".repeat(64), "fish-source", { ...canonical, ingredients: ["200 g chicken", "1 cup rice"] })];
    expect(await findArabicSourceCandidates(["rice"], "Mediterranean", { ...vegan, diets: ["pescatarian"] }, 3)).toEqual([]);
  });
  it("derives required ingredients from the shared recipe rather than its search aliases", async () => {
    mock.shared.mockResolvedValue([{ id: "fish-source", recipe: canonical, ingredientCanonicals: ["rice", "salmon", "seafood", "protein", "chicken"] }]);
    const result = await findArabicSourceCandidates(["rice"], "Mediterranean", { ...vegan, diets: ["pescatarian"] }, 3);
    const shared = result.find(row => row.source?.id === "fish-source");
    expect(shared?.requiredFoodIds).toEqual(expect.arrayContaining(["food-rice", "food-salmon"]));
    expect(shared?.requiredFoodIds).not.toContain("food-chicken");
  });
  it("keeps other source types available when reference lookup fails", async () => {
    mock.references.mockRejectedValue(new Error("reference unavailable"));
    const result = await findArabicSourceCandidates(["rice"], "Egyptian", vegan, 10);
    expect(result.some(row => /koshary/i.test(row.reference.title))).toBe(true);
  });
  it("ignores malformed semantic records while retaining eligible trusted recipes", async () => {
    mock.editors = [{ id: "a".repeat(64), data: { ...editor("a", "bad").data, recipe: { name: "Broken", cuisine: "Egyptian", source_recipe_id: "bad", ingredients: [123], steps: ["Cook"] } } }];
    expect((await findArabicSourceCandidates(["rice"], "Egyptian", vegan, 10)).some(row => /koshary/i.test(row.reference.title))).toBe(true);
  });
  it("rechecks trusted fingerprints and semantic expiry before Arabic publication", async () => {
    const [candidate] = await findArabicSourceCandidates(["rice"], "Egyptian", vegan, 10);
    expect(await arabicSourceIsCurrent(candidate.source!)).toBe(true);
    expect(await arabicSourceIsCurrent({ ...candidate.source!, fingerprint: "changed" })).toBe(false);
    const key = "a".repeat(64), cached = editor(key, candidate.source!.id);
    mock.rows.set(`recipeEditorSemanticCache/${key}`, cached.data);
    const linked = { ...candidate.source!, editorKey: key, editorFingerprint: arabicFingerprint(cached.data.recipe) };
    expect(await arabicSourceIsCurrent(linked)).toBe(true);
    mock.rows.set(`recipeEditorSemanticCache/${key}`, { ...cached.data, expiresAt: { toMillis: () => 0 } });
    expect(await arabicSourceIsCurrent(linked)).toBe(false);
  });
});

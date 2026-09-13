import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "firebase-admin/firestore";
import type { RecipeReferenceDoc } from "@/lib/recipeReferenceTypes";
const mock = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), reads: [] as string[], references: vi.fn() }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({ doc: (path: string) => ({ path, get: async () => { mock.reads.push(path); return { exists: mock.rows.has(path), data: () => mock.rows.get(path) }; } }) }) }));
vi.mock("@/services/recipeReferenceService", () => ({ findRecipeReferencesForGeneration: mock.references }));
vi.mock("@/data/offline/firestoreRecipeReferenceCatalog", () => ({ isDiscoverableRecipeReferenceDoc: (value: { publishStatus?: string }) => value.publishStatus === "ready" }));
import { arabicSourceIsCurrent } from "@/services/arabic/sourceEligibility";
import { findArabicReferenceCandidates, readArabicReferenceSource, referenceFingerprint } from "@/services/arabic/referenceSources";
import { arabicFingerprint } from "@/services/arabic/fingerprint";
const recipe = { name: "Salmon Rice", ingredients: ["200 g salmon", "1 cup rice"] };
const reference = { id: "ref-1", title: "Salmon Rice", cuisine: "Mediterranean", ingredients: recipe.ingredients, directions: ["Bake salmon and cook rice."], publishStatus: "ready", qualityStatus: "approved" } as unknown as RecipeReferenceDoc;
const source = { kind: "reference" as const, id: reference.id, fingerprint: referenceFingerprint(reference) };
beforeEach(() => { mock.rows.clear(); mock.reads = []; vi.clearAllMocks(); mock.rows.set("recipeReferenceRecipes/ref-1", reference as unknown as Record<string, unknown>); });
describe("Arabic derivatives recheck read-only English sources", () => {
  it("checks publication and source contents without write-capable cache helpers", async () => {
    expect(await arabicSourceIsCurrent(source)).toBe(true);
    mock.rows.set("recipeReferenceRecipes/ref-1", { ...reference, directions: ["Changed preparation"] });
    expect(await arabicSourceIsCurrent(source)).toBe(false);
    mock.rows.set("recipeReferenceRecipes/ref-1", { ...reference, publishStatus: "needs_review" });
    expect(await arabicSourceIsCurrent(source)).toBe(false);
    mock.rows.clear(); expect(await arabicSourceIsCurrent(source)).toBe(false);
    expect(await readArabicReferenceSource("../bad")).toBeNull();
  });
  it.each([
    { cacheVersion: "old", expiresAt: { toMillis: () => Date.now() + 60000 }, recipe },
    { cacheVersion: "recipe-editor-v11-validation-identity-v1", expiresAt: { toMillis: () => 0 }, recipe },
    { cacheVersion: "recipe-editor-v11-validation-identity-v1", expiresAt: Date.now() + 60000, recipe },
    { cacheVersion: "recipe-editor-v11-validation-identity-v1", expiresAt: { toMillis: () => Date.now() + 60000 }, recipe: { name: "Changed" } }
  ])("invalidates only a derivative when its editor source is stale or changed", async cache => {
    const editorKey = "a".repeat(64); mock.rows.set(`recipeEditorSemanticCache/${editorKey}`, cache);
    expect(await arabicSourceIsCurrent({ ...source, editorKey, editorFingerprint: arabicFingerprint(recipe) })).toBe(false);
  });
  it("rechecks reference and editor snapshots inside the publication transaction", async () => {
    const editorKey = "a".repeat(64);
    mock.rows.set(`recipeEditorSemanticCache/${editorKey}`, { cacheVersion: "recipe-editor-v11-validation-identity-v1", expiresAt: { toMillis: () => Date.now() + 60000 }, recipe });
    const reads: string[] = [];
    const transaction = { get: async (ref: { path: string }) => { reads.push(ref.path); return { exists: mock.rows.has(ref.path), data: () => mock.rows.get(ref.path) }; } } as unknown as Transaction;
    expect(await arabicSourceIsCurrent({ ...source, editorKey, editorFingerprint: arabicFingerprint(recipe) }, transaction)).toBe(true);
    expect(reads).toEqual(["recipeReferenceRecipes/ref-1", `recipeEditorSemanticCache/${editorKey}`]);
    expect(await arabicSourceIsCurrent({ ...source, editorKey: "../unsafe" })).toBe(false);
  });
  it("retrieves eligible references without creating English editor-cache misses", async () => {
    mock.references.mockResolvedValue([{ id: "ref-1", title: reference.title, cuisine: reference.cuisine, ingredients: reference.ingredients, steps: reference.directions, matchedIngredients: ["rice"] }, { id: "missing" }]);
    const candidates = await findArabicReferenceCandidates(["rice"], "Mediterranean", { diets: [], conditions: [], allergens: [] }, 3);
    expect(candidates).toHaveLength(1); expect(candidates[0].edited).toBeNull(); expect(candidates[0].fingerprint).toBe(source.fingerprint);
    expect(mock.reads.some(path => path.startsWith("recipeEditorSemanticCache/"))).toBe(true);
  });
});

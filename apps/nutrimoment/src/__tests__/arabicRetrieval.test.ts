import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ rows: new Map<string, unknown>(), reads: [] as string[], writes: [] as string[] }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ get: async () => { db.reads.push(path); return { exists: db.rows.has(path), data: () => db.rows.get(path) }; }, set: (value: unknown) => { db.writes.push(path); if (!path.startsWith("ingredientResolutionsArabicV1/")) throw new Error("English write forbidden"); db.rows.set(path, value); } })
}) }));
import { readEnglishEditorForArabic, arabicVariantKey } from "@/services/arabic/referenceSources";
import { buildRecipeEditorCacheKey } from "@/services/recipeEditorSemanticCache";
import { assertArabicWritePath, arabicPaths } from "@/services/arabic/repository";
import { resolveArabicIngredients } from "@/services/arabic/ingredientResolution";
import { findArabicFood } from "@/services/arabic/foodCatalog";
const source = { id: "reference-1", title: "Salmon Rice", cuisine: "Mediterranean", ingredients: ["200 g salmon", "1 cup rice"], steps: ["Cook salmon and rice."], matchedIngredients: ["rice"] };
const input = { sourceRecipe: source, recipeLanguage: "English", preferredCuisine: "Mediterranean", availableIngredients: [{ name: "rice" }], diets: ["pescatarian"], conditions: [], allergens: [], excludedIngredients: [] };
beforeEach(() => { db.rows.clear(); db.reads = []; db.writes = []; });
describe("Arabic read-only reference adapters and resolution", () => {
  it("reads a current English editor cache without warming or writing its cache", async () => {
    const key = buildRecipeEditorCacheKey(input);
    db.rows.set(`recipeEditorSemanticCache/${key}`, { cacheVersion: "recipe-editor-v11-validation-identity-v1", expiresAt: { toMillis: () => Date.now() + 60000 }, recipe: { name: "Salmon Rice" } });
    expect((await readEnglishEditorForArabic(input))?.recipe.name).toBe("Salmon Rice");
    expect(db.reads).toEqual([`recipeEditorSemanticCache/${key}`]);
    expect(db.writes).toEqual([]);
    db.rows.delete(`recipeEditorSemanticCache/${key}`);
    expect(await readEnglishEditorForArabic(input)).toBeNull();
  });
  it("rejects expired editor data and keys Arabic variants by pantry, source and restrictions", async () => {
    db.rows.set(`recipeEditorSemanticCache/${buildRecipeEditorCacheKey(input)}`, { cacheVersion: "old", expiresAt: { toMillis: () => 1 }, recipe: {} });
    expect(await readEnglishEditorForArabic(input)).toBeNull();
    const key = arabicVariantKey("source-fingerprint", input);
    expect(key).not.toBe(arabicVariantKey("source-changed", input));
    expect(key).not.toBe(arabicVariantKey("source-fingerprint", { ...input, diets: ["vegan"] }));
    expect(key).not.toBe(arabicVariantKey("source-fingerprint", { ...input, availableIngredients: [{ name: "fish" }] }));
    expect(() => assertArabicWritePath(arabicPaths.variant(key))).not.toThrow();
    expect(() => assertArabicWritePath(`recipeEditorSemanticCache/${key}`)).toThrow();
  });
  it("uses no AI for a zero-credit request and never resolves ambiguous shawarma", async () => {
    const model = vi.fn();
    const result = await resolveArabicIngredients(["Ground beed", "شاورما"], { allowAi: false, deadline: Date.now() + 10000, requestId: "test", model });
    expect(model).not.toHaveBeenCalled();
    expect(result.unclear.length).toBeGreaterThan(0);
    expect(result.unclear.some(item => item.text === "شاورما")).toBe(true);
    expect(db.writes).toEqual([]);
  });
  it("rejects an invented model food ID instead of learning a global alias", async () => {
    const model = vi.fn().mockResolvedValue({ resolutions: [{ index: 0, foodId: "invented", confidence: 1 }] });
    const result = await resolveArabicIngredients(["Ground beed"], { allowAi: true, deadline: Date.now() + 15000, requestId: "test", model });
    expect(model).toHaveBeenCalledTimes(1);
    expect(result.unclear).toHaveLength(1);
    expect(db.writes).toEqual([]);
  });
  it("saves a high-confidence resolution only in Arabic and reuses it without credits", async () => {
    const foodId = findArabicFood("ground beef")!.id;
    const model = vi.fn().mockResolvedValue({ resolutions: [{ index: 0, foodId, confidence: 0.99 }] });
    const options = { allowAi: true, deadline: Date.now() + 15000, requestId: "test", model };
    expect((await resolveArabicIngredients(["Ground beed"], options)).unclear).toEqual([]);
    expect(db.writes).toHaveLength(1); expect(() => assertArabicWritePath(db.writes[0])).not.toThrow();
    const cached = await resolveArabicIngredients(["Ground beed"], { ...options, allowAi: false });
    expect(cached.unclear).toEqual([]); expect(model).toHaveBeenCalledTimes(1);
  });
  it.each([0.97, 0, -1])("does not persist uncertain or invalid confidence %s", async confidence => {
    const model = vi.fn().mockResolvedValue({ resolutions: [{ index: 0, foodId: findArabicFood("ground beef")!.id, confidence }] });
    const result = await resolveArabicIngredients(["Ground beed"], { allowAi: true, deadline: Date.now() + 15000, requestId: "test", model });
    expect(result.unclear).toHaveLength(1); expect(db.writes).toEqual([]);
  });
});

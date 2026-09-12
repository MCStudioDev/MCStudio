import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonical } from "./fixtures/arabic";
const model = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openai", () => ({ callOpenAIText: model, extractJson: (value: string) => value }));
import { callArabicModel, translateArabicSource, generateArabicRecipes } from "@/services/arabic/gemini";
import { arabicGenerationSchema, arabicRepairSchema, arabicTranslationSchema } from "@/services/arabic/modelSchemas";
beforeEach(() => { vi.clearAllMocks(); model.mockResolvedValue('{"recipe":{}}'); });
describe("Arabic Gemini orchestration", () => {
  it("keeps nested serving constraints out of all Gemini schemas", () => {
    // Captured Gemini 400: nested array/numeric bounds produce too many states.
    // Structural fields remain required; semantic bounds are validated locally.
    for (const schema of [arabicGenerationSchema(10), arabicGenerationSchema(21), arabicTranslationSchema, arabicRepairSchema]) {
      expect(JSON.stringify(schema)).not.toMatch(/"(?:minItems|maxItems|minimum|maximum)":/);
    }
  });
  it("coalesces concurrent translations without an English cache", async () => {
    const deadline = Date.now() + 10_000;
    const [first, second] = await Promise.all([translateArabicSource("same", canonical, deadline, "r1"), translateArabicSource("same", canonical, deadline, "r2")]);
    expect(first).toEqual(second); expect(model).toHaveBeenCalledTimes(1);
    await translateArabicSource("same", canonical, deadline, "r3");
    expect(model).toHaveBeenCalledTimes(2);
  });
  it("bounds transport attempts and preserves stable JSON keys", async () => {
    await generateArabicRecipes({ ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 1, cuisine: "Any", calorieTarget: 1650, missingLimit: 2 }, Date.now() + 10_000, "r");
    expect(model.mock.calls[0][0]).toContain("Modern Standard Arabic");
    expect(model.mock.calls[0][3]).toMatchObject({ maxAttempts: 1, responseMimeType: "application/json" });
  });
  it("does not call Gemini after its deadline", async () => {
    await expect(callArabicModel("test", Date.now(), "r", "repair")).rejects.toThrow("DEADLINE");
    expect(model).not.toHaveBeenCalled();
  });
  it("constrains generated ingredient quantities in both representations", async () => {
    await generateArabicRecipes({ ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 1, cuisine: "Any", calorieTarget: 1650, missingLimit: 2 }, Date.now() + 10_000, "r");
    const schema = model.mock.calls[0][3].responseJsonSchema;
    expect(schema).toBeDefined();
    const pair = schema.properties.recipes.items.properties;
    for (const recipe of [pair.canonical, pair.recipe]) {
      const ingredient = recipe.properties.ingredients.items;
      expect(ingredient.required).toEqual(["name", "quantity", "unit"]);
      expect(ingredient.properties.quantity).toMatchObject({ type: "number" });
    }
    expect(pair.canonical.properties.ingredients.items.properties.unit.enum).toContain("tsp");
    expect(pair.recipe.properties.ingredients.items.properties.unit.enum).toContain("ملعقة صغيرة");
  });
  it("renders structured quantities without inventing or converting measures", async () => {
    model.mockResolvedValue(JSON.stringify({ recipes: [{
      canonical: { ingredients: [{ name: "salt", quantity: 0.25, unit: "tsp" }] },
      recipe: { ingredients: [{ name: "ملح", quantity: 0.25, unit: "ملعقة صغيرة" }] }
    }] }));
    const result = await generateArabicRecipes({ ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 1, cuisine: "Any", calorieTarget: 1650, missingLimit: 2 }, Date.now() + 10_000, "r");
    expect(result).toEqual({ recipes: [{ canonical: { ingredients: ["0.25 tsp salt"] }, recipe: { ingredients: ["0.25 ملعقة صغيرة ملح"] } }] });
  });
  it("preserves valid pairs for partial results when another ingredient is malformed", async () => {
    model.mockResolvedValue(JSON.stringify({ recipes: [
      { canonical: { ingredients: [{ name: "salt", quantity: 0.25, unit: "tsp" }] }, recipe: {} },
      { canonical: { ingredients: [{ name: "water", unit: "cup" }] }, recipe: null }
    ] }));
    const result = await generateArabicRecipes({ ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 2, cuisine: "Any", calorieTarget: 1650, missingLimit: 2 }, Date.now() + 10_000, "r") as { recipes: Array<{ canonical: { ingredients: unknown[] } }> };
    expect(result.recipes[0].canonical.ingredients).toEqual(["0.25 tsp salt"]);
    expect(result.recipes[1].canonical.ingredients[0]).toEqual({ name: "water", unit: "cup" });
  });
  it("rejects malformed JSON and clears failed translation locks", async () => {
    model.mockResolvedValueOnce("invalid json");
    await expect(translateArabicSource("bad", canonical, Date.now() + 10_000, "r")).rejects.toThrow();
    await expect(translateArabicSource("bad", canonical, Date.now() + 10_000, "r")).resolves.toEqual({ recipe: {} });
  });
});

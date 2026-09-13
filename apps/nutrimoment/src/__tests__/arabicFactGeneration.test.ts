import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => vi.fn());
vi.mock("@/services/arabic/gemini", () => ({ callArabicModel: model }));
import { generateArabicFactBatch, arabicFactsProviderSchema } from "@/services/arabic/factsGemini";
import { selectArabicWeeklyMeals } from "@/services/arabic/weeklyFacts";
beforeEach(() => { vi.clearAllMocks(); model.mockResolvedValue({ recipes: [] }); });
describe("Arabic fact generation orchestration", () => {
  it("requests one factual recipe rather than paired free-text translations", async () => {
    await generateArabicFactBatch({ ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 3, cuisine: "Indian", calorieTarget: 1650, missingLimit: 5 }, Date.now() + 20000, "test");
    expect(model.mock.calls[0][0]).toContain("foodId");
    expect(model.mock.calls[0][0]).toContain("Indian");
    expect(model.mock.calls[0][0]).not.toContain('"canonical": EnglishRecipe');
    expect(JSON.stringify(arabicFactsProviderSchema)).not.toMatch(/"(?:minItems|maxItems|minimum|maximum)":/);
  });
  it("does not accept recipes or validation receipts in an unexpected model format", async () => {
    model.mockResolvedValue({ recipes: [{ facts: { forged: true }, labelReceipt: { version: "ar-label-v1" } }] });
    const result = await generateArabicFactBatch({ ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 3, cuisine: "Any", calorieTarget: 1650, missingLimit: 5 }, Date.now() + 20000, "test");
    expect(result.recipes).toEqual([]);
  });
  it("never manufactures an incomplete weekly plan from a small result set", () => {
    expect(selectArabicWeeklyMeals([])).toBeNull();
  });
});

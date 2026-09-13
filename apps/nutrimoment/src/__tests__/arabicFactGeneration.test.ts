import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => vi.fn());
vi.mock("@/services/arabic/gemini", () => ({ callArabicModel: model }));
import { generateArabicFactBatch, arabicFactsProviderSchema } from "@/services/arabic/factsGemini";
import { selectArabicWeeklyMeals } from "@/services/arabic/weeklyFacts";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
beforeEach(() => { vi.clearAllMocks(); model.mockResolvedValue({ recipes: [] }); });
describe("Arabic fact generation orchestration", () => {
  it("checks a small ingredient manifest before paying for full recipe instructions", async () => {
    const facts = weeklyFactFixtures()[0];
    model.mockResolvedValueOnce({ plans: [{ name: facts.name, dishFamily: facts.dishFamily, foodIds: facts.ingredients.map(item => item.foodId), mealTypes: facts.mealTypes }] });
    const result = await generateArabicFactBatch({ ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 1, cuisine: "Mediterranean", calorieTarget: 1650, missingLimit: 0 }, Date.now() + 30000, "test");
    expect(result.recipes).toEqual([]);
    expect(model).toHaveBeenCalledTimes(1);
    expect(model.mock.calls[0][3]).toBe("arabic_facts_planning");
  });
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

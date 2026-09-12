import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonical } from "./fixtures/arabic";
const model = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openai", () => ({ callOpenAIText: model, extractJson: (value: string) => value }));
import { callArabicModel, translateArabicSource, generateArabicRecipes } from "@/services/arabic/gemini";
beforeEach(() => { vi.clearAllMocks(); model.mockResolvedValue('{"recipe":{}}'); });
describe("Arabic Gemini orchestration", () => {
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
  it("rejects malformed JSON and clears failed translation locks", async () => {
    model.mockResolvedValueOnce("invalid json");
    await expect(translateArabicSource("bad", canonical, Date.now() + 10_000, "r")).rejects.toThrow();
    await expect(translateArabicSource("bad", canonical, Date.now() + 10_000, "r")).resolves.toEqual({ recipe: {} });
  });
});

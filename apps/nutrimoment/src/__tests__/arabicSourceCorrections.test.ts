import { beforeEach, describe, expect, it, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
vi.mock("@/services/arabic/factsGemini", () => ({ generateArabicFactBatch: generate }));
import { generateArabicSourceBatch } from "@/services/arabic/sourceCorrections";
const input = { ingredients: ["rice"], cuisine: "Egyptian", restrictions: { diets: ["vegan"], allergens: [], conditions: [] }, count: 3, calorieTarget: 1650, missingLimit: 5 };
beforeEach(() => { generate.mockReset(); });
describe("Arabic source correction concurrency", () => {
  it("shares one in-flight correction for identical requests", async () => {
    let resolve!: (value: { recipes: never[] }) => void;
    generate.mockImplementation(() => new Promise(done => { resolve = done; }));
    const one = generateArabicSourceBatch(input, Date.now() + 30000, "one");
    const two = generateArabicSourceBatch(input, Date.now() + 30000, "two");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].sourceOnly).toBe(true);
    resolve({ recipes: [] });
    expect(await one).toEqual(await two);
  });
  it("never shares a correction across different restrictions", async () => {
    generate.mockResolvedValue({ recipes: [] });
    await Promise.all([generateArabicSourceBatch(input, Date.now() + 30000, "one"),
      generateArabicSourceBatch({ ...input, restrictions: { ...input.restrictions, allergens: ["soy"] } }, Date.now() + 30000, "two")]);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("removes a failed in-flight request so a later request can recover", async () => {
    generate.mockRejectedValueOnce(new Error("provider failed")).mockResolvedValue({ recipes: [] });
    await expect(generateArabicSourceBatch(input, Date.now() + 30000, "one")).rejects.toThrow("provider failed");
    await expect(generateArabicSourceBatch(input, Date.now() + 30000, "two")).resolves.toEqual({ recipes: [] });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

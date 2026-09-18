import { beforeEach, describe, expect, it, vi } from "vitest";
const guidance = vi.hoisted(() => vi.fn());
vi.mock("@/services/arabic/cuisineGuidance", () => ({ buildArabicCuisineGuidance: guidance }));
import { selectArabicDishCandidates } from "@/services/arabic/dishCandidates";
import { boundedArabicDiagnostics } from "@/services/arabic/generationDiagnostics";
const input = { ingredients: ["rice", "fava beans"], restrictions: { diets: ["vegan"], allergens: [], conditions: [] }, count: 1, cuisine: "Egyptian", calorieTarget: 1650, missingLimit: "unlimited" as const };
const dish = (name: string, ingredients: string[], nativeName = name, mealTypes = ["breakfast", "lunch", "dinner"]) => ({ name, nativeName, description: name, essentialIngredients: ingredients, availableIngredients: ingredients, mealTypes });
beforeEach(() => guidance.mockReset());
describe("server-selected Arabic dish candidates", () => {
  it("keeps a dedicated discovery batch free of catalog candidates", async () => {
    guidance.mockResolvedValue([dish("Already planned dish", ["rice"])]);
    const result = await selectArabicDishCandidates({ ...input, count: 3, discoveryOnly: true });
    expect(result).toHaveLength(3);
    expect(result.every(item => item.kind === "discovery" && !item.title)).toBe(true);
  });
  it("assigns compatible distinct dishes and discovery slots to parallel weekly meal batches", async () => {
    guidance.mockResolvedValue([
      dish("Breakfast", ["fava beans"], "Breakfast", ["breakfast"]),
      dish("Lunch", ["rice"], "Lunch", ["lunch"]),
      dish("Dinner", ["tomato"], "Dinner", ["dinner"]),
      dish("Flexible", ["rice", "tomato"])
    ]);
    const results = await Promise.all(["breakfast", "lunch", "dinner"].map(type =>
      selectArabicDishCandidates({ ...input, count: 3, mealTypesNeeded: [type], variationSeed: "week" })));
    expect(results.map(items => items[0].title)).toEqual(["Breakfast", "Lunch", "Dinner"]);
    const ids = results.flatMap(items => items.map(item => item.candidateId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(results.every(items => items.length >= 3)).toBe(true);
  });
  it("deduplicates alternate English spellings through the shared native name", async () => {
    guidance.mockResolvedValue([dish("Foul Bil Tahina", ["fava beans"], "فول بالطحينة"), dish("Ful Bel Tahina", ["fava beans", "tahini"], "فول بالطحينة"), dish("Taameya", ["fava beans", "onion"], "طعمية")]);
    const result = await selectArabicDishCandidates(input);
    expect(result.filter(item => item.nativeName === "فول بالطحينة")).toHaveLength(1);
    expect(result.some(item => item.title === "Taameya")).toBe(true);
  });
  it("gives different ingredient families a slot before repeated rice variants", async () => {
    guidance.mockResolvedValue([dish("Rice A", ["rice", "tomato"]), dish("Rice B", ["tomato", "rice"]), dish("Rice C", ["rice", "tomato"]), dish("Taameya", ["fava beans", "onion"]), dish("Koshary", ["rice", "lentils"])]);
    expect((await selectArabicDishCandidates(input)).map(item => item.title)).toEqual(["Rice A", "Taameya", "Koshary"]);
  });
  it("keeps IDs stable after filtering and never selects recently shown Arabic names", async () => {
    guidance.mockResolvedValue([dish("Taameya", ["fava beans"], "طعمية"), dish("Koshary", ["rice", "lentils"], "كشري")]);
    const first = await selectArabicDishCandidates(input);
    const next = await selectArabicDishCandidates({ ...input, excludeNames: ["طعمية"] });
    expect(next.map(item => item.title)).not.toContain("Taameya");
    expect(next[0].candidateId).toBe(first[1].candidateId);
  });
  it("deduplicates source dishes and never mixes them with cuisine guidance", async () => {
    const source = { reference: { id: "s1", title: "Koshary", ingredients: [], steps: [], matchedIngredients: [] }, fingerprint: "f", variantKey: "v" };
    expect(await selectArabicDishCandidates({ ...input, count: 7, sourceOnly: true, references: [source, { ...source, reference: { ...source.reference, id: "s2" } }] })).toHaveLength(1);
    expect(guidance).not.toHaveBeenCalled();
  });
  it("supports uncatalogued/Any cuisines through bounded server-issued discovery slots", async () => {
    guidance.mockResolvedValue([]);
    const result = await selectArabicDishCandidates({ ...input, cuisine: "Any", count: 3 });
    expect(result).toHaveLength(3);
    expect(new Set(result.map(item => item.candidateId)).size).toBe(3);
    expect(result.every(item => item.kind === "discovery")).toBe(true);
  });
  it("bounds stored diagnostics and strips detailed validation payloads", () => {
    const result = boundedArabicDiagnostics(Array.from({ length: 200 }, () => ({ candidateId: "untrusted/path", name: "طعمية\u0001", stage: "validation", status: "rejected", issues: ["canonical:unsafe:private ingredient text", "incorrect_cooking_sequence:raw output"] } as const)).map(item => ({ ...item, issues: [...item.issues] })));
    expect(result).toHaveLength(150);
    expect(result[0]).toEqual({ name: "طعمية", stage: "validation", status: "rejected", issues: ["canonical:unsafe", "incorrect_cooking_sequence"] });
  });
});

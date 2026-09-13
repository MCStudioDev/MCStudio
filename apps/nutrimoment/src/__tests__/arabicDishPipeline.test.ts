import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ model: vi.fn(), guidance: vi.fn() }));
vi.mock("@/services/arabic/gemini", () => ({ callArabicModel: mocks.model }));
vi.mock("@/services/arabic/cuisineGuidance", () => ({ buildArabicCuisineGuidance: mocks.guidance }));
import { generateArabicFactBatch } from "@/services/arabic/factsGemini";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
import { findArabicFood } from "@/services/arabic/foodCatalog";

const input = { ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 2, cuisine: "Mediterranean", calorieTarget: 1650, missingLimit: "unlimited" as const };
const fixtures = () => [weeklyFactFixtures()[0], weeklyFactFixtures()[7]];
const payload = (prompt: string) => prompt.includes("INPUT_JSON\n") ? JSON.parse(prompt.split("INPUT_JSON\n")[1]) : { candidates: [], plans: [], culinaryChecks: [], repairs: [] };
type Candidate = { candidateId: string; title?: string };
const state = { ids: [] as string[] };
function useProvider(options: { reorder?: boolean; omitFirst?: boolean; badSequence?: boolean; duplicate?: boolean; repairFails?: boolean; wrongId?: boolean } = {}) {
  mocks.model.mockImplementation(async (prompt: string, _deadline: number, _requestId: string, stage: string) => {
    const data = payload(prompt);
    if (stage === "arabic_facts_planning") {
      state.ids = data.candidates.map((item: Candidate) => item.candidateId);
      return { plans: data.candidates.slice(0, 2).map((item: Candidate, index: number) => {
        const facts = fixtures()[index];
        return { candidateId: item.candidateId, name: facts.name, dishFamily: facts.dishFamily, foodIds: facts.ingredients.map(i => i.foodId), mealTypes: facts.mealTypes };
      }) };
    }
    if (stage === "arabic_facts_generation") {
      let recipes = data.plans.slice(0, 2).map((plan: Candidate, index: number) => ({ candidateId: plan.candidateId, facts: fixtures()[index] }));
      if (options.reorder) recipes.reverse();
      if (options.omitFirst) recipes = recipes.filter(item => item.candidateId !== state.ids[0]);
      if (options.duplicate) recipes.push(recipes[0]);
      if (options.wrongId) recipes[0] = { ...recipes[0], candidateId: "unissued-id" };
      return { recipes };
    }
    if (stage === "arabic_facts_verification") return {
      labels: [], recipes: [], sources: [],
      culinary: data.culinaryChecks.map((item: Candidate) => ({ candidateId: item.candidateId,
        valid: !(options.badSequence && item.candidateId === state.ids[0]),
        issues: options.badSequence && item.candidateId === state.ids[0] ? ["incorrect_cooking_sequence"] : [] }))
    };
    if (stage === "arabic_facts_repair") {
      if (options.repairFails) throw new Error("repair offline");
      return { repairs: data.repairs.map((item: Candidate) => ({ candidateId: item.candidateId, steps: fixtures()[0].steps, totalMinutes: fixtures()[0].totalMinutes })) };
    }
    throw new Error(`Unexpected stage ${stage}`);
  });
}
beforeEach(() => { mocks.model.mockReset(); mocks.guidance.mockReset(); mocks.guidance.mockResolvedValue([]); state.ids = []; });
describe("Arabic dish ownership and independent validation", () => {
  it("cannot rename a different ingredient manifest after dropping catalog structural ingredients", async () => {
    mocks.guidance.mockResolvedValue([{ name: "Chicken rice", nativeName: "أرز بالدجاج", essentialIngredients: ["chicken", "rice"], availableIngredients: ["rice"] }]);
    useProvider();
    const result = await generateArabicFactBatch({ ...input, count: 1 }, Date.now() + 65000, "identity");
    expect(result.recipes).toEqual([]);
    expect(result.diagnostics.some(item => item.issues.includes("dish_ingredients_changed"))).toBe(true);
  });
  it("keeps identities and ingredients attached when Gemini reorders recipes", async () => {
    useProvider({ reorder: true });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "reorder");
    expect(result.recipes.map(item => item.facts.name), JSON.stringify(result.diagnostics)).toEqual(fixtures().map(item => item.name).reverse());
    expect(result.recipes[0].facts.ingredients).toEqual(fixtures()[1].ingredients);
  });
  it("keeps the successful dish when another is omitted and records its identity", async () => {
    useProvider({ omitFirst: true });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "omitted");
    expect(result.recipes.map(item => item.facts.name)).toEqual([fixtures()[1].name]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ candidateId: state.ids[0], stage: "generation", issues: ["dish_omitted"] })]));
  });
  it("rejects duplicated or unissued IDs without renaming a different recipe", async () => {
    useProvider({ wrongId: true, duplicate: true });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "wrong-id");
    expect(result.diagnostics.some(item => item.issues.includes("unknown_candidate_id"))).toBe(true);
    expect(result.recipes.filter(item => item.facts.name === fixtures()[1].name)).toHaveLength(1);
  });
  it("uses only the assigned source in correction prompts, with no cuisine suggestions", async () => {
    useProvider();
    const facts = fixtures()[0];
    const reference = { reference: { id: "koshary-source", title: "Koshary", ingredients: ["rice"], steps: [], matchedIngredients: ["rice"], cuisine: "Egyptian" },
      fingerprint: "source-fingerprint", variantKey: "v", requiredFoodIds: facts.ingredients.map(item => item.foodId) };
    await generateArabicFactBatch({ ...input, count: 7, sourceOnly: true, references: [reference] }, Date.now() + 65000, "source");
    expect(mocks.guidance).not.toHaveBeenCalled();
    const data = payload(mocks.model.mock.calls[0][0]);
    expect(data.candidates).toHaveLength(1);
    expect(data).not.toHaveProperty("cuisineDishes");
    expect(mocks.model.mock.calls[0][0]).not.toContain("Select 9");
  });
  it("requires independent cooking-sequence verification and repairs only the rejected dish once", async () => {
    useProvider({ badSequence: true });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "sequence");
    const repairs = mocks.model.mock.calls.filter(call => call[3] === "arabic_facts_repair");
    expect(repairs).toHaveLength(1);
    expect(payload(repairs[0][0]).repairs.map((item: Candidate) => item.candidateId)).toEqual([state.ids[0]]);
    // The independent reviewer still rejects the repair; the other dish survives.
    expect(result.recipes.map(item => item.facts.name)).toEqual([fixtures()[1].name]);
    expect(result.diagnostics.some(item => item.candidateId === state.ids[0] && item.issues.includes("incorrect_cooking_sequence"))).toBe(true);
  });
  it("does not lose already verified recipes if a repair fails", async () => {
    useProvider({ badSequence: true, repairFails: true });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "repair-failure");
    expect(result.recipes.map(item => item.facts.name)).toEqual([fixtures()[1].name]);
  });
  it("fails closed without independent culinary verification", async () => {
    useProvider();
    const original = mocks.model.getMockImplementation()!;
    mocks.model.mockImplementation((...args) => args[3] === "arabic_facts_verification" ? Promise.resolve({ labels: [], culinary: [] }) : original(...args));
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "unverified");
    expect(result.recipes).toEqual([]);
    expect(result.diagnostics.some(item => item.issues.includes("culinary_unverified"))).toBe(true);
  });
  it("does not allow the manifest to introduce chicken for a pescatarian", async () => {
    useProvider();
    const original = mocks.model.getMockImplementation()!;
    mocks.model.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[3] === "arabic_facts_planning" && result.plans[0]) result.plans[0].foodIds.push(findArabicFood("chicken")!.id);
      return result;
    });
    const result = await generateArabicFactBatch({ ...input, restrictions: { ...input.restrictions, diets: ["pescatarian"] } }, Date.now() + 65000, "diet");
    expect(result.diagnostics.some(item => item.issues.includes("ingredient_not_allowed"))).toBe(true);
  });
});

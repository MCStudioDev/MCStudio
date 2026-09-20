import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ model: vi.fn(), guidance: vi.fn() }));
vi.mock("@/services/arabic/gemini", () => ({ callArabicModel: mocks.model }));
vi.mock("@/services/arabic/cuisineGuidance", () => ({ buildArabicCuisineGuidance: mocks.guidance }));
import { generateArabicFactBatch } from "@/services/arabic/factsGemini";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
import { findArabicFood } from "@/services/arabic/foodCatalog";
import { normalizeArabicInputs } from "@/services/arabic/ingredients";

const input = { ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 2, cuisine: "Mediterranean", calorieTarget: 1650, missingLimit: "unlimited" as const };
const fixtures = () => [weeklyFactFixtures()[0], weeklyFactFixtures()[1]];
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
        return { candidateId: item.candidateId, name: facts.name, dishFamily: facts.dishFamily, foodIds: facts.ingredients.map(i => i.foodId), preparations: facts.steps.map(step => step.action), mealTypes: facts.mealTypes };
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
      return { repairs: data.repairs.map((item: Candidate) => ({ candidateId: item.candidateId, steps: fixtures()[0].steps.map(({ previousSteps, ...step }, index) => ({ ...step, stepId: `s${index + 1}`, previousStepIds: (previousSteps ?? []).map(value => `s${value}`) })), totalMinutes: fixtures()[0].totalMinutes })) };
    }
    throw new Error(`Unexpected stage ${stage}`);
  });
}
beforeEach(() => { mocks.model.mockReset(); mocks.guidance.mockReset(); mocks.guidance.mockResolvedValue([]); state.ids = []; });
describe("Arabic dish ownership and independent validation", () => {
  it("constrains weekly discovery to the requested meal slot at the provider boundary", async () => {
    useProvider();
    await generateArabicFactBatch({ ...input, mealTypesNeeded: ["breakfast"], pantryOptional: true }, Date.now() + 65000, "breakfast");
    const call = mocks.model.mock.calls.find(call => call[3] === "arabic_facts_planning")!;
    expect(call[4].properties.plans.items.properties.mealTypes.items.enum).toEqual(["breakfast"]);
  });
  it("plans named dishes and open discovery slots separately without losing either", async () => {
    const first = fixtures()[0];
    mocks.guidance.mockResolvedValue([{ name: first.dishFamily, nativeName: first.name,
      essentialIngredients: ["rice"], availableIngredients: ["rice"] }]);
    useProvider();
    const original = mocks.model.getMockImplementation()!;
    mocks.model.mockImplementation(async (...args) => {
      if (args[3] === "arabic_facts_planning") {
        const candidates = payload(args[0]).candidates;
        // Reproduce the live provider: a mixed prompt silently drops unnamed slots.
        const selected = candidates.some((c: Candidate) => c.title) ? candidates.filter((c: Candidate) => c.title) : candidates;
        return { plans: selected.map((c: Candidate) => {
          const facts = fixtures()[c.title ? 0 : 1];
          return { candidateId: c.candidateId, name: facts.name, dishFamily: facts.dishFamily,
            foodIds: facts.ingredients.map(i => i.foodId), preparations: ["simmer"], mealTypes: facts.mealTypes };
        }) };
      }
      return original(...args);
    });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "mixed-planning");
    expect(result.recipes).toHaveLength(2);
    const requests = mocks.model.mock.calls.filter(call => call[3] === "arabic_facts_planning").map(call => payload(call[0]).candidates);
    expect(requests).toHaveLength(2);
    expect(requests.every(items => items.every((c: Candidate) => !!c.title) || items.every((c: Candidate) => !c.title))).toBe(true);
  });
  it.each(["offline", "malformed"])("preserves named dishes when discovery is %s", async failure => {
    const first = fixtures()[0];
    mocks.guidance.mockResolvedValue([{ name: first.dishFamily, nativeName: first.name,
      essentialIngredients: ["rice"], availableIngredients: ["rice"] }]);
    useProvider();
    const original = mocks.model.getMockImplementation()!;
    mocks.model.mockImplementation(async (...args) => {
      if (args[3] === "arabic_facts_planning" && payload(args[0]).candidates.every((c: Candidate) => !c.title)) {
        if (failure === "offline") throw new Error("provider unavailable");
        return { plans: "invalid" };
      }
      return original(...args);
    });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "partial-planning");
    expect(result.recipes).toHaveLength(1);
    expect(result.diagnostics.filter(item => item.status === "rejected").map(item => item.issues)).toEqual([
      [failure === "offline" ? "planning_unavailable" : "invalid_manifest_response"]
    ]);
  });
  it("shares one name-repair budget across concurrent generation batches", async () => {
    useProvider();
    const original = mocks.model.getMockImplementation()!;
    mocks.model.mockImplementation(async (...args) => {
      if (args[3] === "arabic_facts_name_repair") return { names: payload(args[0]).names.map((item: Candidate, index: number) => ({ candidateId: item.candidateId, name: fixtures()[index].name })) };
      const result = await original(...args);
      if (args[3] === "arabic_facts_planning") result.plans.forEach((plan: any) => { plan.name = "Native Latin title"; });
      return result;
    });
    const nameRepairBudget = { used: false };
    await Promise.all(["a", "b"].map(variationSeed => generateArabicFactBatch({ ...input, variationSeed, nameRepairBudget }, Date.now() + 65000, "shared-budget")));
    expect(mocks.model.mock.calls.filter(call => call[3] === "arabic_facts_name_repair")).toHaveLength(1);
    expect(nameRepairBudget.used).toBe(true);
  });
  it.each([true, false].flatMap(succeeds => ["Native Latin title", "ข้าวผัด", "Рис"].map(name => ({ succeeds, name }))))(
    "repairs only non-Arabic planning titles once: $name, succeeds=$succeeds", async ({ succeeds, name }) => {
    useProvider();
    const original = mocks.model.getMockImplementation()!;
    mocks.model.mockImplementation(async (...args) => {
      if (args[3] === "arabic_facts_name_repair") return { names: payload(args[0]).names.map((item: Candidate, index: number) => ({
        candidateId: item.candidateId, name: succeeds ? fixtures()[index].name : "Still English", foodIds: ["food-chicken"]
      })) };
      const result = await original(...args);
      if (args[3] === "arabic_facts_planning") result.plans.forEach((plan: any) => { plan.name = name; });
      return result;
    });
    const result = await generateArabicFactBatch(input, Date.now() + 65000, "planning-language");
    expect(mocks.model.mock.calls.filter(call => call[3] === "arabic_facts_name_repair")).toHaveLength(1);
    expect(result.recipes).toHaveLength(succeeds ? 2 : 0);
    if (succeeds) expect(result.recipes[0].facts.ingredients).toEqual(fixtures()[0].ingredients);
    else expect(mocks.model.mock.calls.some(call => call[3] === "arabic_facts_generation")).toBe(false);
  });
  it("uses the same exact generic food identity for pantry, catalog requirements and Gemini", async () => {
    mocks.guidance.mockResolvedValue([{ name: "Chicken rice", nativeName: "أرز بالدجاج", essentialIngredients: ["chicken", "rice"], availableIngredients: ["chicken"] }]);
    useProvider();
    const original = mocks.model.getMockImplementation()!;
    mocks.model.mockImplementation(async (...args) => {
      const result = await original(...args);
      // Provider returns the valid generic catalog ID, not a guessed cut.
      return JSON.parse(JSON.stringify(result).replaceAll("food-salmon", "food-chicken").replaceAll("سلمون", "دجاج").replaceAll("salmon", "chicken"));
    });
    const normalized = await normalizeArabicInputs(["دجاج"]);
    const result = await generateArabicFactBatch({ ...input, count: 1, ingredients: normalized.canonical }, Date.now() + 65000, "generic-food");
    expect(result.recipes, JSON.stringify(result.diagnostics)).toHaveLength(1);
    const planning = payload(mocks.model.mock.calls[0][0]);
    expect(planning.ownedFoodIds).toEqual(["food-chicken"]);
    expect(planning.candidates[0].essentialFoodIds).toEqual(["food-chicken", "food-rice"]);
  });
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
    const repairFoodIds = (repairs[0][4] as any).properties.repairs.items.properties.steps.items.properties.foodIds.items.enum;
    expect(repairFoodIds).toEqual(fixtures()[0].ingredients.map(item => item.foodId));
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

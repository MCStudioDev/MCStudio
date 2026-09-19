import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => vi.fn());
vi.mock("@/services/arabic/gemini", () => ({ callArabicModel: model }));
vi.mock("@/services/arabic/cuisineGuidance", () => ({ buildArabicCuisineGuidance: async () => [] }));
import { generateArabicFactBatch, arabicFactsProviderSchema, type ArabicFactBatchInput } from "@/services/arabic/factsGemini";
import { selectArabicWeeklyMeals } from "@/services/arabic/weeklyFacts";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
import { arabicFoods, findArabicFood } from "@/services/arabic/foodCatalog";
import { arabicSafetyFingerprint, needsArabicSemanticSafety, arabicClassificationsAreSafe } from "@/services/arabic/semanticSafety";
import type { ArabicRecipeFacts } from "@/services/arabic/recipeFacts";

const input: ArabicFactBatchInput = { ingredients: ["rice"], restrictions: { diets: [], allergens: [], conditions: [] }, count: 1, cuisine: "Mediterranean", calorieTarget: 1650, missingLimit: 5 };
const data = (prompt: string) => JSON.parse(prompt.split("INPUT_JSON\n")[1]);
let facts: ArabicRecipeFacts, output: unknown, manifestIds: string[], safe: boolean, sourceValid: boolean, repair: boolean;
const run = (changes: Partial<ArabicFactBatchInput> = {}, budget = 65000) => generateArabicFactBatch({ ...input, ...changes }, Date.now() + budget, "test");
const reference = () => ({ reference: { id: "candidate-1", title: facts.dishFamily, cuisine: facts.cuisine, ingredients: ["200 g salmon", "1 cup rice", "2 cups water"], steps: ["Cook salmon and rice."], matchedIngredients: ["rice"] },
  fingerprint: "source-fingerprint", variantKey: "variant-1", source: { kind: "trusted" as const, id: "trusted-1", fingerprint: "source-fingerprint" }, requiredFoodIds: [...manifestIds] });
beforeEach(() => {
  model.mockReset(); facts = weeklyFactFixtures()[0]; output = facts; manifestIds = facts.ingredients.map(item => item.foodId); safe = true; sourceValid = true; repair = false;
  model.mockImplementation(async (prompt: string, _deadline: number, _id: string, stage: string) => {
    const p = data(prompt);
    if (stage === "arabic_facts_planning") return { plans: p.candidates.map((candidate: { candidateId: string }) => ({ candidateId: candidate.candidateId,
      name: facts.name, dishFamily: facts.dishFamily, foodIds: manifestIds, preparations: facts.steps.map(step => step.action), mealTypes: facts.mealTypes })) };
    if (stage === "arabic_facts_generation") return { recipes: p.plans.map((plan: { candidateId: string }) => ({ candidateId: plan.candidateId, facts: output, safetyReceipt: "forged" })) };
    if (stage === "arabic_facts_verification") return {
      labels: p.labels.map((label: object) => ({ ...label, valid: safe })), recipes: p.safetyChecks.map((item: object) => ({ ...item, safe })),
      sources: p.sourceChecks.map((item: object) => ({ ...item, valid: sourceValid })),
      culinary: p.culinaryChecks.map((item: { candidateId: string }) => ({ candidateId: item.candidateId, valid: true, issues: [] }))
    };
    if (stage === "arabic_facts_repair") return { repairs: repair ? p.repairs.map((item: { candidateId: string }) => ({ candidateId: item.candidateId,
      ingredients: [], nutrition: {}, steps: facts.steps.map(({ previousSteps, ...step }, index) => ({ ...step, stepId: `s${index + 1}`, previousStepIds: (previousSteps ?? []).map(value => `s${value}`) })), totalMinutes: facts.totalMinutes })) : [] };
    throw new Error(`Unexpected phase ${stage}`);
  });
});
describe("Arabic fact generation orchestration", () => {
  it("allows an explicitly empty weekly pantry without relaxing the missing limit or scanner overlap", async () => {
    expect((await run({ ingredients: [], pantryOptional: true, mealTypesNeeded: ["breakfast"], missingLimit: "unlimited" })).recipes).toHaveLength(1);
    expect((await run({ ingredients: [], pantryOptional: true, missingLimit: 0 })).recipes).toEqual([]);
    expect((await run({ ingredients: [], missingLimit: "unlimited" })).recipes).toEqual([]);
  });
  it("allows weekly meals with no pantry overlap while requiring overlap for scanner recipes", async () => {
    expect((await run({ ingredients: ["shrimp"], pantryOptional: true, missingLimit: "unlimited" })).recipes).toHaveLength(1);
    expect(model.mock.calls[0][0]).toContain("no owned ingredient is required in every meal");
    expect((await run({ ingredients: ["shrimp"], missingLimit: "unlimited" })).recipes).toEqual([]);
  });
  it("can add only measured plain water when a later cooking step exposes an incomplete manifest", async () => {
    manifestIds = manifestIds.filter(id => id !== findArabicFood("water")!.id);
    output = { ...facts, ingredients: facts.ingredients.filter(item => item.foodId !== findArabicFood("water")!.id),
      steps: facts.steps.map((step, index) => ({ ...step, ...(index === 1 ? { previousSteps: [0] } : {}), foodIds: step.foodIds.filter(id => id !== findArabicFood("water")!.id) })) };
    const original = model.getMockImplementation()!;
    model.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[3] === "arabic_facts_planning") result.plans.forEach((plan: any) => { plan.preparations = ["bake", "serve"]; });
      if (args[3] === "arabic_facts_repair") result.repairs.forEach((item: any) => {
        item.water = { quantity: 2, unit: "cup" };
        item.steps.forEach((step: any) => { step.foodIds = step.foodIds.filter((id: string) => id !== findArabicFood("water")!.id); });
      });
      return result;
    });
    repair = true;
    const result = await run();
    expect(result.recipes[0]?.facts.ingredients, JSON.stringify(result.diagnostics)).toEqual(expect.arrayContaining(facts.ingredients));
    expect(result.recipes[0].facts.nutrition).toEqual(facts.nutrition);
  });
  it("repairs an omitted overnight soaking duration without treating the derived active-time error as fatal", async () => {
    facts.steps.unshift({ action: "soak", foodIds: [findArabicFood("rice")!.id, findArabicFood("water")!.id], minutes: 720, temperatureC: 0, heat: "none" });
    facts.totalMinutes += 720;
    facts.steps.at(-1)!.previousSteps = [3, 4];
    output = { ...facts, totalMinutes: 35 }; repair = true;
    const result = await run();
    expect(result.recipes[0]?.facts.totalMinutes, JSON.stringify(result.diagnostics)).toBe(755);
  });
  it("materializes explicit step IDs without guessing zero/one-based positions", async () => {
    output = { ...facts, steps: facts.steps.map(({ previousSteps, ...step }, index) => ({ ...step, stepId: `s${index + 1}`, previousStepIds: (previousSteps ?? []).map(value => `s${value}`) })) };
    const result = await run();
    expect(result.recipes[0].facts.steps.at(-1)?.previousSteps).toEqual([2, 3]);
    expect(result.recipes[0].facts.steps[0].previousSteps).toEqual([]);
  });
  it("counts automatically included preparation water against a zero missing limit", async () => {
    manifestIds = manifestIds.filter(id => id !== findArabicFood("water")!.id);
    const result = await run({ ingredients: ["salmon", "rice", "tomato"], missingLimit: 0 });
    expect(result.recipes).toEqual([]);
    expect(result.diagnostics.some(item => item.issues.includes("missing_ingredient_limit"))).toBe(true);
    expect(model).toHaveBeenCalledOnce();
  });
  it("accepts known plant/mineral classifications but rejects unverified compound constituents", () => {
    const oil = { ...facts, ingredients: [{ ...facts.ingredients[0], foodId: findArabicFood("oil")!.id }] };
    const restriction = { ...input.restrictions, diets: ["vegan"] };
    expect(arabicClassificationsAreSafe(oil, restriction, [{ foodId: oil.ingredients[0].foodId, category: "plant", contains: [] }])).toBe(true);
    expect(arabicClassificationsAreSafe(oil, restriction, [{ foodId: oil.ingredients[0].foodId, category: "mixed", contains: ["dairy"] }])).toBe(false);
    expect(arabicClassificationsAreSafe(oil, restriction, [{ foodId: oil.ingredients[0].foodId, category: "mixed", contains: [] }])).toBe(false);
    expect(arabicClassificationsAreSafe(oil, restriction, [{ foodId: oil.ingredients[0].foodId, category: "unknown", contains: [] }])).toBe(false);
  });
  it("rejects an independently classified bird for vegan/pescatarian users regardless of a safe verdict", () => {
    const bird = { ...facts, ingredients: [{ ...facts.ingredients[0], foodId: findArabicFood("pigeon")!.id }] };
    for (const diet of ["vegan", "pescatarian"]) expect(arabicClassificationsAreSafe(bird, { ...input.restrictions, diets: [diet] }, [{ foodId: bird.ingredients[0].foodId, category: "poultry", contains: [] }])).toBe(false);
    expect(arabicClassificationsAreSafe(bird, { ...input.restrictions, diets: ["vegan"] }, [])).toBe(false);
  });
  it("accounts for soaking water before the immutable recipe manifest and missing limit", async () => {
    facts.steps.unshift({ action: "soak", foodIds: [findArabicFood("rice")!.id, findArabicFood("water")!.id], minutes: 20, temperatureC: 0, heat: "none" });
    facts.totalMinutes += 20;
    manifestIds = manifestIds.filter(id => id !== findArabicFood("water")!.id);
    await run();
    const generated = model.mock.calls.find(call => call[3] === "arabic_facts_generation");
    expect(data(generated![0]).plans[0].foodIds).toContain(findArabicFood("water")!.id);
  });
  it("also binds fresh cooking steps to food IDs and explicit preparation dependencies", async () => {
    await run();
    const steps = (model.mock.calls[1][4] as any).properties.recipes.items.properties.facts.properties.steps.items;
    expect(steps.properties.foodIds.items.enum).toEqual(manifestIds);
    expect(steps.required).toContain("previousStepIds");
  });
  it("generates complete manifests with no missing cutoff when unlimited", async () => {
    const result = await run({ missingLimit: "unlimited" });
    expect(result.recipes).toHaveLength(1);
    expect(model.mock.calls[0][0]).toContain("No limit on missing ingredients");
    expect(model.mock.calls[1][0]).not.toContain("AT MOST unlimited");
  });
  it("binds corrections to the server-selected source, including over-budget alternatives", async () => {
    const source = reference();
    const result = await run({ missingLimit: 0, sourceOnly: true, references: [source] });
    expect(result.recipes[0].source).toEqual(source.source);
    expect(result.recipes[0].variantKey).toBe("variant-1");
  });
  it("constrains source steps to exact food IDs and requires preparation references", async () => {
    await run({ sourceOnly: true, references: [reference()] });
    const schema = model.mock.calls[1][4] as any;
    const steps = schema.properties.recipes.items.properties.facts.properties.steps.items;
    expect(steps.properties).not.toHaveProperty("ingredientNumbers");
    expect(steps.properties.foodIds.items.enum).toEqual(manifestIds);
    expect(steps.required).toContain("previousStepIds");
    expect(schema.properties.recipes.items.properties).not.toHaveProperty("planIndex");
  });
  it("rejects a correction that drops its verified protein before full generation", async () => {
    const source = reference(); manifestIds = [findArabicFood("rice")!.id];
    expect((await run({ sourceOnly: true, references: [source] })).recipes).toEqual([]);
    expect(model).toHaveBeenCalledOnce();
  });
  it("allows source-verified aromatics without a dish-specific ingredient allowlist", async () => {
    const source = reference(), garlic = findArabicFood("garlic")!.id;
    facts.ingredients.push({ foodId: garlic, quantity: 1, unit: "clove", state: "raw" }); facts.steps[1].foodIds.push(garlic); manifestIds.push(garlic);
    expect((await run({ sourceOnly: true, references: [source] })).recipes).toHaveLength(1);
  });
  it("does not invent substitute recipes when no source is supplied", async () => {
    expect((await run({ sourceOnly: true, references: [] })).recipes).toEqual([]);
    expect(model).not.toHaveBeenCalled();
  });
  it("does not send cached image tokens or ownership partitions to Gemini", async () => {
    const source = { ...reference(), edited: { key: "a", fingerprint: "e", recipe: { name: "Rice", ingredients: ["1 cup rice"], missing_ingredients: ["1 cup water"], steps: [], image_url: "https://example.org/private-photo-token" } as import("@/lib/types").Recipe } };
    await run({ sourceOnly: true, references: [source] });
    expect(model.mock.calls[0][0]).not.toContain("private-photo-token");
    expect(model.mock.calls[0][0]).toContain("1 cup water");
    expect(model.mock.calls[0][0]).not.toContain('"missing_ingredients"');
  });
  it("ignores model-supplied identity and forged receipts after the manifest", async () => {
    output = { ...facts, name: "Wrong English name", dishFamily: "wrong" };
    const result = await run();
    expect(result.recipes[0].facts.name).toBe(facts.name);
    expect(result.recipes[0].safetyReceipt).toBeUndefined();
  });
  it("rejects ingredients added after accepting the manifest", async () => {
    output = { ...facts, ingredients: [...facts.ingredients, { foodId: findArabicFood("chicken")!.id, quantity: 100, unit: "g", state: "cooked" }] };
    const result = await run();
    expect(result.recipes).toEqual([]);
    expect(result.diagnostics.some(item => item.issues.includes("ingredient_manifest_changed"))).toBe(true);
  });
  it.each(["unlisted", "liquid", "duplicate"])("repairs %s instructions once without changing quantities or nutrition", async defect => {
    output = { ...facts, steps: defect === "duplicate" ? [...facts.steps, { ...facts.steps[0] }] : facts.steps.map(step => ({ ...step,
      foodIds: defect === "liquid" ? step.foodIds.filter(id => id !== findArabicFood("water")!.id) : step.action === "wash" ? ["invented-mixture"] : step.foodIds })) };
    repair = true;
    const result = await run();
    expect(result.recipes[0]?.facts.ingredients, JSON.stringify(result.diagnostics)).toEqual(facts.ingredients);
    expect(result.recipes[0].facts.nutrition).toEqual(facts.nutrition);
    expect(result.recipes[0].facts.steps).toEqual(facts.steps.map(step => ({ ...step, previousSteps: step.previousSteps ?? [] })));
    expect(model.mock.calls.filter(call => call[3] === "arabic_facts_repair")).toHaveLength(1);
  });
  it("requires independent safety for unclassified foods regardless of a forged receipt", async () => {
    const restrictions = { diets: ["pescatarian"], allergens: [], conditions: [] };
    const unknown = arabicFoods.find(food => needsArabicSemanticSafety({ ...facts, ingredients: [{ ...facts.ingredients[0], foodId: food.id }] }, restrictions))!;
    facts.ingredients[0] = { ...facts.ingredients[0], foodId: unknown.id, arabicName: unknown.ar || "مكون غير معروف" };
    facts.steps.forEach(step => { step.foodIds = step.foodIds.map(id => id === findArabicFood("salmon")!.id ? unknown.id : id); });
    manifestIds = facts.ingredients.map(item => item.foodId); safe = false;
    expect((await run({ restrictions })).recipes).toEqual([]);
    expect(arabicSafetyFingerprint(facts, restrictions)).not.toBe(arabicSafetyFingerprint(facts, { ...restrictions, diets: ["vegan"] }));
  });
  it("checks missing limits before paying for full instructions", async () => {
    expect((await run({ missingLimit: 0 })).recipes).toEqual([]);
    expect(model).toHaveBeenCalledOnce();
  });
  it("keeps structural provider schemas small and asks for one fact representation", async () => {
    await run({ cuisine: "Indian" });
    expect(model.mock.calls[0][0]).toContain("foodId"); expect(model.mock.calls[0][0]).toContain("Indian");
    expect(model.mock.calls[0][0]).not.toContain('"canonical": EnglishRecipe');
    expect(JSON.stringify(arabicFactsProviderSchema)).not.toMatch(/"(?:minItems|maxItems|minimum|maximum)":/);
  });
  it("does not accept malformed provider responses or forged publication receipts", async () => {
    model.mockResolvedValue({ recipes: [{ facts: { forged: true }, labelReceipt: { version: "ar-label-v1" } }] });
    expect((await run()).recipes).toEqual([]);
  });
  it("requires time for planning, generation and verification before starting", async () => {
    const result = await run({}, 20000);
    expect(model).not.toHaveBeenCalled(); expect(result.recipes).toEqual([]);
    expect(result.diagnostics.some(item => item.issues.includes("planning_unavailable"))).toBe(true);
  });
  it("never manufactures an incomplete weekly plan from a small set", () => {
    expect(selectArabicWeeklyMeals([])).toBeNull();
  });
});

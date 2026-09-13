import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => vi.fn());
vi.mock("@/services/arabic/gemini", () => ({ callArabicModel: model }));
import { generateArabicFactBatch, arabicFactsProviderSchema } from "@/services/arabic/factsGemini";
import { selectArabicWeeklyMeals } from "@/services/arabic/weeklyFacts";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
import { arabicFoods, findArabicFood } from "@/services/arabic/foodCatalog";
import { arabicSafetyFingerprint, needsArabicSemanticSafety } from "@/services/arabic/semanticSafety";
beforeEach(() => { model.mockReset(); model.mockResolvedValue({ recipes: [] }); });
describe("Arabic fact generation orchestration", () => {
  const input = { ingredients: ["rice"], restrictions: { diets: [] as string[], allergens: [] as string[], conditions: [] as string[] }, count: 1, cuisine: "Mediterranean", calorieTarget: 1650, missingLimit: 5 };
  const manifest = (facts: ReturnType<typeof weeklyFactFixtures>[number]) => ({ name: facts.name, dishFamily: facts.dishFamily, foodIds: facts.ingredients.map(item => item.foodId), mealTypes: facts.mealTypes });
  it("binds a correction to its selected trusted source and retains over-budget dishes for suggestions", async () => {
    const facts = weeklyFactFixtures()[0];
    const reference = { reference: { id: "candidate-1", title: facts.dishFamily, cuisine: facts.cuisine, ingredients: ["200 g salmon", "1 cup rice", "1 cup water"], steps: ["Cook the salmon and rice."], matchedIngredients: ["rice"] },
      fingerprint: "source-fingerprint", variantKey: "variant-1", source: { kind: "trusted" as const, id: "trusted-1", fingerprint: "source-fingerprint" }, requiredFoodIds: facts.ingredients.map(item => item.foodId) };
    model.mockResolvedValueOnce({ plans: [{ ...manifest(facts), referenceId: "candidate-1" }] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts }] }).mockResolvedValueOnce({ labels: [], sources: [{ index: 0, valid: true }] });
    const result = await generateArabicFactBatch({ ...input, missingLimit: 0, sourceOnly: true, references: [reference] }, Date.now() + 40000, "test");
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].source).toEqual(reference.source);
    expect(result.recipes[0].variantKey).toBe("variant-1");
  });
  it("uses constrained food IDs in source cooking steps instead of ambiguous ingredient positions", async () => {
    const facts = weeklyFactFixtures()[0];
    const reference = { reference: { id: "candidate-1", title: facts.dishFamily, cuisine: facts.cuisine, ingredients: [], steps: [], matchedIngredients: [] }, fingerprint: "f", variantKey: "v", requiredFoodIds: facts.ingredients.map(item => item.foodId) };
    model.mockResolvedValueOnce({ plans: [{ ...manifest(facts), referenceId: "candidate-1" }] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts }] }).mockResolvedValueOnce({ labels: [], sources: [{ index: 0, valid: true }] });
    await generateArabicFactBatch({ ...input, sourceOnly: true, references: [reference] }, Date.now() + 40000, "test");
    const schema = model.mock.calls[1][4] as { properties: { recipes: { items: { properties: { facts: { properties: { steps: { items: { required: string[]; properties: Record<string, unknown> } } } } } } } } };
    const properties = schema.properties.recipes.items.properties.facts.properties.steps.items.properties;
    expect(properties).not.toHaveProperty("ingredientNumbers");
    expect(properties.foodIds).toMatchObject({ items: { enum: reference.requiredFoodIds } });
    expect(schema.properties.recipes.items.properties.facts.properties.steps.items.required).toContain("previousSteps");
  });
  it("rejects a source correction that drops its verified protein", async () => {
    const facts = weeklyFactFixtures()[0];
    const reference = { reference: { id: "candidate-1", title: facts.dishFamily, cuisine: facts.cuisine, ingredients: [], steps: [], matchedIngredients: [] }, fingerprint: "f", variantKey: "v", requiredFoodIds: [findArabicFood("salmon")!.id] };
    model.mockResolvedValueOnce({ plans: [{ ...manifest(facts), referenceId: "candidate-1", foodIds: [findArabicFood("rice")!.id] }] });
    const result = await generateArabicFactBatch({ ...input, sourceOnly: true, references: [reference] }, Date.now() + 40000, "test");
    expect(result.recipes).toEqual([]);
    expect(model).toHaveBeenCalledTimes(1);
  });
  it("allows source-verified cooking aromatics without a per-dish ingredient allowlist", async () => {
    const facts = weeklyFactFixtures()[0], requiredFoodIds = facts.ingredients.map(item => item.foodId);
    const garlic = findArabicFood("garlic")!.id;
    facts.ingredients.push({ foodId: garlic, quantity: 1, unit: "clove", state: "raw" });
    facts.steps[1].foodIds.push(garlic);
    const reference = { reference: { id: "candidate-1", title: facts.dishFamily, cuisine: facts.cuisine, ingredients: [], steps: [], matchedIngredients: [] }, fingerprint: "f", variantKey: "v", requiredFoodIds };
    model.mockResolvedValueOnce({ plans: [{ ...manifest(facts), referenceId: "candidate-1" }] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts }] }).mockResolvedValueOnce({ labels: [], sources: [{ index: 0, valid: true }] });
    expect((await generateArabicFactBatch({ ...input, sourceOnly: true, references: [reference] }, Date.now() + 40000, "test")).recipes).toHaveLength(1);
  });
  it("rejects corrections with no recognized source instead of silently generating a substitute", async () => {
    const facts = weeklyFactFixtures()[0];
    model.mockResolvedValueOnce({ plans: [manifest(facts)] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts }] });
    expect((await generateArabicFactBatch({ ...input, sourceOnly: true, references: [] }, Date.now() + 40000, "test")).recipes).toEqual([]);
  });
  it("does not send cached image tokens or ingredient ownership to the correction model", async () => {
    const facts = weeklyFactFixtures()[0];
    const reference = { reference: { id: "candidate-1", title: facts.dishFamily, cuisine: facts.cuisine, ingredients: ["1 cup rice"], steps: [], matchedIngredients: ["rice"] }, fingerprint: "f", variantKey: "v",
      edited: { key: "a", fingerprint: "e", recipe: { name: "Rice", ingredients: ["1 cup rice"], missing_ingredients: ["1 cup water"], steps: [], image_url: "https://example.org/private-photo-token" } as import("@/lib/types").Recipe } };
    await generateArabicFactBatch({ ...input, sourceOnly: true, references: [reference] }, Date.now() + 30000, "test");
    expect(model.mock.calls[0][0]).not.toContain("private-photo-token");
    expect(model.mock.calls[0][0]).toContain("1 cup water");
  });
  it("renders a valid manifest and ignores model-supplied identity and receipts", async () => {
    const facts = weeklyFactFixtures()[0];
    model.mockResolvedValueOnce({ plans: [manifest(facts)] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts: { ...facts, name: "Wrong English name", dishFamily: "wrong" }, safetyReceipt: "forged" }] });
    const result = await generateArabicFactBatch(input, Date.now() + 40000, "test");
    expect(result.recipes).toHaveLength(1); expect(result.recipes[0].facts.name).toBe(facts.name); expect(result.recipes[0].safetyReceipt).toBeUndefined();
    expect(model).toHaveBeenCalledTimes(2);
  });
  it("rejects ingredients added after a budget manifest was accepted", async () => {
    const facts = weeklyFactFixtures()[0];
    const added = { ...facts, ingredients: [...facts.ingredients, { foodId: findArabicFood("chicken")!.id, quantity: 100, unit: "g", state: "cooked" }] };
    model.mockResolvedValueOnce({ plans: [manifest(facts)] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts: added }] }).mockResolvedValue({ repairs: [] });
    const result = await generateArabicFactBatch(input, Date.now() + 40000, "test");
    expect(result.recipes).toEqual([]); expect(result.diagnostics.some(item => item.issues.includes("ingredient_manifest_changed"))).toBe(true);
  });
  it("allows one instruction repair while keeping ingredient quantities and nutrition fixed", async () => {
    const facts = weeklyFactFixtures()[0];
    const broken = { ...facts, steps: facts.steps.map(step => ({ ...step, foodIds: step.action === "wash" ? ["invented-mixture"] : step.foodIds })) };
    model.mockResolvedValueOnce({ plans: [manifest(facts)] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts: broken }] })
      .mockResolvedValueOnce({ repairs: [{ index: 0, name: facts.name, dishFamily: facts.dishFamily, ingredients: [], nutrition: {}, steps: facts.steps.map(({ foodIds, ...step }) => ({ ...step, ingredientNumbers: foodIds.map(id => facts.ingredients.findIndex(item => item.foodId === id) + 1) })) }] });
    const result = await generateArabicFactBatch(input, Date.now() + 40000, "test");
    expect(result.recipes[0].facts.ingredients).toEqual(facts.ingredients); expect(result.recipes[0].facts.nutrition).toEqual(facts.nutrition); expect(model).toHaveBeenCalledTimes(3);
  });
  it("repairs missing cooking-liquid references without changing ingredients", async () => {
    const facts = weeklyFactFixtures()[0];
    const broken = { ...facts, steps: facts.steps.map(step => ({ ...step, foodIds: step.foodIds.filter(id => id !== findArabicFood("water")!.id) })) };
    model.mockResolvedValueOnce({ plans: [manifest(facts)] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts: broken }] })
      .mockResolvedValueOnce({ repairs: [{ index: 0, name: facts.name, dishFamily: facts.dishFamily, steps: facts.steps.map(({ foodIds, ...step }) => ({ ...step, ingredientNumbers: foodIds.map(id => facts.ingredients.findIndex(item => item.foodId === id) + 1) })) }] });
    const result = await generateArabicFactBatch(input, Date.now() + 40000, "test");
    expect(result.recipes).toHaveLength(1);
    expect(model.mock.calls[2][0]).toContain("missing_cooking_liquid");
  });
  it("identifies the exact repeated steps for the single bounded repair", async () => {
    const facts = weeklyFactFixtures()[0];
    const broken = { ...facts, steps: [...facts.steps, { ...facts.steps[0] }] };
    model.mockResolvedValueOnce({ plans: [manifest(facts)] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts: broken }] })
      .mockResolvedValueOnce({ repairs: [{ index: 0, name: facts.name, dishFamily: facts.dishFamily, steps: facts.steps.map(({ foodIds, ...step }) => ({ ...step, ingredientNumbers: foodIds.map(id => facts.ingredients.findIndex(item => item.foodId === id) + 1) })) }] });
    const result = await generateArabicFactBatch(input, Date.now() + 40000, "test");
    expect(model.mock.calls[2][0]).toContain('"duplicateStepNumbers":[[1,5]]');
    expect(result.recipes[0].facts.steps).toEqual(facts.steps);
    expect(model).toHaveBeenCalledTimes(3);
  });
  it("requires an independent semantic check for unclassified foods and rejects forged safety receipts", async () => {
    const facts = weeklyFactFixtures()[0], restrictions = { diets: ["pescatarian"], allergens: [], conditions: [] };
    const unknown = arabicFoods.find(food => needsArabicSemanticSafety({ ...facts, ingredients: [{ ...facts.ingredients[0], foodId: food.id }] }, restrictions))!;
    facts.ingredients[0] = { ...facts.ingredients[0], foodId: unknown.id, arabicName: unknown.ar || "مكون غير معروف" };
    facts.steps.forEach(step => { step.foodIds = step.foodIds.map(id => id === findArabicFood("salmon")!.id ? unknown.id : id); });
    model.mockResolvedValueOnce({ plans: [manifest(facts)] }).mockResolvedValueOnce({ recipes: [{ planIndex: 0, facts, safetyReceipt: arabicSafetyFingerprint(facts, restrictions) }] }).mockResolvedValue({ labels: [], recipes: [{ index: 0, safe: false }] });
    expect((await generateArabicFactBatch({ ...input, restrictions }, Date.now() + 40000, "test")).recipes).toEqual([]);
    expect(arabicSafetyFingerprint(facts, restrictions)).not.toBe(arabicSafetyFingerprint(facts, { ...restrictions, diets: ["vegan"] }));
  });
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

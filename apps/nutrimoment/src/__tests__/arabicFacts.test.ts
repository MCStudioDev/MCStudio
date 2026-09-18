import { describe, expect, it } from "vitest";
import { normalizeArabicInputs } from "@/services/arabic/ingredients";
import { arabicFoods, findArabicFood } from "@/services/arabic/foodCatalog";
import { buildArabicFactsEntry, recipeFactsIdentity } from "@/services/arabic/recipeFacts";

const unrestricted = { diets: [], conditions: [], allergens: [] };
const food = (name: string) => findArabicFood(name)!.id;
export function salmonFacts() {
  return {
    version: "ar-facts-v1", name: "طبق السلمون مع الأرز", cuisine: "Mediterranean",
    dishFamily: "salmon-rice", mealTypes: ["lunch", "dinner"], servings: 1,
    ingredients: [
      { foodId: food("salmon"), quantity: 200, unit: "g", state: "raw" },
      { foodId: food("rice"), quantity: 1, unit: "cup", state: "raw" },
      { foodId: food("water"), quantity: 1, unit: "cup", state: "raw" }
    ],
    steps: [
      { action: "wash", foodIds: [food("rice")], minutes: 0, temperatureC: 0, heat: "none" },
      { action: "simmer", foodIds: [food("rice"), food("water")], minutes: 15, temperatureC: 0, heat: "low" },
      { action: "bake", foodIds: [food("salmon")], minutes: 15, temperatureC: 200, heat: "none" },
      { action: "serve", foodIds: [food("salmon"), food("rice")], minutes: 0, temperatureC: 0, heat: "none" }
    ],
    nutrition: { calories: 500, protein: 40, carbs: 50, fat: 15 }, totalMinutes: 30, difficulty: "easy"
  };
}

describe("Arabic facts pipeline", () => {
  it("requires explicitly measured soaking liquid, including water discarded before cooking", async () => {
    const facts = salmonFacts();
    facts.steps.unshift({ action: "soak", foodIds: [food("rice")], minutes: 20, temperatureC: 0, heat: "none" });
    facts.totalMinutes = 50;
    expect((await buildArabicFactsEntry(facts, unrestricted)).reasons).toContain("missing_soaking_liquid");
    facts.steps[0].foodIds.push(food("water"));
    expect((await buildArabicFactsEntry(facts, unrestricted)).entry).not.toBeNull();
  });
  it("requires cooking liquid when raw grains or legumes are boiled or simmered", async () => {
    const facts = salmonFacts();
    facts.steps[1].foodIds = [food("rice")];
    expect((await buildArabicFactsEntry(facts, unrestricted)).reasons).toContain("missing_cooking_liquid");
  });
  it("reports repairable instruction defects even while compound safety verification is pending", async () => {
    const facts = salmonFacts();
    facts.ingredients.push({ foodId: food("tomato sauce"), quantity: 0.5, unit: "cup", state: "cooked" });
    facts.steps[1].foodIds.push(food("tomato sauce"));
    facts.steps.push({ ...facts.steps[0] });
    const checked = await buildArabicFactsEntry(facts, { ...unrestricted, diets: ["pescatarian"] });
    expect(checked.entry).toBeNull();
    expect(checked.reasons).toContain("semantic_safety_unverified");
    expect(checked.reasons).toContain("canonical:duplicate_instructions");
  });
  it("uses existing food knowledge for ordinary English, Arabic and mixed input", async () => {
    for (const term of ["mushroom", "mushrooms", "فطر", "soy sauce", "lime", "cilantro"]) {
      const result = await normalizeArabicInputs([term]);
      expect(result.unclear, term).toEqual([]);
      expect(findArabicFood(result.canonical[0]), term).toBeDefined();
    }
    expect((await normalizeArabicInputs(["٢ حبة طماطم؛ rice، فول"])).canonical).toEqual(["tomato", "rice", "fava beans"]);
    expect((await normalizeArabicInputs(["شاورما", "unknown zzz food"])).unclear).toHaveLength(2);
    expect(new Set(arabicFoods.map(item => item.id)).size).toBe(arabicFoods.length);
  });
  it("renders one set of quantities, ingredient identities and actions in Arabic", async () => {
    const result = await buildArabicFactsEntry(salmonFacts(), { ...unrestricted, diets: ["pescatarian"] });
    expect(result.reasons).toEqual([]);
    expect(result.entry?.recipe.ingredients[0]).toContain("200 غرام");
    expect(result.entry?.recipe.steps.join(" ")).toContain("200");
    expect(result.entry?.recipe.steps.join(" ")).not.toMatch(/[a-z]/i);
    expect(result.entry?.facts).toBeDefined();
  });
  it("rejects unknown IDs, unlisted step ingredients and missing cooking for raw fish", async () => {
    const unknown = salmonFacts(); unknown.ingredients[0].foodId = "invented-chicken";
    expect((await buildArabicFactsEntry(unknown, unrestricted)).entry).toBeNull();
    const hidden = salmonFacts(); hidden.steps[0].foodIds.push(food("chicken"));
    expect((await buildArabicFactsEntry(hidden, unrestricted)).entry).toBeNull();
    const raw = salmonFacts(); raw.steps = raw.steps.filter(step => step.action !== "bake");
    expect((await buildArabicFactsEntry(raw, unrestricted)).entry).toBeNull();
  });
  it("keeps Sandy's chicken rejection and fish/mushroom acceptance", async () => {
    const chicken = salmonFacts();
    const salmonId = food("salmon");
    chicken.ingredients[0].foodId = food("chicken");
    chicken.steps.forEach(step => { step.foodIds = step.foodIds.map(id => id === salmonId ? food("chicken") : id); });
    expect((await buildArabicFactsEntry(chicken, { ...unrestricted, diets: ["pescatarian"] })).entry).toBeNull();
    expect((await buildArabicFactsEntry(salmonFacts(), { ...unrestricted, diets: ["pescatarian"] })).entry).not.toBeNull();
  });
  it("rejects breadcrumb composition for Paleo even if the legacy validator misses it", async () => {
    const facts = salmonFacts();
    facts.ingredients = [{ foodId: food("breadcrumbs"), quantity: 0.25, unit: "cup", state: "raw" }];
    facts.steps.forEach(step => { step.foodIds = [food("breadcrumbs")]; });
    expect((await buildArabicFactsEntry(facts, { ...unrestricted, diets: ["paleo"] })).reasons).toContain("diet_violation");
  });
  it("does not count renamed versions of the same recipe as different dishes", () => {
    const first = salmonFacts(); const renamed = { ...first, name: "وصفة السلمون الجديدة", dishFamily: "different-name" };
    expect(recipeFactsIdentity(first)).toBe(recipeFactsIdentity(renamed));
  });
});

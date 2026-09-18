import { describe, expect, it } from "vitest";
import { buildArabicCuisineGuidance } from "@/services/arabic/cuisineGuidance";
import { selectArabicDishCandidates } from "@/services/arabic/dishCandidates";

describe("Arabic cuisine guidance", () => {
  it("uses cuisine guidance for an explicitly empty weekly pantry", async () => {
    const base = { ingredients: [], cuisine: "Egyptian", count: 7, calorieTarget: 1650, missingLimit: "unlimited" as const,
      restrictions: { diets: ["vegetarian"], allergens: [], conditions: [] }, mealTypesNeeded: ["breakfast"] };
    const selected = await selectArabicDishCandidates({ ...base, allowEmptyPantry: true });
    expect(selected.some(item => item.kind === "catalog")).toBe(true);
    expect(await buildArabicCuisineGuidance("Egyptian", [], base.restrictions)).toEqual([]);
  });
  it("assigns both taameya and koshary a stable slot for Mina's shown pantry", async () => {
    const selected = await selectArabicDishCandidates({ ingredients: ["rice", "fava beans", "chickpeas"], cuisine: "Egyptian", count: 7,
      calorieTarget: 1650, missingLimit: "unlimited", restrictions: { diets: ["vegan"], allergens: [], conditions: [] } });
    expect(selected.map(item => item.title).join(" ").toLowerCase()).toMatch(/taameya/);
    expect(selected.map(item => item.title).join(" ").toLowerCase()).toMatch(/koshary|koshari/);
  });
  it("prioritizes recognizable Egyptian dishes compatible with the pantry and vegan profile", async () => {
    const dishes = await buildArabicCuisineGuidance("Egyptian", ["rice", "tomato", "fava beans"], { diets: ["vegan"], conditions: [], allergens: [] });
    const names = dishes.map(dish => dish.name).join(" ").toLowerCase();
    expect(names).toMatch(/ful medames|foul medames/);
    expect(names).toContain("taameya");
    expect(names).toMatch(/koshary|koshari/);
    expect(names).not.toMatch(/chicken|beef|lamb|shawarma/);
    expect(dishes.find(dish => /koshary|koshari/i.test(dish.name))?.essentialIngredients.join(" ")).toMatch(/lentil/);
  });
  it("leaves unrestricted cuisine open without fabricating a local cuisine", async () => {
    expect(await buildArabicCuisineGuidance("Any", ["rice"], { diets: [], allergens: [], conditions: [] })).toEqual([]);
  });
});

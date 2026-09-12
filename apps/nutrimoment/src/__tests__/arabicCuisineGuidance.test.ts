import { describe, expect, it } from "vitest";
import { buildArabicCuisineGuidance } from "@/services/arabic/cuisineGuidance";

describe("Arabic cuisine guidance", () => {
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

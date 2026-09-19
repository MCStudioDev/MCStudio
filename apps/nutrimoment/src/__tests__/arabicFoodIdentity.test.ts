import { describe, expect, it } from "vitest";
import { arabicFoods, findArabicFood } from "@/services/arabic/foodCatalog";
import { normalizeArabicInputs } from "@/services/arabic/ingredients";

describe("Arabic catalog identity precedence", () => {
  it("never lets a broader alias overwrite an exact canonical food name", () => {
    const mismatches = arabicFoods.filter(food => findArabicFood(food.en)?.id !== food.id).map(food => food.en);
    expect(mismatches).toEqual([]);
  });
  it("keeps generic chicken distinct from a specific cut in either input language", async () => {
    expect(findArabicFood("chicken")?.id).toBe("food-chicken");
    expect(findArabicFood("دجاج")?.id).toBe("food-chicken");
    expect(findArabicFood("chicken breast")?.id).toBe("food-chicken-breast");
    expect(findArabicFood("chicken wings")?.id).toBe("food-chicken-wings");
    expect((await normalizeArabicInputs(["دجاج", "chicken"])).canonical).toEqual(["chicken"]);
  });
});

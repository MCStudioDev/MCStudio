import { describe, expect, it } from "vitest";
import { buildNormalizedShoppingList } from "../lib/shoppingListNormalizer";

describe("shopping list normalizer", () => {
  it("merges duplicate Arabic ingredients when one line has a measured unit and another is a vague item count", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: ["جمبري - 1 كج", "جمبري - 2 عنصر"]
      })
    ).toEqual(["جمبري - 1 كجم"]);
  });

  it("sums duplicate Arabic ingredients with the same measured unit", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: ["جمبري - 1 كج", "جمبري - 0.5 كجم"]
      })
    ).toEqual(["جمبري - 1.5 كجم"]);
  });
});

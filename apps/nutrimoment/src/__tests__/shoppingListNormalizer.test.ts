import { describe, expect, it } from "vitest";
import { buildNormalizedShoppingList } from "../lib/shoppingListNormalizer";

describe("shopping list normalizer", () => {
  it("merges duplicate Arabic ingredients when one line has a measured unit and another is a vague item count", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: ["\u062c\u0645\u0628\u0631\u064a - 1 \u0643\u062c", "\u062c\u0645\u0628\u0631\u064a - 2 \u0639\u0646\u0635\u0631"]
      })
    ).toEqual(["\u062c\u0645\u0628\u0631\u064a - 1 \u0643\u062c\u0645"]);
  });

  it("sums duplicate Arabic ingredients with the same measured unit", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: ["\u062c\u0645\u0628\u0631\u064a - 1 \u0643\u062c", "\u062c\u0645\u0628\u0631\u064a - 0.5 \u0643\u062c\u0645"]
      })
    ).toEqual(["\u062c\u0645\u0628\u0631\u064a - 1.5 \u0643\u062c\u0645"]);
  });

  it("normalizes vague mixed-unit shopping entries", () => {
    const list = buildNormalizedShoppingList({
      displayLanguage: "ar",
      shoppingList: ["rice - 14 mixed units", "lentils - 12 mixed unit"]
    });

    expect(list.join(" ")).not.toMatch(/mixed|\u0645\u064a\u0643\u0633\u064a\u062f/i);
  });

  it("keeps Arabic shopping list readable and removes prep wording", () => {
    const list = buildNormalizedShoppingList({
      displayLanguage: "ar",
      shoppingList: [
        "\u0628\u0635\u0644 \u0645\u0641\u0631\u0648\u0645 - 2 \u062d\u0628\u0629",
        "\u0628\u0635\u0644 - 3 \u062d\u0628\u0629",
        "\u0628\u0642\u062f\u0648\u0646\u0633 \u0645\u0641\u0631\u0648\u0645 \u0644\u0644\u062a\u0632\u064a\u064a\u0646 - 1 \u0628\u0648\u0646\u062a\u0634",
        "\u062e\u064a\u0627\u0631 \u0645\u0642\u0637\u0639 \u0645\u0643\u0639\u0628\u0627\u062a - \u0646\u0635\u0641 \u0643\u0648\u0628 - 1 item",
        "nori - 1 item",
        "edamame - 1 cup"
      ]
    });
    const text = list.join(" ");

    expect(text).toContain("\u0628\u0635\u0644 - 5 \u062d\u0628\u0629");
    expect(text).toContain("\u0628\u0642\u062f\u0648\u0646\u0633 - 1 \u062d\u0632\u0645\u0629");
    expect(text).toContain("\u0637\u062d\u0627\u0644\u0628 \u0646\u0648\u0631\u064a");
    expect(text).toContain("\u0641\u0648\u0644 \u0635\u0648\u064a\u0627 \u0623\u062e\u0636\u0631");
    expect(text).not.toMatch(/item|bunch|\u0628\u0648\u0646\u062a\u0634|\u0645\u0642\u0637\u0639|\u0645\u0641\u0631\u0648\u0645|\u0644\u0644\u062a\u0632\u064a\u064a\u0646/i);
  });

  it("merges Arabic rice variants and avoids whole-item units for staples", () => {
    expect(
      buildNormalizedShoppingList({
        displayLanguage: "ar",
        shoppingList: [
          "\u0623\u0631\u0632 - 2 \u062d\u0628\u0629",
          "\u0623\u0631\u0632 \u0645\u0635\u0631\u064a - 1 \u0639\u0628\u0648\u0629"
        ]
      })
    ).toEqual(["\u0623\u0631\u0632 - 1 \u0639\u0628\u0648\u0629"]);
  });

  it("translates plant milks from canonical English into readable Arabic", () => {
    const list = buildNormalizedShoppingList({
      displayLanguage: "ar",
      shoppingList: ["coconut milk - 1 can", "oat milk - 2 cups", "almond milk - 1 cup"]
    });

    expect(list).toContain("\u062d\u0644\u064a\u0628 \u062c\u0648\u0632 \u0627\u0644\u0647\u0646\u062f - 1 \u0639\u0644\u0628\u0629");
    expect(list).toContain("\u062d\u0644\u064a\u0628 \u0627\u0644\u0634\u0648\u0641\u0627\u0646 - 2 \u0643\u0648\u0628");
    expect(list).toContain("\u062d\u0644\u064a\u0628 \u0627\u0644\u0644\u0648\u0632 - 1 \u0643\u0648\u0628");
  });
});

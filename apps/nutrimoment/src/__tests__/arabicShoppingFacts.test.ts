import { describe, expect, it } from "vitest";
import { buildArabicShoppingList } from "@/services/arabic/shoppingFacts";
import { buildArabicFactsEntry } from "@/services/arabic/recipeFacts";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
import { buildArabicEntry } from "@/services/arabic/validation";
import { canonical, arabic } from "./fixtures/arabic";
const restrictions = { diets: [], conditions: [], allergens: [] };
describe("Arabic shopping quantities from verified facts", () => {
  it("keeps fractional quantities when an existing Arabic recipe joins a new weekly plan", async () => {
    const legacy = await buildArabicEntry({ ...canonical, ingredients: [canonical.ingredients[0], "1/2 cup rice", canonical.ingredients[2]] },
      { ...arabic, ingredients: [arabic.ingredients[0], "١/٢ كوب أرز", arabic.ingredients[2]] }, restrictions);
    expect(legacy.reasons).toEqual([]);
    expect(await buildArabicShoppingList([legacy.entry!], [])).toContain("0.5 كوب أرز");
  });
  it("aggregates every meal and subtracts measured pantry stock once", async () => {
    const facts = weeklyFactFixtures().slice(0, 2);
    const entries = await Promise.all(facts.map(async fact => (await buildArabicFactsEntry(fact, restrictions)).entry!));
    const list = await buildArabicShoppingList(entries, [{ name: "سلمون", quantity: "٠٫١ كيلوغرام" }, { name: "rice", quantity: "1 cup" }]);
    expect(list).toContain("300 غرام سلمون");
    expect(list).toContain("1 كوب أرز");
    expect(list.join(" ")).not.toMatch(/[A-Za-z]/);
  });
  it("does not subtract incomparable package counts or unmeasured stock", async () => {
    const entry = (await buildArabicFactsEntry(weeklyFactFixtures()[0], restrictions)).entry!;
    const list = await buildArabicShoppingList([entry], [{ name: "salmon", quantity: "1 can" }, { name: "rice" }]);
    expect(list).toContain("200 غرام سلمون");
    expect(list).toContain("1 كوب أرز");
  });
});

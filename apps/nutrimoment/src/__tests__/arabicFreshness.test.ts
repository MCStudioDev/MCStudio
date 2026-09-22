import { describe, expect, it } from "vitest";
import { arabic, canonical, restrictions } from "./fixtures/arabic";
import { buildArabicEntry } from "@/services/arabic/validation";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
import { buildArabicFactsEntry } from "@/services/arabic/recipeFacts";
import { arabicEntryFreshnessKeys, arabicIngredientContextKey, arabicLastShownAt, arabicRecipeNameKey,
  arabicSourceKey, buildArabicFreshnessRecord, buildArabicRecentRecipes, buildArabicRecentWeeklyMeals, repeatsPreviousArabicWeek,
  rotateArabicCandidates, ARABIC_FRESHNESS_WINDOW_MS, ARABIC_WEEKLY_FRESHNESS_WINDOW_MS } from "@/services/arabic/freshness";

describe("Arabic weekly history", () => {
  it("reads pre-fix weeks across pantry changes for seven days without rewriting them", async () => {
    const entries = await Promise.all(weeklyFactFixtures().map(async facts => (await buildArabicFactsEntry(facts, restrictions)).entry!));
    const row = { timestamp: new Date(now - 2 * ARABIC_FRESHNESS_WINDOW_MS).toISOString(), sessionType: "weekly_meal_plan",
      generationStatus: "completed", ingredients: ["old pantry"], recipes: entries.map(entry => entry.recipe) };
    const before = structuredClone(row), recent = buildArabicRecentWeeklyMeals([row], now);
    expect(arabicLastShownAt(entries[0], recent)).toBe(now - 2 * ARABIC_FRESHNESS_WINDOW_MS);
    expect(repeatsPreviousArabicWeek(entries, recent)).toBe(true); expect(row).toEqual(before);
    for (const override of [{ timestamp: new Date(now - ARABIC_WEEKLY_FRESHNESS_WINDOW_MS).toISOString() },
      { timestamp: new Date(now + 1000).toISOString() }, { timestamp: "bad" }, { generationStatus: "failed" },
      { sessionType: "recipe_generation" }, { recipes: [] }]) {
      expect(buildArabicRecentWeeklyMeals([{ ...row, ...override }], now).shownAt.size).toBe(0);
    }
  });
});

const now = Date.parse("2026-09-13T12:00:00Z");
const history = (overrides: Record<string, unknown> = {}) => ({ timestamp: new Date(now - 1000).toISOString(),
  sessionType: "recipe_generation", generationStatus: "completed", ingredients: ["أرز", "سلمون"], recipes: [arabic], ...overrides });

describe("Arabic recipe freshness", () => {
  it("retains recent history after correcting a broad ingredient alias without rewriting records", async () => {
    const entry = (await buildArabicEntry(canonical, arabic, restrictions)).entry!;
    const row = history({ ingredients: ["دجاج"], recipeFreshness: buildArabicFreshnessRecord(["chicken breast"], [entry]) });
    const before = structuredClone(row);
    const recent = await buildArabicRecentRecipes([row], ["chicken"], now);
    expect(arabicLastShownAt(entry, recent)).toBe(now - 1000);
    expect(row).toEqual(before);
    expect((await buildArabicRecentRecipes([row], ["salmon"], now)).shownAt.size).toBe(0);
  });
  it("uses a stable ingredient context regardless of order, duplication or case", () => {
    expect(arabicIngredientContextKey(["rice", "salmon"])).toBe(arabicIngredientContextKey(["Salmon", "rice", "rice"]));
    expect(arabicIngredientContextKey(["rice"])).not.toBe(arabicIngredientContextKey(["rice", "salmon"]));
  });
  it("reads existing mixed-language Arabic history without modifying it", async () => {
    const row = history({ ingredients: ["٢٠٠ غرام سلمون، rice"] }), before = structuredClone(row);
    const entry = (await buildArabicEntry(canonical, arabic, restrictions)).entry!;
    const recent = await buildArabicRecentRecipes([row], ["rice", "salmon"], now);
    expect(arabicLastShownAt(entry, recent)).toBe(now - 1000);
    expect(recent.names).toEqual([arabic.name]); expect(row).toEqual(before);
  });
  it("recognizes older displayed recipes after pantry partitioning", async () => {
    const recent = await buildArabicRecentRecipes([history({ recipes: [{ ...arabic, ingredients: [arabic.ingredients[1]], missing_ingredients: [arabic.ingredients[0], arabic.ingredients[2]] }] })], ["rice", "salmon"], now);
    const entry = (await buildArabicEntry({ ...canonical, name: "Renamed" }, { ...arabic, name: "عنوان آخر" }, restrictions)).entry!;
    expect(arabicLastShownAt(entry, recent)).toBe(now - 1000);
  });
  it.each([
    { timestamp: new Date(now - ARABIC_FRESHNESS_WINDOW_MS).toISOString() }, { timestamp: "bad" }, { timestamp: 123 },
    { timestamp: new Date(now + 1000).toISOString() }, { sessionType: "weekly_meal_plan" }, { generationStatus: "failed" },
    { ingredients: ["tuna"] }, { ingredients: ["unclearxyz"] }, { ingredients: [3] }, { ingredients: undefined }, { recipes: [{}] }
  ])("ignores expired, unrelated, failed or malformed history: %j", async overrides => {
    expect((await buildArabicRecentRecipes([history(overrides)], ["rice", "salmon"], now)).shownAt.size).toBe(0);
  });
  it("stores only Arabic freshness metadata and retains the most recent occurrence", async () => {
    const entry = (await buildArabicEntry(canonical, arabic, restrictions, { id: "en-source", fingerprint: "x" })).entry!;
    const record = buildArabicFreshnessRecord(["rice"], [entry]);
    const recent = await buildArabicRecentRecipes([
      history({ recipeFreshness: record }), history({ recipeFreshness: record, timestamp: new Date(now - 2000).toISOString() })
    ], ["rice"], now);
    expect(record.names).toEqual([arabic.name, canonical.name]);
    expect(arabicLastShownAt(entry, recent)).toBe(now - 1000);
    expect(recent.shownAt.has(arabicSourceKey(entry.source!))).toBe(true);
    expect((await buildArabicRecentRecipes([history({ recipeFreshness: record })], ["tuna"], now)).shownAt.size).toBe(0);
  });
  it("does not treat renamed, resized fact recipes as new dishes", async () => {
    const facts = weeklyFactFixtures()[0], entry = (await buildArabicFactsEntry(facts, restrictions)).entry!;
    const changed = { ...entry, id: "ar-new", canonical: { ...entry.canonical, name: "Different wording" }, recipe: { ...entry.recipe, id: "ar-new", name: "اسم آخر" },
      facts: { ...facts, name: "اسم آخر", dishFamily: "other", ingredients: facts.ingredients.map(item => ({ ...item, quantity: item.quantity * 2 })) } };
    const recent = await buildArabicRecentRecipes([history({ recipeFreshness: buildArabicFreshnessRecord(["rice"], [entry]) })], ["rice"], now);
    expect(arabicLastShownAt(changed, recent)).toBe(now - 1000);
    expect(arabicEntryFreshnessKeys(changed)).toContain(arabicEntryFreshnessKeys(entry).find(key => key.startsWith("facts:")));
  });
  it("normalizes Arabic spelling marks and separates source namespaces", () => {
    expect(arabicRecipeNameKey("أَرُزّ بالطماطم")).toBe(arabicRecipeNameKey("ارز بالطماطم"));
    expect(arabicSourceKey({ id: "one", fingerprint: "old" })).toBe(arabicSourceKey({ kind: "shared", id: "one", fingerprint: "new" }));
    expect(arabicSourceKey({ kind: "reference", id: "one", fingerprint: "x" })).not.toBe(arabicSourceKey({ id: "one", fingerprint: "x" }));
  });
  it("rotates equivalent candidates per click with deterministic retry ordering", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i) })), key = (row: { id: string }) => row.id;
    const first = rotateArabicCandidates(rows, "click-1", key);
    expect(rotateArabicCandidates([...rows].reverse(), "click-1", key)).toEqual(first);
    expect(rotateArabicCandidates(rows, "click-2", key)).not.toEqual(first);
    expect(rows[0].id).toBe("0"); expect(rotateArabicCandidates([], "x", key)).toEqual([]);
  });
});

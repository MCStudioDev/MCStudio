import { describe, expect, it } from "vitest";
import { buildArabicEntry, validateArabicPair, partitionArabicRecipe } from "@/services/arabic/validation";

import { restrictions, canonical, arabic } from "./fixtures/arabic";

describe("Arabic validation adapter", () => {
  it("accepts a complete fish recipe with Arabic digits without changing English validators", async () => {
    expect(await validateArabicPair(canonical, arabic, restrictions)).toEqual([]);
  });
  it("rejects changed ingredient quantities", async () => {
    expect(await validateArabicPair(canonical, { ...arabic, ingredients: ["٣٠٠ غرام سلمون", ...arabic.ingredients.slice(1)] }, restrictions)).toContain("ingredient_quantity_changed");
  });
  it("rejects changed cooking times", async () => {
    expect(await validateArabicPair(canonical, { ...arabic, cook_time: "٣٠ دقيقة" }, restrictions)).toContain("cooking_time_changed");
  });
  it("rejects changed instruction numbers", async () => {
    expect(await validateArabicPair(canonical, { ...arabic, steps: arabic.steps.map(s => s.replace("١٥", "٥")) }, restrictions)).toContain("instruction_numbers_changed");
  });
  it("rejects instructions that remove cooking or substitute a different protein", async () => {
    for (const steps of [arabic.steps.map(step => step.replace("اطبخ", "لا تطبخ")), arabic.steps.map(step => step.replaceAll("السلمون", "التونة"))]) {
      expect(await validateArabicPair(canonical, { ...arabic, steps }, restrictions)).toContain("instruction_meaning_changed");
    }
  });
  it("rejects chicken and ambiguous shawarma for Sandy", async () => {
    for (const protein of ["chicken", "shawarma"]) {
      const unsafe = { ...canonical, name: `${protein} Rice Bowl`, ingredients: canonical.ingredients.map(s => s.replace("salmon", protein)), steps: canonical.steps.map(s => s.replaceAll("salmon", protein)) };
      expect(await validateArabicPair(unsafe, arabic, restrictions)).toContain("diet_violation");
    }
  });
  it("partitions pantry ingredients and applies zero missing precisely", async () => {
    const { entry } = await buildArabicEntry(canonical, arabic, restrictions);
    expect(entry).not.toBeNull();
    expect(await partitionArabicRecipe(entry!, ["rice"], 0)).toBeNull();
    expect((await partitionArabicRecipe(entry!, ["rice"], 2))?.missing_ingredients).toHaveLength(2);
  });
  it("keeps fingerprints stable across Firestore field ordering", async () => {
    const first = await buildArabicEntry(canonical, arabic, restrictions, { id: "source-1", fingerprint: "hash" });
    const second = await buildArabicEntry(canonical, arabic, restrictions, { fingerprint: "hash", id: "source-1" });
    expect(first.entry?.fingerprint).toBe(second.entry?.fingerprint);
  });
  it("accepts mushroom recipes for Sandy", async () => {
    const mushroom = { ...canonical, name: "Mushroom Rice Bowl", ingredients: canonical.ingredients.map(value => value.replace("salmon", "mushrooms")), steps: canonical.steps.map(value => value.replaceAll("salmon", "mushrooms")) };
    const translated = { ...arabic, name: "طبق الفطر مع الأرز", ingredients: arabic.ingredients.map(value => value.replace("سلمون", "فطر")), steps: arabic.steps.map(value => value.replaceAll("سلمون", "فطر")) };
    expect(await validateArabicPair(mushroom, translated, restrictions)).toEqual([]);
  });
});

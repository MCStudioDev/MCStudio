import { describe, expect, it } from "vitest";
import { buildArabicEntry, validateArabicPair, partitionArabicRecipe } from "@/services/arabic/validation";

import { restrictions, canonical, arabic } from "./fixtures/arabic";
import livePairs from "./fixtures/arabic-live-rejection.json";

describe("Arabic validation adapter", () => {
  it("accepts the actual live tomato-rice response after Arabic alias validation", async () => {
    const pair = livePairs[1];
    expect(await validateArabicPair(pair.canonical, pair.recipe, { diets: ["vegan"], conditions: [], allergens: [] })).toEqual([]);
    const { entry } = await buildArabicEntry(pair.canonical, pair.recipe, { diets: ["vegan"], conditions: [], allergens: [] });
    expect((await partitionArabicRecipe(entry!, ["rice", "tomato", "fava beans"], 5))?.missing_ingredients).toHaveLength(5);
  });
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
  it("retains all groceries for a weekly meal with no owned ingredients", async () => {
    const { entry } = await buildArabicEntry(canonical, arabic, restrictions);
    const weekly = await partitionArabicRecipe(entry!, ["shrimp"], "unlimited", true);
    expect(weekly?.ingredients).toEqual([]);
    expect(weekly?.missing_ingredients).toEqual([...arabic.ingredients, ...arabic.missing_ingredients]);
    expect(await partitionArabicRecipe(entry!, ["shrimp"], "unlimited")).toBeNull();
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
  it("accepts a quantified Egyptian vegan rice and fava-bean recipe", async () => {
    const { veganCanonical, veganArabic } = await import("./fixtures/arabic");
    expect(await validateArabicPair(veganCanonical, veganArabic, { diets: ["vegan"], allergens: [], conditions: [] })).toEqual([]);
    const { entry } = await buildArabicEntry(veganCanonical, veganArabic, { diets: ["vegan"], allergens: [], conditions: [] });
    expect(await partitionArabicRecipe(entry!, ["rice", "tomato", "fava beans"], 5)).not.toBeNull();
  });
  it("does not equate generic canned beans with fava beans", async () => {
    const { veganCanonical, veganArabic } = await import("./fixtures/arabic");
    expect(await validateArabicPair({ ...veganCanonical, ingredients: veganCanonical.ingredients.map(s => s.replace("fava beans", "canned beans")) }, veganArabic, { diets: ["vegan"], allergens: [], conditions: [] })).toContain("ingredient_identity_changed");
  });
});

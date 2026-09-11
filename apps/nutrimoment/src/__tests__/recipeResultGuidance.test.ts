import { describe, expect, it } from "vitest";
import { buildRecipeResultGuidance } from "@/lib/recipeResultGuidance";

const base = { returnedCount: 0, requestedCount: 5, maxMissingIngredients: 0, preferredCuisine: "Any", language: "en", hasRestrictions: true };
describe("recipe result explanations and next steps", () => {
  it("explains Sandy's zero-missing setting and recommends practical changes", () => {
    const result = buildRecipeResultGuidance(base)!;
    expect(result.reasons.join(" ")).toContain("set to 0");
    expect(result.suggestions.join(" ")).toContain("1 or 2");
    expect(result.suggestions.join(" ")).toContain("already have");
    expect(result.reasons.join(" ")).not.toContain("were rejected");
  });
  it("reports a missing-ingredient rejection only with search evidence", () => {
    expect(buildRecipeResultGuidance({ ...base, missingLimitRejected: 3 })!.reasons.join(" ")).toContain("needed more missing ingredients");
  });
  it("explains other-cuisine fallback even when all requested slots are filled", () => {
    const result = buildRecipeResultGuidance({ ...base, returnedCount: 5, preferredCuisine: "Italian", otherCuisineCount: 2 })!;
    expect(result.reasons.join(" ")).toContain("Italian");
    expect(result.reasons.join(" ")).toContain("other cuisines");
  });
  it("does not recommend weakening dietary or allergy restrictions", () => {
    const result = buildRecipeResultGuidance({ ...base, safetyRejected: 2 })!;
    expect(result.reasons.join(" ")).toContain("dietary checks");
    expect(result.suggestions.join(" ")).not.toMatch(/remove|disable|relax|allerg/i);
  });
  it("explains partial results and the active nonzero missing limit", () => {
    const result = buildRecipeResultGuidance({ ...base, returnedCount: 2, maxMissingIngredients: 1 })!;
    expect(result.title).toContain("2 of 5");
    expect(result.reasons.join(" ")).toContain("1 missing ingredient");
  });
  it("distinguishes a service failure from an ingredient mismatch", () => {
    const result = buildRecipeResultGuidance({ ...base, serviceUnavailable: true })!;
    expect(result.reasons.join(" ")).toContain("could not complete");
    expect(result.reasons.join(" ")).not.toContain("set to 0");
    expect(result.suggestions.join(" ")).toContain("Try again");
  });
  it("explains recently shown recipes only when evidence is supplied", () => {
    expect(buildRecipeResultGuidance({ ...base, recentExcluded: 2 })!.reasons.join(" ")).toContain("24 hours");
  });
  it("provides Arabic guidance", () => {
    const result = buildRecipeResultGuidance({ ...base, language: "ar" })!;
    expect(result.reasons.join(" ")).toContain("المكونات المفقودة");
    expect(result.suggestions.join(" ")).toContain("مكون أو مكونين");
  });
  it("does not show problem guidance for a complete preference match", () => {
    expect(buildRecipeResultGuidance({ ...base, returnedCount: 5 })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  getGroundedUnderfillRequestCount,
  getPremiumRecipeEditorCandidateCount,
  prioritizeCuratedRecipeSources,
  shouldExpandRecipeSourceSearch,
  shouldFinalizeSourceCandidatesBeforeEditor,
  shouldRunBulkRecipeRepair,
  shouldRunPremiumRecipeEditor,
  shouldServeDatasetBeforeRecipeEditor
} from "../services/premiumRecipeEditorPolicy";

describe("premium recipe editor policy", () => {
  it("overfetches constrained source recipes before per-card editing", () => {
    expect(getPremiumRecipeEditorCandidateCount({
      hasAdaptationConstraints: true,
      requestedRecipeCount: 10
    })).toBe(14);
    expect(getPremiumRecipeEditorCandidateCount({
      hasAdaptationConstraints: false,
      requestedRecipeCount: 10
    })).toBe(14);
  });

  it("bounds grounded underfill work to the missing slots and five requests", () => {
    expect(getGroundedUnderfillRequestCount(0)).toBe(0);
    expect(getGroundedUnderfillRequestCount(2)).toBe(3);
    expect(getGroundedUnderfillRequestCount(4)).toBe(5);
    expect(getGroundedUnderfillRequestCount(7)).toBe(5);
  });

  it("runs the editor for a premium user when source recipes are available", () => {
    expect(shouldRunPremiumRecipeEditor({ isAdmin: false, isPremium: true }, 10)).toBe(true);
  });

  it("runs the editor for an admin account", () => {
    expect(shouldRunPremiumRecipeEditor({ isAdmin: true, isPremium: false }, 10)).toBe(true);
  });

  it("does not run the premium editor for a free user", () => {
    expect(shouldRunPremiumRecipeEditor({ isAdmin: false, isPremium: false }, 10)).toBe(false);
  });

  it("defers customer-facing validation until after premium source editing", () => {
    expect(shouldFinalizeSourceCandidatesBeforeEditor({ isAdmin: false, isPremium: true })).toBe(false);
    expect(shouldFinalizeSourceCandidatesBeforeEditor({ isAdmin: true, isPremium: false })).toBe(false);
    expect(shouldFinalizeSourceCandidatesBeforeEditor({ isAdmin: false, isPremium: false })).toBe(true);
  });

  it("retains curated sources before applying the editor candidate limit", () => {
    const prioritized = prioritizeCuratedRecipeSources([
      { id: "imported-1", name: "Generic one" },
      { id: "imported-2", name: "Generic two" },
      { id: "trusted-source-italian-piccata", name: "Chicken Piccata" }
    ], 2);

    expect(prioritized.map((recipe) => recipe.id)).toEqual([
      "trusted-source-italian-piccata",
      "imported-1"
    ]);
  });

  it("prevents an early dataset return only for premium editing", () => {
    expect(shouldServeDatasetBeforeRecipeEditor({
      access: { isAdmin: false, isPremium: true },
      availableRecipeCount: 10,
      requestedRecipeCount: 10
    })).toBe(false);
    expect(shouldServeDatasetBeforeRecipeEditor({
      access: { isAdmin: false, isPremium: false },
      availableRecipeCount: 10,
      requestedRecipeCount: 10
    })).toBe(true);
  });

  it("does not invoke the editor without a source recipe", () => {
    expect(shouldRunPremiumRecipeEditor({ isAdmin: false, isPremium: true }, 0)).toBe(false);
  });

  it("does not expand source search after the requested count is validated", () => {
    expect(shouldExpandRecipeSourceSearch({
      availableRecipeCount: 10,
      requestedRecipeCount: 10
    })).toBe(false);
    expect(shouldExpandRecipeSourceSearch({
      availableRecipeCount: 7,
      requestedRecipeCount: 10
    })).toBe(true);
  });

  it("expands source search when count is full but pantry coverage is weak", () => {
    expect(shouldExpandRecipeSourceSearch({
      availableRecipeCount: 10,
      qualityRecipeCount: 3,
      requestedRecipeCount: 10
    })).toBe(true);
    expect(shouldExpandRecipeSourceSearch({
      availableRecipeCount: 10,
      qualityRecipeCount: 10,
      requestedRecipeCount: 10
    })).toBe(false);
  });

  it("does not run generic bulk repair after source-backed editing", () => {
    expect(shouldRunBulkRecipeRepair({
      editorTargetCount: 10,
      missingRecipeCount: 7,
      referenceCount: 0
    })).toBe(false);
    expect(shouldRunBulkRecipeRepair({
      editorTargetCount: 0,
      missingRecipeCount: 7,
      referenceCount: 0
    })).toBe(true);
  });
});

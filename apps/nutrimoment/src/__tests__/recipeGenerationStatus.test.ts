import { describe, expect, it } from "vitest";
import { RecipeGenerationStatus } from "../lib/RecipeGenerationStatus";

describe("RecipeGenerationStatus", () => {
  it("exposes stable response states for recipe generation", () => {
    expect(Object.values(RecipeGenerationStatus)).toEqual([
      "SUCCESS_AI",
      "SUCCESS_DATASET",
      "SUCCESS_CACHE",
      "PARTIAL_RESULTS",
      "NO_RESULTS"
    ]);
  });
});

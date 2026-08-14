import { describe, expect, it } from "vitest";
import { RecipeGenerationStatus } from "../lib/RecipeGenerationStatus";
import { buildRecipeGenerationStatusDetail } from "../lib/recipeGenerationPresentation";

describe("recipe generation presentation", () => {
  it("reports the exact partial result count", () => {
    expect(buildRecipeGenerationStatusDetail({
      returnedCount: 6,
      requestedCount: 10,
      servedFrom: "fallback_ai",
      status: RecipeGenerationStatus.PARTIAL_RESULTS
    })).toBe("Showing 6 of 10 safe recipe matches.");
  });

  it("explains exhausted AI credits without blocking shared-pool recipes", () => {
    expect(buildRecipeGenerationStatusDetail({
      aiFillUnavailableReason: "free_ai_credits_exhausted",
      returnedCount: 4,
      requestedCount: 10,
      servedFrom: "shared_pool",
      status: RecipeGenerationStatus.PARTIAL_RESULTS
    })).toBe("Showing 4 of 10 shared-pool recipes. Your 10 free AI credits are used, but shared recipes remain available.");
  });
});

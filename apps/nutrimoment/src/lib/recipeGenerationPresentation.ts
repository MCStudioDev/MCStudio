import { RecipeGenerationStatus } from "@/lib/RecipeGenerationStatus";
import { FREE_LIFETIME_AI_CREDITS } from "@/lib/freeAiCredits";

export function resolveDisplayedRecipeGenerationStatus(input: {
  status?: RecipeGenerationStatus;
  servedFrom?: string;
  returnedCount: number;
  requestedCount: number;
}) {
  if (input.returnedCount <= 0) return RecipeGenerationStatus.NO_RESULTS;
  if (input.status) return input.status;
  if (input.returnedCount < input.requestedCount) return RecipeGenerationStatus.PARTIAL_RESULTS;
  if (input.servedFrom === "fallback_ai" || input.servedFrom === "mock") {
    return RecipeGenerationStatus.SUCCESS_AI;
  }
  return RecipeGenerationStatus.SUCCESS_DATASET;
}

export function buildRecipeGenerationStatusDetail(input: {
  aiFillUnavailableReason?: string;
  requestedCount: number;
  returnedCount: number;
  servedFrom?: string;
  status: RecipeGenerationStatus;
}) {
  if (
    input.servedFrom === "shared_pool" &&
    input.aiFillUnavailableReason === "free_ai_credits_exhausted" &&
    input.returnedCount > 0
  ) {
    return `Showing ${input.returnedCount} of ${input.requestedCount} shared-pool recipes. Your ${FREE_LIFETIME_AI_CREDITS} free AI credits are used, but shared recipes remain available.`;
  }
  if (input.status === RecipeGenerationStatus.PARTIAL_RESULTS) {
    return `Showing ${input.returnedCount} of ${input.requestedCount} safe recipe matches.`;
  }
  if (input.status === RecipeGenerationStatus.NO_RESULTS) {
    return "No safe recipe matched these ingredients and preferences. Try adding another main ingredient or adjusting the cuisine or diet filters.";
  }
  return null;
}

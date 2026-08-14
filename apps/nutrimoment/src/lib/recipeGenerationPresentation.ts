import { RecipeGenerationStatus } from "@/lib/RecipeGenerationStatus";
import { FREE_LIFETIME_AI_CREDITS } from "@/lib/freeAiCredits";

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
  return null;
}

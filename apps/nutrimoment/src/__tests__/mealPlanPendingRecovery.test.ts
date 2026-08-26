import { describe, expect, it } from "vitest";
import { classifyPendingMealPlanEntries } from "@/lib/mealPlanPendingRecovery";

describe("meal-plan pending recovery", () => {
  it("trusts completed server history over an expired browser timer", () => {
    const result = classifyPendingMealPlanEntries({
      history: [{ id: "completed-plan", generationStatus: "completed" }],
      now: 1_000_000,
      pending: [{ id: "completed-plan", startedAt: 1 }],
      staleAfterMs: 100
    });

    expect(result.completedIds).toEqual(["completed-plan"]);
    expect(result.staleUnconfirmedIds).toEqual([]);
  });

  it("separates stale unconfirmed work without declaring it failed", () => {
    const result = classifyPendingMealPlanEntries({
      history: [{ id: "still-pending", generationStatus: "pending" }],
      now: 1_000,
      pending: [
        { id: "still-pending", startedAt: 950 },
        { id: "unknown-old", startedAt: 1 }
      ],
      staleAfterMs: 100
    });

    expect(result.activeIds).toEqual(["still-pending"]);
    expect(result.staleUnconfirmedIds).toEqual(["unknown-old"]);
    expect(result.failedIds).toEqual([]);
  });
});

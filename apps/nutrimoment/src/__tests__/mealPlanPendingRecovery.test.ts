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

  it("expires stale work even when server history remains pending", () => {
    const result = classifyPendingMealPlanEntries({
      history: [{ id: "still-pending", generationStatus: "pending" }],
      now: 1_000,
      pending: [
        { id: "still-pending", startedAt: 950 },
        { id: "stale-server-pending", startedAt: 1 },
        { id: "unknown-old", startedAt: 1 }
      ],
      staleAfterMs: 100
    });

    expect(result.activeIds).toEqual(["still-pending"]);
    expect(result.staleUnconfirmedIds).toEqual(["stale-server-pending", "unknown-old"]);
    expect(result.failedIds).toEqual([]);
  });
});

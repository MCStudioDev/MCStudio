import type { HistoryItem } from "@/lib/types";

interface PendingMealPlanEntry {
  id: string;
  startedAt: number;
}

export function classifyPendingMealPlanEntries(input: {
  history: Array<Pick<HistoryItem, "id" | "generationStatus">>;
  now: number;
  pending: PendingMealPlanEntry[];
  staleAfterMs: number;
}) {
  const statusById = new Map(input.history.map((item) => [item.id, item.generationStatus]));
  const completedIds: string[] = [];
  const failedIds: string[] = [];
  const activeIds: string[] = [];
  const staleUnconfirmedIds: string[] = [];

  input.pending.forEach((entry) => {
    const status = statusById.get(entry.id);
    if (status === "completed") {
      completedIds.push(entry.id);
      return;
    }
    if (status === "failed") {
      failedIds.push(entry.id);
      return;
    }
    if (status === "pending" || input.now - entry.startedAt <= input.staleAfterMs) {
      activeIds.push(entry.id);
      return;
    }
    staleUnconfirmedIds.push(entry.id);
  });

  return { activeIds, completedIds, failedIds, staleUnconfirmedIds };
}

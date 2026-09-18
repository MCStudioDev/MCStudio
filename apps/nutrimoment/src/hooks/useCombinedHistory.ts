"use client";
import { useMemo } from "react";
import { useHistory } from "@/hooks/useHistory";
import { useArabicWorkflow } from "@/hooks/useArabicWorkflow";

/** A display adapter; English records retain their existing read/write paths. */
export function useCombinedHistory() {
  const english = useHistory();
  const arabic = useArabicWorkflow(true);
  const items = useMemo(() => [...english.items, ...arabic.items].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [english.items, arabic.items]);
  return {
    ...english, items, error: english.error ?? arabic.readError,
    removeEntry: (id: string) => id.startsWith("ar:") ? arabic.remove(id) : english.removeEntry(id),
    clear: async () => { await english.clear(); await Promise.all(arabic.items.map(item => arabic.remove(item.id))); },
    updateRecipeImage: (...args: Parameters<typeof english.updateRecipeImage>) => args[0].startsWith("ar:") ? Promise.resolve() : english.updateRecipeImage(...args)
  };
}

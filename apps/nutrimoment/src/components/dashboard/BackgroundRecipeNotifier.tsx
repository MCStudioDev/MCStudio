"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import {
  forgetPendingRecipeHistoryId,
  hasNotifiedRecipeHistoryId,
  markNotifiedRecipeHistoryId,
  readPendingRecipeHistoryIds
} from "@/lib/backgroundRecipeJobs";

export function BackgroundRecipeNotifier() {
  const { addNotification, settings, t } = useApp();
  const { items: historyItems } = useHistory();

  useEffect(() => {
    const pendingIds = readPendingRecipeHistoryIds();
    if (!pendingIds.length) return;

    const completedEntry = historyItems.find(
      (entry) =>
        pendingIds.includes(entry.id) &&
        entry.recipes.length > 0 &&
        entry.generationStatus !== "failed" &&
        !hasNotifiedRecipeHistoryId(entry.id)
    );

    if (completedEntry) {
      markNotifiedRecipeHistoryId(completedEntry.id);
      forgetPendingRecipeHistoryId(completedEntry.id);
      addNotification(t("backgroundRecipesReady"), settings.uiLanguage);
      return;
    }

    const failedEntry = historyItems.find(
      (entry) =>
        pendingIds.includes(entry.id) &&
        entry.generationStatus === "failed" &&
        !hasNotifiedRecipeHistoryId(entry.id)
    );

    if (failedEntry) {
      markNotifiedRecipeHistoryId(failedEntry.id);
      forgetPendingRecipeHistoryId(failedEntry.id);
      addNotification(failedEntry.generationMessage ?? t("backgroundRecipesFailed"), settings.uiLanguage);
    }
  }, [addNotification, historyItems, settings.uiLanguage, t]);

  return null;
}
